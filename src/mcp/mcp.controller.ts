import { Controller, Get, Post, Req, Res, Body } from '@nestjs/common';
import { Request, Response } from 'express';
import { EmailService } from '../email/email.service';
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
        private readonly apiKeyValidation: ApiKeyValidationService,
    ) {}

    @Get('sse')
    async handleSse(@Req() req: Request, @Res() res: Response) {
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
            const validated =
                await this.apiKeyValidation.validateApiKeyAndBalance(
                    apiKey,
                    0,
                    'create_post' as any,
                );
            if (!validated) {
                return res.status(401).json({
                    jsonrpc: '2.0',
                    id: body.id,
                    error: { code: -32001, message: 'Invalid API key' },
                });
            }
            const userId = validated.userId;

            const response = await this.handleMcpMethod(body, userId);

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

                        default:
                            throw new Error(`Unknown tool: ${toolName}`);
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
