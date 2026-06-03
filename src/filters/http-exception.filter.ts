import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        // Get status code and message
        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        // Don't expose internal server errors to clients
        let message = 'Internal server error';
        if (exception instanceof HttpException) {
            const exceptionResponse = exception.getResponse();
            message =
                typeof exceptionResponse === 'string'
                    ? exceptionResponse
                    : typeof exceptionResponse === 'object' &&
                        'message' in exceptionResponse
                      ? (exceptionResponse as any).message
                      : exception.message;
        }

        // Log the error with additional details for debugging
        this.logger.error(
            `[${request.method}] ${request.url} - Status: ${status} - ${
                exception instanceof Error ? exception.stack : 'Unknown error'
            }`,
        );

        // Return a standardized error response
        response.status(status).json({
            statusCode: status,
            timestamp: new Date().toISOString(),
            path: request.url,
            message:
                status === HttpStatus.INTERNAL_SERVER_ERROR
                    ? 'Internal server error'
                    : message,
        });
    }
}
