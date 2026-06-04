import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyValidationService } from '../shared/service/ApiKeyValidationService';

@Injectable()
export class ApiKeyGuard implements CanActivate {
    constructor(private readonly apiKeyValidation: ApiKeyValidationService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();

        // Skip auth for inbound email webhook (called by Cloudflare, no auth header)
        if (request.path === '/email/webhook/inbound') {
            return true;
        }

        // If already authenticated via JWT, skip API key check
        if (request.user) {
            return true;
        }

        const authHeader = request.headers['authorization'];
        if (!authHeader) {
            throw new UnauthorizedException('Missing authorization header');
        }

        const [type, key] = authHeader.split(' ');
        if (type !== 'Bearer' || !key) {
            throw new UnauthorizedException(
                'Invalid authorization header format',
            );
        }

        try {
            // Validate API key (no credit deduction here, just validation)
            const validatedUser =
                await this.apiKeyValidation.validateApiKeyAndBalance(
                    key,
                    0, // No credits deducted for validation
                    'create_inbox', // Default tool name
                );

            // Attach user to request
            request.user = validatedUser.userId;

            // Store API key for potential credit deduction later
            request.apiKey = key;

            return true;
        } catch (error) {
            throw new UnauthorizedException('Invalid API key');
        }
    }
}
