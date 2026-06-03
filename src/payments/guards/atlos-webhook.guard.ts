import {
    CanActivate,
    ExecutionContext,
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

interface RequestWithRawBody extends Request {
    rawBody?: string;
}

@Injectable()
export class AtlosWebhookGuard implements CanActivate {
    private readonly logger = new Logger(AtlosWebhookGuard.name);

    constructor(private readonly configService: ConfigService) {}

    canActivate(context: ExecutionContext): boolean {
        this.logger.log('=== Atlos Webhook Guard: Starting verification ===');

        const request = context.switchToHttp().getRequest<RequestWithRawBody>();

        // Log request details
        this.logger.log('Request details:', {
            method: request.method,
            url: request.url,
            path: request.path,
            headers: {
                'content-type': request.headers['content-type'],
                'content-length': request.headers['content-length'],
                signature: request.headers['signature'] ? 'present' : 'missing',
                'user-agent': request.headers['user-agent'],
                host: request.headers['host'],
            },
        });

        // Check API secret configuration
        let atlosApiSecret: string;
        try {
            atlosApiSecret =
                this.configService.getOrThrow<string>('ATLOS_API_SECRET');
            this.logger.log('ATLOS_API_SECRET found in environment', {
                secretLength: atlosApiSecret.length,
                secretStartsWith: atlosApiSecret.substring(0, 4) + '...',
            });
        } catch (error) {
            this.logger.error('ATLOS_API_SECRET not configured in environment');
            throw new UnauthorizedException('ATLOS_API_SECRET not configured');
        }

        // Get the signature from headers (lowercase)
        const signature = request.headers['signature'] as string;
        const signatureHeader = request.headers['Signature'] as string; // Also check uppercase

        this.logger.log('Signature header check:', {
            signatureLowercase: signature
                ? `present (length: ${signature.length})`
                : 'missing',
            signatureUppercase: signatureHeader
                ? `present (length: ${signatureHeader.length})`
                : 'missing',
            allSignatureHeaders: Object.keys(request.headers).filter(
                (key) => key.toLowerCase() === 'signature',
            ),
        });

        const finalSignature = signature || signatureHeader;

        if (!finalSignature) {
            this.logger.error(
                'Missing signature header in Atlos webhook request',
                {
                    allHeaders: Object.keys(request.headers),
                    headerValues: Object.entries(request.headers)
                        .filter(([key]) => key.toLowerCase().includes('sign'))
                        .map(([key, value]) => ({
                            [key]:
                                typeof value === 'string'
                                    ? value.substring(0, 20) + '...'
                                    : value,
                        })),
                },
            );
            throw new UnauthorizedException('Missing signature header');
        }

        // Get raw body
        const rawBody = request.rawBody;
        const parsedBody = request.body;

        this.logger.log('Body check:', {
            rawBodyExists: !!rawBody,
            rawBodyType: typeof rawBody,
            rawBodyLength: rawBody ? rawBody.length : 0,
            rawBodyPreview: rawBody
                ? rawBody.substring(0, 200) +
                  (rawBody.length > 200 ? '...' : '')
                : 'N/A',
            parsedBodyExists: !!parsedBody,
            parsedBodyType: typeof parsedBody,
            parsedBodyKeys: parsedBody ? Object.keys(parsedBody) : [],
        });

        if (!rawBody) {
            this.logger.error('Missing raw body in Atlos webhook request', {
                hasParsedBody: !!parsedBody,
                parsedBodyContent: parsedBody,
                requestBodyType: typeof request.body,
                requestBodyKeys: request.body ? Object.keys(request.body) : [],
            });
            throw new UnauthorizedException('Missing request body');
        }

        // Log raw body details (for debugging, but truncate for security)
        this.logger.log('Raw body details:', {
            length: rawBody.length,
            firstChars: rawBody.substring(0, 50),
            lastChars: rawBody.substring(Math.max(0, rawBody.length - 50)),
            encoding: Buffer.isEncoding(rawBody) ? 'valid' : 'unknown',
            containsNewlines: rawBody.includes('\n'),
            containsCarriageReturn: rawBody.includes('\r'),
        });

        // Calculate expected signature
        this.logger.log('Calculating expected signature...');
        const hmac = crypto.createHmac('sha256', atlosApiSecret);
        const data = hmac.update(rawBody);
        const expectedSignature = data.digest('base64');

        this.logger.log('Signature comparison:', {
            receivedSignature: finalSignature,
            receivedSignatureLength: finalSignature.length,
            expectedSignature: expectedSignature,
            expectedSignatureLength: expectedSignature.length,
            signaturesMatch: finalSignature === expectedSignature,
            receivedFirstChars: finalSignature.substring(0, 20),
            expectedFirstChars: expectedSignature.substring(0, 20),
        });

        // Compare signatures
        if (finalSignature !== expectedSignature) {
            this.logger.error('Atlos webhook signature verification failed', {
                receivedSignature: finalSignature,
                expectedSignature: expectedSignature,
                receivedLength: finalSignature.length,
                expectedLength: expectedSignature.length,
                rawBodyLength: rawBody.length,
                rawBodyHash: crypto
                    .createHash('sha256')
                    .update(rawBody)
                    .digest('hex')
                    .substring(0, 16),
                apiSecretConfigured: !!atlosApiSecret,
                apiSecretLength: atlosApiSecret.length,
            });
            throw new UnauthorizedException(
                'Invalid signature - webhook data is not authentic',
            );
        }

        this.logger.log(
            '=== Atlos Webhook Guard: Signature verified successfully ===',
        );
        return true;
    }
}
