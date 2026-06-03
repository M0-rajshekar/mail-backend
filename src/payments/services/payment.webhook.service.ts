import {
    Injectable,
    InternalServerErrorException,
    Logger,
    OnModuleInit,
    BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatUnits } from 'viem';
import { PrismaService } from '../../services/prisma.service';
import {
    BillingPeriod,
    ChainType,
    FreePlanStatus,
    PaymentPlan,
    SubscriptionStatus,
    SubscriptionTier,
    TopupStatus,
    TransactionStatus,
    UserStatus,
} from 'generated/prisma';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
    isValidUpgrade,
    getValidUpgradeTiers,
} from '../constants/tier-hierarchy';
import {
    getSubscriptionPrice,
    getSubscriptionCredits,
} from '../constants/subscription-plans';

@Injectable()
export class PaymentsWebhookService implements OnModuleInit {
    private readonly logger = new Logger(PaymentsWebhookService.name);
    private readonly ATLOS_BASE_URL = 'https://api.atlos.io/gateway/rest/';

    constructor(
        private configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly httpService: HttpService,
    ) {}

    async onModuleInit() {
        // Ensure PrismaService is properly connected
        if (!this.prisma) {
            throw new InternalServerErrorException(
                'PrismaService not injected',
            );
        }
        try {
            // Test the connection
            await this.prisma.$connect();
            this.logger.log('PrismaService successfully initialized');
        } catch (error) {
            this.logger.error('Failed to initialize PrismaService:', error);
            throw new InternalServerErrorException(error);
        }
    }

    /**
     * Cancel a subscription via Atlos API
     */
    private async cancelAtlosSubscription(
        subscriptionRefId: string,
    ): Promise<void> {
        try {
            const merchantId =
                this.configService.get<string>('ATLOS_MERCHANT_ID');

            if (!merchantId) {
                throw new InternalServerErrorException(
                    'ATLOS_MERCHANT_ID not configured',
                );
            }

            const cancelUrl = `${this.ATLOS_BASE_URL}Subscription/Cancel`;

            const payload = {
                MerchantId: merchantId,
                SubscriptionId: subscriptionRefId,
                OrderId: null,
            };

            this.logger.log(
                `Calling Atlos cancel subscription API for SubscriptionId: ${subscriptionRefId}`,
            );

            const response = await firstValueFrom(
                this.httpService.post(cancelUrl, payload, {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }),
            );

            this.logger.log(
                `Successfully cancelled Atlos subscription ${subscriptionRefId}`,
                { response: response.data },
            );
        } catch (error: any) {
            this.logger.error(
                `Failed to cancel Atlos subscription ${subscriptionRefId}:`,
                {
                    error: error.message,
                    response: error.response?.data,
                    status: error.response?.status,
                },
            );
            // Don't throw - log the error but continue processing
            // The subscription is already handled in our DB
        }
    }

    async confirmPayinCompleted(body: any): Promise<void> {
        this.logger.log('Processing payin completed event');


        // Input validation
        if (!body?.InvoiceId && !body?.invoiceId) {
            this.logger.error(
                'Invalid payin completed payload - missing invoiceId',
            );
            throw new BadRequestException('Missing invoiceId in payload');
        }

        // Normalize the invoice ID (handle both InvoiceId and invoiceId)
        const invoiceId = body.InvoiceId || body.invoiceId;

        try {
            // Check if this is a subscription payment by looking for SubscriptionId
            if (body.SubscriptionId && body.Status === 100) {
                await this.handleSubscriptionActivation(body);
            }
            // Check if this is a one-time top-up payment (SubscriptionId is null/undefined)
            else if (
                (!body.SubscriptionId || body.SubscriptionId === null) &&
                body.Status === 100
            ) {
                await this.handleAtlosTopUpPayment(body);
            }

            // Process regular payin if invoiceId exists in transaction table
            if (invoiceId) {
                const transaction = await this.prisma.transaction.findFirst({
                    where: { invoiceId },
                });

                if (transaction) {
                    await this.processPayinCompleted(body);
                    this.logger.log(
                        `Successfully processed payin completed for invoice ${invoiceId}`,
                    );
                }
            }
        } catch (error) {
            this.logger.error('Error processing payin completed:', error);
            throw error;
        }
    }

