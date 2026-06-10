import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import {
    InboxStatus,
    EmailDirection,
    EmailStatus,
    DomainStatus,
} from 'generated/prisma';
import { CloudflareEmailService } from './cloudflare-email.service';
import { AttachmentStorageService } from './attachment-storage.service';
import { AttachmentExtractionService } from './attachment-extraction.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { EmailParserService } from './email-parser.service';
import { EmbeddingService } from './embedding.service';
import { EmailGateway } from './email.gateway';
import { CustomDomainService } from './custom-domain.service';
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
import {
    canCreateInbox,
    canCreateWebhook,
    getInboxLimit,
    getEmailsPerMonthLimit,
    getEmailsPerHourLimit,
    getEmailsPerDayLimit,
    getWebhookLimit,
} from '../payments/constants/subscription-plans';

export interface CreateInboxDto {
    emailAddress: string;
    displayName?: string;
    customDomainId?: string;
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
        private readonly attachmentExtraction: AttachmentExtractionService,
        private readonly webhookDelivery: WebhookDeliveryService,
        private readonly emailParser: EmailParserService,
        private readonly embeddingService: EmbeddingService,
        private readonly customDomainService: CustomDomainService,
        private readonly emailGateway?: EmailGateway,
    ) {}

    // ── Inbox Management ──────────────────────────────────────────

    async createInbox(userId: string, dto: CreateInboxDto) {
        const normalizedEmail = dto.emailAddress.toLowerCase().trim();
        let customDomainId: string | undefined = undefined;

        // Extract domain from email
        const emailDomain = normalizedEmail.split('@')[1];
        if (!emailDomain) {
            throw new BadRequestException('Invalid email address format');
        }

        // Check if this is the system default domain (e.g., trueprop.xyz)
        // System domains are NOT custom domains - they're shared infrastructure
        const defaultDomain = process.env.DEFAULT_EMAIL_DOMAIN;
        const isSystemDomain =
            defaultDomain &&
            emailDomain.toLowerCase() === defaultDomain.toLowerCase();

        // Only enforce custom domain checks for non-system domains
        if (!isSystemDomain) {
            // SECURITY CHECK: Check if ANY user has registered this domain (regardless of verification status)
            // This prevents race conditions where User B creates an inbox while User A's domain is pending
            const registeredDomain = await this.prisma.customDomain.findFirst({
                where: {
                    domain: { equals: emailDomain, mode: 'insensitive' },
                },
            });

            if (registeredDomain && registeredDomain.userId !== userId) {
                throw new ForbiddenException(
                    `Domain "${emailDomain}" is already registered by another user. You cannot create inboxes on this domain.`,
                );
            }
        }

        // Check if this email domain belongs to user's verified custom domain
        const existingCustomDomain = await this.prisma.customDomain.findFirst({
            where: {
                domain: { equals: emailDomain, mode: 'insensitive' },
                userId,
                verified: true,
                status: DomainStatus.ACTIVE,
            },
        });

        if (existingCustomDomain) {
            // User owns this verified domain - must provide the customDomainId
            if (!dto.customDomainId) {
                throw new BadRequestException(
                    `Email "${normalizedEmail}" uses your custom domain "${emailDomain}". Please select this domain from the dropdown when creating the inbox.`,
                );
            }

            if (dto.customDomainId !== existingCustomDomain.id) {
                throw new BadRequestException(
                    `Domain ID mismatch. The email "${normalizedEmail}" belongs to domain "${existingCustomDomain.domain}".`,
                );
            }

            customDomainId = existingCustomDomain.id;
        } else if (dto.customDomainId) {
            // User provided a customDomainId but email doesn't match
            const domain = await this.prisma.customDomain.findFirst({
                where: {
                    id: dto.customDomainId,
                    userId,
                    verified: true,
                    status: DomainStatus.ACTIVE,
                },
            });

            if (!domain) {
                throw new BadRequestException(
                    'Custom domain not found, not verified, or does not belong to you',
                );
            }

            // Validate email address ends with the correct domain
            if (emailDomain.toLowerCase() !== domain.domain.toLowerCase()) {
                throw new BadRequestException(
                    `Email must end with @${domain.domain} when using this custom domain`,
                );
            }

            customDomainId = domain.id;
        }

        // Check for duplicate email address (case-insensitive)
        const existing = await this.prisma.inbox.findUnique({
            where: { emailAddress: normalizedEmail },
        });

        if (existing) {
            throw new BadRequestException(
                `Email address "${normalizedEmail}" is already in use by another inbox`,
            );
        }

        // Check subscription plan limits
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { currentPlan: true },
        });

        const currentInboxCount = await this.prisma.inbox.count({
            where: { userId, status: { not: 'DELETED' } },
        });

        if (!canCreateInbox(user?.currentPlan || 'FREE', currentInboxCount)) {
            const limit = getInboxLimit(user?.currentPlan || 'FREE');
            throw new BadRequestException(
                `Inbox limit reached: your ${user?.currentPlan || 'FREE'} plan allows ${limit === -1 ? 'unlimited' : limit} inboxes. Upgrade to create more.`,
            );
        }

        const inbox = await this.prisma.inbox.create({
            data: {
                userId,
                customDomainId,
                emailAddress: normalizedEmail,
                displayName: dto.displayName || normalizedEmail.split('@')[0],
                status: InboxStatus.ACTIVE,
            },
        });

        this.logger.log(
            `Created inbox ${inbox.id} for user ${userId}${customDomainId ? ' on custom domain' : ''}`,
        );
        return inbox;
    }

    async getInboxes(userId: string) {
        return this.prisma.inbox.findMany({
            where: { userId, status: { not: InboxStatus.DELETED } },
            orderBy: { createdAt: 'desc' },
            include: {
                customDomain: {
                    select: {
                        id: true,
                        domain: true,
                        verified: true,
                    },
                },
            },
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
                customDomain: {
                    select: {
                        id: true,
                        domain: true,
                        verified: true,
                    },
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

        // Check plan-based rate limits
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { currentPlan: true },
        });

        const plan = user?.currentPlan || 'FREE';

        // Check monthly email quota
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const monthlySent = await this.prisma.emailMessage.count({
            where: {
                inbox: { userId },
                direction: 'OUTBOUND',
                sentAt: { gte: monthStart },
            },
        });

        const monthlyLimit = getEmailsPerMonthLimit(plan);
        if (monthlyLimit !== -1 && monthlySent >= monthlyLimit) {
            throw new BadRequestException(
                `Monthly email limit reached: your ${plan} plan allows ${monthlyLimit.toLocaleString()} emails per month. Upgrade to send more.`,
            );
        }

        // Check per-inbox rate limits (plan-specific)
        const planHourLimit = getEmailsPerHourLimit(plan);
        const planDayLimit = getEmailsPerDayLimit(plan);

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const hourCount = await this.prisma.emailMessage.count({
            where: {
                inboxId,
                direction: 'OUTBOUND',
                sentAt: { gte: oneHourAgo },
            },
        });

        if (hourCount >= planHourLimit) {
            throw new BadRequestException(
                `Rate limit exceeded: max ${planHourLimit} emails per hour per inbox on the ${plan} plan.`,
            );
        }

        const dayCount = await this.prisma.emailMessage.count({
            where: {
                inboxId,
                direction: 'OUTBOUND',
                sentAt: { gte: oneDayAgo },
            },
        });

        if (dayCount >= planDayLimit) {
            throw new BadRequestException(
                `Rate limit exceeded: max ${planDayLimit} emails per day per inbox on the ${plan} plan.`,
            );
        }

        // Validate sender
        const fromEmail = inbox.emailAddress;

        // Validate that FROM address is allowed (custom domain must be verified)
        const fromValidation =
            await this.customDomainService.validateFromAddress(
                userId,
                fromEmail,
            );
        if (!fromValidation.valid) {
            throw new BadRequestException(fromValidation.error);
        }

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
            } as any,
        });

        // Emit websocket event
        if (this.emailGateway) {
            this.emailGateway.emitEmailSent(userId, message);
        }

        // Send via Cloudflare
        this.logger.log(
            `Sending email from ${fromEmail} to ${dto.to.join(', ')} via Cloudflare...`,
        );
        try {
            const result = await this.cloudflareEmail.sendEmail({
                to: dto.to,
                from: {
                    address: fromEmail,
                    name: inbox.displayName || fromEmail,
                },
                subject: dto.subject,
                text: dto.body,
                html: dto.bodyHtml || textToHtml(dto.body),
                cc: dto.cc,
                bcc: dto.bcc,
                headers:
                    Object.keys(threadingHeaders).length > 0
                        ? threadingHeaders
                        : undefined,
            });
            this.logger.log(`Email sent successfully: ${result.messageId}`);
        } catch (error: any) {
            this.logger.error(`Failed to send email: ${error.message}`);

            // Mark as failed but keep record
            await this.prisma.emailMessage.update({
                where: { id: message.id },
                data: { status: EmailStatus.FAILED },
            });

            throw new BadRequestException(
                `Failed to send email: ${error.message}`,
            );
        }

        // Update inbox stats
        await this.prisma.inbox.update({
            where: { id: inbox.id },
            data: {
                totalEmails: { increment: 1 },
                lastActivityAt: new Date(),
            },
        });

        // Emit websocket event
        if (this.emailGateway) {
            this.emailGateway.emitEmailReceived(inbox.id, message);
            this.emailGateway.emitInboxUpdate(inbox.id, {
                totalEmails: inbox.totalEmails + 1,
            });
        }

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

    async handleInboundEmail(emailAddress: string, rawEmail: Buffer) {
        this.logger.log(
            `Processing inbound email for: ${emailAddress}, raw size: ${rawEmail.length} bytes`,
        );

        // Parse email
        let parsed;
        try {
            parsed = await this.emailParser.parseEmail(rawEmail);
            this.logger.log(
                `Email parsed: subject="${parsed.subject}", from=${parsed.from?.address}`,
            );
        } catch (parseError) {
            this.logger.error(`Failed to parse email: ${parseError.message}`);
            throw parseError;
        }

        const recipients = this.emailParser.extractRecipients(parsed);

        // Find the inbox
        const inbox = await this.prisma.inbox.findUnique({
            where: { emailAddress: emailAddress.toLowerCase() },
            include: { user: true },
        });

        if (!inbox) {
            this.logger.warn(`Inbox not found for ${emailAddress}`);
            return null;
        }

        if (inbox.status !== InboxStatus.ACTIVE) {
            this.logger.warn(
                `Inbox found but not active: ${emailAddress}, status=${inbox.status}`,
            );
            return null;
        }

        this.logger.log(`Found inbox: ${inbox.id} for ${emailAddress}`);

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

        // Store attachments and extract text content
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

                // Extract text content for LLM consumption
                        let extractedText: string | null = null;
                        if (this.attachmentExtraction.isExtractable(att.mimeType, att.filename || '')) {
                            try {
                                const extracted = await this.attachmentExtraction.extractAttachment(
                                    att.filename || 'untitled',
                                    att.mimeType,
                                    Buffer.from(att.content),
                                );
                                extractedText = extracted.extractedText;
                            } catch (err) {
                                this.logger.warn(`Attachment extraction failed for ${att.filename}: ${err.message}`);
                            }
                        }

                storedAttachments.push({
                    ...stored,
                    extractedText,
                });
            }
        }

        // Generate embedding for semantic search
        let embedding: any = null;
        try {
            embedding = await this.embeddingService.generateEmailEmbedding(
                parsed.subject,
                parsed.text || stripHtmlToText(parsed.html || ''),
            );
        } catch (err) {
            this.logger.warn(`Failed to generate embedding: ${err.message}`);
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
                    extractedText: att.extractedText || null,
                })),
                metadata: {
                    headers: parsed.headers,
                    inReplyTo,
                    references,
                },
            } as any,
        });

        // Set embedding via raw SQL since it's a pgvector Unsupported type
        if (embedding) {
            try {
                const embeddingStr = `[${(embedding as number[]).join(',')}]`;
                await this.prisma.$executeRawUnsafe(
                    `UPDATE email_messages SET embedding = $1::vector WHERE id = $2`,
                    embeddingStr,
                    message.id,
                );
            } catch (err: any) {
                this.logger.warn(`Failed to store embedding: ${err.message}`);
            }
        }

        // Update inbox stats
        await this.prisma.inbox.update({
            where: { id: inbox.id },
            data: {
                totalEmails: { increment: 1 },
                lastActivityAt: new Date(),
            },
        });

        // Trigger webhooks
        await this.webhookDelivery.deliverEvent(
            inbox.userId,
            'email.received',
            {
                inboxId: inbox.id,
                messageId: message.id,
                from: parsed.from?.address,
                subject: parsed.subject,
                preview:
                    parsed.text?.substring(0, 200) ||
                    stripHtmlToText(parsed.html || '').substring(0, 200),
                threadId: message.threadId,
            },
        );

        this.logger.log(
            `Received email for ${emailAddress} from ${parsed.from?.address}`,
        );
        return message;
    }

    // ── Inbound Email Handling (Parsed Data) ─────────────────────────

    async handleInboundEmailParsed(data: {
        emailAddress: string;
        from: string;
        subject: string;
        body: string;
        bodyHtml?: string;
        headers?: Record<string, string>;
    }) {
        const { emailAddress, from, subject, body, bodyHtml, headers } = data;

        this.logger.log(
            `Processing parsed inbound email for: ${emailAddress}, from: ${from}, subject: "${subject}"`,
        );

        // Find the inbox
        const inbox = await this.prisma.inbox.findUnique({
            where: { emailAddress: emailAddress.toLowerCase() },
            include: { user: true },
        });

        if (!inbox) {
            this.logger.warn(`Inbox not found for ${emailAddress}`);
            return null;
        }

        if (inbox.status !== InboxStatus.ACTIVE) {
            this.logger.warn(
                `Inbox found but not active: ${emailAddress}, status=${inbox.status}`,
            );
            return null;
        }

        this.logger.log(`Found inbox: ${inbox.id} for ${emailAddress}`);

        // Determine thread ID by subject
        let threadId: string | null = null;
        if (subject) {
            threadId = await this.findThreadBySubject(inbox.id, subject, from);
        }

        const messageId = crypto.randomUUID();

        // Generate embedding for semantic search
        let embedding: any = null;
        try {
            embedding = await this.embeddingService.generateEmailEmbedding(
                subject,
                body,
            );
        } catch (err) {
            this.logger.warn(`Failed to generate embedding: ${err.message}`);
        }

        // Store email
        const message = await this.prisma.emailMessage.create({
            data: {
                inboxId: inbox.id,
                messageId: messageId,
                fromAddress: from.toLowerCase(),
                fromName: null,
                toAddresses: [emailAddress.toLowerCase()],
                ccAddresses: [],
                bccAddresses: [],
                subject: subject || '',
                body: body || '',
                bodyHtml: bodyHtml || null,
                direction: EmailDirection.INBOUND,
                status: EmailStatus.RECEIVED,
                receivedAt: new Date(),
                threadId: threadId || messageId,
                attachments: [],
                metadata: {
                    headers: headers || {},
                },
            } as any,
        });

        // Set embedding via raw SQL since it's a pgvector Unsupported type
        if (embedding) {
            try {
                const embeddingStr = `[${(embedding as number[]).join(',')}]`;
                await this.prisma.$executeRawUnsafe(
                    `UPDATE email_messages SET embedding = $1::vector WHERE id = $2`,
                    embeddingStr,
                    message.id,
                );
            } catch (err: any) {
                this.logger.warn(`Failed to store embedding: ${err.message}`);
            }
        }

        // Update inbox stats
        await this.prisma.inbox.update({
            where: { id: inbox.id },
            data: {
                totalEmails: { increment: 1 },
                lastActivityAt: new Date(),
            },
        });

        // Emit websocket event
        if (this.emailGateway) {
            this.emailGateway.emitEmailReceived(inbox.id, message);
            this.emailGateway.emitInboxUpdate(inbox.id, {
                totalEmails: inbox.totalEmails + 1,
            });
        }

        // Trigger webhooks
        await this.webhookDelivery.deliverEvent(
            inbox.userId,
            'email.received',
            {
                inboxId: inbox.id,
                messageId: message.id,
                from: from,
                subject: subject,
                preview: body?.substring(0, 200) || '',
                threadId: message.threadId,
            },
        );

        this.logger.log(
            `Received parsed email for ${emailAddress} from ${from}`,
        );
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

        const [emails, totalCount] = await Promise.all([
            this.prisma.emailMessage.findMany({
                where: { inboxId },
                orderBy: { createdAt: 'desc' },
                skip: offset,
                take: limit,
            }),
            this.prisma.emailMessage.count({
                where: { inboxId },
            }),
        ]);

        return { emails, totalCount };
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
            data: {
                isRead: true,
                status: EmailStatus.READ,
            },
        });

        return message;
    }

    async toggleStar(userId: string, messageId: string) {
        const message = await this.getMessage(userId, messageId);

        const updated = await this.prisma.emailMessage.update({
            where: { id: messageId },
            data: { starred: !message.starred },
        });

        return updated;
    }

    async moveToTrash(userId: string, messageId: string) {
        const message = await this.getMessage(userId, messageId);

        await this.prisma.emailMessage.update({
            where: { id: messageId },
            data: { status: EmailStatus.TRASH },
        });

        return { success: true };
    }

    async restoreFromTrash(userId: string, messageId: string) {
        const message = await this.getMessage(userId, messageId);

        await this.prisma.emailMessage.update({
            where: { id: messageId },
            data: {
                status:
                    message.direction === 'INBOUND'
                        ? EmailStatus.RECEIVED
                        : EmailStatus.SENT,
                isRead: true,
            },
        });

        return { success: true };
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
        // Check subscription plan webhook limits
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { currentPlan: true },
        });

        const currentWebhookCount = await this.prisma.webhookEndpoint.count({
            where: { userId, status: 'ACTIVE' },
        });

        if (
            !canCreateWebhook(user?.currentPlan || 'FREE', currentWebhookCount)
        ) {
            const limit = getWebhookLimit(user?.currentPlan || 'FREE');
            throw new BadRequestException(
                `Webhook limit reached: your ${user?.currentPlan || 'FREE'} plan allows ${limit === -1 ? 'unlimited' : limit} webhooks. Upgrade to create more.`,
            );
        }

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

    // ── Stats ───────────────────────────────────────────────────────

    async getStats(userId: string) {
        const [
            totalInboxes,
            totalEmails,
            emailsSent,
            emailsReceived,
            activeWebhooks,
            recentEmails,
        ] = await Promise.all([
            this.prisma.inbox.count({ where: { userId } }),
            this.prisma.emailMessage.count({
                where: { inbox: { userId } },
            }),
            this.prisma.emailMessage.count({
                where: { inbox: { userId }, direction: 'OUTBOUND' },
            }),
            this.prisma.emailMessage.count({
                where: { inbox: { userId }, direction: 'INBOUND' },
            }),
            this.prisma.webhookEndpoint.count({
                where: { userId, status: 'ACTIVE' },
            }),
            this.prisma.emailMessage.findMany({
                where: { inbox: { userId } },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: {
                    id: true,
                    subject: true,
                    fromAddress: true,
                    direction: true,
                    createdAt: true,
                    inbox: { select: { emailAddress: true } },
                },
            }),
        ]);

        return {
            totalInboxes,
            totalEmails,
            emailsSent,
            emailsReceived,
            activeWebhooks,
            recentEmails,
        };
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
        const {
            inboxId,
            from,
            to,
            subject,
            dateStart,
            dateEnd,
            hasAttachments,
            limit = 50,
            offset = 0,
        } = options;

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

    // ── Semantic Search ─────────────────────────────────────────────

    async semanticSearch(userId: string, query: string, limit = 20) {
        // Generate embedding for the search query
        const queryEmbedding =
            await this.embeddingService.generateEmbedding(query);

        const vectorStr = queryEmbedding.join(',');

        // Find similar emails using cosine similarity
        // Using $queryRawUnsafe because vector literals cannot be parameterized
        const results = await this.prisma.$queryRawUnsafe(`
      SELECT 
        m.id,
        m."inboxId",
        m."fromAddress",
        m."fromName",
        m."toAddresses",
        m.subject,
        m.body,
        m."bodyHtml",
        m."createdAt",
        m.direction,
        m.status,
        i."emailAddress" as "inboxEmail",
        1 - (m.embedding <=> '[${vectorStr}]'::vector) as similarity
      FROM "email_messages" m
      JOIN "inboxes" i ON m."inboxId" = i.id
      WHERE i."userId" = '${userId}'
        AND m.embedding IS NOT NULL
      ORDER BY m.embedding <=> '[${vectorStr}]'::vector
      LIMIT ${limit}
    `);

        return {
            emails: results,
            query,
            count: Array.isArray(results) ? results.length : 0,
        };
    }

    // ── Bulk Embeddings ───────────────────────────────────────────

    async backfillEmbeddings(userId: string) {
        // Find all emails without embeddings for this user
        const emails = await this.prisma.emailMessage.findMany({
            where: {
                inbox: { userId },
                embedding: null,
            } as any,
            select: {
                id: true,
                subject: true,
                body: true,
            },
            take: 100, // Process in batches
        });

        let processed = 0;
        let failed = 0;

        for (const email of emails) {
            try {
                const embedding =
                    await this.embeddingService.generateEmailEmbedding(
                        email.subject,
                        email.body,
                    );
                const vectorStr = embedding.join(',');

                await this.prisma.$executeRawUnsafe(`
                    UPDATE "email_messages"
                    SET embedding = '[${vectorStr}]'::vector
                    WHERE id = '${email.id}'
                `);

                processed++;
            } catch (err: any) {
                this.logger.warn(
                    `Failed to embed email ${email.id}: ${err.message}`,
                );
                failed++;
            }
        }

        return {
            processed,
            failed,
            total: emails.length,
            message: `Backfill complete: ${processed} embedded, ${failed} failed`,
        };
    }

    // ── Attachments ─────────────────────────────────────────────────

    async getAttachmentDownloadUrl(s3Key: string): Promise<string> {
        return this.attachmentStorage.getPresignedUrl(s3Key, 3600);
    }

    // ── Config / Diagnostics ────────────────────────────────────────

    async getConfig() {
        const apiToken = process.env.CLOUDFLARE_API_TOKEN;
        const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

        return {
            cloudflareConfigured: !!(apiToken && accountId),
            accountId: accountId
                ? `${accountId.substring(0, 4)}...${accountId.substring(accountId.length - 4)}`
                : null,
            apiTokenLength: apiToken ? apiToken.length : 0,
            senderDomain: process.env.SENDER_DOMAIN || null,
        };
    }
}
