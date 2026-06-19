import { Controller, Get, Post, Req, Res, Body } from '@nestjs/common';
import { Request, Response } from 'express';
import { EmailService } from '../email/email.service';
import { CustomDomainService } from '../email/custom-domain.service';
import { ApiKeyValidationService } from '../shared/service/ApiKeyValidationService';
import { Logger } from '@nestjs/common';

/**
 * MCP (Model Context Protocol) HTTP Server for AgentMail
 *
 * Exposes email operations as MCP tools over HTTP/SSE.
 * Compatible with Claude Desktop, Cursor, and other MCP clients.
 *
 * Endpoints:
 * - GET  /mcp/sse        - SSE connection for MCP messages
 * - POST /mcp/messages   - Endpoint for MCP client messages
 *
 * Tools exposed:
 * - email.list_inboxes    - List all inboxes
 * - email.get_messages    - Get messages from an inbox
 * - email.send_email      - Send an email
 * - email.search_emails   - Search emails
 * - email.get_inbox_stats - Get inbox statistics
 */

interface McpRequest {
    jsonrpc: '2.0';
    id: number | string;
    method: string;
    params?: any;
}

interface McpResponse {
    jsonrpc: '2.0';
    id: number | string | null;
    result?: any;
    error?: { code: number; message: string; data?: any };
}

@Controller('mcp')
export class McpController {
    private readonly logger = new Logger(McpController.name);
    private clients = new Map<string, Response>();
    private messageCounter = 0;

    constructor(
        private readonly emailService: EmailService,
        private readonly customDomainService: CustomDomainService,
        private readonly apiKeyValidation: ApiKeyValidationService,
    ) {}

    /**
     * Track MCP usage: send FlexPrice event for analytics
     */
    private async trackMcpUsage(userId: string, toolName: string, apiKey: string, quantity: number = 1) {
        // MCP tool names are namespaced (e.g. "email.send_email"); normalize to the bare
        // name and alias to the canonical REST credit key so costs + FlexPrice event
        // names match the REST API path exactly.
        const raw = toolName.includes('.') ? toolName.split('.').pop()! : toolName;
        const ALIAS: Record<string, string> = {
            get_messages: 'list_messages',
            get_inbox_stats: 'get_email_stats',
        };
        const tool = ALIAS[raw] ?? raw;

        const { getToolCredits } = await import('../utils/tool-credits');
        const credits = getToolCredits(tool);

        // Deduct credits from the local ledger (same as the REST API path).
        try {
            await this.apiKeyValidation.deductCredits(apiKey, credits, tool);
        } catch (e) {
            console.warn(`[trackMcpUsage] Failed to deduct credits for ${tool}:`, e);
        }

        // Send FlexPrice event for analytics.
        try {
            const { sendFlexPriceEvent } = await import('../utils/siren.utils');
            await sendFlexPriceEvent({
                type: tool,
                id: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
                time: new Date().toISOString(),
                source: 'AgentMail_MCP',
                subject: userId,
                data: {
                    credits,
                    toolType: tool,
                    quantity,
                    currentPlan: 'mcp',
                },
            });
        } catch (e) {
            console.warn(`[trackMcpUsage] Failed to send FlexPrice event for ${tool}:`, e);
        }
    }