    /**
     * Handle Atlos top-up payment confirmation (one-time payment, no subscription)
     */
    private async handleAtlosTopUpPayment(body: any): Promise<void> {
        const invoiceId = body.InvoiceId || body.invoiceId;
        const status = body.Status;
        const userAddress = body.UserAddress;
        const amount = body.Amount || body.amount;
        const asset = body.Asset;
        const blockchain = body.Blockchain;

        this.logger.log(
            `Processing Atlos top-up payment for InvoiceId: ${invoiceId}`,
            {
                userAddress,
                amount,
                asset,
                blockchain,
            },
        );

        if (status !== 100) {
            this.logger.warn(`Payment status is not 100, received: ${status}`);
            return;
        }

        // Find user by wallet address - handle case sensitivity based on blockchain
        let user;
        if (blockchain === 'SOL') {
            // For Solana, try both original case and lowercase
            user = await this.prisma.user.findFirst({
                where: {
                    OR: [
                        { walletAddress: userAddress },
                        { walletAddress: userAddress.toLowerCase() }
                    ]
                },
                include: {
                    TopUp: true,
                    Credits: true,
                    Subscription: {
                        where: {
                            subscriptionStatus: {
                                in: [
                                    SubscriptionStatus.ACTIVE,
                                    SubscriptionStatus.PAUSED,
                                ],
                            },
                        },
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                    },
                },
            });
        } else {
            // For EVM chains, use lowercase
            user = await this.prisma.user.findUnique({
                where: { walletAddress: userAddress.toLowerCase() },
                include: {
                    TopUp: true,
                    Credits: true,
                    Subscription: {
                        where: {
                            subscriptionStatus: {
                                in: [
                                    SubscriptionStatus.ACTIVE,
                                    SubscriptionStatus.PAUSED,
                                ],
                            },
                        },
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                    },
                },
            });
        }

        if (!user) {
            this.logger.error(
                `User not found for wallet address: ${userAddress}`,
            );
            throw new BadRequestException(
                `User not found for wallet address: ${userAddress}`,
            );
        }

        // Calculate credits based on amount
        const creditsPerAmount = Number(
            this.configService.get<string>('CREDITS_PER_AMOUNT_TOP_UP') ||
                '240',
        );

        if (isNaN(creditsPerAmount) || creditsPerAmount <= 0) {
            throw new InternalServerErrorException(
                'Invalid CREDITS_PER_AMOUNT_TOP_UP configuration',
            );
        }

        // Amount is already in USD/fiat, so we can directly calculate credits
        const creditsToAdd = parseFloat(amount) * creditsPerAmount;

        if (isNaN(creditsToAdd) || creditsToAdd <= 0) {
            throw new BadRequestException('Invalid credits calculation');
        }

        this.logger.log(`Calculated credits to add: ${creditsToAdd}`, {
            amount,
            creditsPerAmount,
            userId: user.id,
        });

        // Check if user has an active subscription
        const activeSubscription = user.Subscription?.[0];

        if (activeSubscription) {
            // User has active subscription - add credits to subscription
            this.logger.log(
                `User ${user.id} has active subscription ${activeSubscription.id}. Adding ${creditsToAdd} credits to subscription.`,
            );

            await this.prisma.subscription.update({
                where: { id: activeSubscription.id },
                data: {
                    totalCredits: { increment: creditsToAdd },
                },
            });

            // Pause free credits if active
            if (user?.Credits?.status === FreePlanStatus.ACTIVE) {
                await this.prisma.credits.update({
                    where: { id: user.Credits.id },
                    data: { status: FreePlanStatus.PAUSED },
                });
            }

            // Reactivate user if paused
            if (user?.status === UserStatus.PAUSED) {
                await this.prisma.user.update({
                    where: { id: user.id },
                    data: { status: UserStatus.ACTIVE },
                });
            }

            // Create transaction record
            await this.prisma.transaction.create({
                data: {
                    userId: user.id,
                    walletAddress: userAddress?.toLowerCase(),
                    chainId: blockchain || 'UNKNOWN',
                    chainType: ChainType.ETHEREUM,
                    amount: parseFloat(amount),
                    creditsBilled: creditsToAdd,
                    tokenAddress: asset || 'UNKNOWN',
                    status: TransactionStatus.CONFIRMED,
                    invoiceId: invoiceId,
                    paymentPlan: PaymentPlan.SUBSCRIPTION,
                    tokenDecimals: 6,
                    description: `Atlos top-up payment - ${creditsToAdd} credits added to active subscription`,
                    tokenSymbol: asset,
                },
            });

            this.logger.log(
                `Successfully added ${creditsToAdd} credits to subscription ${activeSubscription.id} for user ${user.id}.`,
            );
        } else {
            // User has no active subscription
            // Check if they have a cancelled/done subscription with remaining credits
            const cancelledSubscription =
                await this.prisma.subscription.findFirst({
                    where: {
                        userId: user.id,
                        subscriptionStatus: SubscriptionStatus.DONE,
                    },
                    orderBy: { createdAt: 'desc' },
                });

            let totalCreditsForTopUp = creditsToAdd;

            if (cancelledSubscription) {
                // Calculate remaining credits from cancelled subscription
                const remainingCredits =
                    cancelledSubscription.totalCredits -
                    (cancelledSubscription.creditUsage || 0);

                if (remainingCredits > 0) {
                    this.logger.log(
                        `User ${user.id} has ${remainingCredits} remaining credits from cancelled subscription ${cancelledSubscription.id}. Adding to top-up.`,
                    );
                    totalCreditsForTopUp += remainingCredits;
                }
            }

            // Pause free credits if active
            if (user?.Credits?.status === FreePlanStatus.ACTIVE) {
                await this.prisma.credits.update({
                    where: { id: user.Credits.id },
                    data: { status: FreePlanStatus.PAUSED },
                });
            }

            // Upsert the TopUp record
            await this.prisma.topUp.upsert({
                where: { userId: user.id },
                create: {
                    userId: user.id,
                    totalCredits: totalCreditsForTopUp,
                    creditUsage: 0,
                    status: TopupStatus.ACTIVE,
                },
                update: {
                    totalCredits: { increment: totalCreditsForTopUp },
                    status: TopupStatus.ACTIVE,
                },
            });

            // Update the user plan type — only switch to TOP_UP if user is on FREE plan
            // If user already has a SUBSCRIPTION, keep it (top-up just adds extra credits)
            if (user.currentPlan === PaymentPlan.FREE) {
                const updateData: any = { currentPlan: PaymentPlan.TOP_UP };
                if (user?.status === UserStatus.PAUSED) {
                    updateData.status = UserStatus.ACTIVE;
                }
                await this.prisma.user.update({
                    where: { id: user.id },
                    data: updateData,
                });
            } else if (user?.status === UserStatus.PAUSED) {
                // Just reactivate if paused, don't change plan
                await this.prisma.user.update({
                    where: { id: user.id },
                    data: { status: UserStatus.ACTIVE },
                });
            }

            // Create transaction record for tracking
            await this.prisma.transaction.create({
                data: {
                    userId: user.id,
                    walletAddress: userAddress?.toLowerCase(),
                    chainId: blockchain || 'UNKNOWN',
                    chainType: ChainType.ETHEREUM,
                    amount: parseFloat(amount),
                    creditsBilled: creditsToAdd,
                    tokenAddress: asset || 'UNKNOWN',
                    status: TransactionStatus.CONFIRMED,
                    invoiceId: invoiceId,
                    paymentPlan: PaymentPlan.TOP_UP,
                    tokenDecimals: 6,
                    description: `Atlos top-up payment - ${totalCreditsForTopUp} credits added to top-up balance`,
                    tokenSymbol: asset,
                },
            });

            this.logger.log(
                `Successfully processed Atlos top-up payment for user ${user.id}. Added ${totalCreditsForTopUp} credits to top-up balance.`,
            );
        }
    }

