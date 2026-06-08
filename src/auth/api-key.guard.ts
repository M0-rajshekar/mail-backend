import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyValidationService } from '../shared/service/ApiKeyValidationService';
import { getToolCredits } from '../utils/tool-credits';

@Injectable()
export class ApiKeyGuard implements CanActivate {
    constructor(private readonly apiKeyValidation: ApiKeyValidationService) {}

    private getToolNameFromRequest(request: any): string {
        const method = request.method;
        const path = request.route?.path || request.path;
        const map: Record<string, string> = {
            'POST /email/inboxes': 'create_inbox',
            'DELETE /email/inboxes/:id': 'delete_inbox',
            'POST /email/inboxes/:id/messages': 'send_email',
            'GET /email/inboxes': 'list_inboxes',
            'GET /email/inboxes/:id': 'get_inbox',
            'GET /email/inboxes/:id/messages': 'list_messages',
            'GET /email/messages/:id': 'get_message',
            'GET /email/stats': 'get_analytics',
        };
        return map[`${method} ${path}`] || 'list_inboxes';
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();

        // Skip auth for inbound email webhook (called by Cloudflare, no auth header)
        if (
            request.path === '/email/webhook/inbound' ||
            request.path?.startsWith('/email/webhook/')
        ) {
            return true;
        }

        const toolName = this.getToolNameFromRequest(request);
        const requiredCredits = getToolCredits(toolName);

        // If already authenticated via JWT, still validate credits
        if (request.user) {
            const apiKey = request.apiKey || await this.apiKeyValidation.findApiKeyByUserId(request.user);
            if (apiKey) {
                await this.apiKeyValidation.validateApiKeyAndBalance(apiKey, requiredCredits, toolName as any);
                request.apiKey = apiKey;
            }
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
            const validatedUser =
                await this.apiKeyValidation.validateApiKeyAndBalance(
                    key,
                    requiredCredits,
                    toolName as any,
                );

            request.user = validatedUser.userId;
            request.apiKey = key;

            return true;
        } catch (error) {
            throw new UnauthorizedException('Invalid API key or insufficient credits');
        }
    }
}