    @Get('sse')
    async handleSse(@Req() req: Request, @Res() res: Response) {
        // Validate API key before opening SSE stream
        const apiKey = req.headers['x-api-key'] as string;
        if (!apiKey) {
            return res.status(401).json({ error: 'Unauthorized: x-api-key header required' });
        }
        try {
            const validated = await this.apiKeyValidation.validateApiKeyAndBalance(apiKey, 0, 'list_inboxes');
            if (!validated) {
                return res.status(401).json({ error: 'Invalid API key' });
            }
        } catch (error: any) {
            return res.status(401).json({ error: error.message });
        }

        const clientId =
            (req.query.clientId as string) || `client-${Date.now()}`;

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        });

        res.write(
            `event: endpoint\ndata: /mcp/messages?clientId=${clientId}\n\n`,
        );

        this.clients.set(clientId, res);
        this.logger.log(`MCP client connected: ${clientId}`);

        req.on('close', () => {
            this.clients.delete(clientId);
            this.logger.log(`MCP client disconnected: ${clientId}`);
        });
    }

    @Post('messages')
    async handleMessage(
        @Req() req: Request,
        @Res() res: Response,
        @Body() body: McpRequest,
    ) {
        const clientId = req.query.clientId as string;

        // Validate API key from header
        const apiKey = req.headers['x-api-key'] as string;
        if (!apiKey) {
            return res.status(401).json({
                jsonrpc: '2.0',
                id: body.id,
                error: {
                    code: -32001,
                    message: 'Unauthorized: x-api-key header required',
                },
            });
        }

        try {
            // Determine actual tool and required credits
            const toolName = body.method === 'tools/call' ? body.params?.name : null;
            const { getToolCredits } = await import('../utils/tool-credits');
            const requiredCredits = toolName ? getToolCredits(toolName) : 0;
            const validationToolName = (toolName || 'list_inboxes') as any;

            const validated =
                await this.apiKeyValidation.validateApiKeyAndBalance(
                    apiKey,
                    requiredCredits,
                    validationToolName,
                );
            if (!validated) {
                return res.status(401).json({
                    jsonrpc: '2.0',
                    id: body.id,
                    error: { code: -32001, message: 'Invalid API key' },
                });
            }
            const userId = validated.userId;

            const response = await this.handleMcpMethod(body, userId, apiKey);

            // Deduct credits after successful tool execution
            if (toolName && requiredCredits > 0) {
                await this.apiKeyValidation.deductCredits(apiKey, requiredCredits, toolName);
            }

            // Send via SSE if client connected
            const client = this.clients.get(clientId);
            if (client && !client.destroyed) {
                client.write(
                    `event: message\ndata: ${JSON.stringify(response)}\n\n`,
                );
                return res.status(202).json({});
            }

            return res.json(response);
        } catch (error: any) {
            this.logger.error(`MCP error: ${error.message}`);
            return res.json({
                jsonrpc: '2.0',
                id: body.id,
                error: { code: -32603, message: error.message },
            });
        }
    }

    private async handleMcpMethod(
        req: McpRequest,
        userId: string,
        apiKey?: string,
    ): Promise<McpResponse> {
        const { method, params, id } = req;

        switch (method) {
            case 'initialize':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        protocolVersion: '2024-11-05',
                        capabilities: {
                            tools: {},
                            resources: {},
                        },
                        serverInfo: {
                            name: 'agentmail-mcp',
                            version: '1.0.0',
                        },
                    },
                };

            case 'tools/list':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        tools: [
                            {
                                name: 'email.list_inboxes',
                                description: 'List all email inboxes',
                                inputSchema: {
                                    type: 'object',
                                    properties: {},
                                },
                            },
                            {
                                name: 'email.get_messages',
                                description:
                                    'Get messages from a specific inbox',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        inboxId: {
                                            type: 'string',
                                            description:
                                                'Inbox ID or email address',
                                        },
                                        limit: {
                                            type: 'number',
                                            description:
                                                'Max messages to return',
                                            default: 20,
                                        },
                                    },
                                    required: ['inboxId'],
                                },
                            },
                            {
                                name: 'email.send_email',
                                description: 'Send an email from an inbox',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        inboxId: {
                                            type: 'string',
                                            description: 'Inbox ID',
                                        },
                                        to: {
                                            type: 'array',
                                            items: { type: 'string' },
                                            description: 'Recipient addresses',
                                        },
                                        subject: { type: 'string' },
                                        body: { type: 'string' },
                                        bodyHtml: { type: 'string' },
                                    },
                                    required: [
                                        'inboxId',
                                        'to',
                                        'subject',
                                        'body',
                                    ],
                                },
                            },
                            {
                                name: 'email.create_inbox',
                                description: 'Create a new email inbox',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        emailAddress: {
                                            type: 'string',
                                            description: 'Email address for the inbox (e.g., agent@yourdomain.com)',
                                        },
                                        displayName: {
                                            type: 'string',
                                            description: 'Display name for the inbox',
                                        },
                                        customDomainId: {
                                            type: 'string',
                                            description: 'Custom domain ID (omit for default domain)',
                                        },
                                    },
                                    required: ['emailAddress'],
                                },
                            },
                            {
                                name: 'email.delete_inbox',
                                description: 'Delete an email inbox',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        inboxId: {
                                            type: 'string',
                                            description: 'Inbox ID or email address to delete',
                                        },
                                    },
                                    required: ['inboxId'],
                                },
                            },
                            {
                                name: 'email.search_emails',
                                description: 'Search emails by keyword',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        query: {
                                            type: 'string',
                                            description: 'Search query',
                                        },
                                        inboxId: { type: 'string' },
                                        limit: { type: 'number', default: 20 },
                                    },
                                    required: ['query'],
                                },
                            },
                            {
                                name: 'email.get_inbox_stats',
                                description: 'Get statistics for all inboxes',
                                inputSchema: {
                                    type: 'object',
                                    properties: {},
                                },
                            },
                            {
                                name: 'email.create_label',
                                description:
                                    'Create a label for organizing emails',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        name: {
                                            type: 'string',
                                            description: 'Label name',
                                        },
                                        color: {
                                            type: 'string',
                                            description:
                                                'Hex color (e.g., #10b981). Optional.',
                                        },
                                    },
                                    required: ['name'],
                                },
                            },
                            {
                                name: 'email.list_labels',
                                description:
                                    'List all labels with their message counts',
                                inputSchema: {
                                    type: 'object',
                                    properties: {},
                                },
                            },
                            {
                                name: 'email.delete_label',
                                description: 'Delete a label',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        labelId: {
                                            type: 'string',
                                            description: 'Label ID to delete',
                                        },
                                    },
                                    required: ['labelId'],
                                },
                            },
                            {
                                name: 'email.apply_label',
                                description: 'Apply a label to a message',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        messageId: {
                                            type: 'string',
                                            description: 'Message ID',
                                        },
                                        labelId: {
                                            type: 'string',
                                            description: 'Label ID',
                                        },
                                    },
                                    required: ['messageId', 'labelId'],
                                },
                            },
                            {
                                name: 'email.remove_label',
                                description: 'Remove a label from a message',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        messageId: {
                                            type: 'string',
                                            description: 'Message ID',
                                        },
                                        labelId: {
                                            type: 'string',
                                            description: 'Label ID',
                                        },
                                    },
                                    required: ['messageId', 'labelId'],
                                },
                            },
                            {
                                name: 'domain.list_domains',
                                description:
                                    'List all registered custom domains',
                                inputSchema: {
                                    type: 'object',
                                    properties: {},
                                },
                            },
                            {
                                name: 'domain.register',
                                description: 'Register a new custom domain',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        domain: {
                                            type: 'string',
                                            description:
                                                'Domain to register (e.g., example.com)',
                                        },
                                    },
                                    required: ['domain'],
                                },
                            },
                            {
                                name: 'domain.verify',
                                description:
                                    'Verify domain ownership and configure email routing',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        domainId: {
                                            type: 'string',
                                            description:
                                                'Domain ID from list_domains',
                                        },
                                    },
                                    required: ['domainId'],
                                },
                            },
                            {
                                name: 'domain.get_details',
                                description:
                                    'Get domain details including DNS records',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        domainId: {
                                            type: 'string',
                                            description: 'Domain ID',
                                        },
                                    },
                                    required: ['domainId'],
                                },
                            },
                            {
                                name: 'domain.delete',
                                description:
                                    'Delete a custom domain and all associated inboxes',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        domainId: {
                                            type: 'string',
                                            description: 'Domain ID to delete',
                                        },
                                    },
                                    required: ['domainId'],
                                },
                            },
                            {
                                name: 'domain.get_dns_records',
                                description:
                                    'Get required DNS records for domain verification',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        domainId: {
                                            type: 'string',
                                            description: 'Domain ID',
                                        },
                                    },
                                    required: ['domainId'],
                                },
                            },
                        ],
                    },
                };

            case 'tools/call': {
                const toolName = params?.name;
                const args = params?.arguments || {};

                try {
                    let result: any;

                    switch (toolName) {
                        case 'email.list_inboxes':
                            result = await this.emailService.getInboxes(userId);
                            break;

                        case 'email.create_inbox': {
                            result = await this.emailService.createInbox(
                                userId,
                                {
                                    emailAddress: args.emailAddress,
                                    displayName: args.displayName,
                                    customDomainId: args.customDomainId,
                                },
                            );
                            break;
                        }

                        case 'email.delete_inbox': {
                            result = await this.emailService.deleteInbox(
                                userId,
                                args.inboxId,
                            );
                            break;
                        }

                        case 'email.get_messages': {
                            const inbox =
                                await this.emailService.getInboxes(userId);
                            const targetInbox = inbox.find(
                                (i: any) =>
                                    i.id === args.inboxId ||
                                    i.emailAddress === args.inboxId,
                            );
                            if (!targetInbox)
                                throw new Error('Inbox not found');
                            const messages =
                                await this.emailService.getMessages(
                                    userId,
                                    targetInbox.id,
                                    args.limit || 20,
                                    0,
                                );
                            result = messages;
                            break;
                        }

                        case 'email.send_email': {
                            result = await this.emailService.sendEmail(
                                userId,
                                args.inboxId,
                                {
                                    to: args.to,
                                    subject: args.subject,
                                    body: args.body,
                                    bodyHtml: args.bodyHtml,
                                },
                            );
                            break;
                        }

                        case 'email.search_emails': {
                            result = await this.emailService.searchEmails(
                                userId,
                                args.query,
                                {
                                    inboxId: args.inboxId,
                                    limit: args.limit || 20,
                                },
                            );
                            break;
                        }

                        case 'email.get_inbox_stats': {
                            result = await this.emailService.getStats(userId);
                            break;
                        }

                        case 'email.create_label': {
                            result = await this.emailService.createLabel(
                                userId,
                                args.name,
                                args.color,
                            );
                            break;
                        }

                        case 'email.list_labels': {
                            result = await this.emailService.getLabels(userId);
                            break;
                        }

                        case 'email.delete_label': {
                            result = await this.emailService.deleteLabel(
                                userId,
                                args.labelId,
                            );
                            break;
                        }

                        case 'email.apply_label': {
                            result = await this.emailService.applyLabel(
                                userId,
                                args.messageId,
                                args.labelId,
                            );
                            break;
                        }

                        case 'email.remove_label': {
                            result = await this.emailService.removeLabel(
                                userId,
                                args.messageId,
                                args.labelId,
                            );
                            break;
                        }

                        case 'domain.list_domains': {
                            result =
                                await this.customDomainService.getUserDomains(
                                    userId,
                                );
                            break;
                        }

                        case 'domain.register': {
                            result =
                                await this.customDomainService.registerDomain(
                                    userId,
                                    args.domain,
                                );
                            break;
                        }

                        case 'domain.verify': {
                            result =
                                await this.customDomainService.verifyDomain(
                                    userId,
                                    args.domainId,
                                );
                            break;
                        }

                        case 'domain.get_details': {
                            result =
                                await this.customDomainService.getDomainDetails(
                                    userId,
                                    args.domainId,
                                );
                            break;
                        }

                        case 'domain.delete': {
                            result =
                                await this.customDomainService.deleteDomain(
                                    userId,
                                    args.domainId,
                                );
                            break;
                        }

                        case 'domain.get_dns_records': {
                            result =
                                await this.customDomainService.getDnsRecords(
                                    userId,
                                    args.domainId,
                                );
                            break;
                        }

                        default:
                            throw new Error(`Unknown tool: ${toolName}`);
                    }

                    // Track successful MCP tool usage
                    if (apiKey) {
                        await this.trackMcpUsage(userId, toolName, apiKey, Array.isArray(result) ? result.length : 1);
                    }

                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify(result, null, 2),
                                },
                            ],
                            isError: false,
                        },
                    };
                } catch (error: any) {
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {
                            content: [
                                {
                                    type: 'text',
                                    text: `Error: ${error.message}`,
                                },
                            ],
                            isError: true,
                        },
                    };
                }
            }

            default:
                return {
                    jsonrpc: '2.0',
                    id,
                    error: {
                        code: -32601,
                        message: `Method not found: ${method}`,
                    },
                };
        }
    }
}
