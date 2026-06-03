import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RedeemCouponDto {
  @ApiProperty({ description: 'Coupon code to redeem', example: 'PROMO2024' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
