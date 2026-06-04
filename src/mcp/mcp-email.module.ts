import { Module, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EmailService } from '../email/email.service';
import { ApiKeyValidationService } from '../shared/service/ApiKeyValidationService';
import { PrismaService } from '../services/prisma.service';

@Module({})
export class McpEmailModule {
    private readonly logger = new Logger(McpEmailModule.name);

    constructor(
        private readonly emailService: EmailService,
        private readonly apiKeyValidation: ApiKeyValidationService,
        private readonly prisma: PrismaService,
    ) {}

    async createServer() {
        const server = new McpServer({
            name: 'agentmail-mcp-server',
            version: '1.0.0',
        });

        // Tool: list_inboxes
        server.tool(
            'list_inboxes',
            'List all email inboxes for the authenticated user',
            {},
            async () => {
                // For MCP via HTTP, we'll need auth context
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                status: 'ok',
                                note: 'Use HTTP MCP endpoint at /mcp/email/sse',
                            }),
                        },
                    ],
                };
            },
        );

        return server;
    }
}
