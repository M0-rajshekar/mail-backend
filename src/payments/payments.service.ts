import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../services/prisma.service';
import { firstValueFrom } from 'rxjs';
import {
    AtlosAssetsResponse,
    AtlosInvoiceResponse,
    AtlosPaymentResponse,
    CancelSubscriptionDto,
    CreateAtlosInvoiceDto,
    CreateAtlosPaymentDto,
    CreateSubscriptionDto,
    ListAtlosAssetsDto,
} from './dto/payment.dto';
import { CREDIT_PER_DOLLAR_TOP_UP } from './constants';
import {
    FreePlanStatus,
    SubscriptionStatus,
    TopupStatus,
} from 'generated/prisma';
import {
    isValidUpgrade,
    getValidUpgradeTiers,
} from './constants/tier-hierarchy';
import {
    getSubscriptionCredits,
    canConnectAccount as canConnectAccountForTier,
    getAccountLimit,
} from './constants/subscription-plans';
import { RATE_LIMITS, RateLimitTier, ToolName } from '../shared/types/rate-limit.types';

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);
    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
        private readonly prismaService: PrismaService,
    ) {}

    async cancelSubscription(
        cancelSubscriptionDto: CancelSubscriptionDto,
    ): Promise<{
        success: boolean;
        message: string;
        subscriptionId?: string;
        nextBillingDate?: Date;
        cancellationDate?: Date;
        daysUntilCancellation?: number;
    }> {
        try {
            const subscription =
                await this.prismaService.subscription.findFirst({
                    where: {
                        userId: cancelSubscriptionDto.userId,
                        subscriptionStatus: 'ACTIVE',
                    },
                    take: 1,
                    orderBy: { updatedAt: 'desc' },
                });

            if (!subscription) {
                throw new BadRequestException('No active subscription found');
            }

            // Check if subscription was already cancelled
            if (subscription.subscriptionCancelDate) {
                throw new BadRequestException(
                    'Subscription is already scheduled for cancellation',
                );
            }

            const cancellationDate = new Date();

            // Set cancellation date but keep subscription active until next billing date
            // The subscription will remain active and user can use services until nextBillingDate
            await this.prismaService.subscription.update({
                where: { id: subscription.id },
                data: {
                    subscriptionCancelDate: cancellationDate,
                    updatedAt: new Date(),
                },
            });

            // Calculate days until cancellation
            let daysUntilCancellation: number | undefined;
            if (subscription.nextBillingDate) {
                const timeDiff =
                    subscription.nextBillingDate.getTime() -
                    new Date().getTime();
                daysUntilCancellation = Math.ceil(
                    timeDiff / (1000 * 3600 * 24),
                );
            }

            const response = {
                success: true,
                message:
                    'Subscription scheduled for cancellation successfully. You will continue to have access until your next billing date.',
                subscriptionId: subscription.id,
                nextBillingDate: subscription.nextBillingDate || undefined,
                cancellationDate,
                daysUntilCancellation,
            };

            this.logger.log(
                'Subscription scheduled for cancellation successfully',
                {
                    userId: cancelSubscriptionDto.userId,
                    subscriptionId: subscription.id,
                    nextBillingDate: subscription.nextBillingDate,
                    message:
                        'Subscription will remain active until next billing date, then will be cancelled automatically',
                },
            );

            return response;
        } catch (error: any) {
            this.logger.error('Error scheduling subscription cancellation:', {
                userId: cancelSubscriptionDto.userId,
                message: error.message,
            });

            if (error instanceof BadRequestException) {
                throw error;
            }

            throw new InternalServerErrorException(
                'Failed to cancel subscription',
            );
        }
    }

    /**
     * Cancel subscription via Atlos API
     * This cancels the recurring payment at the payment gateway level
     */
    async cancelAtlosSubscription(userId: string): Promise<{
        success: boolean;
        message: string;
        subscriptionId?: string;
        subscriptionRefId?: string;
    }> {
        try {
            // Find the active subscription for the user
            const subscription =
                await this.prismaService.subscription.findFirst({
                    where: {
                        userId: userId,
                        subscriptionStatus: 'ACTIVE',
                    },
                    take: 1,
                    orderBy: { updatedAt: 'desc' },
                });

            if (!subscription) {
                throw new BadRequestException('No active subscription found');
            }

            if (!subscription.subscriptionRefId) {
                throw new BadRequestException(
                    'Subscription reference ID not found. Cannot cancel via Atlos.',
                );
            }

            // Get merchant ID from config
            const merchantId =
                this.configService.getOrThrow<string>('ATLOS_MERCHANT_ID');

            if (!merchantId) {
                throw new InternalServerErrorException(
                    'ATLOS_MERCHANT_ID not configured',
                );
            }

            const atlosApiSecret =
                this.configService.getOrThrow<string>('ATLOS_API_SECRET');
            if (!atlosApiSecret) {
                throw new InternalServerErrorException(
                    'Atlos API secret not configured',
                );
            }

            const atlasBaseUrl = 'https://api.atlos.io/gateway/rest/';
            const cancelUrl = `${atlasBaseUrl}Subscription/Cancel`;

            const payload = {
                MerchantId: merchantId,
                SubscriptionId: subscription.subscriptionRefId,
                OrderId: null,
            };

            this.logger.log(
                `Calling Atlos cancel subscription API for user ${userId}`,
                {
                    subscriptionId: subscription.id,
                    subscriptionRefId: subscription.subscriptionRefId,
                },
            );

            // Call Atlos API to cancel subscription
            const response = await firstValueFrom(
                this.httpService.post(cancelUrl, payload, {
                    headers: {
                        'Content-Type': 'application/json',
                        ApiSecret: atlosApiSecret,
                    },
                }),
            );

            this.logger.log(
                `Successfully cancelled Atlos subscription ${subscription.subscriptionRefId}`,
                { response: response.data },
            );

            // Mark the subscription as CANCELLED in our database
            await this.prismaService.subscription.update({
                where: { id: subscription.id },
                data: {
                    subscriptionStatus: 'CANCELLED',
                    subscriptionCancelDate: new Date(),
                    updatedAt: new Date(),
                },
            });

            return {
                success: true,
                message:
                    'Subscription cancelled successfully via Atlos. The subscription has been terminated immediately.',
                subscriptionId: subscription.id,
                subscriptionRefId: subscription.subscriptionRefId,
            };
        } catch (error: any) {
            this.logger.error('Error cancelling Atlos subscription:', {
                userId: userId,
                message: error.message,
                response: error.response?.data,
                status: error.response?.status,
            });

            if (
                error instanceof BadRequestException ||
                error instanceof NotFoundException
            ) {
                throw error;
            }

            throw new InternalServerErrorException(
                'Failed to cancel subscription via Atlos',
            );
        }
    }

    /**
     * Check if user has any other active plans (subscription or top-up)
     */
    private async checkForOtherActivePlans(userId: string): Promise<boolean> {
        // Check for active subscription
        const activeSubscription =
            await this.prismaService.subscription.findFirst({
                where: {
                    userId,
                    subscriptionStatus: 'ACTIVE',
                },
            });

        // Check for active top-up
        const activeTopUp = await this.prismaService.topUp.findFirst({
            where: {
                userId,
                status: 'ACTIVE',
            },
        });

        return !!(activeSubscription || activeTopUp);
    }

    async getLifeTimeCredits(userId: string): Promise<number> {
        const credits = await this.prismaService.credits.findFirst({
            where: { userId },
            select: { creditUsage: true },
        });

        const topUp = await this.prismaService.topUp.findFirst({
            where: { userId },
            select: { creditUsage: true },
        });

        const subscription = await this.prismaService.subscription.findFirst({
            where: { userId },
            select: { creditUsage: true },
        });

        return (
            (credits?.creditUsage ?? 0) +
            (topUp?.creditUsage ?? 0) +
            (subscription?.creditUsage ?? 0)
        );
    }

    async getCredits(userId: string): Promise<any> {
        // Implement getCreditsDetails function or replace with your logic
        return await this.getCreditsDetails(userId);
    }

    async getCurrentPlan(userId: string): Promise<{ currentPlan: string }> {
        const user = await this.prismaService.user.findUnique({
            where: { id: userId },
            select: { currentPlan: true },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return { currentPlan: user.currentPlan };
    }

    async getSubscriptionPlanDetails(userId: string): Promise<any> {
        // Find the most recent subscription that is either CREATED, ACTIVE or CANCELLED, whichever is most recent
        const subscription = await this.prismaService.subscription.findFirst({
            where: {
                userId,
                subscriptionStatus: {
                    in: ['CREATED', 'ACTIVE', 'CANCELLED'],
                },
            },
            orderBy: {
                updatedAt: 'desc',
            },
        });

        const user = await this.prismaService.user.findUnique({
            where: { id: userId },
            select: { currentPlan: true },
        });

        // Log the subscription data to debug nextBillingDate issue
        if (subscription) {
            this.logger.log(`Subscription found for user ${userId}:`);
            this.logger.log(`  - ID: ${subscription.id}`);
            this.logger.log(`  - Status: ${subscription.subscriptionStatus}`);
            this.logger.log(`  - Next Billing Date: ${subscription.nextBillingDate}`);
            this.logger.log(`  - Subscription Ref ID: ${subscription.subscriptionRefId}`);
        } else {
            this.logger.log(`No subscription found for user ${userId}`);
        }

        return { subscription, plan: user?.currentPlan };
    }

    async getTopUpPlanDetails(userId: string): Promise<any> {
        const topUp = await this.prismaService.topUp.findFirst({
            where: { userId },
        });

        if (!topUp) {
            throw new NotFoundException('No topUp found');
        }

        return topUp;
    }

    async getTransactionHistory(userId: string): Promise<any[]> {
        const transactions = await this.prismaService.transaction.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });

        return transactions;
    }

    async getUserStatus(userId: string): Promise<{ status: string }> {
        const user = await this.prismaService.user.findUnique({
            where: { id: userId },
            select: { status: true },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return { status: user.status };
    }

    async getActiveSubscription(userId: string): Promise<any> {
        const subscription = await this.prismaService.subscription.findFirst({
            where: { userId },
        });

        return subscription;
    }

    async getPendingPaymentAmt(userId: string): Promise<number | null> {
        const user = await this.prismaService.user.findUnique({
            where: { id: userId },
            select: { currentPlan: true },
        });

        if (!user || user.currentPlan === 'SUBSCRIPTION') {
            return null;
        }

        switch (user.currentPlan) {
            case 'FREE':
                const credits = await this.prismaService.credits.findFirst({
                    where: { userId, status: 'ACTIVE' },
                });

                if (!credits) return null;

                if (
                    credits.creditUsage &&
                    credits.creditUsage > credits.availableCredits
                ) {
                    return (
                        (credits.creditUsage - credits.availableCredits) /
                        CREDIT_PER_DOLLAR_TOP_UP
                    );
                }
                break;
            case 'TOP_UP':
                const topUp = await this.prismaService.topUp.findFirst({
                    where: { userId },
                });

                if (!topUp) return null;

                if (topUp.creditUsage > topUp.totalCredits) {
                    return (
                        (topUp.creditUsage - topUp.totalCredits) /
                        CREDIT_PER_DOLLAR_TOP_UP
                    );
                }
                break;

            default:
                break;
        }

        return null;
    }

    async switchBackToSubscription(userId: string): Promise<any> {
        const subscription = await this.prismaService.subscription.findMany({
            where: { userId, subscriptionStatus: 'ACTIVE' },
            orderBy: { updatedAt: 'desc' },
            take: 1,
        });

        if (!subscription[0]) {
            throw new NotFoundException('No subscription found');
        }

        return await this.prismaService.user.update({
            where: { id: userId },
            data: {
                currentPlan: 'SUBSCRIPTION',
            },
        });
    }

    private async getCreditsDetails(userId: string): Promise<any> {
        try {
            const existingUser = await this.prismaService.user.findFirst({
                where: { id: userId },
            });

            if (!existingUser) return null;

            switch (existingUser.currentPlan) {
                case 'FREE':
                    const credits = await this.prismaService.credits.findFirst({
                        where: { userId },
                        select: { availableCredits: true, creditUsage: true },
                    });

                    if (!credits) return null;

                    return {
                        availableCredits: credits.availableCredits,
                        creditUsage: credits.creditUsage,
                    };

                case 'TOP_UP':
                    const topUp = await this.prismaService.topUp.findFirst({
                        where: { userId },
                        select: { totalCredits: true, creditUsage: true },
                    });

                    if (!topUp) return null;

                    return {
                        availableCredits: topUp.totalCredits,
                        creditUsage: topUp.creditUsage,
                    };

                case 'SUBSCRIPTION':
                    const subscription =
                        await this.prismaService.subscription.findMany({
                            where: { userId, subscriptionStatus: 'ACTIVE' },
                            select: { totalCredits: true, creditUsage: true },
                            take: 1,
                            orderBy: {
                                updatedAt: 'desc',
                            },
                        });

                    if (!subscription[0]) return null;

                    return {
                        availableCredits: subscription[0].totalCredits,
                        creditUsage: subscription[0].creditUsage,
                    };
                default:
                    return null;
            }
        } catch (error) {
            this.logger.error('Error getting credits details:', error);
            return null;
        }
    }
    async getUserCredits(
        userId: string,
        type: 'total' | 'usage' = 'total',
    ): Promise<number> {
        try {
            const existingUser = await this.prismaService.user.findFirst({
                where: { id: userId },
            });

            if (!existingUser) return 0;

            switch (existingUser.currentPlan) {
                case 'FREE':
                    const credits = await this.prismaService.credits.findFirst({
                        where: { userId },
                    });
                    if (!credits) return 0;

                    // Check if the FREE plan status is PAUSED or DONE
                    if ((credits.status === FreePlanStatus.PAUSED || credits.status === FreePlanStatus.DONE) && type === 'total') { return 0; }

                    return type === 'total'
                        ? credits.availableCredits - (credits.creditUsage ?? 0)
                        : (credits.creditUsage ?? 0);

                case 'TOP_UP':
                    const topUp = await this.prismaService.topUp.findFirst({
                        where: { userId },
                    });

                    if (!topUp) return 0;

                    // Check if the TOP_UP plan status is PAUSED or DONE
                    if ((topUp.status === TopupStatus.PAUSED || topUp.status === TopupStatus.DONE) && type === 'total') { return 0; }

                    return type === 'total'
                        ? topUp.totalCredits - topUp.creditUsage
                        : topUp.creditUsage;

                case 'SUBSCRIPTION':
                    const subscription =
                        await this.prismaService.subscription.findMany({
                            where: { userId },
                            take: 1,
                            orderBy: {
                                updatedAt: 'desc',
                            },
                        });

                    if (!subscription[0]) return 0;

                    // Check if the SUBSCRIPTION plan status is PAUSED or DONE
                    if ((subscription[0].subscriptionStatus === SubscriptionStatus.PAUSED || subscription[0].subscriptionStatus === SubscriptionStatus.DONE || subscription[0].subscriptionStatus === SubscriptionStatus.CANCELLED) && type === 'total') { return 0; }

                    return type === 'total'
                        ? subscription[0].totalCredits - subscription[0].creditUsage  // Return remaining credits (total - used)
                        : subscription[0].creditUsage;
                default:
                    return 0;
            }
        } catch (error) {
            this.logger.error('Error getting user credits:', error);
            return 0;
        }
    }
    /**
     * Check if a user's subscription is scheduled for cancellation
     * Returns cancellation info if subscription is scheduled to be cancelled
     */
    async getSubscriptionCancellationInfo(userId: string): Promise<{
        isScheduledForCancellation: boolean;
        cancellationDate?: Date;
        nextBillingDate?: Date;
        daysUntilCancellation?: number;
    }> {
        try {
            const subscription =
                await this.prismaService.subscription.findFirst({
                    where: {
                        userId: userId,
                        subscriptionStatus: 'ACTIVE',
                        subscriptionCancelDate: { not: null },
                    },
                    orderBy: { updatedAt: 'desc' },
                });

            if (!subscription || !subscription.subscriptionCancelDate) {
                return { isScheduledForCancellation: false };
            }

            const now = new Date();
            const nextBillingDate = subscription.nextBillingDate;

            let daysUntilCancellation: number | undefined;
            if (nextBillingDate) {
                const timeDiff = nextBillingDate.getTime() - now.getTime();
                daysUntilCancellation = Math.max(
                    0,
                    Math.ceil(timeDiff / (1000 * 3600 * 24)),
                );
            }

            return {
                isScheduledForCancellation: true,
                cancellationDate: subscription.subscriptionCancelDate,
                nextBillingDate: nextBillingDate || undefined,
                daysUntilCancellation: daysUntilCancellation,
            };
        } catch (error) {
            const err =
                error instanceof Error ? error : new Error(String(error));
            this.logger.error('Error getting subscription cancellation info:', {
                userId,
                error: err.message,
            });
            throw new InternalServerErrorException(
                'Failed to get subscription cancellation info',
            );
        }
    }

    /**
     * Create a subscription with CREATED status
     * This will be called by the frontend before payment initiation
     */
    async createSubscription(
        createSubscriptionDto: CreateSubscriptionDto,
        userId: string,
    ): Promise<{
        success: boolean;
        subscriptionId: string;
        message: string;
        oldSubscriptionRefId?: string;
    }> {
        try {
            const { subscriptionTier, billingPeriod, isUpgrade } =
                createSubscriptionDto;

            // Check if user exists
            const user = await this.prismaService.user.findUnique({
                where: { id: userId },
                select: { id: true, currentPlan: true },
            });

            if (!user) {
                throw new NotFoundException(`User with ID ${userId} not found`);
            }

            let remainingCredits = 0;
            let oldSubscriptionRefId: string | undefined;

            // Handle upgrade scenario
            if (isUpgrade) {
                // Find active subscription
                const activeSubscription =
                    await this.prismaService.subscription.findFirst({
                        where: {
                            userId,
                            subscriptionStatus: SubscriptionStatus.ACTIVE,
                        },
                        orderBy: { createdAt: 'desc' },
                    });

                if (!activeSubscription) {
                    throw new BadRequestException(
                        'No active subscription found to upgrade from',
                    );
                }

                // Validate upgrade path (only upgrades to higher tiers allowed)
                if (
                    !isValidUpgrade(
                        activeSubscription.subscriptionPlan,
                        subscriptionTier,
                    )
                ) {
                    const validTiers = getValidUpgradeTiers(
                        activeSubscription.subscriptionPlan,
                    );
                    throw new BadRequestException(
                        `Invalid upgrade path. Current tier: ${activeSubscription.subscriptionPlan}. ` +
                            `Valid upgrade tiers: ${validTiers.join(', ') || 'None (already at highest tier)'}`,
                    );
                }

                // Calculate remaining credits from current subscription
                const currentTotalCredits =
                    activeSubscription.totalCredits || 0;
                const currentUsedCredits = activeSubscription.creditUsage || 0;
                remainingCredits = Math.max(
                    0,
                    currentTotalCredits - currentUsedCredits,
                );

                oldSubscriptionRefId =
                    activeSubscription.subscriptionRefId || undefined;

                this.logger.log(
                    `Upgrade detected for user ${userId}. Remaining credits from old subscription: ${remainingCredits}`,
                );
            }

            // Calculate billing dates
            const nextBillingDate =
                this.calculateNextBillingDateForCreation(billingPeriod);
            const nextResetDate =
                billingPeriod === 'YEARLY'
                    ? this.calculateNextResetDateForCreation()
                    : null;

            // Calculate total credits based on subscription tier
            const baseTotalCredits =
                this.calculateTotalCreditsForTier(subscriptionTier);

            // Add remaining credits from old subscription if upgrading
            const totalCredits = baseTotalCredits + remainingCredits;

            // Create subscription with CREATED status
            const subscription = await this.prismaService.subscription.create({
                data: {
                    userId,
                    subscriptionPlan: subscriptionTier,
                    billingPeriod,
                    subscriptionStatus: SubscriptionStatus.CREATED,
                    totalCredits,
                    creditUsage: 0,
                    subscriptionBuyDate: new Date(),
                    nextBillingDate,
                    nextResetDate,
                },
            });

            this.logger.log(
                `Subscription created with CREATED status for user ${userId}`,
                {
                    subscriptionId: subscription.id,
                    isUpgrade,
                    remainingCredits,
                    totalCredits,
                },
            );

            // NOTE: currentPlan is NOT updated here — it will be set to SUBSCRIPTION
            // when the Atlos webhook confirms payment (handleSubscriptionActivation).
            // This prevents users from getting SUBSCRIPTION plan without paying.

            return {
                success: true,
                subscriptionId: subscription.id,
                oldSubscriptionRefId,
                message: isUpgrade
                    ? `Subscription upgrade created successfully. ${remainingCredits} credits transferred from old subscription.`
                    : 'Subscription created successfully with CREATED status',
            };
        } catch (error: any) {
            this.logger.error('Error creating subscription:', {
                userId: userId,
                message: error.message,
            });

            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException
            ) {
                throw error;
            }

            throw new InternalServerErrorException(
                'Failed to create subscription',
            );
        }
    }

    /**
     * Calculate next billing date for subscription creation
     */
    private calculateNextBillingDateForCreation(billingPeriod: string): Date {
        const nextBillingDate = new Date();

        if (billingPeriod === 'MONTHLY') {
            const currentDay = nextBillingDate.getDate();
            nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

            const daysInNewMonth = new Date(
                nextBillingDate.getFullYear(),
                nextBillingDate.getMonth() + 1,
                0,
            ).getDate();
            if (currentDay > daysInNewMonth) {
                nextBillingDate.setDate(daysInNewMonth);
            } else {
                nextBillingDate.setDate(currentDay);
            }
        } else if (billingPeriod === 'YEARLY') {
            const currentDay = nextBillingDate.getDate();
            const currentMonth = nextBillingDate.getMonth();
            nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);

            if (currentMonth === 1 && currentDay === 29) {
                const isLeapYear = (year: number) =>
                    (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
                if (!isLeapYear(nextBillingDate.getFullYear())) {
                    nextBillingDate.setDate(28);
                }
            }
        }

        return nextBillingDate;
    }

    /**
     * Calculate next reset date for subscription creation
     */
    private calculateNextResetDateForCreation(): Date {
        const nextResetDate = new Date();
        const currentDay = nextResetDate.getDate();
        nextResetDate.setMonth(nextResetDate.getMonth() + 1);

        const daysInNewMonth = new Date(
            nextResetDate.getFullYear(),
            nextResetDate.getMonth() + 1,
            0,
        ).getDate();
        if (currentDay > daysInNewMonth) {
            nextResetDate.setDate(daysInNewMonth);
        } else {
            nextResetDate.setDate(currentDay);
        }

        return nextResetDate;
    }

    /**
     * Calculate total credits based on subscription tier
     */
    private calculateTotalCreditsForTier(
        subscriptionTier: string,
        billingPeriod: 'MONTHLY' | 'YEARLY' = 'MONTHLY',
    ): number {
        const credits = getSubscriptionCredits(subscriptionTier, billingPeriod);

        if (credits === 0) {
            this.logger.warn(
                `Unknown subscription tier: ${subscriptionTier}, defaulting to 0 credits`,
            );
        }

        return credits;
    }
    /**
     * Create Atlos Invoice for top-up
     */
    async createAtlosInvoice(
        createAtlosInvoiceDto: CreateAtlosInvoiceDto,
        userId: string,
    ): Promise<AtlosInvoiceResponse> {
        try {
            const user = await this.prismaService.user.findUnique({
                where: { id: userId },
                select: {
                    walletAddress: true,
                    email: true,
                    username: true,
                },
            });

            if (!user) {
                throw new NotFoundException(`User with ID ${userId} not found`);
            }

            const atlasBaseUrl = 'https://api.atlos.io/gateway/rest/';
            const merchantId =
                this.configService.getOrThrow<string>('ATLOS_MERCHANT_ID');

            const payload = {
                MerchantId: merchantId,
                OrderId: createAtlosInvoiceDto.orderId || null,
                OrderAmount: createAtlosInvoiceDto.orderAmount,
                UserName: user.username ? user.username : `cus_${userId}`,
                UserEmail: user.email ? user.email : null,
                PostbackUrl: `${this.configService.getOrThrow<string>('SELF_DOMAIN')}/payments/webhook/social/confirm-payin-completed`,
            };

            this.logger.log('Creating Atlos invoice for top-up', {
                userId,
                payload,
            });

            const atlosApiSecret =
                this.configService.getOrThrow<string>('ATLOS_API_SECRET');
            if (!atlosApiSecret) {
                throw new InternalServerErrorException(
                    'Atlos API secret not configured',
                );
            }

            const response = await firstValueFrom(
                this.httpService.post(
                    `${atlasBaseUrl}Invoice/Create`,
                    payload,
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            ApiSecret: atlosApiSecret,
                        },
                    },
                ),
            );

            this.logger.log('Atlos invoice created successfully', {
                userId,
                invoiceId: response.data?.Id,
            });

            return response.data;
        } catch (error: any) {
            this.logger.error('Error creating Atlos invoice:', {
                userId,
                error: error.message,
            });
            throw new InternalServerErrorException(
                'Failed to create Atlos invoice',
            );
        }
    }

    async fixUserCurrentPlan(userId: string): Promise<{ success: boolean; message: string }> {
        // Check if user has an active subscription
        const subscription = await this.prismaService.subscription.findFirst({
            where: {
                userId,
                subscriptionStatus: {
                    in: ['CREATED', 'ACTIVE'],
                },
            },
        });

        if (!subscription) {
            return {
                success: false,
                message: 'No active subscription found for user',
            };
        }

        // Update user's currentPlan to SUBSCRIPTION
        await this.prismaService.user.update({
            where: { id: userId },
            data: { currentPlan: 'SUBSCRIPTION' },
        });

        this.logger.log(`Fixed user ${userId} currentPlan to SUBSCRIPTION`);

        return {
            success: true,
            message: 'User currentPlan updated to SUBSCRIPTION',
        };
    }

    /**
     * List available assets for Atlos payment
     */
    async listAtlosAssets(
        listAtlosAssetsDto: ListAtlosAssetsDto,
        userId: string,
    ): Promise<AtlosAssetsResponse> {
        try {
            const atlasBaseUrl = 'https://api.atlos.io/gateway/rest/';
            const merchantId =
                this.configService.getOrThrow<string>('ATLOS_MERCHANT_ID');

            const params = {
                MerchantId: merchantId,
                OrderAmount: listAtlosAssetsDto.orderAmount,
                OrderCurrency: listAtlosAssetsDto.orderCurrency || 'USD',
            };

            this.logger.log('Fetching Atlos assets', { userId, params });

            const atlosApiSecret =
                this.configService.getOrThrow<string>('ATLOS_API_SECRET');
            if (!atlosApiSecret) {
                throw new InternalServerErrorException(
                    'Atlos API secret not configured',
                );
            }

            const response = await firstValueFrom(
                this.httpService.post(`${atlasBaseUrl}Asset/List`, params, {
                    headers: {
                        'Content-Type': 'application/json',
                        ApiSecret: atlosApiSecret,
                    },
                }),
            );

            this.logger.log('Atlos assets fetched successfully', {
                userId,
                assetCount: response.data?.Assets?.length || 0,
            });

            return response.data;
        } catch (error: any) {
            this.logger.error('Error fetching Atlos assets:', {
                userId,
                message: error.message,
                response: error.response?.data,
            });
            throw new InternalServerErrorException(
                'Failed to fetch Atlos assets',
            );
        }
    }

    /**
     * Create Atlos Payment for top-up
     */
    async createAtlosPayment(
        createAtlosPaymentDto: CreateAtlosPaymentDto,
        userId: string,
    ): Promise<AtlosPaymentResponse> {
        try {
            const user = await this.prismaService.user.findUnique({
                where: { id: userId },
                select: { walletAddress: true },
            });

            // Import blockchain validation
            const { isValidBlockchainCode, getBlockchainConfig } = await import('./constants/blockchains');
            
            // Validate blockchain code
            if (!isValidBlockchainCode(createAtlosPaymentDto.blockchainCode)) {
                throw new BadRequestException(
                    `Unsupported blockchain code: ${createAtlosPaymentDto.blockchainCode}`,
                );
            }

            const blockchainConfig = getBlockchainConfig(createAtlosPaymentDto.blockchainCode);

            const atlasBaseUrl = 'https://api.atlos.io/gateway/rest/';

            const payload = {
                InvoiceId: createAtlosPaymentDto.invoiceId,
                AssetCode: createAtlosPaymentDto.assetCode,
                BlockchainCode: createAtlosPaymentDto.blockchainCode,
                IsEvm: blockchainConfig.isEvm,
                UserAddress: user?.walletAddress.toLowerCase(),
            };

            this.logger.log('Creating Atlos payment for top-up', {
                userId,
                payload,
            });

            const atlosApiSecret =
                this.configService.getOrThrow<string>('ATLOS_API_SECRET');
            if (!atlosApiSecret) {
                throw new InternalServerErrorException(
                    'Atlos API secret not configured',
                );
            }

            const response = await firstValueFrom(
                this.httpService.post(
                    `${atlasBaseUrl}Payment/Create`,
                    payload,
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            ApiSecret: atlosApiSecret,
                        },
                    },
                ),
            );

            this.logger.log('Atlos payment created successfully', {
                userId,
                paymentId: response.data?.PaymentId,
            });

            return response.data;
        } catch (error: any) {
            this.logger.error('Error creating Atlos payment:', {
                userId,
                message: error.message,
                response: error.response?.data,
            });
            throw new InternalServerErrorException(
                'Failed to create Atlos payment',
            );
        }
    }

    /**
     * Check if user can connect another social account based on their subscription tier.
     * Returns { allowed, currentCount, limit, tier }.
     */
    async canConnectAccount(userId: string): Promise<{
        allowed: boolean;
        currentCount: number;
        limit: number;
        tier: string;
    }> {
        const user = await this.prismaService.user.findUnique({
            where: { id: userId },
            include: {
                Subscription: {
                    where: { subscriptionStatus: 'ACTIVE' },
                    orderBy: { updatedAt: 'desc' },
                    take: 1,
                },
            },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Determine effective tier from active subscription, fall back to FREE
        const tier =
            (user as any).Subscription && (user as any).Subscription.length > 0
                ? (user as any).Subscription[0].subscriptionPlan
                : 'FREE';

        const currentCount = 0; // Zernio removed - no social accounts
        const limit = getAccountLimit(tier);
        const allowed = canConnectAccountForTier(tier, currentCount);

        return { allowed, currentCount, limit, tier };
    }

    async getRateLimits(userId: string): Promise<{
        plan: string;
        limits: Array<{
            toolName: string;
            maxRequests: number;
            currentUsage: number;
            remaining: number;
            resetDate: Date;
            windowMs: number;
        }>;
    }> {
        try {
            // Get user's current plan
            const user = await this.prismaService.user.findUnique({
                where: { id: userId },
                include: {
                    Subscription: {
                        where: { subscriptionStatus: 'ACTIVE' },
                        orderBy: { updatedAt: 'desc' },
                        take: 1,
                    },
                    TopUp: true,
                },
            });

            if (!user) {
                throw new NotFoundException('User not found');
            }

            // Determine user's rate limit tier
            let rateLimitTier: RateLimitTier = 'FREE';
            
            if (user.TopUp && user.TopUp.status === 'ACTIVE') {
                rateLimitTier = 'TOP_UP';
            } else if (user.Subscription && user.Subscription.length > 0) {
                const subscription = user.Subscription[0];
                rateLimitTier = subscription.subscriptionPlan as RateLimitTier;
            }

            // Get current time and prepare response
            const now = new Date();
            const limits: Array<{
                toolName: string;
                maxRequests: number;
                currentUsage: number;
                remaining: number;
                resetDate: Date;
                windowMs: number;
            }> = [];

            // Get rate limits for the user's tier
            const tierLimits = RATE_LIMITS[rateLimitTier];
            
            // OPTIMIZATION: Fetch all rate limits for this user in a single query
            const allRateLimits = await this.prismaService.rateLimit.findMany({
                where: {
                    userId,
                },
            });

            // Create a map for quick lookup
            const rateLimitMap = new Map<string, number>();
            for (const rateLimit of allRateLimits) {
                const key = `${rateLimit.featureType}_${rateLimit.resetDate.getTime()}`;
                rateLimitMap.set(key, rateLimit.requestCount);
            }
            
            for (const [toolName, config] of Object.entries(tierLimits)) {
                const resetDate = this.normalizeResetDate(now, config.windowMs);
                const key = `${toolName}_${resetDate.getTime()}`;
                
                const currentUsage = rateLimitMap.get(key) || 0;
                const remaining = Math.max(0, config.maxRequests - currentUsage);

                limits.push({
                    toolName,
                    maxRequests: config.maxRequests,
                    currentUsage,
                    remaining,
                    resetDate,
                    windowMs: config.windowMs,
                });
            }

            return {
                plan: rateLimitTier,
                limits,
            };
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            
            this.logger.error('Error getting rate limits:', {
                userId,
                message: error.message,
            });
            throw new InternalServerErrorException('Failed to get rate limits');
        }
    }

    /**
     * Normalize reset date to the start of the window (same logic as ApiKeyValidationService)
     */
    private normalizeResetDate(now: Date, windowMs: number): Date {
        const windowStart = new Date(
            Math.floor(now.getTime() / windowMs) * windowMs,
        );
        return new Date(windowStart.getTime() + windowMs);
    }
}