    /**
     * Handle subscription activation when payment is confirmed with status 100
     */
    private async handleSubscriptionActivation(body: any): Promise<void> {
        const subscriptionRefId = body.SubscriptionId;
        const status = body.Status;
        const user = await this.prisma.user.findUnique({
            where: { walletAddress: body.UserAddress.toLowerCase() },
            include: {
                Credits: true,
                TopUp: true,
            },
        });

        this.logger.log(
            `Processing subscription activation for SubscriptionId: ${subscriptionRefId}`,
        );

        if (status !== 100) {
            this.logger.warn(
                `Subscription payment status is not 100, received: ${status}`,
            );
            return;
        }

        // Check if user has TopUp with remaining credits
        let topUpCreditsToTransfer = 0;
        if (user?.TopUp) {
            const remainingTopUpCredits =
                user.TopUp.totalCredits - (user.TopUp.creditUsage || 0);
            if (remainingTopUpCredits > 0) {
                topUpCreditsToTransfer = remainingTopUpCredits;
                this.logger.log(
                    `User ${user.id} has ${topUpCreditsToTransfer} remaining TopUp credits. Will transfer to subscription.`,
                );
            }
        }

        // Find subscription with CREATED status
        let subscription = await this.prisma.subscription.findFirst({
            where: {
                userId: user?.id as string,
                subscriptionStatus: SubscriptionStatus.CREATED,
            },
            orderBy: { createdAt: 'desc' },
        });

        // Check for existing active subscription
        const oldActiveSubscription = await this.prisma.subscription.findFirst({
            where: {
                userId: user?.id as string,
                subscriptionStatus: SubscriptionStatus.ACTIVE,
                subscriptionRefId: subscriptionRefId,
            },
            orderBy: { createdAt: 'desc' },
        });

        // If no CREATED subscription found but there's an active one with same refId, this is a RENEWAL
        if (!subscription && oldActiveSubscription) {
            this.logger.log(
                `Renewal detected for subscription ${subscriptionRefId}. Creating new subscription entry.`,
            );

            // Calculate next billing date
            const nextBillingDate = this.calculateNextBillingDate(
                oldActiveSubscription.billingPeriod as string,
            );
            const nextResetDate =
                oldActiveSubscription.billingPeriod === BillingPeriod.YEARLY
                    ? this.calculateNextResetDate()
                    : null;

            // Get total credits for the plan and add TopUp credits if any
            const baseCredits = this.calculateTotalCredits(
                oldActiveSubscription.subscriptionPlan,
                oldActiveSubscription.billingPeriod || 'MONTHLY',
            );
            const totalCredits = baseCredits + topUpCreditsToTransfer;

            // Mark old subscription as DONE
            await this.prisma.subscription.update({
                where: { id: oldActiveSubscription.id },
                data: {
                    subscriptionStatus: SubscriptionStatus.DONE,
                    updatedAt: new Date(),
                },
            });

            // Create new subscription entry for renewal
            subscription = await this.prisma.subscription.create({
                data: {
                    userId: user?.id as string,
                    subscriptionPlan: oldActiveSubscription.subscriptionPlan,
                    billingPeriod: oldActiveSubscription.billingPeriod,
                    subscriptionStatus: SubscriptionStatus.ACTIVE,
                    totalCredits,
                    creditUsage: 0,
                    subscriptionRefId: subscriptionRefId,
                    subscriptionBuyDate: new Date(),
                    nextBillingDate,
                    nextResetDate,
                },
            });

            // Transfer TopUp credits if any
            if (topUpCreditsToTransfer > 0 && user?.TopUp) {
                await this.prisma.topUp.update({
                    where: { id: user.TopUp.id },
                    data: {
                        creditUsage: user.TopUp.totalCredits, // Mark all as used
                        status: TopupStatus.PAUSED,
                    },
                });
                this.logger.log(
                    `Transferred ${topUpCreditsToTransfer} TopUp credits to subscription ${subscription.id}`,
                );
            }

            this.logger.log(
                `Created new subscription entry ${subscription.id} for renewal with ${totalCredits} total credits (${baseCredits} base + ${topUpCreditsToTransfer} from TopUp)`,
            );
        } else if (!subscription) {
            // No CREATED and no matching ACTIVE - this is an error
            this.logger.warn(
                `No subscription found with CREATED status or active subscription for SubscriptionId: ${subscriptionRefId}`,
            );
            return;
        } else {
            // Found a CREATED subscription - check if this is an upgrade
            const otherActiveSubscription =
                await this.prisma.subscription.findFirst({
                    where: {
                        userId: user?.id as string,
                        subscriptionStatus: SubscriptionStatus.ACTIVE,
                        id: { not: subscription.id },
                    },
                    orderBy: { createdAt: 'desc' },
                });

            if (otherActiveSubscription) {
                // Determine if this is an upgrade
                const isUpgrade =
                    otherActiveSubscription.subscriptionPlan !==
                    subscription.subscriptionPlan;
                const isDifferentSubscriptionRef =
                    otherActiveSubscription.subscriptionRefId !==
                    subscription.subscriptionRefId;

                if (isUpgrade && isDifferentSubscriptionRef) {
                    // This is an UPGRADE - different plan and different subscription ref
                    this.logger.log(
                        `Upgrade detected: ${otherActiveSubscription.subscriptionPlan} -> ${subscription.subscriptionPlan}. ` +
                            `Cancelling old subscription ${otherActiveSubscription.subscriptionRefId} via Atlos API`,
                    );

                    // Cancel old subscription via Atlos API
                    if (otherActiveSubscription.subscriptionRefId) {
                        await this.cancelAtlosSubscription(
                            otherActiveSubscription.subscriptionRefId,
                        );
                    }

                    // Mark old subscription as DONE
                    await this.prisma.subscription.update({
                        where: { id: otherActiveSubscription.id },
                        data: {
                            subscriptionStatus: SubscriptionStatus.DONE,
                            updatedAt: new Date(),
                        },
                    });

                    this.logger.log(
                        `Old subscription ${otherActiveSubscription.id} cancelled and marked as DONE after upgrade`,
                    );
                }
            }

            // Activate the CREATED subscription and add TopUp credits if any
            // Set subscriptionRefId from webhook body.SubscriptionId
            const currentTotalCredits = subscription.totalCredits || 0;
            const newTotalCredits =
                currentTotalCredits + topUpCreditsToTransfer;

            await this.prisma.subscription.update({
                where: { id: subscription.id },
                data: {
                    subscriptionStatus: SubscriptionStatus.ACTIVE,
                    subscriptionBuyDate: new Date(),
                    updatedAt: new Date(),
                    totalCredits: newTotalCredits,
                    subscriptionRefId: subscriptionRefId,
                },
            });

            // Transfer TopUp credits if any
            if (topUpCreditsToTransfer > 0 && user?.TopUp) {
                await this.prisma.topUp.update({
                    where: { id: user.TopUp.id },
                    data: {
                        creditUsage: user.TopUp.totalCredits, // Mark all as used
                        status: TopupStatus.PAUSED,
                    },
                });
                this.logger.log(
                    `Transferred ${topUpCreditsToTransfer} TopUp credits to subscription ${subscription.id}`,
                );
            }
        }

        // Update user's current plan and status
        await this.prisma.user.update({
            where: { id: user?.id as string },
            data: {
                currentPlan: PaymentPlan.SUBSCRIPTION,
                status: UserStatus.ACTIVE,
                updatedAt: new Date(),
            },
        });

        if (user?.Credits?.status === FreePlanStatus.ACTIVE) {
            await this.prisma.credits.update({
                where: { id: user.Credits.id },
                data: { status: FreePlanStatus.PAUSED },
            });
        }

        // Write transaction record for the subscription activation
        try {
            const amount = body.Amount || body.amount || 0;
            const asset = body.Asset || body.asset || 'USDC';
            const blockchain = body.Blockchain || body.blockchain || 'UNKNOWN';
            const invoiceId = body.InvoiceId || body.invoiceId;
            await this.prisma.transaction.create({
                data: {
                    userId: user?.id as string,
                    walletAddress: (body.UserAddress || '').toLowerCase(),
                    chainId: blockchain,
                    chainType: ChainType.ETHEREUM,
                    amount: parseFloat(amount),
                    creditsBilled: subscription.totalCredits,
                    tokenAddress: asset,
                    status: TransactionStatus.CONFIRMED,
                    invoiceId: invoiceId,
                    paymentPlan: PaymentPlan.SUBSCRIPTION,
                    tokenDecimals: 6,
                    tokenSymbol: asset,
                    description: `Atlos subscription payment - ${subscription.subscriptionPlan} ${subscription.billingPeriod}`,
                },
            });
        } catch (txErr) {
            this.logger.error(`Failed to write transaction record for subscription activation: ${txErr}`);
        }

        this.logger.log(
            `Successfully activated subscription ${subscription.id} for user ${subscription.userId}`,
        );
    }

