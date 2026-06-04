export class CouponDto {
    id: string;
    code: string;
    creditAmount: number;
    isActive: boolean;
    redemptionCount: number;
    createdAt: Date;
    updatedAt: Date;
}

export class CouponRedemptionDto {
    id: string;
    userId: string;
    couponId: string;
    couponCode: string;
    creditsAdded: number;
    createdAt: Date;
}

export class RedeemCouponResponseDto {
    success: boolean;
    message: string;
    creditsAdded: number;
    totalCredits: number;
    canAccessPayments: boolean;
}
