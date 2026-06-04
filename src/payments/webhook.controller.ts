import { Body, Controller, Post, Get, Logger, Req } from '@nestjs/common';
import { PaymentsWebhookService } from './services/payment.webhook.service';
import { Request } from 'express';

@Controller('payments/webhook/social')
export class PaymentsWebhookController {
    private readonly logger = new Logger(PaymentsWebhookController.name);

    constructor(
        private readonly paymentsWebhookService: PaymentsWebhookService,
    ) {}

    @Get('test')
    testWebhook() {
        this.logger.log('Webhook test endpoint hit');
        return {
            success: true,
            message: 'SocialPilot webhook endpoint is accessible',
            timestamp: new Date().toISOString(),
            endpoint: '/payments/webhook/social/test',
        };
    }

    @Post('confirm-payin-completed')
    // @UseGuards(AtlosWebhookGuard)
    async confirmPayinCompleted(@Body() body: any, @Req() request: Request) {
        this.logger.log('=== WEBHOOK RECEIVED FROM ATLOS ===');
        this.logger.log(
            'Request Headers:',
            JSON.stringify(request.headers, null, 2),
        );
        this.logger.log('Request Body:', JSON.stringify(body, null, 2));
        this.logger.log('Request IP:', request.ip);
        this.logger.log('Request URL:', request.url);
        this.logger.log('Request Method:', request.method);

        return await this.paymentsWebhookService.confirmPayinCompleted(body);
    }
}
