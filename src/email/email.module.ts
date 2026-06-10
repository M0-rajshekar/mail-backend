import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { EmailGateway } from './email.gateway';
import { ImapSmtpController } from './imap-smtp.controller';
import { CustomDomainController } from './custom-domain.controller';
import { CustomDomainService } from './custom-domain.service';
import { CloudflareEmailService } from './cloudflare-email.service';
import { CloudflareZonesService } from './cloudflare-zones.service';
import { AttachmentStorageService } from './attachment-storage.service';
import { AttachmentExtractionService } from './attachment-extraction.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { EmailParserService } from './email-parser.service';
import { EmbeddingService } from './embedding.service';
import { PrismaService } from '../services/prisma.service';
import { ApiKeyValidationService } from '../shared/service/ApiKeyValidationService';

@Module({
    imports: [HttpModule],
    providers: [
        EmailService,
        EmailGateway,
        CloudflareEmailService,
        CloudflareZonesService,
        AttachmentStorageService,
        AttachmentExtractionService,
        WebhookDeliveryService,
        EmailParserService,
        EmbeddingService,
        PrismaService,
        ApiKeyValidationService,
        CustomDomainService,
    ],
    controllers: [EmailController, ImapSmtpController, CustomDomainController],
    exports: [
        EmailService,
        EmailGateway,
        CloudflareEmailService,
        AttachmentStorageService,
        AttachmentExtractionService,
        WebhookDeliveryService,
        EmailParserService,
        EmbeddingService,
    ],
})
export class EmailModule {}
