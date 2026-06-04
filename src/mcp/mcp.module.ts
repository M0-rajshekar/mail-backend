import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { EmailModule } from '../email/email.module';
import { ApiKeyValidationService } from '../shared/service/ApiKeyValidationService';
import { PrismaService } from '../services/prisma.service';

@Module({
    imports: [EmailModule],
    controllers: [McpController],
    providers: [ApiKeyValidationService, PrismaService],
})
export class McpModule {}
