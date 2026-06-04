import {
    BadRequestException,
    Injectable,
    UnauthorizedException,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/services/prisma.service';
import {
    CreateCouponDto,
    UpdateCouponDto,
    RedeemCouponResponseDto,
    CouponDto,
    CouponRedemptionDto,
} from './dto';
import { FreePlanStatus, AccessRequestStatus } from 'generated/prisma';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CouponsService {
    private readonly logger = new Logger(CouponsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
    ) {}

    private async isAdmin(userId: string): Promise<boolean> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { walletAddress: true },
        });

        const adminWallet = this.configService.get<string>(
            'ADMIN_WALLET_ADDRESS',
        );
        if (!adminWallet) return false;

        return user?.walletAddress.toLowerCase() === adminWallet.toLowerCase();
    }

    /**
     * Admin: Create a new coupon code
     */
    async createCoupon(
        createCouponDto: CreateCouponDto,
        userId: string,
    ): Promise<CouponDto> {
        if (!(await this.isAdmin(userId))) {
            throw new UnauthorizedException(
                `User is not an admin. Please login with the admin account.`,
            );
        }
        try {
            const code = createCouponDto.code.toUpperCase();
            const existing = await this.prisma.coupon.findUnique({
                where: { code },
            });

            if (existing) {
                throw new BadRequestException(
                    `Coupon code '${code}' already exists`,
                );
            }

            const coupon = await this.prisma.coupon.create({
                data: {
                    code,
                    creditAmount: createCouponDto.creditAmount,
                    isActive: createCouponDto.isActive ?? true,
                },
                include: {
                    _count: {
                        select: { redemptions: true },
                    },
                },
            });

            this.logger.log(`Created coupon: ${coupon.code}`);

            return {
                id: coupon.id,
                code: coupon.code,
                creditAmount: coupon.creditAmount,
                isActive: coupon.isActive,
                redemptionCount: coupon._count.redemptions,
                createdAt: coupon.createdAt,
                updatedAt: coupon.updatedAt,
            };
        } catch (error: any) {
            if (
                error instanceof BadRequestException ||
                error instanceof UnauthorizedException
            ) {
                throw error;
            }
            this.logger.error('Error creating coupon:', error);
            throw new BadRequestException('Failed to create coupon');
        }
    }

    /**
     * Admin: Update an existing coupon
     */
    async updateCoupon(
        id: string,
        updateCouponDto: UpdateCouponDto,
        userId: string,
    ): Promise<CouponDto> {
        if (!(await this.isAdmin(userId))) {
            throw new UnauthorizedException(
                `User is not an admin. Please login with the admin account.`,
            );
        }
        try {
            const coupon = await this.prisma.coupon.findUnique({
                where: { id },
            });

            if (!coupon) {
                throw new NotFoundException(`Coupon with ID ${id} not found`);
            }

            const updateData: any = { ...updateCouponDto };
            if (updateData.code) {
                updateData.code = updateData.code.toUpperCase();
            }

            const updated = await this.prisma.coupon.update({
                where: { id },
                data: updateData,
                include: {
                    _count: {
                        select: { redemptions: true },
                    },
                },
            });

            this.logger.log(`Updated coupon: ${updated.code}`);

            return {
                id: updated.id,
                code: updated.code,
                creditAmount: updated.creditAmount,
                isActive: updated.isActive,
                redemptionCount: updated._count.redemptions,
                createdAt: updated.createdAt,
                updatedAt: updated.updatedAt,
            };
        } catch (error: any) {
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException ||
                error instanceof UnauthorizedException
            ) {
                throw error;
            }
            this.logger.error('Error updating coupon:', error);
            throw new BadRequestException('Failed to update coupon');
        }
    }

    /**
     * Admin: List all coupons with redemption stats
     */
    async listCoupons(userId: string): Promise<CouponDto[]> {
        if (!(await this.isAdmin(userId))) {
            throw new UnauthorizedException(
                `User is not an admin. Please login with the admin account.`,
            );
        }
        const coupons = await this.prisma.coupon.findMany({
            include: {
                _count: {
                    select: { redemptions: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return coupons.map((coupon) => ({
            id: coupon.id,
            code: coupon.code,
            creditAmount: coupon.creditAmount,
            isActive: coupon.isActive,
            redemptionCount: coupon._count.redemptions,
            createdAt: coupon.createdAt,
            updatedAt: coupon.updatedAt,
        }));
    }

    /**
     * Admin: Get a specific coupon by ID
     */
    async getCoupon(id: string, userId: string): Promise<CouponDto> {
        if (!(await this.isAdmin(userId))) {
            throw new UnauthorizedException(
                `User is not an admin. Please login with the admin account.`,
            );
        }
        const coupon = await this.prisma.coupon.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { redemptions: true },
                },
            },
        });

        if (!coupon) {
            throw new NotFoundException(`Coupon with ID ${id} not found`);
        }

        return {
            id: coupon.id,
            code: coupon.code,
            creditAmount: coupon.creditAmount,
            isActive: coupon.isActive,
            redemptionCount: coupon._count.redemptions,
            createdAt: coupon.createdAt,
            updatedAt: coupon.updatedAt,
        };
    }

    /**
     * Admin: Delete a coupon
     */
    async deleteCoupon(
        id: string,
        userId: string,
    ): Promise<{ success: boolean; message: string }> {
        if (!(await this.isAdmin(userId))) {
            throw new UnauthorizedException(
                `User is not an admin. Please login with the admin account.`,
            );
        }
        try {
            const coupon = await this.prisma.coupon.findUnique({
                where: { id },
                include: {
                    _count: {
                        select: { redemptions: true },
                    },
                },
            });

            if (!coupon) {
                throw new NotFoundException(`Coupon with ID ${id} not found`);
            }

            if (coupon._count.redemptions > 0) {
                throw new BadRequestException(
                    `Cannot delete coupon '${coupon.code}' as it has ${coupon._count.redemptions} redemptions`,
                );
            }

            await this.prisma.coupon.delete({
                where: { id },
            });

            this.logger.log(`Deleted coupon: ${coupon.code}`);

            return {
                success: true,
                message: `Coupon '${coupon.code}' deleted successfully`,
            };
        } catch (error: any) {
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException ||
                error instanceof UnauthorizedException
            ) {
                throw error;
            }
            this.logger.error('Error deleting coupon:', error);
            throw new BadRequestException('Failed to delete coupon');
        }
    }

    /**
     * Admin: Get redemptions for a specific coupon
     */
    async getCouponRedemptions(
        couponId: string,
        userId: string,
    ): Promise<CouponRedemptionDto[]> {
        if (!(await this.isAdmin(userId))) {
            throw new UnauthorizedException(
                `User is not an admin. Please login with the admin account.`,
            );
        }
        const coupon = await this.prisma.coupon.findUnique({
            where: { id: couponId },
        });

        if (!coupon) {
            throw new NotFoundException(`Coupon with ID ${couponId} not found`);
        }

        const redemptions = await this.prisma.couponRedemption.findMany({
            where: { couponId },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        walletAddress: true,
                    },
                },
                coupon: {
                    select: {
                        code: true,
                        creditAmount: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return redemptions.map((redemption) => ({
            id: redemption.id,
            userId: redemption.userId,
            couponId: redemption.couponId,
            couponCode: redemption.coupon.code,
            creditsAdded: redemption.coupon.creditAmount,
            createdAt: redemption.createdAt,
        }));
    }

    /**
     * User: Redeem a coupon code
     */
    async redeemCoupon(
        userId: string,
        code: string,
    ): Promise<RedeemCouponResponseDto> {
        try {
            const coupon = await this.prisma.coupon.findUnique({
                where: { code: code.toUpperCase() },
            });

            if (!coupon) {
                throw new BadRequestException('Invalid coupon code');
            }

            if (!coupon.isActive) {
                throw new BadRequestException(
                    'This coupon code is no longer active',
                );
            }

            const existingRedemption =
                await this.prisma.couponRedemption.findUnique({
                    where: {
                        userId_couponId: {
                            userId,
                            couponId: coupon.id,
                        },
                    },
                });

            if (existingRedemption) {
                throw new BadRequestException(
                    'You have already redeemed this coupon code',
                );
            }

            // Get or create user's Credits record
            let userCredits = await this.prisma.credits.findUnique({
                where: { userId },
            });

            if (!userCredits) {
                userCredits = await this.prisma.credits.create({
                    data: {
                        userId,
                        availableCredits: 0,
                        creditUsage: 0,
                        status: FreePlanStatus.ACTIVE,
                    },
                });
            }

            const result = await this.prisma.$transaction(async (tx) => {
                await tx.couponRedemption.create({
                    data: {
                        userId,
                        couponId: coupon.id,
                    },
                });

                const updatedCredits = await tx.credits.update({
                    where: { userId },
                    data: {
                        availableCredits: { increment: coupon.creditAmount },
                        status: FreePlanStatus.ACTIVE,
                    },
                });

                await tx.user.update({
                    where: { id: userId },
                    data: {
                        accessRequestStatus: AccessRequestStatus.APPROVED,
                    },
                });

                return updatedCredits;
            });

            this.logger.log(
                `User ${userId} redeemed coupon '${code}' for ${coupon.creditAmount} credits`,
            );

            return {
                success: true,
                message: `Successfully redeemed coupon! ${coupon.creditAmount} credits added to your account.`,
                creditsAdded: coupon.creditAmount,
                totalCredits: result.availableCredits,
                canAccessPayments: true,
            };
        } catch (error: any) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error('Error redeeming coupon:', error);
            throw new BadRequestException('Failed to redeem coupon');
        }
    }

    /**
     * User: Get redemption history
     */
    async getUserRedemptions(userId: string): Promise<CouponRedemptionDto[]> {
        const redemptions = await this.prisma.couponRedemption.findMany({
            where: { userId },
            include: {
                coupon: {
                    select: {
                        code: true,
                        creditAmount: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return redemptions.map((redemption) => ({
            id: redemption.id,
            userId: redemption.userId,
            couponId: redemption.couponId,
            couponCode: redemption.coupon.code,
            creditsAdded: redemption.coupon.creditAmount,
            createdAt: redemption.createdAt,
        }));
    }

    /**
     * User: Check if user can access payment plans
     * Derived from accessRequestStatus — APPROVED means access granted.
     */
    async canAccessPayments(
        userId: string,
    ): Promise<{ canAccessPayments: boolean }> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { accessRequestStatus: true },
        });

        return {
            canAccessPayments:
                user?.accessRequestStatus === AccessRequestStatus.APPROVED,
        };
    }
}
