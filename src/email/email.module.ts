import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { CloudflareEmailService } from './cloudflare-email.service';
import { AttachmentStorageService } from './attachment-storage.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { EmailParserService } from './email-parser.service';
import { PrismaService } from '../services/prisma.service';
import { ApiKeyValidationService } from '../shared/service/ApiKeyValidationService';

@Module({
  imports: [HttpModule],
  providers: [
    EmailService,
    CloudflareEmailService,
    AttachmentStorageService,
    WebhookDeliveryService,
    EmailParserService,
    PrismaService,
    ApiKeyValidationService,
  ],
  controllers: [EmailController],
  exports: [
    EmailService,
    CloudflareEmailService,
    AttachmentStorageService,
    WebhookDeliveryService,
    EmailParserService,
  ],
})
export class EmailModule {}
