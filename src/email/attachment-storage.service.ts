/**
 * Attachment storage service
 * Stores email attachments in S3/R2-compatible storage
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface AttachmentUpload {
    filename: string;
    contentType: string;
    content: Buffer | string;
    size: number;
}

export interface StoredAttachment {
    id: string;
    email_id: string;
    filename: string;
    mimetype: string;
    size: number;
    s3Key: string;
    content_id?: string | null;
    disposition?: string | null;
}

@Injectable()
export class AttachmentStorageService {
    private readonly logger = new Logger(AttachmentStorageService.name);
    private readonly s3Client: S3Client;
    private readonly bucket: string;

    constructor(private readonly configService: ConfigService) {
        this.bucket =
            this.configService.get<string>('S3_BUCKET') ||
            'agentmail-attachments';

        // Support AWS S3, Cloudflare R2, and DigitalOcean Spaces.
        // Env vars use the S3_* convention in this project; fall back to AWS_*.
        const endpoint = this.configService.get<string>('S3_ENDPOINT');
        const region =
            this.configService.get<string>('S3_REGION') ||
            this.configService.get<string>('AWS_REGION') ||
            'auto';
        const accessKeyId =
            this.configService.get<string>('S3_ACCESS_KEY_ID') ||
            this.configService.get<string>('AWS_ACCESS_KEY_ID');
        const secretAccessKey =
            this.configService.get<string>('S3_SECRET_ACCESS_KEY') ||
            this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

        if (!accessKeyId || !secretAccessKey) {
            this.logger.warn(
                'S3 credentials not found (S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY). Attachment uploads will fail.',
            );
        }

        this.s3Client = new S3Client({
            region,
            endpoint: endpoint || undefined,
            credentials:
                accessKeyId && secretAccessKey
                    ? {
                          accessKeyId,
                          secretAccessKey,
                      }
                    : undefined,
        });
    }

    /**
     * Store attachment in S3/R2
     */
    async storeAttachment(
        emailId: string,
        attachmentId: string,
        attachment: AttachmentUpload,
    ): Promise<StoredAttachment> {
        const sanitizedFilename = attachment.filename.replace(
            /[/\\:*?"<>|\x00-\x1f]/g,
            '_',
        );
        const key = `attachments/${emailId}/${attachmentId}/${sanitizedFilename}`;

        try {
            await this.s3Client.send(
                new PutObjectCommand({
                    Bucket: this.bucket,
                    Key: key,
                    Body: attachment.content,
                    ContentType: attachment.contentType,
                    ContentLength: attachment.size,
                }),
            );

            this.logger.log(
                `Stored attachment: ${key} (${attachment.size} bytes)`,
            );

            return {
                id: attachmentId,
                email_id: emailId,
                filename: attachment.filename,
                mimetype: attachment.contentType,
                size: attachment.size,
                s3Key: key,
            };
        } catch (error: any) {
            this.logger.error(`Failed to store attachment: ${error.message}`);
            throw new Error(`Attachment storage failed: ${error.message}`);
        }
    }

    /**
     * Get attachment from S3/R2
     */
    async getAttachment(key: string): Promise<Buffer> {
        try {
            const response = await this.s3Client.send(
                new GetObjectCommand({
                    Bucket: this.bucket,
                    Key: key,
                }),
            );

            const stream = response.Body as any;
            const chunks: Buffer[] = [];

            for await (const chunk of stream) {
                chunks.push(chunk);
            }

            return Buffer.concat(chunks);
        } catch (error: any) {
            this.logger.error(`Failed to get attachment: ${error.message}`);
            throw new Error(`Attachment retrieval failed: ${error.message}`);
        }
    }

    /**
     * Delete attachment from S3/R2
     */
    async deleteAttachment(key: string): Promise<void> {
        try {
            await this.s3Client.send(
                new DeleteObjectCommand({
                    Bucket: this.bucket,
                    Key: key,
                }),
            );

            this.logger.log(`Deleted attachment: ${key}`);
        } catch (error: any) {
            this.logger.error(`Failed to delete attachment: ${error.message}`);
        }
    }

    /**
     * Generate presigned URL for attachment download
     */
    async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });

            return await getSignedUrl(this.s3Client, command, { expiresIn });
        } catch (error: any) {
            this.logger.error(
                `Failed to generate presigned URL: ${error.message}`,
            );
            throw new Error(`URL generation failed: ${error.message}`);
        }
    }

    /**
     * Store multiple attachments
     */
    async storeAttachments(
        emailId: string,
        attachments: AttachmentUpload[],
    ): Promise<StoredAttachment[]> {
        const stored: StoredAttachment[] = [];

        for (const attachment of attachments) {
            const id = crypto.randomUUID();
            const storedAttachment = await this.storeAttachment(
                emailId,
                id,
                attachment,
            );
            stored.push(storedAttachment);
        }

        return stored;
    }
}
