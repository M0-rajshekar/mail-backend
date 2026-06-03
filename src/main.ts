import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './filters/http-exception.filter';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    const configService = app.get(ConfigService);

    // Trust reverse proxy — ensures req.protocol is 'https' behind load balancers/nginx
    // This fixes x402 resource URLs showing http:// instead of https://
    app.getHttpAdapter().getInstance().set('trust proxy', 1);

    app.use(cookieParser());

    app.enableCors({
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'x-api-key',
            'x-request-id',
            'x-wallet-address',
            'wallet-address',
            'ngrok-skip-browser-warning',
            'x-payment',
            'x-payment-response',
        ],
        credentials: true,
        exposedHeaders: ['Content-Type', 'Access-Control-Allow-Origin', 'x-payment-response'],
        maxAge: 86400,
        preflightContinue: false,
        optionsSuccessStatus: 204,
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
    });

    // Swagger setup
    const config = new DocumentBuilder()
        .setTitle('AgentMail API')
        .setDescription(
            'API for AgentMail - Email infrastructure for AI agents.',
        )
        .setVersion('1.0')
        .addBearerAuth()
        .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    app.useGlobalFilters(new GlobalExceptionFilter());

    const port = configService.get('PORT') || 4000;
    await app.listen(port);

    // Graceful shutdown handling
    process.on('SIGTERM', async () => {
        await app.close();
    });

    process.on('SIGINT', async () => {
        await app.close();
    });
}

bootstrap().catch((error) => {
    console.error('Failed to start application:', error);
    process.exit(1);
});

