import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { InboxStatus, EmailDirection, EmailStatus } from 'generated/prisma';
import { CloudflareEmailService } from './cloudflare-email.service';
import { AttachmentStorageService } from './attachment-storage.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { EmailParserService } from './email-parser.service';
import {
  validateSender,
  generateMessageId,
  buildThreadingHeaders,
  buildReferencesChain,
  checkSendRateLimit,
  stripHtmlToText,
  textToHtml,
  buildQuotedReplyBlock,
} from './email-helpers';

export interface CreateInboxDto {
  emailAddress: string;
  displayName?: string;
}

export interface SendEmailDto {
  to: string[];
  subject: string;
  body: string;
  bodyHtml?: string;
  cc?: string[];
  bcc?: string[];
  inReplyTo?: string;
  references?: string[];
  threadId?: string;
}

export interface RegisterWebhookDto {
  url: string;
  events?: string[];
  secret?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudflareEmail: CloudflareEmailService,
    private readonly attachmentStorage: AttachmentStorageService,
    private readonly webhookDelivery: WebhookDeliveryService,
    private readonly emailParser: EmailParserService,
  ) {}

  // ── Inbox Management ──────────────────────────────────────────

  async createInbox(userId: string, dto: CreateInboxDto) {
    const existing = await this.prisma.inbox.findUnique({
      where: { emailAddress: dto.emailAddress },
    });

    if (existing) {
      throw new BadRequestException('Email address already in use');
    }

    const inbox = await this.prisma.inbox.create({
      data: {
        userId,
        emailAddress: dto.emailAddress.toLowerCase(),
        displayName: dto.displayName || dto.emailAddress.split('@')[0],
        status: InboxStatus.ACTIVE,
      },
    });

    this.logger.log(`Created inbox ${inbox.id} for user ${userId}`);
    return inbox;
  }

  async getInboxes(userId: string) {
    return this.prisma.inbox.findMany({
      where: { userId, status: { not: InboxStatus.DELETED } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInbox(userId: string, inboxId: string) {
    const inbox = await this.prisma.inbox.findFirst({
      where: { id: inboxId, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!inbox) {
      throw new NotFoundException('Inbox not found');
    }

    return inbox;
  }

  async deleteInbox(userId: string, inboxId: string) {
    const inbox = await this.prisma.inbox.findFirst({
      where: { id: inboxId, userId },
    });

    if (!inbox) {
      throw new NotFoundException('Inbox not found');
    }

    await this.prisma.inbox.update({
      where: { id: inboxId },
      data: { status: InboxStatus.DELETED },
    });

    return { success: true };
  }

  // ── Email Sending ──────────────────────────────────────────────

  async sendEmail(userId: string, inboxId: string, dto: SendEmailDto) {
    const inbox = await this.prisma.inbox.findFirst({
      where: { id: inboxId, userId },
    });

    if (!inbox) {
      throw new NotFoundException('Inbox not found');
    }

    // Check rate limits
    const rateLimitError = await checkSendRateLimit(this.prisma, inboxId);
    if (rateLimitError) {
      throw new BadRequestException(rateLimitError);
    }

    // Validate sender
    const fromEmail = inbox.emailAddress;
    const fromDomain = fromEmail.split('@')[1];
    const { messageId, outgoingMessageId } = generateMessageId(fromDomain);

    // Build threading headers if replying
    let threadingHeaders: Record<string, string> = {};
    if (dto.inReplyTo) {
      threadingHeaders = buildThreadingHeaders(
        dto.inReplyTo,
        dto.references || [],
      );
    }

    // Store in database
    const message = await this.prisma.emailMessage.create({
      data: {
        inboxId,
        fromAddress: fromEmail,
        fromName: inbox.displayName,
        toAddresses: dto.to.map((t) => t.toLowerCase()),
        ccAddresses: dto.cc?.map((c) => c.toLowerCase()) || [],
        bccAddresses: dto.bcc?.map((b) => b.toLowerCase()) || [],
        subject: dto.subject,
        body: dto.body,
        bodyHtml: dto.bodyHtml || textToHtml(dto.body),
        direction: EmailDirection.OUTBOUND,
        status: EmailStatus.SENT,
        sentAt: new Date(),
        messageId: outgoingMessageId,
        threadId: dto.threadId || dto.inReplyTo || messageId,
      },
    });

    // Send via Cloudflare
    try {
      await this.cloudflareEmail.sendEmail({
        to: dto.to,
        from: { email: fromEmail, name: inbox.displayName || fromEmail },
        subject: dto.subject,
        text: dto.body,
        html: dto.bodyHtml || textToHtml(dto.body),
        cc: dto.cc,
        bcc: dto.bcc,
        headers: Object.keys(threadingHeaders).length > 0 ? threadingHeaders : undefined,
      });
    } catch (error: any) {
      this.logger.error(`Failed to send email: ${error.message}`);
      
      // Mark as failed but keep record
      await this.prisma.emailMessage.update({
        where: { id: message.id },
        data: { status: EmailStatus.FAILED },
      });
      
      throw new BadRequestException(`Failed to send email: ${error.message}`);
    }

    // Update inbox stats
    await this.prisma.inbox.update({
      where: { id: inboxId },
      data: {
        totalEmails: { increment: 1 },
        lastActivityAt: new Date(),
      },
    });

    // Trigger webhooks
    await this.webhookDelivery.deliverEvent(userId, 'email.sent', {
      inboxId,
      messageId: message.id,
      to: dto.to,
      subject: dto.subject,
    });

    this.logger.log(`Sent email from ${fromEmail} to ${dto.to.join(', ')}`);
    return message;
  }

  // ── Inbound Email Handling ─────────────────────────────────────

  async handleInboundEmail(
    emailAddress: string,
    rawEmail: Buffer,
  ) {
    // Parse email
    const parsed = await this.emailParser.parseEmail(rawEmail);
    const recipients = this.emailParser.extractRecipients(parsed);
    
    // Find the inbox
    const inbox = await this.prisma.inbox.findUnique({
      where: { emailAddress: emailAddress.toLowerCase() },
      include: { user: true },
    });

    if (!inbox || inbox.status !== InboxStatus.ACTIVE) {
      this.logger.warn(`No active inbox found for ${emailAddress}`);
      return null;
    }

    // Determine thread ID
    const references = this.emailParser.buildReferences(parsed);
    const inReplyTo = parsed.inReplyTo
      ? this.emailParser.extractMsgId(parsed.inReplyTo)
      : null;
    const originalMsgId = parsed.messageId
      ? this.emailParser.extractMsgId(parsed.messageId)
      : null;
    
    let threadId = references[0] || inReplyTo;

    // If no threading headers, try to find by subject
    if (!threadId && parsed.subject) {
      const subjectThread = await this.findThreadBySubject(
        inbox.id,
        parsed.subject,
        parsed.from?.address,
      );
      if (subjectThread) threadId = subjectThread;
    }

    const messageId = crypto.randomUUID();

    // Store attachments
    const storedAttachments: any[] = [];
    if (parsed.attachments && parsed.attachments.length > 0) {
      for (const att of parsed.attachments) {
        const attId = crypto.randomUUID();
        const stored = await this.attachmentStorage.storeAttachment(
          messageId,
          attId,
          {
            filename: att.filename || 'untitled',
            contentType: att.mimeType,
            content: att.content,
            size: att.size,
          },
        );
        storedAttachments.push(stored);
      }
    }

    // Store email
    const message = await this.prisma.emailMessage.create({
      data: {
        inboxId: inbox.id,
        messageId: originalMsgId,
        fromAddress: (parsed.from?.address || '').toLowerCase(),
        fromName: parsed.from?.name || null,
        toAddresses: recipients.to,
        ccAddresses: recipients.cc,
        bccAddresses: recipients.bcc,
        subject: parsed.subject || '',
        body: parsed.text || stripHtmlToText(parsed.html || ''),
        bodyHtml: parsed.html || null,
        direction: EmailDirection.INBOUND,
        status: EmailStatus.RECEIVED,
        receivedAt: new Date(),
        threadId: threadId || messageId,
        attachments: storedAttachments.map((att) => ({
          id: att.id,
          filename: att.filename,
          mimetype: att.mimetype,
          size: att.size,
          s3Key: att.s3Key,
        })),
        metadata: {
          headers: parsed.headers,
          inReplyTo,
          references,
        },
      },
    });

    // Update inbox stats
    await this.prisma.inbox.update({
      where: { id: inbox.id },
      data: {
        totalEmails: { increment: 1 },
        lastActivityAt: new Date(),
      },
    });

    // Trigger webhooks
    await this.webhookDelivery.deliverEvent(inbox.userId, 'email.received', {
      inboxId: inbox.id,
      messageId: message.id,
      from: parsed.from?.address,
      subject: parsed.subject,
      preview: parsed.text?.substring(0, 200) || stripHtmlToText(parsed.html || '').substring(0, 200),
      threadId: message.threadId,
    });

    this.logger.log(`Received email for ${emailAddress} from ${parsed.from?.address}`);
    return message;
  }

  // ── Thread Management ───────────────────────────────────────────

  async findThreadBySubject(
    inboxId: string,
    subject: string,
    senderAddress?: string,
  ): Promise<string | null> {
    const normalized = subject
      .replace(/^(?:(?:re|fwd?|fw|aw|wg|r[eé]f|sv)\s*:\s*)+/i, '')
      .trim()
      .toLowerCase();

    if (!normalized) return null;

    // Find recent emails with matching subject
    const recentEmails = await this.prisma.emailMessage.findMany({
      where: {
        inboxId,
        threadId: { not: null },
        receivedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      },
      orderBy: { receivedAt: 'desc' },
      take: 50,
    });

    const normalizedSender = senderAddress?.toLowerCase().trim();

    for (const email of recentEmails) {
      const emailSubject = (email.subject || '')
        .replace(/^(?:(?:re|fwd?|fw|aw|wg|r[eé]f|sv)\s*:\s*)+/i, '')
        .trim()
        .toLowerCase();

      if (emailSubject !== normalized) continue;

      if (normalizedSender) {
        const participants = `${email.fromAddress},${email.toAddresses.join(',')}`;
        if (!participants.includes(normalizedSender)) continue;
      }

      return email.threadId;
    }

    return null;
  }

  async getThread(userId: string, threadId: string) {
    const messages = await this.prisma.emailMessage.findMany({
      where: {
        threadId,
        inbox: { userId },
      },
      orderBy: { createdAt: 'asc' },
      include: { inbox: { select: { emailAddress: true } } },
    });

    if (messages.length === 0) {
      throw new NotFoundException('Thread not found');
    }

    return {
      threadId,
      messageCount: messages.length,
      messages,
    };
  }

  // ── Message Operations ──────────────────────────────────────────

  async getMessages(userId: string, inboxId: string, limit = 50, offset = 0) {
    const inbox = await this.prisma.inbox.findFirst({
      where: { id: inboxId, userId },
    });

    if (!inbox) {
      throw new NotFoundException('Inbox not found');
    }

    return this.prisma.emailMessage.findMany({
      where: { inboxId },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });
  }

  async getMessage(userId: string, messageId: string) {
    const message = await this.prisma.emailMessage.findFirst({
      where: { id: messageId },
      include: { inbox: true },
    });

    if (!message || message.inbox.userId !== userId) {
      throw new NotFoundException('Message not found');
    }

    return message;
  }

  async markAsRead(userId: string, messageId: string) {
    const message = await this.getMessage(userId, messageId);
    
    await this.prisma.emailMessage.update({
      where: { id: messageId },
      data: { status: EmailStatus.READ },
    });

    return message;
  }

  // ── Reply & Forward ─────────────────────────────────────────────

  async createReplyDraft(
    userId: string,
    inboxId: string,
    originalMessageId: string,
  ) {
    const inbox = await this.prisma.inbox.findFirst({
      where: { id: inboxId, userId },
    });

    if (!inbox) {
      throw new NotFoundException('Inbox not found');
    }

    const original = await this.getMessage(userId, originalMessageId);
    if (!original) {
      throw new NotFoundException('Original message not found');
    }

    const quotedBlock = buildQuotedReplyBlock({
      date: original.createdAt.toISOString(),
      sender: original.fromAddress,
      body: original.bodyHtml || original.body || '',
    });

    return {
      to: [original.fromAddress],
      subject: original.subject?.startsWith('Re:') 
        ? original.subject 
        : `Re: ${original.subject || ''}`,
      body: quotedBlock,
      inReplyTo: original.messageId || original.id,
      threadId: original.threadId,
    };
  }

  // ── Webhook Management ─────────────────────────────────────────

  async registerWebhook(userId: string, dto: RegisterWebhookDto) {
    const webhook = await this.prisma.webhookEndpoint.create({
      data: {
        userId,
        url: dto.url,
        events: dto.events || ['email.received'],
        secret: dto.secret,
      },
    });

    return webhook;
  }

  async getWebhooks(userId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteWebhook(userId: string, webhookId: string) {
    const webhook = await this.prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, userId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    await this.prisma.webhookEndpoint.delete({
      where: { id: webhookId },
    });

    return { success: true };
  }

  // ── Search ──────────────────────────────────────────────────────

  async searchEmails(
    userId: string,
    query: string,
    options: {
      inboxId?: string;
      from?: string;
      to?: string;
      subject?: string;
      dateStart?: Date;
      dateEnd?: Date;
      hasAttachments?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const { inboxId, from, to, subject, dateStart, dateEnd, hasAttachments, limit = 50, offset = 0 } = options;

    const where: any = {
      inbox: { userId },
    };

    if (query) {
      where.OR = [
        { subject: { contains: query, mode: 'insensitive' } },
        { body: { contains: query, mode: 'insensitive' } },
        { fromAddress: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (inboxId) where.inboxId = inboxId;
    if (from) where.fromAddress = { contains: from, mode: 'insensitive' };
    if (to) where.toAddresses = { hasSome: [to] };
    if (subject) where.subject = { contains: subject, mode: 'insensitive' };
    if (dateStart || dateEnd) {
      where.createdAt = {};
      if (dateStart) where.createdAt.gte = dateStart;
      if (dateEnd) where.createdAt.lte = dateEnd;
    }

    const [emails, totalCount] = await Promise.all([
      this.prisma.emailMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: { inbox: { select: { emailAddress: true } } },
      }),
      this.prisma.emailMessage.count({ where }),
    ]);

    return { emails, totalCount };
  }
}
