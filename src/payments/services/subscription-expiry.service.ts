import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../services/prisma.service';
import { SubscriptionStatus, SubscriptionTier } from 'generated/prisma';

@Injectable()
export class SubscriptionExpiryService {
    private readonly logger = new Logger(SubscriptionExpiryService.name);

    constructor(
        private readonly prismaService: PrismaService,
        private readonly configService: ConfigService,
    ) {}

    /**
     * Runs daily at midnight UTC.
     * Finds subscriptions past their nextBillingDate and downgrades them to FREE tier.
     */
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async handleExpiredSubscriptions(): Promise<void> {
        this.logger.log('Starting subscription expiry check...');

        const now = new Date();

        try {
            // Find all ACTIVE subscriptions that have either:
            // 1. nextBillingDate in the past (expired paid subscription)
            // 2. subscriptionCancelDate in the past AND subscriptionStatus ACTIVE
            const expiredSubscriptions =
                await this.prismaService.subscription.findMany({
                    where: {
                        subscriptionStatus: SubscriptionStatus.ACTIVE,
                        subscriptionPlan: {
                            not: SubscriptionTier.FREE,
                        },
                        OR: [
                            {
                                nextBillingDate: { lt: now },
                                subscriptionCancelDate: { not: null },
                            },
                            {
                                nextBillingDate: { lt: now },
                                subscriptionCancelDate: null,
                            },
                        ],
                    },
                    include: {
                        user: true,
                    },
                });

            this.logger.log(
                `Found ${expiredSubscriptions.length} expired subscription(s)`,
            );

            for (const subscription of expiredSubscriptions) {
                await this.processExpiredSubscription(subscription);
            }

            this.logger.log('Subscription expiry check complete.');
        } catch (error: any) {
            this.logger.error('Error during subscription expiry check', {
                message: error.message,
                stack: error.stack,
            });
        }
    }

    private async processExpiredSubscription(subscription: any): Promise<void> {
        const userId = subscription.userId;

        this.logger.log(`Processing expired subscription for user ${userId}`);

        try {
            // Downgrade subscription to FREE and mark CANCELLED
            await this.prismaService.subscription.update({
                where: { id: subscription.id },
                data: {
                    subscriptionPlan: SubscriptionTier.FREE,
                    subscriptionStatus: SubscriptionStatus.CANCELLED,
                    updatedAt: new Date(),
                },
            });

            this.logger.log(
                `Downgraded subscription to FREE for user ${userId}`,
            );
        } catch (error: any) {
            this.logger.error(
                `Failed to process expired subscription for user ${userId}`,
                {
                    subscriptionId: subscription.id,
                    message: error.message,
                },
            );
        }
    }
}
