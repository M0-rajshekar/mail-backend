/**
 * Webhook delivery service
 * Delivers email events to user webhook endpoints with retry logic
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { createHmac } from 'crypto';

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: any;
}

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Deliver event to all registered webhooks for a user
   */
  async deliverEvent(userId: string, event: string, data: any): Promise<void> {
    const webhooks = await this.prisma.webhookEndpoint.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        events: { has: event },
      },
    });

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    // Deliver to all webhooks in parallel
    await Promise.allSettled(
      webhooks.map((webhook) => this.deliverToWebhook(webhook, payload)),
    );
  }

  /**
   * Deliver payload to a single webhook endpoint with retries
   */
  private async deliverToWebhook(
    webhook: any,
    payload: WebhookPayload,
  ): Promise<void> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'AgentMail-Webhook/1.0',
          'X-Webhook-Event': payload.event,
          'X-Webhook-Timestamp': payload.timestamp,
          'X-Webhook-ID': crypto.randomUUID(),
        };

        // Add signature if secret is configured
        if (webhook.secret) {
          const signature = this.signPayload(payload, webhook.secret);
          headers['X-Webhook-Signature'] = signature;
        }

        const response = await firstValueFrom(
          this.httpService.post(webhook.url, payload, {
            headers,
            timeout: 30000, // 30 second timeout
            validateStatus: () => true, // Don't throw on non-2xx
          }),
        );

        if (response.status >= 200 && response.status < 300) {
          // Success - update last triggered time
          await this.prisma.webhookEndpoint.update({
            where: { id: webhook.id },
            data: {
              lastTriggeredAt: new Date(),
              failureCount: 0,
            },
          });

          this.logger.log(`Webhook delivered successfully: ${webhook.url} (${payload.event})`);
          return;
        } else {
          throw new Error(`Webhook returned status ${response.status}`);
        }
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          `Webhook delivery attempt ${attempt + 1}/${maxRetries} failed for ${webhook.url}: ${error.message}`,
        );

        if (attempt < maxRetries - 1) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt) * 1000;
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    this.logger.error(`Webhook delivery failed after ${maxRetries} attempts: ${webhook.url}`);
    
    // Update failure count and potentially disable webhook
    const newFailureCount = (webhook.failureCount || 0) + 1;
    const status = newFailureCount >= 10 ? 'DISABLED' : webhook.status;

    await this.prisma.webhookEndpoint.update({
      where: { id: webhook.id },
      data: {
        failureCount: newFailureCount,
        status,
      },
    });

    if (lastError) {
      throw lastError;
    }
  }

  /**
   * Sign payload with HMAC-SHA256
   */
  private signPayload(payload: WebhookPayload, secret: string): string {
    const payloadString = JSON.stringify(payload);
    return createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
  }

  /**
   * Verify webhook signature
   */
  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expected = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    return signature === expected;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
