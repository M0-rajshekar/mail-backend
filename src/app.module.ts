import {
    MiddlewareConsumer,
    Module,
    NestModule,
    RequestMethod,
} from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggingInterceptor } from './filters/logging.interceptor';
import { SanitizeResponseInterceptor } from './interceptors/sanitize-response.interceptor';
import { AuthModule } from './auth/auth.module';
import { AuthMiddleware } from './auth/auth.middleware';
import { BullModule } from '@nestjs/bull';
import { PrismaService } from './services/prisma.service';
import { PaymentsService } from './services/payments.service';
import { NIX_QUEUE } from './constants/constants';
import { SirenConsumer } from './utils/siren.consumer';
import { HttpModule } from '@nestjs/axios';
import { PaymentsModule } from './payments/payments.module';
import { CouponsModule } from './coupons/coupons.module';
import { EmailModule } from './email/email.module';
import { McpModule } from './mcp/mcp.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            cache: true,
        }),
        AuthModule,
        PaymentsModule,
        CouponsModule,
        EmailModule,
        McpModule,
        ThrottlerModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => {
                const isProduction =
                    configService.get('NODE_ENV') === 'production';
                return [
                    {
                        ttl: 60000,
                        limit: isProduction ? 200 : 2000,
                    },
                ];
            },
        }),
        BullModule.forRootAsync({
            useFactory: (configService: ConfigService) => {
                const isProduction =
                    configService.get<string>('NODE_ENV') === 'production';
                const isMongoDirector = configService
                    .get<string>('REDIS_HOST_ADDRESS')
                    ?.includes('mongodirector.com');
                return {
                    redis: {
                        host: configService.getOrThrow<string>(
                            'REDIS_HOST_ADDRESS',
                        ),
                        port: configService.getOrThrow<number>('REDIS_PORT'),
                        password:
                            configService.getOrThrow<string>('REDIS_PASSWORD'),
                        tls:
                            isProduction || isMongoDirector
                                ? {
                                      rejectUnauthorized: false,
                                  }
                                : undefined,
                    },
                };
            },
            inject: [ConfigService],
        }),
        BullModule.registerQueue({
            name: NIX_QUEUE,
        }),
        HttpModule,
    ],
    controllers: [AppController],
    providers: [
        AppService,
        PrismaService,
        PaymentsService,
        SirenConsumer,
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        {
            provide: APP_INTERCEPTOR,
            useClass: LoggingInterceptor,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: SanitizeResponseInterceptor,
        },
    ],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer
            .apply(AuthMiddleware)
            .exclude(
                { path: '/', method: RequestMethod.GET },
                {
                    path: '/payments/webhook/edge-true/confirm-payin-created',
                    method: RequestMethod.POST,
                },
                {
                    path: '/payments/webhook/edge-true/confirm-payin-completed',
                    method: RequestMethod.POST,
                },
                {
                    path: '/payments/webhook/social/confirm-payin-completed',
                    method: RequestMethod.POST,
                },
                {
                    path: '/payments/webhook/social/test',
                    method: RequestMethod.GET,
                },
                {
                    path: '/payments/webhook/mcp/confirm-payin-completed',
                    method: RequestMethod.POST,
                },
                { path: '/x402/(.*)', method: RequestMethod.ALL },
                { path: '/email/webhook/(.*)', method: RequestMethod.ALL },
            )
            .forRoutes({ path: '*', method: RequestMethod.ALL });
    }
}
