import {
    IsString,
    IsOptional,
    IsNumber,
    IsPositive,
    IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCouponDto {
    @ApiPropertyOptional({
        description: 'Unique coupon code',
        example: 'PROMO2024',
    })
    @IsString()
    @IsOptional()
    code?: string;

    @ApiPropertyOptional({
        description: 'Number of credits to award on redemption',
        example: 100,
    })
    @IsNumber()
    @IsPositive()
    @IsOptional()
    creditAmount?: number;

    @ApiPropertyOptional({ description: 'Whether coupon is active' })
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}
