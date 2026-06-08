import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../../services/prisma.service';
import { SubscriptionStatus, UserStatus, PaymentPlan } from 'generated/prisma';
import { ToolName } from '../../utils/tool-credits';

export interface ValidatedUser {
    userId: string;
}

@Injectable()
export class ApiKeyValidationService {
    private readonly logger = new Logger(ApiKeyValidationService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Validates the API key, checks credits, and returns the user's context.
     * All API tools use this to scope operations to the correct user automatically.
     */
    async validateApiKeyAndBalance(
        apiKey: string,
        requiredCredits: number,
        toolName: ToolName,
    ): Promise<ValidatedUser> {
        if (!this.isValidApiKeyFormat(apiKey)) {
            throw new BadRequestException(
                'Invalid API key format. Expected format: sk_xxx',
            );
        }

        const apiKeyRecord = await this.prisma.apiKey.findUnique({
            where: { key: apiKey },
            include: {
                User: {
                    include: {
                        Credits: true,
                        TopUp: true,
                        Subscription: {
                            where: {
                                subscriptionStatus: SubscriptionStatus.ACTIVE,
                            },
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                        },
                    },
                },
            },
        });

        if (
            !apiKeyRecord?.User ||
            apiKeyRecord.User.status !== UserStatus.ACTIVE
        ) {
            throw new BadRequestException('Invalid API key or inactive user');
        }

        if (apiKeyRecord.expiry && apiKeyRecord.expiry < new Date()) {
            throw new ForbiddenException(
                'API key has expired. Please generate a new one.',
            );
        }

        const user = apiKeyRecord.User;
        let availableCredits = 0;

        switch (user.currentPlan) {
            case PaymentPlan.FREE:
                if (!user.Credits) {
                    throw new ForbiddenException(
                        'No credits record found for FREE plan.',
                    );
                }
                availableCredits =
                    user.Credits.availableCredits -
                    (user.Credits.creditUsage || 0);
                break;
            case PaymentPlan.TOP_UP:
                if (!user.TopUp) {
                    throw new ForbiddenException('No top-up record found.');
                }
                availableCredits =
                    user.TopUp.totalCredits - user.TopUp.creditUsage;
                break;
            case PaymentPlan.SUBSCRIPTION:
                const sub = user.Subscription?.[0];
                if (!sub) {
                    throw new ForbiddenException(
                        'No active subscription found.',
                    );
                }
                // Check for unlimited credits (999999 or -1 means unlimited)
                if (sub.totalCredits >= 999999 || sub.totalCredits === -1) {
                    availableCredits = 999999; // Treat as unlimited
                } else {
                    availableCredits =
                        sub.totalCredits - (sub.creditUsage || 0);
                }
                break;
            default:
                throw new BadRequestException(
                    `Unknown payment plan: ${user.currentPlan}`,
                );
        }

        if (availableCredits < requiredCredits) {
            throw new ForbiddenException(
                `Insufficient credits. Need ${requiredCredits}, have ${availableCredits}.`,
            );
        }

        this.logger.log(
            `Validated key for user ${user.id}, credits: ${availableCredits}`,
        );

        return {
            userId: user.id,
        };
    }

    async deductCredits(
        apiKey: string,
        creditsToDeduct: number,
        toolName?: string,
    ): Promise<void> {
        const apiKeyRecord = await this.prisma.apiKey.findUnique({
            where: { key: apiKey },
            include: {
                User: {
                    include: {
                        Credits: true,
                        TopUp: true,
                        Subscription: {
                            where: {
                                subscriptionStatus: SubscriptionStatus.ACTIVE,
                            },
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                        },
                    },
                },
            },
        });

        if (!apiKeyRecord?.User)
            throw new BadRequestException('Invalid API key');
        const user = apiKeyRecord.User;

        switch (user.currentPlan) {
            case PaymentPlan.FREE:
                if (!user.Credits)
                    throw new BadRequestException('No credits record');
                await this.prisma.credits.update({
                    where: { id: user.Credits.id },
                    data: {
                        creditUsage:
                            (user.Credits.creditUsage || 0) + creditsToDeduct,
                    },
                });
                break;
            case PaymentPlan.TOP_UP:
                if (!user.TopUp)
                    throw new BadRequestException('No top-up record');
                await this.prisma.topUp.update({
                    where: { id: user.TopUp.id },
                    data: {
                        creditUsage: user.TopUp.creditUsage + creditsToDeduct,
                    },
                });
                break;
            case PaymentPlan.SUBSCRIPTION:
                const sub = user.Subscription?.[0];
                if (!sub)
                    throw new BadRequestException('No active subscription');
                // Skip deduction for unlimited plans (999999 or -1 means unlimited)
                if (sub.totalCredits >= 999999 || sub.totalCredits === -1) {
                    this.logger.log(
                        `Skipping credit deduction for unlimited plan - user ${user.id}`,
                    );
                    return;
                }
                await this.prisma.subscription.update({
                    where: { id: sub.id },
                    data: {
                        creditUsage: (sub.creditUsage || 0) + creditsToDeduct,
                    },
                });
                break;
        }

        this.logger.log(`Deducted ${creditsToDeduct} credits for ${toolName}`);

        // Log to CreditUsageLog for ledger/audit
        try {
            await this.prisma.creditUsageLog.create({
                data: {
                    userId: apiKeyRecord.User.id,
                    toolName: toolName || 'unknown',
                    credits: creditsToDeduct,
                    description: `${toolName} usage`,
                    source: 'api',
                },
            });
        } catch (logError) {
            this.logger.warn(`Failed to log credit usage: ${logError.message}`);
        }
    }

    async findApiKeyByUserId(userId: string): Promise<string | null> {
        const record = await this.prisma.apiKey.findUnique({
            where: { userId },
            select: { key: true },
        });
        return record?.key || null;
    }

    private isValidApiKeyFormat(apiKey: string): boolean {
        return /^sk_[A-Za-z0-9]{32,}$/.test(apiKey);
    }
}
