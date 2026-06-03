import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './webhook.controller';
import { PaymentsWebhookService } from './services/payment.webhook.service';
import { PrismaService } from 'src//services/prisma.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AtlosWebhookGuard } from './guards/atlos-webhook.guard';
import { PaymentAccessGuard } from './guards/payment-access.guard';
import { X402SubscriptionController } from './controllers/x402-subscription.controller';
import { X402SubscriptionService } from './services/x402-subscription.service';
import { X402MiddlewareService } from './services/x402-middleware.service';
import { SubscriptionPaymentService } from './services/subscription-payment.service';
import { SubscriptionExpiryService } from './services/subscription-expiry.service';

@Module({
    imports: [ConfigModule, HttpModule, ScheduleModule.forRoot()],
    controllers: [
        PaymentsController, 
        PaymentsWebhookController, 
        X402SubscriptionController,
    ],
    providers: [
        PaymentsService,
        PaymentsWebhookService,
        PrismaService,
        ConfigService,
        AtlosWebhookGuard,
        PaymentAccessGuard,
        X402SubscriptionService,
        X402MiddlewareService,
        SubscriptionPaymentService,
        SubscriptionExpiryService,
    ],
    exports: [
        PaymentsService, 
        X402SubscriptionService, 
        X402MiddlewareService, 
        SubscriptionPaymentService,
    ],
})
export class PaymentsModule {}
