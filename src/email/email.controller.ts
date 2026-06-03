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
} from '@nestjs/common';
import { Request } from 'express';
import { EmailService } from './email.service';
import { ApiKeyValidationService } from '../shared/service/ApiKeyValidationService';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';

class CreateInboxDto {
  emailAddress: string;
  displayName?: string;
}

class SendEmailDto {
  to: string[];
  subject: string;
  body: string;
  bodyHtml?: string;
  cc?: string[];
  bcc?: string[];
}

class RegisterWebhookDto {
  url: string;
  events?: string[];
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

  // ── Inbound Email Handler ───────────────────────────────────────

  @Post('webhook/inbound')
  @ApiOperation({ summary: 'Receive inbound email (called by Cloudflare)' })
  async handleInboundEmail(@Body() body: any) {
    // Support both raw email (from Worker with raw) and parsed email (from Worker without raw)
    if (body.rawEmail) {
      const rawEmail = Buffer.from(body.rawEmail, 'base64');
      return this.emailService.handleInboundEmail(body.emailAddress, rawEmail);
    }
    
    // Fallback: accept parsed email data directly from Worker
    return this.emailService.handleInboundEmailParsed({
      emailAddress: body.emailAddress,
      from: body.from,
      subject: body.subject,
      body: body.body,
      bodyHtml: body.bodyHtml,
      headers: body.headers,
    });
  }

  // ── Webhooks ───────────────────────────────────────────────────

  @Post('webhooks')
  @ApiOperation({ summary: 'Register webhook endpoint' })
  async registerWebhook(@Body() dto: RegisterWebhookDto, @Req() req: Request) {
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

  // ── Attachments ────────────────────────────────────────────────

  @Get('messages/:messageId/attachments/:attachmentId/download')
  @ApiOperation({ summary: 'Download attachment' })
  async downloadAttachment(
    @Param('messageId') messageId: string,
    @Param('attachmentId') attachmentId: string,
    @Req() req: Request,
  ) {
    // Verify user owns the message
    await this.emailService.getMessage(req.user as string, messageId);
    
    // Get attachment from storage
    const key = `attachments/${messageId}/${attachmentId}`;
    // Return presigned URL or redirect
    return { downloadUrl: key };
  }
}
