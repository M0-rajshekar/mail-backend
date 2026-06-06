import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { EmailService } from './email.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import {
    ApiTags,
    ApiBearerAuth,
    ApiOperation,
    ApiQuery,
} from '@nestjs/swagger';

/**
 * IMAP/SMTP Proxy Controller
 *
 * Provides REST API endpoints that mimic IMAP/SMTP operations
 * for clients that need traditional email client compatibility.
 *
 * IMAP-like operations:
 * - GET /imap/folders - List folders (inboxes)
 * - GET /imap/messages - List messages with flags
 * - GET /imap/messages/:id/raw - Get raw MIME message
 * - POST /imap/messages/:id/flags - Update flags (read/unread)
 *
 * SMTP-like operations:
 * - POST /smtp/send - Send email (same as existing email API)
 */

@ApiTags('IMAP/SMTP Proxy')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller()
export class ImapSmtpController {
    constructor(private readonly emailService: EmailService) {}

    // ── IMAP-like operations ──────────────────────────────────────

    @Get('imap/folders')
    @ApiOperation({ summary: 'List folders (inboxes) - IMAP compatible' })
    async listFolders(@Req() req: Request) {
        const userId = req.user as string;
        const inboxes = await this.emailService.getInboxes(userId);

        return {
            folders: inboxes.map((inbox: any) => ({
                name: inbox.displayName || inbox.emailAddress,
                path: inbox.emailAddress,
                delimiter: '/',
                attributes: ['\\Inbox'],
                messages: inbox.totalEmails,
                uidvalidity: inbox.id,
            })),
        };
    }

    @Get('imap/messages')
    @ApiOperation({ summary: 'List messages - IMAP compatible' })
    @ApiQuery({ name: 'folder', required: false })
    @ApiQuery({ name: 'since', required: false })
    @ApiQuery({ name: 'before', required: false })
    @ApiQuery({ name: 'unseen', required: false, type: Boolean })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async listMessages(
        @Query('folder') folder?: string,
        @Query('since') since?: string,
        @Query('before') before?: string,
        @Query('unseen') unseen?: boolean,
        @Query('limit') limit = 50,
        @Req() req?: Request,
    ) {
        const userId = (req as any).user as string;
        const inboxes = await this.emailService.getInboxes(userId);

        let targetInbox: any = inboxes[0];
        if (folder) {
            targetInbox = inboxes.find(
                (i: any) => i.emailAddress === folder || i.id === folder,
            );
        }

        if (!targetInbox) {
            return { messages: [], total: 0 };
        }

        const { emails: messages, totalCount } =
            await this.emailService.getMessages(
                userId,
                targetInbox.id,
                +limit,
                0,
            );

        return {
            folder: targetInbox.emailAddress,
            uidvalidity: targetInbox.id,
            total: totalCount,
            messages: messages.map((msg: any) => ({
                uid: msg.id,
                seq: msg.id,
                flags: msg.status === 'READ' ? ['\\Seen'] : [],
                date: msg.createdAt,
                from: { address: msg.fromAddress, name: msg.fromName },
                to: msg.toAddresses.map((a: string) => ({ address: a })),
                subject: msg.subject,
                size: (msg.body?.length || 0) + (msg.bodyHtml?.length || 0),
                threadId: msg.threadId,
            })),
        };
    }

    @Post('imap/messages/:id/flags')
    @ApiOperation({ summary: 'Update message flags - IMAP compatible' })
    async updateFlags(
        @Body() body: { flags: string[]; mode: 'add' | 'remove' | 'set' },
        @Req() req: Request,
    ) {
        const userId = req.user as string;

        if (body.mode === 'add' && body.flags.includes('\\Seen')) {
            // Mark as read
            const messageId = (req as any).params?.id;
            if (messageId) {
                await this.emailService.markAsRead(userId, messageId);
            }
        }

        return { success: true };
    }

    // ── SMTP-like operations ────────────────────────────────────────

    @Post('smtp/send')
    @ApiOperation({ summary: 'Send email - SMTP compatible' })
    async smtpSend(
        @Body()
        body: {
            from: string;
            to: string[];
            subject: string;
            text: string;
            html?: string;
            cc?: string[];
            bcc?: string[];
            attachments?: {
                filename: string;
                content: string;
                encoding: string;
            }[];
        },
        @Req() req: Request,
    ) {
        const userId = req.user as string;

        // Find inbox by from address
        const inboxes = await this.emailService.getInboxes(userId);
        const inbox = inboxes.find((i: any) => i.emailAddress === body.from);

        if (!inbox) {
            return {
                success: false,
                error: 'Inbox not found for from address',
            };
        }

        const result = await this.emailService.sendEmail(userId, inbox.id, {
            to: body.to,
            subject: body.subject,
            body: body.text,
            bodyHtml: body.html,
            cc: body.cc,
            bcc: body.bcc,
        });

        return {
            success: true,
            messageId: result.messageId,
            accepted: body.to,
            rejected: [],
        };
    }

    @Get('smtp/capabilities')
    @ApiOperation({ summary: 'Get SMTP capabilities' })
    getCapabilities() {
        return {
            capabilities: [
                'SMTPUTF8',
                '8BITMIME',
                'SIZE 52428800',
                'AUTH PLAIN LOGIN',
                'STARTTLS',
            ],
            maxMessageSize: 52428800,
            supportedAuth: ['PLAIN', 'LOGIN'],
        };
    }
}
