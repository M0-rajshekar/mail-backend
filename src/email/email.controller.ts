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
    UseGuards,
    Logger,
    NotFoundException,
    BadRequestException,
    InternalServerErrorException,
} from '@nestjs/common';
import { Request } from 'express';
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
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
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

class AttachmentDto {
    @ApiProperty({ description: 'Base64-encoded file content' })
    @IsString()
    content: string;

    @ApiProperty({ description: 'Filename' })
    @IsString()
    filename: string;

    @ApiProperty({ description: 'MIME type (e.g., application/pdf, image/png)' })
    @IsString()
    type: string;

    @ApiProperty({ description: 'Disposition: attachment or inline', enum: ['attachment', 'inline'] })
    @IsString()
    disposition: 'attachment' | 'inline';

    @ApiPropertyOptional({ description: 'Content ID for inline attachments' })
    @IsOptional()
    @IsString()
    contentId?: string;
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

    @ApiPropertyOptional({ description: 'Attachments', type: [AttachmentDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AttachmentDto)
    attachments?: AttachmentDto[];
}

@ApiTags('Email')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('email')
export class EmailController {
    private readonly logger = new Logger(EmailController.name);

    constructor(
        private readonly emailService: EmailService,
        private readonly apiKeyValidation: ApiKeyValidationService,
    ) {}

    /**
     * Track API usage: deduct credits + send FlexPrice event
     */
    private async trackUsage(req: Request, toolName: string, quantity: number = 1) {
        const apiKey = (req as any).apiKey as string;
        if (!apiKey) return;

        const { getToolCredits } = await import('../utils/tool-credits');
        const credits = getToolCredits(toolName);

        // Deduct credits
        try {
            await this.apiKeyValidation.deductCredits(apiKey, credits, toolName);
        } catch (e) {
            // Don't fail the request if credit deduction fails
            console.warn(`[trackUsage] Failed to deduct credits for ${toolName}:`, e);
        }

        // Send FlexPrice event
        try {
            const { sendFlexPriceEvent } = await import('../utils/siren.utils');
            await sendFlexPriceEvent({
                type: toolName,
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
                time: new Date().toISOString(),
                source: 'AgentMail_API',
                subject: (req as any).user as string,
                data: {
                    credits,
                    toolType: toolName,
                    quantity,
                    currentPlan: 'email',
                },
            });
        } catch (e) {
            // Don't fail the request if event tracking fails
            console.warn(`[trackUsage] Failed to send FlexPrice event for ${toolName}:`, e);
        }
    }

    // ── Inboxes ─────────────────────────────────────────────────────

    @Post('inboxes')
    @ApiOperation({ summary: 'Create a new inbox' })
    async createInbox(@Body() dto: CreateInboxDto, @Req() req: Request) {
        const userId = req.user as string;
        const result = await this.emailService.createInbox(userId, dto);
        await this.trackUsage(req, 'create_inbox');
        return result;
    }

    @Get('inboxes')
    @ApiOperation({ summary: 'List all inboxes' })
    async getInboxes(@Req() req: Request) {
        const userId = req.user as string;
        const result = await this.emailService.getInboxes(userId);
        await this.trackUsage(req, 'list_inboxes', result?.length ?? 0);
        return result;
    }

    @Get('inboxes/:id')
    @ApiOperation({ summary: 'Get inbox details' })
    async getInbox(@Param('id') id: string, @Req() req: Request) {
        const userId = req.user as string;
        const result = await this.emailService.getInbox(userId, id);
        await this.trackUsage(req, 'get_inbox');
        return result;
    }

    @Delete('inboxes/:id')
    @ApiOperation({ summary: 'Delete an inbox' })
    async deleteInbox(@Param('id') id: string, @Req() req: Request) {
        const userId = req.user as string;
        const result = await this.emailService.deleteInbox(userId, id);
        await this.trackUsage(req, 'delete_inbox');
        return result;
    }

    // ── Stats ─────────────────────────────────────────────────────

    @Get('stats')
    @ApiOperation({ summary: 'Get dashboard stats' })
    async getStats(@Req() req: Request) {
        const userId = req.user as string;
        const result = await this.emailService.getStats(userId);
        await this.trackUsage(req, 'get_email_stats');
        return result;
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
        const result = await this.emailService.sendEmail(userId, inboxId, dto);
        await this.trackUsage(req, 'send_email');
        return result;
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
        const result = await this.emailService.getMessages(userId, inboxId, +limit, +offset);
        await this.trackUsage(req, 'list_messages', Array.isArray(result) ? result.length : 0);
        return result;
    }

    @Get('messages/:id')
    @ApiOperation({ summary: 'Get message details' })
    async getMessage(@Param('id') messageId: string, @Req() req: Request) {
        const userId = req.user as string;
        const result = await this.emailService.getMessage(userId, messageId);
        await this.trackUsage(req, 'get_message');
        return result;
    }

    @Get('messages/:messageId/attachments/:attachmentId/download')
    @ApiOperation({ summary: 'Get presigned download URL for an attachment' })
    async getAttachmentUrl(
        @Param('messageId') messageId: string,
        @Param('attachmentId') attachmentId: string,
        @Req() req: Request,
    ) {
        const userId = req.user as string;
        return this.emailService.getAttachmentDownloadUrl(userId, messageId, attachmentId);
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

    // ── Labels ──────────────────────────────────────────────────────

    @Post('labels')
    @ApiOperation({ summary: 'Create a label' })
    async createLabel(
        @Body() dto: { name: string; color?: string },
        @Req() req: Request,
    ) {
        const userId = req.user as string;
        const result = await this.emailService.createLabel(
            userId,
            dto.name,
            dto.color,
        );
        await this.trackUsage(req, 'create_label');
        return result;
    }

    @Get('labels')
    @ApiOperation({ summary: 'List all labels' })
    async getLabels(@Req() req: Request) {
        const userId = req.user as string;
        const result = await this.emailService.getLabels(userId);
        await this.trackUsage(req, 'list_labels');
        return result;
    }

    @Delete('labels/:id')
    @ApiOperation({ summary: 'Delete a label' })
    async deleteLabel(@Param('id') labelId: string, @Req() req: Request) {
        const userId = req.user as string;
        const result = await this.emailService.deleteLabel(userId, labelId);
        await this.trackUsage(req, 'delete_label');
        return result;
    }

    @Get('labels/:id/messages')
    @ApiOperation({ summary: 'List messages with a given label' })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'offset', required: false, type: Number })
    async getMessagesByLabel(
        @Param('id') labelId: string,
        @Query('limit') limit = 50,
        @Query('offset') offset = 0,
        @Req() req?: Request,
    ) {
        const userId = (req as any).user as string;
        const result = await this.emailService.getMessagesByLabel(
            userId,
            labelId,
            +limit,
            +offset,
        );
        await this.trackUsage(req as Request, 'list_messages');
        return result;
    }

    @Put('messages/:id/labels/:labelId')
    @ApiOperation({ summary: 'Apply a label to a message' })
    async applyLabel(
        @Param('id') messageId: string,
        @Param('labelId') labelId: string,
        @Req() req: Request,
    ) {
        const userId = req.user as string;
        const result = await this.emailService.applyLabel(
            userId,
            messageId,
            labelId,
        );
        await this.trackUsage(req, 'apply_label');
        return result;
    }

    @Delete('messages/:id/labels/:labelId')
    @ApiOperation({ summary: 'Remove a label from a message' })
    async removeLabel(
        @Param('id') messageId: string,
        @Param('labelId') labelId: string,
        @Req() req: Request,
    ) {
        const userId = req.user as string;
        const result = await this.emailService.removeLabel(
            userId,
            messageId,
            labelId,
        );
        await this.trackUsage(req, 'remove_label');
        return result;
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
        const result = await this.emailService.searchEmails(userId, query, {
            inboxId,
            from,
            subject,
            limit: +limit,
            offset: +offset,
        });
        await this.trackUsage(req as Request, 'search_emails', Array.isArray(result) ? result.length : 0);
        return result;
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
        const result = await this.emailService.semanticSearch(userId, query, +limit);
        await this.trackUsage(req as Request, 'semantic_search', Array.isArray(result) ? result.length : 0);
        return result;
    }

    // ── Inbound Email Handler ───────────────────────────────────────

    @Post('webhook/inbound')
    @ApiOperation({ summary: 'Receive inbound email (called by Cloudflare)' })
    async handleInboundEmail(@Body() body: any) {
        try {
            if (!body.emailAddress) {
                throw new BadRequestException('emailAddress is required');
            }

            // Attachments only survive the raw-MIME path. Log which path runs so
            // missing-attachment reports are diagnosable instead of silent.
            this.logger.log(
                `[inbound] ${body.emailAddress} hasRawEmail=${!!body.rawEmail} rawLen=${body.rawEmail?.length ?? 0}`,
            );

            // Support both raw email (from Worker with raw) and parsed email (from Worker without raw)
            if (body.rawEmail) {
                try {
                    const rawEmail = Buffer.from(body.rawEmail, 'base64');
                    return await this.emailService.handleInboundEmail(
                        body.emailAddress,
                        rawEmail,
                    );
                } catch (parseError: any) {
                    // The parsed-data fallback CANNOT recover attachments, so make
                    // a raw-parse failure loud instead of silently dropping them.
                    this.logger.error(
                        `[inbound] raw-MIME parse failed for ${body.emailAddress} — falling back WITHOUT attachments: ${parseError?.message}`,
                        parseError?.stack,
                    );
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

            // Fallback: no rawEmail from the worker → attachments cannot be parsed.
            this.logger.warn(
                `[inbound] no rawEmail from worker for ${body.emailAddress} — attachments will be dropped (parsed-data path)`,
            );
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

}
