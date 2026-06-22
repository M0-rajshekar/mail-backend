/**
 * Embedding Service - Generates vector embeddings using Cloudflare Workers AI
 * Free tier: 10,000 neurons/day
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class EmbeddingService {
    private readonly logger = new Logger(EmbeddingService.name);

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {}

    /**
     * Generate embedding vector from text using Cloudflare Workers AI
     * Model: @cf/baai/bge-base-en-v1.5 (768 dimensions) or @cf/baai/bge-small-en-v1.5 (384 dimensions)
     */
    async generateEmbedding(text: string): Promise<number[]> {
        // Embeddings need only the "Workers AI" permission. Use a dedicated,
        // least-privilege token (CLOUDFLARE_AI_TOKEN) so it does not have to
        // share the broad-scope CLOUDFLARE_API_TOKEN used for email
        // sending / zones / custom domains. Falls back to the shared token.
        const apiToken =
            this.configService.get<string>('CLOUDFLARE_AI_TOKEN') ||
            this.configService.get<string>('CLOUDFLARE_API_TOKEN');
        const accountId = this.configService.get<string>(
            'CLOUDFLARE_ACCOUNT_ID',
        );

        if (!apiToken || !accountId) {
            this.logger.warn(
                'Cloudflare credentials not configured for embeddings',
            );
            // Return zero vector as fallback
            return new Array(384).fill(0);
        }

        try {
            const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/baai/bge-small-en-v1.5`;

            const response = await firstValueFrom(
                this.httpService.post(
                    url,
                    {
                        text: text.substring(0, 512), // Model has max input length
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${apiToken}`,
                            'Content-Type': 'application/json',
                        },
                    },
                ),
            );

            const result = response.data?.result;
            if (result && result.data && Array.isArray(result.data)) {
                return result.data;
            }

            // Fallback: try alternative response format
            if (result && Array.isArray(result)) {
                return result;
            }

            this.logger.warn('Unexpected embedding response format');
            return new Array(384).fill(0);
        } catch (error: any) {
            this.logger.error(`Failed to generate embedding: ${error.message}`);
            return new Array(384).fill(0);
        }
    }

    /**
     * Generate embedding for email content
     */
    async generateEmailEmbedding(
        subject: string | null,
        body: string | null,
    ): Promise<number[]> {
        const text = `${subject || ''} ${body || ''}`.trim().substring(0, 512);
        return this.generateEmbedding(text);
    }

    /**
     * Calculate cosine similarity between two vectors
     */
    cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Vectors must have same dimensions');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
