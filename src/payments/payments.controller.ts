import {
    Body,
    Controller,
    Get,
    Post,
    Query,
    Req,
    UnauthorizedException,
    UseGuards,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import {
    ActiveSubscriptionResponseDto,
    AtlosAssetsResponse,
    AtlosInvoiceResponse,
    AtlosPaymentResponse,
    CreateAtlosInvoiceDto,
    CreateAtlosPaymentDto,
    CreateSubscriptionDto,
    CreditsDetailsResponseDto,
    CurrentPlanResponseDto,
    LifeTimeCreditsResponseDto,
    ListAtlosAssetsDto,
    PendingPaymentAmtResponseDto,
    SubscriptionPlanDetailsResponseDto,
    TopUpPlanDetailsResponseDto,
    TransactionHistoryResponseDto,
    UserCreditsResponseDto,
    UserStatusResponseDto,
} from './dto/payment.dto';
import { Request } from 'express';
import { PaymentAccessGuard } from './guards/payment-access.guard';

@ApiBearerAuth()
@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) {}

    @Get('lifetime-credits')
    @ApiOperation({ summary: 'Get lifetime credits usage' })
    @ApiResponse({
        status: 200,
        description: 'Lifetime credits retrieved successfully',
    })
    @ApiResponse({ status: 404, description: 'User not found' })
    async getLifeTimeCredits(
        @Req() req: Request,
    ): Promise<LifeTimeCreditsResponseDto> {
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        const totalCredits =
            await this.paymentsService.getLifeTimeCredits(userId);
        return { totalCredits };
    }

    // Get credits details
    @Get('credits-details')
    @ApiOperation({ summary: 'Get credits details' })
    @ApiResponse({
        status: 200,
        description: 'Credits details retrieved successfully',
    })
    @ApiResponse({ status: 404, description: 'User not found' })
    async getCredits(@Req() req: Request): Promise<CreditsDetailsResponseDto> {
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return await this.paymentsService.getCredits(userId);
    }

    @Get('current-plan')
    @ApiOperation({ summary: 'Get current plan' })
    @ApiResponse({
        status: 200,
        description: 'Current plan retrieved successfully',
    })
    @ApiResponse({ status: 404, description: 'User not found' })
    async getCurrentPlan(@Req() req: Request): Promise<CurrentPlanResponseDto> {
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return await this.paymentsService.getCurrentPlan(userId);
    }

    @Get('subscription-plan-details')
    @ApiOperation({ summary: 'Get subscription plan details' })
    @ApiResponse({
        status: 200,
        description: 'Subscription plan details retrieved successfully',
    })
    @ApiResponse({ status: 404, description: 'User not found' })
    async getSubscriptionPlanDetails(
        @Req() req: Request,
    ): Promise<SubscriptionPlanDetailsResponseDto> {
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return await this.paymentsService.getSubscriptionPlanDetails(userId);
    }

    @Get('top-up-plan-details')
    @ApiOperation({ summary: 'Get top up plan details' })
    @ApiResponse({
        status: 200,
        description: 'Top up plan details retrieved successfully',
    })
    @ApiResponse({ status: 404, description: 'No topUp found' })
    async getTopUpPlanDetails(
        @Req() req: Request,
    ): Promise<TopUpPlanDetailsResponseDto> {
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return await this.paymentsService.getTopUpPlanDetails(userId);
    }

    @Get('transaction-history')
    @ApiOperation({ summary: 'Get transaction history' })
    @ApiResponse({
        status: 200,
        description: 'Transaction history retrieved successfully',
    })
    @ApiResponse({ status: 404, description: 'User not found' })
    async getTransactionHistory(
        @Req() req: Request,
    ): Promise<TransactionHistoryResponseDto> {
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        const transactions =
            await this.paymentsService.getTransactionHistory(userId);
        return { transactions };
    }

    @Get('user-status')
    @ApiOperation({ summary: 'Get user status' })
    @ApiResponse({
        status: 200,
        description: 'User status retrieved successfully',
    })
    @ApiResponse({ status: 404, description: 'User not found' })
    async getUserStatus(@Req() req: Request): Promise<UserStatusResponseDto> {
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return await this.paymentsService.getUserStatus(userId);
    }

    @Get('active-subscription')
    @ApiOperation({ summary: 'Get active subscription' })
    @ApiResponse({
        status: 200,
        description: 'Active subscription retrieved successfully',
    })
    @ApiResponse({ status: 404, description: 'User not found' })
    async getActiveSubscription(
        @Req() req: Request,
    ): Promise<ActiveSubscriptionResponseDto> {
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        const subscription =
            await this.paymentsService.getActiveSubscription(userId);
        return { subscription };
    }

    @Get('pending-payment-amount')
    @ApiOperation({ summary: 'Get pending payment amount' })
    @ApiResponse({
        status: 200,
        description: 'Pending payment amount retrieved successfully',
    })
    @ApiResponse({ status: 404, description: 'User not found' })
    async getPendingPaymentAmt(
        @Req() req: Request,
    ): Promise<PendingPaymentAmtResponseDto> {
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        const amount = await this.paymentsService.getPendingPaymentAmt(userId);
        return { amount: amount ?? undefined };
    }

    @Post('switch-back-to-subscription')
    @ApiOperation({ summary: 'Switch back to subscription plan' })
    @ApiResponse({
        status: 200,
        description: 'Successfully switched back to subscription',
    })
    @ApiResponse({ status: 404, description: 'No subscription found' })
    async switchBackToSubscription(
        @Req() req: Request,
    ): Promise<{ message: string }> {
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        await this.paymentsService.switchBackToSubscription(userId);
        return { message: 'Successfully switched back to subscription plan' };
    }

    // check user credits
    @Get('user-credits')
    @ApiOperation({ summary: 'Get user credits' })
    @ApiResponse({
        status: 200,
        description: 'User credits retrieved successfully',
    })
    @ApiResponse({ status: 404, description: 'User not found' })
    @ApiQuery({
        name: 'type',
        enum: ['total', 'usage'],
        required: false,
        description: 'Credit type to retrieve',
    })
    async getUserCredits(
        @Req() req: Request,
        @Query('type') type: 'total' | 'usage' = 'total',
    ): Promise<UserCreditsResponseDto> {
        const credits = await this.paymentsService.getUserCredits(
            req.user as string,
            type,
        );
        return { credits, type };
    }

    @Get('subscription-cancellation-status')
    @ApiOperation({ summary: 'Get subscription cancellation status' })
    @ApiResponse({
        status: 200,
        description: 'Subscription cancellation status retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                isScheduledForCancellation: { type: 'boolean' },
                cancellationDate: { type: 'string', format: 'date-time' },
                nextBillingDate: { type: 'string', format: 'date-time' },
                daysUntilCancellation: { type: 'number' },
            },
        },
    })
    @ApiResponse({ status: 404, description: 'User not found' })
    async getSubscriptionCancellationStatus(@Req() req: Request): Promise<{
        isScheduledForCancellation: boolean;
        cancellationDate?: Date;
        nextBillingDate?: Date;
        daysUntilCancellation?: number;
    }> {
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return await this.paymentsService.getSubscriptionCancellationInfo(
            userId,
        );
    }

    @Post('cancel-subscription')
    @ApiOperation({ summary: 'Cancel subscription' })
    @ApiResponse({
        status: 200,
        description: 'Subscription cancelled successfully',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                subscriptionId: { type: 'string' },
                nextBillingDate: { type: 'string', format: 'date-time' },
                cancellationDate: { type: 'string', format: 'date-time' },
                daysUntilCancellation: { type: 'number' },
            },
        },
    })
    @ApiResponse({ status: 404, description: 'Subscription not found' })
    async cancelSubscription(@Req() req: Request): Promise<{
        success: boolean;
        message: string;
        subscriptionId?: string;
        nextBillingDate?: Date;
        cancellationDate?: Date;
        daysUntilCancellation?: number;
    }> {
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return await this.paymentsService.cancelSubscription({ userId });
    }

    @Post('cancel-atlos-subscription')
    @ApiOperation({
        summary: 'Cancel subscription via Atlos API',
        description:
            'Cancels the active subscription by calling Atlos API. Takes user ID from auth token and fetches the subscription reference ID automatically.',
    })
    @ApiResponse({
        status: 200,
        description:
            'Subscription cancelled successfully via Atlos payment gateway',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                subscriptionId: { type: 'string' },
                subscriptionRefId: { type: 'string' },
            },
        },
    })
    @ApiResponse({
        status: 400,
        description:
            'No active subscription found or subscription already cancelled',
    })
    @ApiResponse({ status: 404, description: 'User not found' })
    async cancelAtlosSubscription(@Req() req: Request): Promise<{
        success: boolean;
        message: string;
        subscriptionId?: string;
        subscriptionRefId?: string;
    }> {
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return await this.paymentsService.cancelAtlosSubscription(userId);
    }

    @Post('create-subscription')
    @UseGuards(PaymentAccessGuard)
    @ApiOperation({
        summary:
            'Create a subscription with CREATED status (before payment confirmation)',
    })
    @ApiResponse({
        status: 201,
        description: 'Subscription created successfully with CREATED status',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                subscriptionId: { type: 'string' },
                subscriptionRefId: { type: 'string' },
                message: { type: 'string' },
            },
        },
    })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async createSubscription(
        @Body() createSubscriptionDto: CreateSubscriptionDto,
        @Req() req: Request,
    ): Promise<{
        success: boolean;
        subscriptionId: string;
        message: string;
    }> {
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return await this.paymentsService.createSubscription(
            createSubscriptionDto,
            userId,
        );
    }

    @Get('rate-limits')
    @ApiOperation({ summary: 'Get user rate limits and current usage' })
    @ApiResponse({
        status: 200,
        description: 'Rate limits and usage retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                plan: { type: 'string' },
                limits: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            toolName: { type: 'string' },
                            maxRequests: { type: 'number' },
                            currentUsage: { type: 'number' },
                            remaining: { type: 'number' },
                            resetDate: { type: 'string', format: 'date-time' },
                            windowMs: { type: 'number' }
                        }
                    }
                }
            }
        }
    })
    @ApiResponse({ status: 404, description: 'User not found' })
    async getRateLimits(@Req() req: Request): Promise<{
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
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return await this.paymentsService.getRateLimits(userId);
    }

    @Post('atlos/invoice/create')
    @UseGuards(PaymentAccessGuard)
    @ApiOperation({
        summary: 'Create Atlos invoice for top-up',
        description: 'Step 1: Create an invoice with Atlos for top-up payment',
    })
    @ApiResponse({
        status: 200,
        description: 'Invoice created successfully',
    })
    async createAtlosInvoice(
        @Body() createAtlosInvoiceDto: CreateAtlosInvoiceDto,
        @Req() req: any,
    ): Promise<AtlosInvoiceResponse> {
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return await this.paymentsService.createAtlosInvoice(
            createAtlosInvoiceDto,
            userId,
        );
    }

    @Post('atlos/asset/list')
    @ApiOperation({
        summary: 'List available Atlos assets',
        description:
            'Step 2: Fetch the list of available assets and blockchains for payment',
    })
    @ApiResponse({
        status: 200,
        description: 'Assets fetched successfully',
    })
    async listAtlosAssets(
        @Body() listAtlosAssetsDto: ListAtlosAssetsDto,
        @Req() req: any,
    ): Promise<AtlosAssetsResponse> {
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return await this.paymentsService.listAtlosAssets(
            listAtlosAssetsDto,
            userId,
        );
    }

    @Post('atlos/payment/create')
    @UseGuards(PaymentAccessGuard)
    @ApiOperation({
        summary: 'Create Atlos payment for top-up',
        description:
            'Step 4: Create a payment with selected asset/blockchain. This generates a receiving wallet address.',
    })
    @ApiResponse({
        status: 200,
        description: 'Payment created successfully with wallet address',
    })
    async createAtlosPayment(
        @Body() createAtlosPaymentDto: CreateAtlosPaymentDto,
        @Req() req: any,
    ): Promise<AtlosPaymentResponse> {
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return await this.paymentsService.createAtlosPayment(
            createAtlosPaymentDto,
            userId,
        );
    }

    @Post('fix-user-plan')
    @ApiOperation({ summary: 'Fix user currentPlan based on active subscription' })
    @ApiResponse({ status: 200, description: 'User plan fixed' })
    async fixUserPlan(@Req() req: any): Promise<{ success: boolean; message: string }> {
        const userId = req.user;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return await this.paymentsService.fixUserCurrentPlan(userId);
    }
}
