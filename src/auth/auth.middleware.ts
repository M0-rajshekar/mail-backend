import {
    Injectable,
    Logger,
    NestMiddleware,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, JWTVerifyResult } from 'jose';
import { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../services/prisma.service';
import { ApiKeyValidationService } from '../shared/service/ApiKeyValidationService';
import { v4 as uuid } from 'uuid';

// Extend Express Request type to include user and apiKey
declare global {
    namespace Express {
        interface Request {
            user?: string;
            apiKey?: string;
        }
    }
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
    private readonly logger = new Logger(AuthMiddleware.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly apiKeyValidation: ApiKeyValidationService,
    ) {}

    async use(req: Request, res: Response, next: NextFunction) {
        // Skip auth for excluded paths (belt-and-suspenders with module exclude)
        const skipPaths = [
            '/',
            '/health',
            '/payments/webhook/edge-true/confirm-payin-created',
            '/payments/webhook/edge-true/confirm-payin-completed',
            '/payments/webhook/social/confirm-payin-completed',
            '/payments/webhook/social/test',
            '/payments/webhook/mcp/confirm-payin-completed',
            '/email/webhook/inbound',
        ];
        if (
            skipPaths.includes(req.path) ||
            req.path.startsWith('/x402/') ||
            req.path === '/x402' ||
            req.path.startsWith('/mcp/') || // MCP endpoints use x-api-key auth internally
            req.path.startsWith('/connect/') || // OAuth callback — no JWT, public endpoint
            req.path.startsWith('/email/webhook/') // Email inbound webhook — called by Cloudflare, no auth
        ) {
            return next();
        }

        try {
            const authHeader = req.headers['authorization'];
            let token: string | undefined;

            // Try to get token from Authorization header first
            if (authHeader) {
                const tokenParts = authHeader.trim().split(' ');
                if (tokenParts.length === 2 && tokenParts[0] === 'Bearer') {
                    token = tokenParts[1];
                }
            }

            // If no token from header, try cookies
            if (!token && req.cookies && req.cookies.user_token) {
                token = req.cookies.user_token;
            }

            if (!token) {
                this.logger.warn(
                    'Missing authorization header and no valid cookie token',
                );
                throw new UnauthorizedException('Missing authorization header');
            }

            // If token looks like an API key (sk_ prefix), validate via ApiKeyValidationService
            if (token.startsWith('sk_')) {
                try {
                    const validated = await this.apiKeyValidation.validateApiKeyAndBalance(
                        token,
                        0,
                        'list_inboxes',
                    );
                    req.user = validated.userId;
                    req.apiKey = token;
                    this.logger.debug(`API key auth success for user ${validated.userId}`);
                    res.setHeader('X-Content-Type-Options', 'nosniff');
                    return next();
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    this.logger.warn(`API key validation failed: ${msg}`);
                    throw err instanceof UnauthorizedException
                        ? err
                        : new UnauthorizedException('Invalid or expired API key');
                }
            }

            // Get secret
            const secret = this.configService.get<string>('JWT_SECRET');
            if (!secret) {
                this.logger.error('JWT_SECRET not set in environment');
                throw new UnauthorizedException('Server configuration error');
            }

            let verified: JWTVerifyResult;
            try {
                verified = await jwtVerify(
                    token,
                    new TextEncoder().encode(secret),
                    {
                        maxTokenAge: '7d',
                        algorithms: ['HS256'],
                    },
                );
                this.logger.debug('JWT successfully verified');
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                this.logger.warn(`JWT verification failed: ${msg}`);
                throw new UnauthorizedException('Invalid or expired token');
            }

            // Check for 'userId' field in JWT payload (our token uses userId, not id)
            const userId = verified.payload?.userId;
            if (!userId) {
                this.logger.warn('Missing "userId" field in JWT payload');
                throw new UnauthorizedException('Invalid token payload');
            }

            // Lookup user
            const user = await this.prisma.user.findUnique({
                where: { id: userId as string },
                select: { id: true, status: true },
            });

            if (!user) {
                this.logger.warn(`User not found in DB: ${userId}`);
                throw new UnauthorizedException('User not found');
            }

            // Status check
            if (user.status !== 'ACTIVE') {
                this.logger.warn(`User inactive: ${user.id}`);
                throw new UnauthorizedException('User account is inactive');
            }

            // Attach to request
            req.user = user.id;

            // Attach API key so controllers can deduct credits for JWT users too
            const apiKey = await this.apiKeyValidation.findApiKeyByUserId(user.id);
            if (apiKey) {
                req.apiKey = apiKey;
            }

            // Secure headers
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader(
                'Cache-Control',
                'no-store, no-cache, must-revalidate, proxy-revalidate',
            );

            next();
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            const msg = error instanceof Error ? error.message : String(error);
            const stack = error instanceof Error ? error.stack : undefined;
            this.logger.error(`Unexpected error: ${msg}`, stack);
            throw new UnauthorizedException('Authentication failed');
        }
    }
}
