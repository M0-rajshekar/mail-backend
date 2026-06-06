import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    Req,
    Res,
    UseGuards,
    NotFoundException,
    BadRequestException,
    InternalServerErrorException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { EmailService } from './email.service';
import { ApiKeyValidationService } from '../shared/service/ApiKeyValidationService';
import {
    ApiTags,
    ApiBearerAuth,
    ApiOperation,
    ApiQuery,
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';
import {
    IsString,
    IsOptional,
    IsArray,
    IsNotEmpty,
    ArrayMinSize,
} from 'class-validator';
import { ApiKeyGuard } from '../auth/api-key.guard';

class CreateInboxDto {
    @ApiProperty({ description: 'Email address for the inbox' })
    @IsString()
    @IsNotEmpty()
    emailAddress: string;

    @ApiPropertyOptional({ description: 'Display name for the inbox' })
    @IsOptional()
    @IsString()
    displayName?: string;

    @ApiPropertyOptional({
        description: 'Custom domain ID to use (omit for default domain)',
    })
    @IsOptional()
    @IsString()
    customDomainId?: string;
}

class SendEmailDto {
    @ApiProperty({ description: 'Recipient email addresses' })
    @IsArray()
    @IsString({ each: true })
    @ArrayMinSize(1)
    to: string[];

    @ApiProperty({ description: 'Email subject' })
    @IsString()
    @IsNotEmpty()
    subject: string;

    @ApiProperty({ description: 'Email body text' })
    @IsString()
    @IsNotEmpty()
    body: string;

    @ApiPropertyOptional({ description: 'Email body HTML' })
    @IsOptional()
    @IsString()
    bodyHtml?: string;

    @ApiPropertyOptional({ description: 'CC recipients' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    cc?: string[];

    @ApiPropertyOptional({ description: 'BCC recipients' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    bcc?: string[];
}

class RegisterWebhookDto {
    @ApiProperty({ description: 'Webhook callback URL' })
    @IsString()
    @IsNotEmpty()
    url: string;

    @ApiPropertyOptional({ description: 'Events to subscribe to' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    events?: string[];

    @ApiPropertyOptional({
        description: 'Webhook secret for signature verification',
    })
    @IsOptional()
    @IsString()
    secret?: string;
}

@ApiTags('Email')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('email')
export class EmailController {
    constructor(
        private readonly emailService: EmailService,
        private readonly apiKeyValidation: ApiKeyValidationService,
    ) {}

    // ── Inboxes ─────────────────────────────────────────────────────

    @Post('inboxes')
    @ApiOperation({ summary: 'Create a new inbox' })
    async createInbox(@Body() dto: CreateInboxDto, @Req() req: Request) {
        const userId = req.user as string;
        return this.emailService.createInbox(userId, dto);
    }

    @Get('inboxes')
    @ApiOperation({ summary: 'List all inboxes' })
    async getInboxes(@Req() req: Request) {
        const userId = req.user as string;
        return this.emailService.getInboxes(userId);
    }

    @Get('inboxes/:id')
    @ApiOperation({ summary: 'Get inbox details' })
    async getInbox(@Param('id') id: string, @Req() req: Request) {
        const userId = req.user as string;
        return this.emailService.getInbox(userId, id);
    }

    @Delete('inboxes/:id')
    @ApiOperation({ summary: 'Delete an inbox' })
    async deleteInbox(@Param('id') id: string, @Req() req: Request) {
        const userId = req.user as string;
        return this.emailService.deleteInbox(userId, id);
    }

    // ── Stats ─────────────────────────────────────────────────────

    @Get('stats')
    @ApiOperation({ summary: 'Get dashboard stats' })
    async getStats(@Req() req: Request) {
        const userId = req.user as string;
        return this.emailService.getStats(userId);
    }

    // ── Messages ────────────────────────────────────────────────────

    @Post('inboxes/:id/messages')
    @ApiOperation({ summary: 'Send an email' })
    async sendEmail(
        @Param('id') inboxId: string,
        @Body() dto: SendEmailDto,
        @Req() req: Request,
    ) {
        const userId = req.user as string;
        const apiKey = (req as any).apiKey;

        // Deduct credits for sending email
        if (apiKey) {
            await this.apiKeyValidation.deductCredits(apiKey, 1, 'send_email');
        }

        return this.emailService.sendEmail(userId, inboxId, dto);
    }

    @Get('inboxes/:id/messages')
    @ApiOperation({ summary: 'List messages in inbox' })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'offset', required: false, type: Number })
    async getMessages(
        @Param('id') inboxId: string,
        @Query('limit') limit = 50,
        @Query('offset') offset = 0,
        @Req() req: Request,
    ) {
        const userId = req.user as string;
        return this.emailService.getMessages(userId, inboxId, +limit, +offset);
    }

    @Get('messages/:id')
    @ApiOperation({ summary: 'Get message details' })
    async getMessage(@Param('id') messageId: string, @Req() req: Request) {
        const userId = req.user as string;
        return this.emailService.getMessage(userId, messageId);
    }

    @Put('messages/:id/read')
    @ApiOperation({ summary: 'Mark message as read' })
    async markAsRead(@Param('id') messageId: string, @Req() req: Request) {
        const userId = req.user as string;
        return this.emailService.markAsRead(userId, messageId);
    }

    @Put('messages/:id/star')
    @ApiOperation({ summary: 'Toggle star on message' })
    async toggleStar(@Param('id') messageId: string, @Req() req: Request) {
        const userId = req.user as string;
        return this.emailService.toggleStar(userId, messageId);
    }

    @Put('messages/:id/trash')
    @ApiOperation({ summary: 'Move message to trash' })
    async moveToTrash(@Param('id') messageId: string, @Req() req: Request) {
        const userId = req.user as string;
        return this.emailService.moveToTrash(userId, messageId);
    }

    @Put('messages/:id/restore')
    @ApiOperation({ summary: 'Restore message from trash' })
    async restoreFromTrash(
        @Param('id') messageId: string,
        @Req() req: Request,
    ) {
        const userId = req.user as string;
        return this.emailService.restoreFromTrash(userId, messageId);
    }

    // ── Threads ─────────────────────────────────────────────────────

    @Get('threads/:id')
    @ApiOperation({ summary: 'Get thread by ID' })
    async getThread(@Param('id') threadId: string, @Req() req: Request) {
        const userId = req.user as string;
        return this.emailService.getThread(userId, threadId);
    }

    @Get('inboxes/:id/threads/:threadId/reply')
    @ApiOperation({ summary: 'Create reply draft' })
    async createReplyDraft(
        @Param('id') inboxId: string,
        @Param('threadId') threadId: string,
        @Req() req: Request,
    ) {
        const userId = req.user as string;
        return this.emailService.createReplyDraft(userId, inboxId, threadId);
    }

    // ── Search ──────────────────────────────────────────────────────

    @Get('search')
    @ApiOperation({ summary: 'Search emails' })
    @ApiQuery({ name: 'q', required: true })
    @ApiQuery({ name: 'inboxId', required: false })
    @ApiQuery({ name: 'from', required: false })
    @ApiQuery({ name: 'subject', required: false })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'offset', required: false, type: Number })
    async searchEmails(
        @Query('q') query: string,
        @Query('inboxId') inboxId?: string,
        @Query('from') from?: string,
        @Query('subject') subject?: string,
        @Query('limit') limit = 50,
        @Query('offset') offset = 0,
        @Req() req?: Request,
    ) {
        const userId = (req as any).user as string;
        return this.emailService.searchEmails(userId, query, {
            inboxId,
            from,
            subject,
            limit: +limit,
            offset: +offset,
        });
    }

    @Get('search/semantic')
    @ApiOperation({ summary: 'Semantic search emails by meaning' })
    @ApiQuery({ name: 'q', required: true })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async semanticSearch(
        @Query('q') query: string,
        @Query('limit') limit = 20,
        @Req() req?: Request,
    ) {
        const userId = (req as any).user as string;
        return this.emailService.semanticSearch(userId, query, +limit);
    }

    // ── Inbound Email Handler ───────────────────────────────────────

    @Post('webhook/inbound')
    @ApiOperation({ summary: 'Receive inbound email (called by Cloudflare)' })
    async handleInboundEmail(@Body() body: any) {
        try {
            if (!body.emailAddress) {
                throw new BadRequestException('emailAddress is required');
            }

            // Support both raw email (from Worker with raw) and parsed email (from Worker without raw)
            if (body.rawEmail) {
                try {
                    const rawEmail = Buffer.from(body.rawEmail, 'base64');
                    return await this.emailService.handleInboundEmail(
                        body.emailAddress,
                        rawEmail,
                    );
                } catch (parseError) {
                    // Raw email failed to parse, fall back to basic parsed data if available
                    if (body.from && body.subject) {
                        return await this.emailService.handleInboundEmailParsed(
                            {
                                emailAddress: body.emailAddress,
                                from: body.from,
                                subject: body.subject,
                                body: body.body || '',
                                bodyHtml: body.bodyHtml,
                                headers: body.headers,
                            },
                        );
                    }
                    throw parseError;
                }
            }

            // Fallback: accept parsed email data directly from Worker
            return await this.emailService.handleInboundEmailParsed({
                emailAddress: body.emailAddress,
                from: body.from,
                subject: body.subject,
                body: body.body,
                bodyHtml: body.bodyHtml,
                headers: body.headers,
            });
        } catch (error: any) {
            if (
                error instanceof BadRequestException ||
                error instanceof NotFoundException
            ) {
                throw error;
            }
            throw new InternalServerErrorException(
                error.message || 'Failed to process inbound email',
            );
        }
    }

    // ── Webhooks ───────────────────────────────────────────────────

    @Post('webhooks')
    @ApiOperation({ summary: 'Register webhook endpoint' })
    async registerWebhook(
        @Body() dto: RegisterWebhookDto,
        @Req() req: Request,
    ) {
        const userId = req.user as string;
        return this.emailService.registerWebhook(userId, dto);
    }

    @Get('webhooks')
    @ApiOperation({ summary: 'List webhook endpoints' })
    async getWebhooks(@Req() req: Request) {
        const userId = req.user as string;
        return this.emailService.getWebhooks(userId);
    }

    @Delete('webhooks/:id')
    @ApiOperation({ summary: 'Delete webhook endpoint' })
    async deleteWebhook(@Param('id') id: string, @Req() req: Request) {
        const userId = req.user as string;
        return this.emailService.deleteWebhook(userId, id);
    }

    // ── Bulk Embeddings ───────────────────────────────────────────

    @Post('admin/backfill-embeddings')
    @ApiOperation({ summary: 'Backfill embeddings for emails without them' })
    async backfillEmbeddings(@Req() req: Request) {
        const userId = req.user as string;
        return this.emailService.backfillEmbeddings(userId);
    }

    // ── Config / Diagnostics ────────────────────────────────────────

    @Get('config')
    @ApiOperation({ summary: 'Get email service configuration status' })
    async getConfig() {
        return this.emailService.getConfig();
    }

    // ── Attachments ────────────────────────────────────────────────

    @Get('messages/:messageId/attachments/:attachmentId/download')
    @ApiOperation({ summary: 'Download attachment via presigned URL' })
    async downloadAttachment(
        @Param('messageId') messageId: string,
        @Param('attachmentId') attachmentId: string,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        // Verify user owns the message
        const message = await this.emailService.getMessage(
            req.user as string,
            messageId,
        );

        // Find attachment in message metadata
        const attachments = (message as any).attachments || [];
        const attachment = attachments.find((a: any) => a.id === attachmentId);

        if (!attachment) {
            throw new NotFoundException('Attachment not found');
        }

        // Generate presigned URL for actual download
        const downloadUrl = await this.emailService.getAttachmentDownloadUrl(
            attachment.s3Key || `attachments/${messageId}/${attachmentId}`,
        );

        // Redirect to presigned URL
        res.redirect(downloadUrl);
    }
}
