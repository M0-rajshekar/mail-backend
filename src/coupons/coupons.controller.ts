import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CouponsService } from './coupons.service';
import {
  CreateCouponDto,
  UpdateCouponDto,
  RedeemCouponDto,
  CouponRedemptionDto,
  CouponDto,
  RedeemCouponResponseDto,
} from './dto';

@ApiTags('coupons')
@ApiBearerAuth()
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post('create')
  @ApiOperation({ summary: 'Create a new coupon code (Admin only)' })
  @ApiResponse({ status: 201, description: 'Coupon created successfully' })
  @ApiResponse({ status: 400, description: 'Coupon code already exists' })
  async createCoupon(
    @Body() createCouponDto: CreateCouponDto,
    @Req() req: Request,
  ): Promise<CouponDto> {
    const userId = req.user;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    return await this.couponsService.createCoupon(createCouponDto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List all coupons (Admin only)' })
  @ApiResponse({ status: 200, description: 'List of all coupons' })
  async listCoupons(@Req() req: Request): Promise<CouponDto[]> {
    const userId = req.user;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    return await this.couponsService.listCoupons(userId);
  }

  @Get('can-access-payments')
  @ApiOperation({ summary: 'Check if user can access payment plans' })
  @ApiResponse({
    status: 200,
    description: 'Payment access status',
    schema: {
      type: 'object',
      properties: {
        canAccessPayments: { type: 'boolean' },
      },
    },
  })
  async canAccessPayments(
    @Req() req: Request,
  ): Promise<{ canAccessPayments: boolean }> {
    const userId = req.user;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    return await this.couponsService.canAccessPayments(userId);
  }

  @Get('my-coupon-redemptions')
  @ApiOperation({ summary: 'Get my coupon redemption history' })
  @ApiResponse({ status: 200, description: 'List of coupon redemptions' })
  async getMyRedemptions(
    @Req() req: Request,
  ): Promise<CouponRedemptionDto[]> {
    const userId = req.user;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    return await this.couponsService.getUserRedemptions(userId);
  }

  @Post('redeem-coupon')
  @ApiOperation({ summary: 'Redeem a coupon code for free credits' })
  @ApiResponse({
    status: 200,
    description: 'Coupon redeemed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        creditsAdded: { type: 'number' },
        totalCredits: { type: 'number' },
        canAccessPayments: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid coupon or already redeemed' })
  async redeemCoupon(
    @Body() dto: RedeemCouponDto,
    @Req() req: Request,
  ): Promise<RedeemCouponResponseDto> {
    const userId = req.user;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    return await this.couponsService.redeemCoupon(userId, dto.code);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific coupon by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'Coupon details' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async getCoupon(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<CouponDto> {
    const userId = req.user;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    return await this.couponsService.getCoupon(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a coupon (Admin only)' })
  @ApiResponse({ status: 200, description: 'Coupon updated successfully' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async updateCoupon(
    @Param('id') id: string,
    @Body() updateCouponDto: UpdateCouponDto,
    @Req() req: Request,
  ): Promise<CouponDto> {
    const userId = req.user;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    return await this.couponsService.updateCoupon(id, updateCouponDto, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a coupon (Admin only)' })
  @ApiResponse({ status: 200, description: 'Coupon deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete coupon with redemptions' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async deleteCoupon(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    const userId = req.user;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    return await this.couponsService.deleteCoupon(id, userId);
  }

  @Get(':id/redemptions')
  @ApiOperation({ summary: 'Get all redemptions for a coupon (Admin only)' })
  @ApiResponse({ status: 200, description: 'List of redemptions for the coupon' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async getCouponRedemptions(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<CouponRedemptionDto[]> {
    const userId = req.user;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    return await this.couponsService.getCouponRedemptions(id, userId);
  }
}
