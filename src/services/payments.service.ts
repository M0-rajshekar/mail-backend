import { Injectable, Logger } from '@nestjs/common';
import { NIX_QUEUE } from 'src/constants/constants';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { TokensDto } from 'src/dto/tokens.dto';

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);
    constructor(@InjectQueue(NIX_QUEUE) private readonly SirenQueue: Queue) {}

    async ingestToken(
        body: TokensDto,
    ): Promise<{ status: string; jobId: string | null }> {
        const job = await this.SirenQueue.add({
            id: crypto.randomUUID(),
            userId: body.userId,
            tokens: body.tokens,
            model: body.model,
            type: body.type,
            ...(body.input_tokens && { input_tokens: body.input_tokens }),
            ...(body.output_tokens && { output_tokens: body.output_tokens }),
            created: new Date().toISOString(),
        });
        // Since the data is only put in the queue, you can return a simple acknowledgement or the job id
        return { status: 'queued', jobId: job?.id?.toString() ?? null };
    }
}
