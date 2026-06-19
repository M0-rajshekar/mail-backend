import {
    Controller,
    Get,
    Post,
    Req,
    Res,
    Logger,
    BadRequestException,
    Param,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { SubscriptionPaymentService } from '../services/subscription-payment.service';
import { ConfigService } from '@nestjs/config';
import { SubscriptionTier, BillingPeriod } from 'generated/prisma';
import { SUBSCRIPTION_PLANS } from '../constants/subscription-plans';

@ApiTags('x402-subscriptions')
@Controller('x402/subscriptions')
export class X402SubscriptionController {
    private readonly logger = new Logger(X402SubscriptionController.name);

    constructor(
        private readonly paymentService: SubscriptionPaymentService,
        private readonly configService: ConfigService,
    ) {}

    private getPrice(plan: string, period: string): number {
        // First try environment variables
        const envKey = `${plan}_${period}_PRICE`;
        const priceStr = this.configService.get(envKey);

        if (priceStr) {
            const amount = parseFloat(priceStr);
            if (!isNaN(amount) && amount > 0) {
                return amount;
            }
        }

        // Fallback to constants
        const planConfig = SUBSCRIPTION_PLANS[plan];
        if (planConfig) {
            const amount =
                period === 'YEARLY'
                    ? planConfig.yearlyPrice
                    : planConfig.monthlyPrice;
            if (amount > 0) {
                return amount;
            }
        }

        throw new BadRequestException(
            `Price not configured for ${plan} ${period}`,
        );
    }

    private validatePlanAndPeriod(
        plan: string,
        period: string,
    ): { validPlan: SubscriptionTier; validPeriod: BillingPeriod } {
        // Validate plan
        const validPlan = Object.values(SubscriptionTier).find(
            (tier) => tier.toLowerCase() === plan.toLowerCase(),
        );

        if (!validPlan) {
            throw new BadRequestException(
                `Invalid subscription plan: ${plan}. Valid plans: ${Object.values(
                    SubscriptionTier,
                ).join(', ')}`,
            );
        }

        // Validate period
        const validPeriod = Object.values(BillingPeriod).find(
            (p) => p.toLowerCase() === period.toLowerCase(),
        );

        if (!validPeriod) {
            throw new BadRequestException(
                `Invalid billing period: ${period}. Valid periods: ${Object.values(BillingPeriod).join(', ')}`,
            );
        }

        return { validPlan, validPeriod };
    }

    // Dynamic endpoint for network-specific subscriptions
    @Get(':network/:plan/:period')
    @ApiOperation({
        summary: 'Get subscription for specific network (X402 payment)',
        description:
            'X402 payment endpoint for subscription on specific network',
    })
    @ApiParam({
        name: 'network',
        description: 'Network name (e.g., ethereum, base, polygon)',
    })
    @ApiParam({
        name: 'plan',
        description: 'Subscription plan',
        enum: Object.values(SubscriptionTier),
    })
    @ApiParam({
        name: 'period',
        description: 'Billing period',
        enum: Object.values(BillingPeriod),
    })
    async getSubscriptionNetwork(
        @Param('network') network: string,
        @Param('plan') plan: string,
        @Param('period') period: string,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        try {
            this.logger.log(
                `Processing ${plan.toUpperCase()} ${period.toUpperCase()} subscription request for network: ${network}`,
            );
            this.validateRequest(req);

            const { validPlan, validPeriod } = this.validatePlanAndPeriod(
                plan,
                period,
            );
            const amount = this.getPrice(validPlan, validPeriod);

            await this.paymentService.processPayment(
                req,
                res,
                validPlan,
                validPeriod,
                amount,
            );
        } catch (error) {
            this.handleError(
                res,
                error,
                `${plan.toUpperCase()} ${period.toUpperCase()}`,
            );
        }
    }

    @Post(':network/:plan/:period')
    @ApiOperation({
        summary:
            'Process subscription payment for specific network (X402 payment)',
        description:
            'X402 payment processing endpoint for subscription on specific network',
    })
    @ApiParam({
        name: 'network',
        description: 'Network name (e.g., ethereum, base, polygon)',
    })
    @ApiParam({
        name: 'plan',
        description: 'Subscription plan',
        enum: Object.values(SubscriptionTier),
    })
    @ApiParam({
        name: 'period',
        description: 'Billing period',
        enum: Object.values(BillingPeriod),
    })
    async postSubscriptionNetwork(
        @Param('network') network: string,
        @Param('plan') plan: string,
        @Param('period') period: string,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        try {
            this.logger.log(
                `Processing ${plan.toUpperCase()} ${period.toUpperCase()} subscription request for network: ${network}`,
            );
            this.validateRequest(req);

            const { validPlan, validPeriod } = this.validatePlanAndPeriod(
                plan,
                period,
            );
            const amount = this.getPrice(validPlan, validPeriod);

            await this.paymentService.processPayment(
                req,
                res,
                validPlan,
                validPeriod,
                amount,
            );
        } catch (error) {
            this.handleError(
                res,
                error,
                `${plan.toUpperCase()} ${period.toUpperCase()}`,
            );
        }
    }

    // Dynamic endpoint for general subscriptions (backward compatibility)
    @Get(':plan/:period')
    @ApiOperation({
        summary: 'Get subscription (X402 payment)',
        description:
            'X402 payment endpoint for subscription (backward compatibility)',
    })
    @ApiParam({
        name: 'plan',
        description: 'Subscription plan',
        enum: Object.values(SubscriptionTier),
    })
    @ApiParam({
        name: 'period',
        description: 'Billing period',
        enum: Object.values(BillingPeriod),
    })
    async getSubscription(
        @Param('plan') plan: string,
        @Param('period') period: string,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        try {
            this.logger.log(
                `Processing ${plan.toUpperCase()} ${period.toUpperCase()} subscription request`,
            );
            this.validateRequest(req);

            const { validPlan, validPeriod } = this.validatePlanAndPeriod(
                plan,
                period,
            );
            const amount = this.getPrice(validPlan, validPeriod);

            await this.paymentService.processPayment(
                req,
                res,
                validPlan,
                validPeriod,
                amount,
            );
        } catch (error) {
            this.handleError(
                res,
                error,
                `${plan.toUpperCase()} ${period.toUpperCase()}`,
            );
        }
    }

    @Post(':plan/:period')
    @ApiOperation({
        summary: 'Process subscription payment (X402 payment)',
        description:
            'X402 payment processing endpoint for subscription (backward compatibility)',
    })
    @ApiParam({
        name: 'plan',
        description: 'Subscription plan',
        enum: Object.values(SubscriptionTier),
    })
    @ApiParam({
        name: 'period',
        description: 'Billing period',
        enum: Object.values(BillingPeriod),
    })
    async postSubscription(
        @Param('plan') plan: string,
        @Param('period') period: string,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        try {
            this.logger.log(
                `Processing ${plan.toUpperCase()} ${period.toUpperCase()} subscription request`,
            );
            this.validateRequest(req);

            const { validPlan, validPeriod } = this.validatePlanAndPeriod(
                plan,
                period,
            );
            const amount = this.getPrice(validPlan, validPeriod);

            await this.paymentService.processPayment(
                req,
                res,
                validPlan,
                validPeriod,
                amount,
            );
        } catch (error) {
            this.handleError(
                res,
                error,
                `${plan.toUpperCase()} ${period.toUpperCase()}`,
            );
        }
    }

    private validateRequest(req: Request): void {
        // Basic request validation
        if (!req.headers['user-agent']) {
            throw new BadRequestException('User-Agent header is required');
        }
    }

    private handleError(res: Response, error: any, operation: string): void {
        this.logger.error(`Error in ${operation} operation:`, error);

        if (error instanceof BadRequestException) {
            res.status(400).json({
                error: 'Bad Request',
                message: error.message,
            });
            return;
        }

        // Don't expose internal errors to clients
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An unexpected error occurred. Please try again later.',
        });
    }
}
