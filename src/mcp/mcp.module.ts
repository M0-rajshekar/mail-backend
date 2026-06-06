import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { McpController } from './mcp.controller';
import { EmailModule } from '../email/email.module';
import { CustomDomainService } from '../email/custom-domain.service';
import { CloudflareZonesService } from '../email/cloudflare-zones.service';
import { ApiKeyValidationService } from '../shared/service/ApiKeyValidationService';
import { PrismaService } from '../services/prisma.service';
import { ConfigService } from '@nestjs/config';

@Module({
    imports: [EmailModule, HttpModule],
    controllers: [McpController],
    providers: [
        ApiKeyValidationService,
        PrismaService,
        CustomDomainService,
        CloudflareZonesService,
        ConfigService,
    ],
})
export class McpModule {}
