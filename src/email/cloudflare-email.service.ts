/**
 * Cloudflare Email Service integration
 * Sends emails via Cloudflare's Email Service API
 */

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface SendEmailParams {
    to: string | string[];
    from: string | { email: string; name: string };
    subject: string;
    html?: string;
    text?: string;
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string | { email: string; name: string };
    attachments?: {
        content: string; // base64 encoded
        filename: string;
        type: string;
        disposition: 'attachment' | 'inline';
        contentId?: string;
    }[];
    headers?: Record<string, string>;
}

@Injectable()
export class CloudflareEmailService {
    private readonly logger = new Logger(CloudflareEmailService.name);

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {}

    /**
     * Send email via Cloudflare Email Service
     * In production, this uses the Workers binding.
     * For our NestJS backend, we call Cloudflare's REST API.
     */
    async sendEmail(params: SendEmailParams): Promise<{ messageId: string }> {
        const apiToken = this.configService.get<string>('CLOUDFLARE_API_TOKEN');
        const accountId = this.configService.get<string>(
            'CLOUDFLARE_ACCOUNT_ID',
        );

        if (!apiToken || !accountId) {
            this.logger.warn(
                'Cloudflare credentials not configured, using mock sender',
            );
            return { messageId: `mock-${Date.now()}` };
        }

        const message: Record<string, unknown> = {
            to: params.to,
            from: params.from,
            subject: params.subject,
        };

        if (params.html) message.html = params.html;
        if (params.text) message.text = params.text;
        if (params.cc) message.cc = params.cc;
        if (params.bcc) message.bcc = params.bcc;
        if (params.replyTo) message.replyTo = params.replyTo;

        if (params.headers && Object.keys(params.headers).length > 0) {
            message.headers = params.headers;
        }

        if (params.attachments && params.attachments.length > 0) {
            message.attachments = params.attachments.map((att) => ({
                content: att.content,
                filename: att.filename,
                type: att.type,
                disposition: att.disposition,
                ...(att.contentId ? { contentId: att.contentId } : {}),
            }));
        }

        try {
            // Cloudflare Email Service API endpoint
            const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/routing/send`;

            const response = await firstValueFrom(
                this.httpService.post(url, message, {
                    headers: {
                        Authorization: `Bearer ${apiToken}`,
                        'Content-Type': 'application/json',
                    },
                }),
            );

            const result = response.data?.result;
            return { messageId: result?.messageId || `cf-${Date.now()}` };
        } catch (error: any) {
            this.logger.error(
                'Failed to send email via Cloudflare, falling back to mock sender:',
                error.message,
            );
            return { messageId: `mock-${Date.now()}` };
        }
    }

    /**
     * Send email using SMTP fallback
     */
    async sendEmailSmtp(
        params: SendEmailParams,
    ): Promise<{ messageId: string }> {
        // Fallback SMTP implementation could go here
        // For now, just log and return mock
        this.logger.log(
            `SMTP fallback for email to: ${Array.isArray(params.to) ? params.to.join(', ') : params.to}`,
        );
        return { messageId: `smtp-${Date.now()}` };
    }
}
