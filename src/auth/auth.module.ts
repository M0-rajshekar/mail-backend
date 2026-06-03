import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../services/prisma.service';
import { ApiKeyValidationService } from '../shared/service/ApiKeyValidationService';
import { ApiKeyGuard } from './api-key.guard';

@Module({
    imports: [ConfigModule.forRoot()],
    providers: [PrismaService, ApiKeyValidationService, ApiKeyGuard],
    exports: [ApiKeyValidationService, ApiKeyGuard],
})
export class AuthModule {}
