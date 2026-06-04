/**
 * Cloudflare Email Service integration
 * Sends emails via Cloudflare's Email Service REST API
 * https://developers.cloudflare.com/email-service/api/send-emails/rest-api/
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface SendEmailParams {
    to: string | string[];
    from: string | { address: string; name: string };
    subject: string;
    html?: string;
    text?: string;
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string | { address: string; name: string };
    attachments?: {
        content: string; // base64 encoded
        filename: string;
        type: string;
        disposition: 'attachment' | 'inline';
        contentId?: string;
    }[];
    headers?: Record<string, string>;
}

interface CloudflareSendResponse {
    success: boolean;
    errors: Array<{ code: number; message: string }>;
    messages: string[];
    result: {
        delivered: string[];
        permanent_bounces: string[];
        queued: string[];
    };
}

@Injectable()
export class CloudflareEmailService {
    private readonly logger = new Logger(CloudflareEmailService.name);

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {}

    /**
     * Send email via Cloudflare Email Service REST API.
     * Endpoint: POST /accounts/{account_id}/email/sending/send
     * https://developers.cloudflare.com/email-service/api/send-emails/rest-api/
     */
    async sendEmail(params: SendEmailParams): Promise<{ messageId: string }> {
        const apiToken = this.configService.get<string>('CLOUDFLARE_API_TOKEN');
        const accountId = this.configService.get<string>('CLOUDFLARE_ACCOUNT_ID');

        if (!apiToken || !accountId) {
            throw new BadRequestException(
                'Cloudflare credentials not configured. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID environment variables.',
            );
        }

        // Build the message payload per Cloudflare REST API spec
        const message: Record<string, unknown> = {
            to: params.to,
            from: params.from,
            subject: params.subject,
        };

        if (params.html) message.html = params.html;
        if (params.text) message.text = params.text;
        if (params.cc) message.cc = params.cc;
        if (params.bcc) message.bcc = params.bcc;

        // REST API uses "reply_to" not "replyTo"
        if (params.replyTo) {
            if (typeof params.replyTo === 'string') {
                message.reply_to = params.replyTo;
            } else {
                message.reply_to = {
                    address: params.replyTo.address,
                    name: params.replyTo.name,
                };
            }
        }

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

        // Correct endpoint per Cloudflare docs
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`;

        this.logger.debug(`Sending email via Cloudflare: ${url}`);

        try {
            const response = await firstValueFrom(
                this.httpService.post<CloudflareSendResponse>(url, message, {
                    headers: {
                        Authorization: `Bearer ${apiToken}`,
                        'Content-Type': 'application/json',
                    },
                }),
            );

            const data = response.data;

            if (!data.success) {
                const errors = data.errors.map(e => `${e.code}: ${e.message}`).join('; ');
                throw new Error(`Cloudflare Email Service error: ${errors}`);
            }

            this.logger.log(
                `Email sent. Delivered: ${data.result.delivered.length}, Bounces: ${data.result.permanent_bounces.length}, Queued: ${data.result.queued.length}`,
            );

            // REST API does not return a messageId. Use a Cloudflare-prefixed ID for tracking.
            return { messageId: `cf-${Date.now()}` };
        } catch (error: any) {
            this.logger.error('Cloudflare Email Service request failed:', error.message);

            if (error.response) {
                const status = error.response.status;
                const cfErrors = error.response.data?.errors;
                if (cfErrors && Array.isArray(cfErrors)) {
                    const details = cfErrors.map((e: any) => `${e.code}: ${e.message}`).join('; ');
                    throw new BadRequestException(`Cloudflare Email Service error (${status}): ${details}`);
                }
                throw new BadRequestException(`Cloudflare Email Service error (${status}): ${error.message}`);
            }

            throw new BadRequestException(`Email sending failed: ${error.message}`);
        }
    }
}
