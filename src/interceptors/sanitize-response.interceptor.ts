import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class SanitizeResponseInterceptor implements NestInterceptor {
    // Add fields that should be redacted from responses
    private readonly sensitiveFields = [
        'password',
        'secret',
        'token',
        'apiKey',
        'privateKey',
        'credential',
        'api_key',
        'credit_card',
        'access_token',
        'refresh_token',
        'jwt',
    ];

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(
            map((data) => {
                if (data) {
                    return this.sanitizeData(data);
                }
                return data;
            }),
        );
    }

    private sanitizeData(data: any): any {
        if (Array.isArray(data)) {
            return data.map((item) => this.sanitizeData(item));
        } else if (typeof data === 'object' && data !== null) {
            const sanitized = { ...data };
            for (const key of Object.keys(sanitized)) {
                if (
                    this.sensitiveFields.some((field) =>
                        key.toLowerCase().includes(field.toLowerCase()),
                    )
                ) {
                    sanitized[key] = '[REDACTED]';
                } else if (
                    typeof sanitized[key] === 'object' &&
                    sanitized[key] !== null
                ) {
                    sanitized[key] = this.sanitizeData(sanitized[key]);
                }
            }
            return sanitized;
        }
        return data;
    }
}
