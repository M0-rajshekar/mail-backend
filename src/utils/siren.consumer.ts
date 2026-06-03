import { Process, Processor } from '@nestjs/bull';
import { NIX_QUEUE } from '../constants/constants';
import { Job } from 'bull';
import { processUserCharge } from './siren.utils';
import { Logger } from '@nestjs/common';

export type sirenType = 'mcp-ai' | 'edgetrue-chat';

export type FlexPriceInput = {
    id: string;
    userId: string;
    tokens: number;
    model: string;
    type: sirenType;
    created: string;
    input_tokens?: number;
    output_tokens?: number;
};

@Processor(NIX_QUEUE)
export class SirenConsumer {
    private readonly logger = new Logger(SirenConsumer.name);

    @Process()
    async process(job: Job<FlexPriceInput>) {
        const { data } = job;
        this.logger.log(`[Queue Consumer] Processing job ${job.id}: type=${data.type}, model=${data.model}, tokens=${data.tokens}`);
        
        try {
            await Promise.all([
                processUserCharge({
                    id: data.id,
                    userId: data.userId,
                    tokens: data.tokens,
                    model: data.model,
                    type: data.type,
                    created: new Date().toISOString(),
                    ...(data.input_tokens && { input_tokens: data.input_tokens }),
                    ...(data.output_tokens && {
                        output_tokens: data.output_tokens,
                    }),
                }),
            ]);
            this.logger.log(`[Queue Consumer] Successfully processed job ${job.id}`);
        } catch (error) {
            this.logger.error(`[Queue Consumer] Error processing job ${job.id}: ${error.message}`);
            throw error;
        }
    }
}
