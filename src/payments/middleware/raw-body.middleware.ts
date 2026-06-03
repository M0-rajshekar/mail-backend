import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface RequestWithRawBody extends Request {
    rawBody?: string;
}

@Injectable()
export class RawBodyMiddleware implements NestMiddleware {
    private readonly logger = new Logger(RawBodyMiddleware.name);

    use(req: RequestWithRawBody, res: Response, next: NextFunction) {
        this.logger.log(
            '=== RawBodyMiddleware: Starting to capture raw body ===',
        );
        this.logger.log('Request details:', {
            method: req.method,
            url: req.url,
            path: req.path,
            contentType: req.headers['content-type'],
            contentLength: req.headers['content-length'],
        });

        req.rawBody = '';
        req.setEncoding('utf8');

        let chunkCount = 0;
        let totalBytesReceived = 0;

        req.on('data', (chunk: string) => {
            chunkCount++;
            const chunkSize = Buffer.byteLength(chunk, 'utf8');
            totalBytesReceived += chunkSize;
            req.rawBody = (req.rawBody || '') + chunk;

            this.logger.debug(`Received chunk ${chunkCount}:`, {
                chunkSize,
                totalBytesReceived,
                rawBodyLength: req.rawBody?.length || 0,
                chunkPreview: chunk.substring(0, 100),
            });
        });

        req.on('end', () => {
            const rawBody = req.rawBody || '';
            this.logger.log(
                '=== RawBodyMiddleware: Body capture complete ===',
                {
                    totalChunks: chunkCount,
                    totalBytesReceived,
                    rawBodyLength: rawBody.length,
                    rawBodyPreview:
                        rawBody.length > 0
                            ? rawBody.substring(0, 200) +
                              (rawBody.length > 200 ? '...' : '')
                            : 'EMPTY',
                    rawBodyEnd:
                        rawBody.length > 0
                            ? rawBody.substring(
                                  Math.max(0, rawBody.length - 100),
                              )
                            : 'EMPTY',
                },
            );

            if (!rawBody || rawBody.length === 0) {
                this.logger.warn('Raw body is empty after capture!', {
                    contentType: req.headers['content-type'],
                    contentLength: req.headers['content-length'],
                    hasBody: !!req.body,
                });
            }

            next();
        });

        req.on('error', (error) => {
            this.logger.error('Error capturing raw body:', {
                error: error.message,
                stack: error.stack,
                chunksReceived: chunkCount,
                bytesReceived: totalBytesReceived,
            });
        });
    }
}
