import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../services/prisma.service';
import {
  SubscriptionStatus,
  SubscriptionTier,
  BillingPeriod,
  UserStatus,
  TransactionStatus,
  FreePlanStatus,
  TopupStatus,
} from 'generated/prisma';
import { getSubscriptionCredits } from '../constants/subscription-plans';

interface CreateX402SubscriptionDto {
  walletAddress: string;
  network: string;
  plan: string;
  billingPeriod: string;
  amount: number;
}

@Injectable()
export class X402SubscriptionService {
  private readonly logger = new Logger(X402SubscriptionService.name);

  constructor(
    private configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async createSubscription(request: CreateX402SubscriptionDto) {
    // Validate and normalize input
    if (!request.walletAddress || !request.network || !request.plan || !request.billingPeriod) {
      throw new BadRequestException('Missing required subscription parameters');
    }

    // Validate wallet address format BEFORE normalization
    if (!this.isValidWalletAddress(request.walletAddress)) {
      throw new BadRequestException('Invalid wallet address format');
    }

    // Normalize wallet address - only lowercase EVM addresses, keep Solana addresses as-is
    const normalizedWalletAddress = request.walletAddress.startsWith('0x') 
      ? request.walletAddress.toLowerCase() 
      : request.walletAddress;

    this.logger.log(`Creating X402 subscription for wallet: ${normalizedWalletAddress}`);

    try {
      // Validate enum values before database operations
      this.validateEnumValue(request.plan, SubscriptionTier, 'subscription plan');
      this.validateEnumValue(request.billingPeriod, BillingPeriod, 'billing period');

      // X402 middleware has already verified payment, so we can proceed directly
      
      // Find or create user
      let user = await this.prisma.user.findFirst({
        where: { 
          walletAddress: normalizedWalletAddress,
        },
        include: {
          Subscription: {
            where: {
              subscriptionStatus: SubscriptionStatus.ACTIVE,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
          Credits: true,
          TopUp: true,
        },
      });

      if (!user) {
        // Create new user
        const newUser = await this.prisma.user.create({
          data: {
            walletAddress: normalizedWalletAddress,
            status: UserStatus.ACTIVE,
            currentPlan: 'SUBSCRIPTION' as any, // Will be updated after subscription creation
            // X402 specific fields
            preferredNetwork: request.network,
            lastPaymentNetwork: request.network,
          },
        });

        // Fetch the user with subscriptions for consistency
        user = await this.prisma.user.findFirst({
          where: { id: newUser.id },
          include: {
            Subscription: {
              where: {
                subscriptionStatus: SubscriptionStatus.ACTIVE,
              },
              orderBy: {
                createdAt: 'desc',
              },
              take: 1,
            },
            Credits: true,
            TopUp: true,
          },
        });
      }

      // Use transaction for atomic operations
      const result = await this.prisma.$transaction(async (tx) => {
        // Cancel existing active subscription if any
        const existingSubscriptions = await tx.subscription.findMany({
          where: {
            userId: user!.id,
            subscriptionStatus: SubscriptionStatus.ACTIVE,
          },
        });

        if (existingSubscriptions && existingSubscriptions.length > 0) {
          const activeSubscription = existingSubscriptions[0];
          
          await tx.subscription.update({
            where: { id: activeSubscription.id },
            data: {
              subscriptionStatus: SubscriptionStatus.CANCELLED,
              subscriptionCancelDate: new Date(),
            },
          });

          this.logger.log(`Cancelled previous subscription ${activeSubscription.id} for X402 upgrade`);
        }

        // Calculate billing dates
        const nextBillingDate = this.calculateNextBillingDate(request.billingPeriod as BillingPeriod);
        const nextResetDate = request.billingPeriod === 'YEARLY' ? this.calculateNextResetDate() : null;

        // Calculate total credits based on subscription tier
        const totalCredits = getSubscriptionCredits(
          request.plan as SubscriptionTier, 
          request.billingPeriod as BillingPeriod
        );

        // Generate subscription reference ID (same as traditional payment flow)
        const subscriptionRefId = `x402_sub_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

        // Create new subscription with ACTIVE status (X402 payment already verified)
        const subscription = await tx.subscription.create({
          data: {
            userId: user!.id,
            subscriptionPlan: request.plan as SubscriptionTier,
            billingPeriod: request.billingPeriod as BillingPeriod,
            subscriptionStatus: SubscriptionStatus.ACTIVE,
            totalCredits,
            creditUsage: 0,
            subscriptionBuyDate: new Date(),
            nextBillingDate,
            nextResetDate,
            subscriptionRefId,
            // X402 specific fields
            paymentMethod: 'X402',
            paymentNetwork: request.network,
          },
        });

        // Update user's current plan and reactivate if paused
        const updateData: any = { 
          currentPlan: 'SUBSCRIPTION',
          lastPaymentNetwork: request.network,
        };
        
        // Always activate user when they have an active subscription (fix for paused users)
        // This ensures users with active subscriptions are never paused
        updateData.status = UserStatus.ACTIVE;

        await tx.user.update({
          where: { id: user!.id },
          data: updateData,
        });

        // Pause free credits if active (same as traditional payment flow)
        if (user?.Credits?.status === FreePlanStatus.ACTIVE) {
          await tx.credits.update({
            where: { id: user.Credits.id },
            data: { status: FreePlanStatus.PAUSED },
          });
        }

        // Pause TopUp if active (same as traditional payment flow)
        if (user?.TopUp?.status === TopupStatus.ACTIVE) {
          await tx.topUp.update({
            where: { id: user.TopUp.id },
            data: {
              creditUsage: user.TopUp.totalCredits, // Mark all as used
              status: TopupStatus.PAUSED,
            },
          });
        }

        // Create transaction record
        await tx.transaction.create({
          data: {
            userId: user!.id,
            walletAddress: normalizedWalletAddress,
            chainId: request.network,
            chainType: request.network.includes('solana') ? 'SOLANA' : 'ETHEREUM',
            amount: request.amount,
            creditsBilled: totalCredits,
            tokenAddress: '', // X402 doesn't provide specific token address
            status: 'CONFIRMED', // X402 payment already verified
            paymentPlan: 'SUBSCRIPTION',
            tokenDecimals: 6, // USDC has 6 decimals
            tokenSymbol: 'USDC',
            description: 'X402 subscription payment',
          },
        });

        return subscription;
      });

      this.logger.log(
        `X402 subscription created successfully for user ${user!.id}`,
        {
          subscriptionId: result.id,
          plan: request.plan,
          billingPeriod: request.billingPeriod,
          totalCredits: result.totalCredits,
          network: request.network,
        },
      );

      return {
        success: true,
        subscriptionId: result.id,
        message: 'X402 subscription created successfully',
        totalCredits: result.totalCredits,
      };
    } catch (error: any) {
      this.logger.error('Error creating X402 subscription:', {
        walletAddress: normalizedWalletAddress,
        message: error.message,
      });

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException('Failed to create X402 subscription');
    }
  }

  private isValidWalletAddress(address: string): boolean {
    // Basic validation for EVM addresses (0x + 40 hex chars) or Solana addresses (base58, 32-44 chars)
    const evmRegex = /^0x[a-fA-F0-9]{40}$/;
    const solanaRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    
    return evmRegex.test(address) || solanaRegex.test(address);
  }

  private validateEnumValue(value: string, enumObject: any, fieldName: string): void {
    const validValues = Object.values(enumObject);
    if (!validValues.includes(value.toUpperCase())) {
      throw new BadRequestException(
        `Invalid ${fieldName}: ${value}. Valid values: ${validValues.join(', ')}`
      );
    }
  }

  private calculateNextBillingDate(billingPeriod: BillingPeriod): Date {
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

  private calculateNextResetDate(): Date {
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
}