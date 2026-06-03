import {
    IsBoolean,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsIn,
    Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { BillingPeriod, PaymentPlan, SubscriptionTier } from 'generated/prisma';
import { SupportedBlockchainCode, SUPPORTED_BLOCKCHAIN_CODES } from '../constants/blockchains';

export class CancelSubscriptionDto {
    @ApiProperty({ description: 'user ID of the user' })
    @IsString()
    @IsNotEmpty()
    userId: string;
}

export class GetCustomerBalanceDto {
    @ApiProperty({ description: 'User ID' })
    @IsString()
    userId: string;
}

export class CreateCustomerDto {
    @ApiProperty({ description: 'Token contract address' })
    @IsString()
    tokenAddress: string;

    @ApiProperty({ description: 'Network ID' })
    @IsNumber()
    networkId: number;

    @ApiProperty({ description: 'Authorization signature' })
    @IsString()
    authorizationSignature: string;

    @ApiPropertyOptional({ description: 'Customer reference ID' })
    @IsOptional()
    @IsString()
    customerRefId?: string;
}

export class CreatePayinDto {
    @ApiProperty({ description: 'Payment amount' })
    @IsString()
    amount: string;

    @ApiProperty({ description: 'Bill date', default: 0 })
    @IsNumber()
    @Type(() => Number)
    billDate: number = 0;

    @ApiPropertyOptional({ description: 'Subscription reference ID' })
    @IsOptional()
    @IsString()
    subscriptionRefId?: string;

    @ApiProperty({ enum: PaymentPlan, description: 'Payment plan type' })
    @IsEnum(PaymentPlan)
    paymentPlan: PaymentPlan;

    @ApiPropertyOptional({ enum: BillingPeriod, description: 'Billing period' })
    @IsOptional()
    @IsEnum(BillingPeriod)
    billingPeriod?: BillingPeriod;

    @ApiPropertyOptional({
        enum: SubscriptionTier,
        description: 'Subscription tier',
    })
    @IsOptional()
    @IsEnum(SubscriptionTier)
    subscriptionTier?: SubscriptionTier;

    @ApiPropertyOptional({ description: 'Payment description' })
    @IsOptional()
    @IsString()
    description?: string;
}

export class CreatePaymentDto {}

export interface CustomerBalanceResponseDto {
    balance: string;
    authorization: string;
    tokenAddress: string;
    decimals: number;
}

export class GetUserDataDto {
    @ApiProperty({ description: 'User ID' })
    @IsString()
    @IsNotEmpty()
    userId: string;
}

export class ListPaymentTypesDto {
    @ApiProperty({ description: 'Network ID' })
    @IsNumber()
    @Type(() => Number)
    networkId: number;
}

export class UpdatePaymentDto extends PartialType(CreatePaymentDto) {}

export interface LifeTimeCreditsResponseDto {
    totalCredits: number;
}

export interface CreditsDetailsResponseDto {
    availableCredits: number;
    usedCredits: number;
    totalCredits: number;
}

export interface CurrentPlanResponseDto {
    currentPlan: string;
}

export interface SubscriptionDetailsDto {
    id: string;
    userId: string;
    subscriptionStatus: string;
    creditUsage: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface SubscriptionPlanDetailsResponseDto {
    subscription?: SubscriptionDetailsDto;
    plan: string;
}

export interface TopUpPlanDetailsResponseDto {
    id: string;
    userId: string;
    creditUsage: number;
    totalCredits: number;
    status: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface TransactionDto {
    id: string;
    userId: string;
    amount: number;
    type: string;
    status: string;
    createdAt: Date;
}

export interface TransactionHistoryResponseDto {
    transactions: TransactionDto[];
}

export interface UserStatusResponseDto {
    status: string;
}

export interface ActiveSubscriptionResponseDto {
    subscription?: SubscriptionDetailsDto;
}

export interface PendingPaymentAmtResponseDto {
    amount?: number;
}

export interface UserCreditsResponseDto {
    credits: number;
    type: 'total' | 'usage';
}

export class CreateSubscriptionDto {
    @ApiProperty({ enum: SubscriptionTier, description: 'Subscription tier' })
    @IsEnum(SubscriptionTier)
    subscriptionTier: SubscriptionTier;

    @ApiProperty({ enum: BillingPeriod, description: 'Billing period' })
    @IsEnum(BillingPeriod)
    billingPeriod: BillingPeriod;

    @ApiPropertyOptional({
        description:
            'Flag to indicate if this is an upgrade from existing subscription',
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    isUpgrade?: boolean;
}

// Atlos Top-Up DTOs
export class CreateAtlosInvoiceDto {
    @ApiPropertyOptional({ description: 'Order ID to track in your system' })
    @IsOptional()
    @IsString()
    orderId?: string;

    @ApiProperty({ description: 'Order amount in orderCurrency', minimum: 0.01 })
    @IsNumber()
    @Type(() => Number)
    @Min(0.01, { message: 'Order amount must be at least 0.01' })
    orderAmount: number;
}

export interface AtlosInvoiceResponse {
    InvoiceId: string;
    Status: string;
    Amount: number;
    Currency: string;
    ExpiryDate?: string;
    PaymentLink?: string;
}

export class ListAtlosAssetsDto {
    @ApiProperty({ description: 'Order amount in orderCurrency', minimum: 0.01 })
    @IsNumber()
    @Type(() => Number)
    @Min(0.01, { message: 'Order amount must be at least 0.01' })
    orderAmount: number;

    @ApiPropertyOptional({ description: 'Fiat order currency', default: 'USD' })
    @IsOptional()
    @IsString()
    orderCurrency?: string;
}

export interface AtlosBlockchain {
    BlockchainCode: number;
    BlockchainName: string;
    NetworkType: string;
}

export interface AtlosAsset {
    AssetCode: string;
    AssetName: string;
    Blockchains: AtlosBlockchain[];
}

export interface AtlosAssetsResponse {
    Assets: AtlosAsset[];
}

export class CreateAtlosPaymentDto {
    @ApiProperty({ description: 'Invoice ID from Invoice/Create' })
    @IsString()
    @IsNotEmpty()
    invoiceId: string;

    @ApiProperty({ description: 'Asset symbol, e.g., "USDC"' })
    @IsString()
    @IsNotEmpty()
    assetCode: string;

    @ApiProperty({
        description: 'Blockchain code',
        enum: SupportedBlockchainCode,
        example: SupportedBlockchainCode.BASE,
    })
    @IsString()
    @IsNotEmpty()
    @IsIn(SUPPORTED_BLOCKCHAIN_CODES, {
        message: `blockchainCode must be one of: ${SUPPORTED_BLOCKCHAIN_CODES.join(', ')}`,
    })
    blockchainCode: SupportedBlockchainCode;
}

export interface AtlosPaymentResponse {
    PaymentId: string;
    WalletAddress: string;
    Amount: string;
    Asset: string;
    Blockchain: string;
    QRCode?: string;
    ExpiryDate?: string;
}
