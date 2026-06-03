import { IsString, IsNotEmpty, IsNumber, IsPositive, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCouponDto {
  @ApiProperty({ description: 'Unique coupon code (will be uppercased)', example: 'PROMO2024' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: 'Number of credits to award on redemption', example: 100 })
  @IsNumber()
  @IsPositive()
  creditAmount: number;

  @ApiPropertyOptional({ description: 'Whether coupon is active', default: true })
  @IsOptional()
  isActive?: boolean;
}
