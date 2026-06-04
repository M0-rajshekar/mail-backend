import { Module } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CouponsController } from './coupons.controller';
import { PrismaService } from 'src/services/prisma.service';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [ConfigModule],
    controllers: [CouponsController],
    providers: [CouponsService, PrismaService],
    exports: [CouponsService],
})
export class CouponsModule {}