    private async processPayinCompleted(body: any): Promise<void> {
        // Normalize the invoice ID (handle both InvoiceId and invoiceId)
        const invoiceId = body.InvoiceId || body.invoiceId;

        // Find the transaction by invoiceId
        const transaction = await this.prisma.transaction.findFirst({
            where: { invoiceId },
        });

        if (!transaction) {
            this.logger.error(`No transaction found for invoice ${invoiceId}`);
            throw new BadRequestException(
                `Transaction not found for invoice ${invoiceId}`,
            );
        }

        // Idempotency check - prevent duplicate completion processing
        if (transaction.status === TransactionStatus.CONFIRMED) {
            this.logger.log(
                `Transaction ${transaction.id} already confirmed, skipping`,
            );
            return;
        }

        // Update the transaction status to confirmed
        await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: {
                status: TransactionStatus.CONFIRMED,
                description: body.paymentMethod?.status || 'completed',
            },
        });

        // Get the user associated with the transaction
        const user = await this.prisma.user.findFirst({
            where: { id: transaction.userId },
            include: {
                TopUp: true,
                Credits: true,
                Subscription: true,
            },
        });

        if (!user) {
            this.logger.error(
                `User not found for transaction ${transaction.id}`,
            );
            throw new BadRequestException(
                `User not found for transaction ${transaction.id}`,
            );
        }

        // Pause free credits if active
        if (user?.Credits?.status === FreePlanStatus.ACTIVE) {
            await this.prisma.credits.update({
                where: { id: user.Credits.id },
                data: { status: FreePlanStatus.PAUSED },
            });
        }
      
        // Handle payment based on plan type
        await this.handlePaymentByPlanType(transaction, user, body);
    }

    /**
     * Handle payment processing based on the payment plan type
     */ private async handlePaymentByPlanType(
        transaction: any,
        user: any,
        body: any,
    ): Promise<void> {
        switch (transaction.paymentPlan) {
            case PaymentPlan.TOP_UP:
                await this.handleTopUpPayment(transaction, user, body);
                break;

            case PaymentPlan.SUBSCRIPTION:
                await this.handleSubscriptionPayment(transaction, user, body);
                break;

            default:
                this.logger.warn(
                    `Unhandled payment plan: ${transaction.paymentPlan}`,
                );
                break;
        }
    }

    /**
     * Handle TOP_UP payment processing
     */
    private async handleTopUpPayment(
        transaction: any,
        user: any,
        body: any,
    ): Promise<void> {
        // Validate amount formatting
        let formattedAmount: string;
        try {
            formattedAmount = formatUnits(BigInt(transaction.amount), 6);
        } catch (error) {
            this.logger.error(
                `Invalid amount format for transaction ${transaction.id}: ${transaction.amount}`,
            );
            throw new BadRequestException(`Invalid transaction amount`);
        }

   

        const creditsPerAmount = Number(
            this.configService.get<string>('CREDITS_PER_AMOUNT_TOP_UP') ||
                '240',
        );

        if (isNaN(creditsPerAmount) || creditsPerAmount <= 0) {
            throw new InternalServerErrorException(
                'Invalid CREDITS_PER_AMOUNT_TOP_UP configuration',
            );
        }

        const creditsToAdd = parseFloat(formattedAmount) * creditsPerAmount;

        if (isNaN(creditsToAdd) || creditsToAdd <= 0) {
            throw new BadRequestException('Invalid credits calculation');
        }

 

        const description = body.description || '';

        if (description === 'RESOLVE_FREE') {
            await this.handleResolveFreePlan(user, transaction, creditsToAdd);
        } else if (description === 'RESOLVE_TOP_UP') {
            await this.handleResolveTopUp(user, transaction, creditsToAdd);
        } else {
            await this.handleRegularTopUp(user, transaction, creditsToAdd);
        }
    }

    /**
     * Handle RESOLVE_FREE top-up scenario
     */
    private async handleResolveFreePlan(
        user: any,
        transaction: any,
        creditsToAdd: number,
    ): Promise<void> {
        if (user?.credits) {
            await this.prisma.credits.update({
                where: { id: user.credits.id },
                data: {
                    status: FreePlanStatus.DONE,
                    availableCredits: { increment: creditsToAdd },
                },
            });
        }

        await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { creditsBilled: creditsToAdd },
        });
    }

    /**
     * Handle RESOLVE_TOP_UP scenario
     */
    private async handleResolveTopUp(
        user: any,
        transaction: any,
        creditsToAdd: number,
    ): Promise<void> {
        await this.prisma.topUp.update({
            where: { userId: user?.id as string },
            data: {
                totalCredits: { increment: creditsToAdd },
                status: TopupStatus.PAUSED,
            },
        });

        await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { creditsBilled: creditsToAdd },
        });
    }

    /**
     * Handle regular top-up scenario
     */
    private async handleRegularTopUp(
        user: any,
        transaction: any,
        creditsToAdd: number,
    ): Promise<void> {
        // Upsert the TopUp record
        await this.prisma.topUp.upsert({
            where: { userId: user?.id as string },
            create: {
                userId: user?.id as string,
                totalCredits: creditsToAdd,
                creditUsage: 0,
                status: TopupStatus.ACTIVE,
            },
            update: {
                totalCredits: { increment: creditsToAdd },
                status: TopupStatus.ACTIVE,
            },
        });

        await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { creditsBilled: creditsToAdd },
        });

        // Update the user plan type and reactivate if paused
        const updateData: any = { currentPlan: PaymentPlan.TOP_UP };
        if (user?.status === UserStatus.PAUSED) {
            updateData.status = UserStatus.ACTIVE;
        }

        await this.prisma.user.update({
            where: { id: user?.id as string },
            data: updateData,
        });
    }

    /**
     * Handle SUBSCRIPTION payment processing
     */
    private async handleSubscriptionPayment(
        transaction: any,
        user: any,
        body?: any,
    ): Promise<void> {
        // Check if this is a subscription
        if (body?.description === 'UPGRADE_TO_BUSINESS') {
            await this.handleSubscriptionUpgrade(transaction, user);
            return;
        }
     

        // Find existing subscription
        const latestSubscription = await this.prisma.subscription.findFirst({
            where: {
                userId: user?.id as string,
                subscriptionStatus: {
                    in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED],
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Parse subscription details with validation
        const subscriptionParts =
            transaction.subscriptionDescription?.split('_') ?? [];
        if (subscriptionParts.length < 3) {
            throw new BadRequestException(
                `Invalid subscription description format: ${transaction.subscriptionDescription}`,
            );
        }

        const [, subscriptionPlan, billingPeriod] = subscriptionParts;

        // Validate subscription plan and billing period
        if (
            !Object.values(SubscriptionTier).includes(
                subscriptionPlan as SubscriptionTier,
            )
        ) {
            throw new BadRequestException(
                `Invalid subscription plan: ${subscriptionPlan}`,
            );
        }

        if (
            !Object.values(BillingPeriod).includes(
                billingPeriod as BillingPeriod,
            )
        ) {
            throw new BadRequestException(
                `Invalid billing period: ${billingPeriod}`,
            );
        }

        // Calculate billing dates with proper error handling
        const nextBillingDate = this.calculateNextBillingDate(billingPeriod);
        const nextResetDate = this.calculateNextResetDate();

        // Set total credits based on subscription plan
        const totalCredits = this.calculateTotalCredits(
            subscriptionPlan,
            billingPeriod,
        );

        // Create or update subscription
        if (latestSubscription) {
            // const isPlanChange = latestSubscription.subscriptionPlan !== subscriptionPlan;
            await this.updateExistingSubscription(
                latestSubscription,
                user,
                transaction,
                billingPeriod as BillingPeriod,
                nextBillingDate,
                nextResetDate,
                subscriptionPlan as SubscriptionTier,
                totalCredits,
            );
        } else {
            await this.createNewSubscription(
                user,
                transaction,
                billingPeriod as BillingPeriod,
                nextBillingDate,
                nextResetDate,
                subscriptionPlan as SubscriptionTier,
                totalCredits,
            );
        }

        // Reactivate user if paused and update current plan
        const updateData: any = { currentPlan: PaymentPlan.SUBSCRIPTION };
        if (user?.status === UserStatus.PAUSED) {
            updateData.status = UserStatus.ACTIVE;
        }

        await this.prisma.user.update({
            where: { id: user?.id as string },
            data: updateData,
        });
    }

    /**
     * Handle subscription upgrade from Professional to Business plan
     */
    private async handleSubscriptionUpgrade(
        transaction: any,
        user: any,
    ): Promise<void> {
        // Find current active subscription
        const currentSubscription = await this.prisma.subscription.findFirst({
            where: {
                userId: user?.id as string,
                subscriptionStatus: SubscriptionStatus.ACTIVE,
            },
            orderBy: { createdAt: 'desc' },
        });

        if (!currentSubscription) {
            throw new BadRequestException(
                `No active subscription found for user ${user.id}`,
            );
        }

        // Parse and validate the upgrade target tier
        const subscriptionParts =
            transaction.subscriptionDescription?.split('_') ?? [];
        if (subscriptionParts.length < 3) {
            throw new BadRequestException(
                `Invalid subscription description format: ${transaction.subscriptionDescription}`,
            );
        }

        const [, targetSubscriptionPlan] = subscriptionParts;

        // Validate upgrade path (must be upgrading to a higher tier)
        if (
            !isValidUpgrade(
                currentSubscription.subscriptionPlan,
                targetSubscriptionPlan,
            )
        ) {
            const validTiers = getValidUpgradeTiers(
                currentSubscription.subscriptionPlan,
            );
            throw new BadRequestException(
                `Invalid upgrade path. Current tier: ${currentSubscription.subscriptionPlan}. ` +
                    `Valid upgrade tiers: ${validTiers.join(', ') || 'None (already at highest tier)'}`,
            );
        }

        // Get plan credit values for current and target tiers
        const currentTierCredits = this.calculateTotalCredits(
            currentSubscription.subscriptionPlan,
            currentSubscription.billingPeriod || 'MONTHLY',
        );
        const targetTierCredits = this.calculateTotalCredits(
            targetSubscriptionPlan,
            currentSubscription.billingPeriod || 'MONTHLY',
        );

        // Calculate current usage percentage
        const currentUsedCredits = currentSubscription.creditUsage || 0;
        const usagePercentage = (currentUsedCredits / currentTierCredits) * 100;
        const remainingPercentage = 100 - usagePercentage;

        this.logger.log(
            `User ${user.id} upgrade: Used ${usagePercentage.toFixed(2)}% of ${currentSubscription.subscriptionPlan} plan, ${remainingPercentage.toFixed(2)}% remaining. Upgrading to ${targetSubscriptionPlan}`,
        );

        // Validate amount formatting
        let paidAmount: number;
        try {
            const formattedAmount = formatUnits(BigInt(transaction.amount), 6);
            paidAmount = parseFloat(formattedAmount);
            if (isNaN(paidAmount) || paidAmount <= 0) {
                throw new Error('Invalid amount');
            }
        } catch (error) {
            this.logger.error(
                `Invalid amount format for upgrade transaction ${transaction.id}: ${transaction.amount}`,
            );
            throw new BadRequestException(`Invalid transaction amount`);
        }

        // For subscription upgrades, calculate based on target tier pricing
        // Get the full cost of target plan to determine the per-dollar credit rate
        const targetPlanFullPrice = getSubscriptionPrice(
            targetSubscriptionPlan,
            currentSubscription.billingPeriod || 'MONTHLY',
        );

        if (isNaN(targetPlanFullPrice) || targetPlanFullPrice <= 0) {
            throw new InternalServerErrorException(
                `Invalid pricing configuration for ${targetSubscriptionPlan}`,
            );
        }

        // Calculate credits per dollar based on target plan (credits/price)
        const targetCreditsPerDollar = targetTierCredits / targetPlanFullPrice;

        // Calculate what the user paid for in terms of target plan credits
        const paidCredits = paidAmount * targetCreditsPerDollar;

        // Calculate what percentage of target plan this payment represents
        const paidPercentageOfTarget = (paidCredits / targetTierCredits) * 100;

        // Calculate credits user should get:
        // 1. Paid percentage of target plan credits
        const targetCreditsFromPayment =
            (paidPercentageOfTarget / 100) * targetTierCredits;

        // 2. Remaining percentage of current plan credits (already paid for)
        const currentCreditsRemaining =
            (remainingPercentage / 100) * currentTierCredits;

        // Total credits to add (this represents the new credit balance)
        const totalCreditsToSet = Math.round(
            targetCreditsFromPayment + currentCreditsRemaining,
        );

        this.logger.log(
            `Upgrade calculation for user ${user.id}: ` +
                `Paid ${paidPercentageOfTarget.toFixed(2)}% of ${targetSubscriptionPlan} plan (${targetCreditsFromPayment.toFixed(0)} credits), ` +
                `Plus ${remainingPercentage.toFixed(2)}% of ${currentSubscription.subscriptionPlan} plan (${currentCreditsRemaining.toFixed(0)} credits), ` +
                `Total credits to set: ${totalCreditsToSet}`,
        );

        // // Validate the upgrade logic - user should get reasonable amount of credits
        // if (totalCreditsToSet <= currentUsedCredits) {
        //     throw new BadRequestException(
        //         `Invalid upgrade calculation: new credit balance (${totalCreditsToSet}) would be less than or equal to used credits (${currentUsedCredits})`
        //     );
        // }

        const creditUsage = (usagePercentage / 100) * targetTierCredits;
        const totalCredits = targetTierCredits; // ✅ Total credits should be the full allocated credits for the tier

        // Update current subscription to target plan
        await this.prisma.subscription.update({
            where: { id: currentSubscription.id },
            data: {
                subscriptionPlan: targetSubscriptionPlan as any,
                totalCredits,
                creditUsage,
                // Keep the same billing dates and current creditUsage since this is an upgrade, not a renewal
            },
        });

        // Update transaction with credits billed (representing the new credits added)
        const creditsAdded = totalCredits - creditUsage;
        await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: {
                creditsBilled: Math.round(creditsAdded),
                description: `Subscription upgraded from ${currentSubscription.subscriptionPlan} to ${targetSubscriptionPlan}. Added ${Math.round(creditsAdded)} credits.`,
            },
        });

        // Reactivate user if paused (though they should be active if they have an active subscription)
        const updateData: any = { currentPlan: PaymentPlan.SUBSCRIPTION };
        if (user?.status === UserStatus.PAUSED) {
            updateData.status = UserStatus.ACTIVE;
        }

        await this.prisma.user.update({
            where: { id: user?.id as string },
            data: updateData,
        });

        this.logger.log(
            `Successfully upgraded user ${user.id} from PROFESSIONAL to BUSINESS plan. ` +
                `New total credits: ${totalCreditsToSet}, Credits added: ${Math.round(creditsAdded)}`,
        );
    }

    /**
     * Calculate next billing date based on billing period with proper date handling
     */
    private calculateNextBillingDate(billingPeriod: string): Date {
        const nextBillingDate = new Date();

        if (billingPeriod === BillingPeriod.MONTHLY) {
            // Handle month-end edge cases properly
            const currentDay = nextBillingDate.getDate();
            nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

            // If original day doesn't exist in new month, use last day of month
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
        } else if (billingPeriod === BillingPeriod.YEARLY) {
            // Handle leap year edge cases
            const currentDay = nextBillingDate.getDate();
            const currentMonth = nextBillingDate.getMonth();
            nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);

            // Handle Feb 29 on non-leap years
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
     * Calculate next reset date (always next month for yearly subscriptions)
     */
    private calculateNextResetDate(): Date {
        const nextResetDate = new Date();
        const currentDay = nextResetDate.getDate();
        nextResetDate.setMonth(nextResetDate.getMonth() + 1);

        // Handle month-end edge cases
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
     * Calculate total credits based on subscription plan
     */
    private calculateTotalCredits(
        subscriptionPlan: string,
        billingPeriod: 'MONTHLY' | 'YEARLY' = 'MONTHLY',
    ): number {
        const credits = getSubscriptionCredits(subscriptionPlan, billingPeriod);

        if (credits === 0) {
            this.logger.warn(
                `Unknown subscription plan: ${subscriptionPlan}, defaulting to 0 credits`,
            );
        }

        return credits;
    }

    /**
     * Update existing subscription
     */
    private async updateExistingSubscription(
        latestSubscription: any,
        user: any,
        transaction: any,
        billingPeriod: string,
        nextBillingDate: Date,
        nextResetDate: Date,
        subscriptionPlan: string,
        totalCredits: number,
    ): Promise<void> {
        // Mark existing subscription as done
        await this.prisma.subscription.update({
            where: { id: latestSubscription.id },
            data: { subscriptionStatus: SubscriptionStatus.DONE },
        });

        // Create new subscription
        await this.prisma.subscription.create({
            data: {
                userId: user?.id as string,
                subscriptionStatus: SubscriptionStatus.ACTIVE,
                billingPeriod: billingPeriod as BillingPeriod,
                nextBillingDate: nextBillingDate,
                nextResetDate:
                    billingPeriod === BillingPeriod.YEARLY
                        ? nextResetDate
                        : null,
                subscriptionPlan: subscriptionPlan as SubscriptionTier,
                totalCredits: totalCredits,
                creditUsage: 0,
                subscriptionRefId: latestSubscription.subscriptionRefId,
                subscriptionBuyDate: new Date(),
            },
        });

        await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { creditsBilled: totalCredits },
        });
    }

    /**
     * Create new subscription
     */
    private async createNewSubscription(
        user: any,
        transaction: any,
        billingPeriod: BillingPeriod,
        nextBillingDate: Date,
        nextResetDate: Date,
        subscriptionPlan: SubscriptionTier,
        totalCredits: number,
    ): Promise<void> {
        const subscriptionRefId = `sub_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

        await this.prisma.subscription.create({
            data: {
                userId: user?.id as string,
                subscriptionStatus: SubscriptionStatus.ACTIVE,
                billingPeriod: billingPeriod,
                nextBillingDate: nextBillingDate,
                nextResetDate:
                    billingPeriod === BillingPeriod.YEARLY
                        ? nextResetDate
                        : null,
                subscriptionPlan: subscriptionPlan,
                totalCredits: totalCredits,
                creditUsage: 0,
                subscriptionRefId: subscriptionRefId,
                subscriptionBuyDate: new Date(),
            },
        });

        await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { creditsBilled: totalCredits },
        });
    }
}
