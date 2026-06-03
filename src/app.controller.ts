import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { PaymentsService } from './services/payments.service';
import { ApiOperation } from '@nestjs/swagger';
import { TokensDto } from './dto/tokens.dto';

@Controller()
export class AppController {
    constructor(
        private readonly appService: AppService,
        private readonly paymentsService: PaymentsService,
    ) {}

    @Get()
    getHello(): any {
        return this.appService.getHello();
    }

    @Post('ingest-token')
    @ApiOperation({
        summary: 'Ingest tokens usage data from Frontend',
        description:
            'Ingest tokens usage data from Frontend for credit management',
    })
    async getIngestToken(
        @Body() body: TokensDto,
    ): Promise<{ status: string; jobId: string | null }> {
        return this.paymentsService.ingestToken(body);
    }
}
