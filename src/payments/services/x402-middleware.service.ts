import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getX402ExpressSupportedNetworks } from '../../shared/config/network.config';
import { SubscriptionTier, BillingPeriod } from 'generated/prisma';
import { SUBSCRIPTION_PLANS } from '../constants/subscription-plans';

export interface X402RouteConfig {
    price: string;
    network: string;
    description?: string;
    mimeType?: string;
    maxTimeoutSeconds?: number;
}

export interface X402MiddlewareOptions {
    url: string;
    apiKey?: string;
    timeout?: number;
}

@Injectable()
export class X402MiddlewareService {
    private readonly logger = new Logger(X402MiddlewareService.name);
    private middleware: any;

    constructor(private readonly configService: ConfigService) {
        this.logger.log('X402MiddlewareService constructor called');
        this.initializeMiddleware();
        this.logger.log(
            `X402MiddlewareService initialized - middleware available: ${this.isAvailable()}`,
        );
    }

    private initializeMiddleware(): void {
        const facilitatorUrl = this.getFacilitatorUrl();
        const pricing = this.getSubscriptionPricing();

        this.logger.log(
            `Initializing X402 middleware - Facilitator: ${facilitatorUrl}`,
        );

        if (!facilitatorUrl) {
            this.logger.error(
                'Missing X402 configuration - facilitator URL not set',
            );
            this.logger.error(`Facilitator URL: ${facilitatorUrl}`);
            return;
        }

        try {
            // Import x402-express middleware
            this.logger.log('Attempting to load x402-express package...');
            const x402Express = require('x402-express');
            this.logger.log('x402-express package loaded successfully');

            const { paymentMiddleware } = x402Express;

            if (!paymentMiddleware) {
                throw new Error(
                    'paymentMiddleware function not found in x402-express package',
                );
            }

            // Generate routes for all networks - PayAI facilitator handles network detection automatically
            const routes = this.generateAllNetworkRoutes(pricing);
            const options: X402MiddlewareOptions = {
                url: facilitatorUrl,
                timeout:
                    this.configService.get('X402_MAX_TIMEOUT_SECONDS', 300) *
                    1000,
            };

            this.logger.log(
                'Creating X402 middleware with routes:',
                Object.keys(routes),
            );
            this.logger.log('X402 middleware options:', options);

            // Use EVM payment address for x402-express middleware (it only supports EVM)
            // For Solana requests, we'll need to handle them separately
            const evmPaymentAddress = this.getEvmPaymentAddress();
            if (!evmPaymentAddress) {
                throw new Error('EVM payment address not configured');
            }

            this.middleware = paymentMiddleware(
                evmPaymentAddress as `0x${string}`,
                routes,
                options,
            );

            this.logger.log(
                '✅ X402 middleware initialized successfully with PayAI facilitator',
            );
            const supportedNetworks = getX402ExpressSupportedNetworks().map(
                (n) => n.name,
            );
            this.logger.log(
                `EVM networks supported by x402-express: ${supportedNetworks.join(', ')}`,
            );
            this.logger.log(
                'Solana networks will be handled with custom X402 implementation',
            );
        } catch (error) {
            this.logger.error(
                '❌ Failed to initialize X402 middleware:',
                error.message,
            );
            this.logger.error('Stack trace:', error.stack);
            this.logger.error('X402 payments will NOT be available');
            this.middleware = null;
        }
    }

    private generateAllNetworkRoutes(
        pricing: any,
    ): Record<string, X402RouteConfig> {
        const routes: Record<string, X402RouteConfig> = {};
        const maxTimeoutSeconds = this.configService.get(
            'X402_MAX_TIMEOUT_SECONDS',
            300,
        );

        // Get subscription plans and billing periods from Prisma enums
        const plans = Object.values(SubscriptionTier).filter(
            (tier) => tier !== SubscriptionTier.FREE,
        ); // Exclude FREE tier from X402 payments
        const periods = Object.values(BillingPeriod);
        const networks = getX402ExpressSupportedNetworks().map(
            (network) => network.name,
        ); // Dynamic EVM networks for x402-express

        for (const plan of plans) {
            for (const period of periods) {
                const price = pricing[plan]?.[period];

                if (!price) {
                    this.logger.error(
                        `Missing price configuration for ${plan} ${period}`,
                    );
                    continue;
                }

                for (const network of networks) {
                    const routeConfig: X402RouteConfig = {
                        price: `$${price}`, // PayAI expects price in dollar format (e.g., "$19" for $19)
                        network,
                        description: `${plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase()} ${period.toLowerCase()} subscription`,
                        mimeType: 'application/json',
                        maxTimeoutSeconds,
                    };

                    // Create network-specific paths: /x402/subscriptions/{network}/{plan}/{period}
                    const networkPath = `/x402/subscriptions/${network}/${plan.toLowerCase()}/${period.toLowerCase()}`;

                    routes[`GET ${networkPath}`] = routeConfig;
                    routes[`POST ${networkPath}`] = routeConfig;
                }
            }
        }

        this.logger.log(
            'Generated X402 routes for EVM networks only:',
            Object.keys(routes),
        );
        this.logger.log(
            'Solana networks will be handled with custom X402 implementation',
        );
        return routes;
    }

    private getFacilitatorUrl(): string {
        return (
            this.configService.get('X402_FACILITATOR_URL') ||
            this.configService.get('FACILITATOR_URL') ||
            'https://facilitator.payai.network'
        );
    }

    getSolanaPaymentAddress(): string {
        return this.configService.get('SOLANA_PAYMENT_ADDRESS') || '';
    }

    getEvmPaymentAddress(): string {
        return (
            this.configService.get('EVM_PAYMENT_ADDRESS') ||
            this.configService.get('X402_PAYMENT_ADDRESS') ||
            ''
        );
    }

    private getSubscriptionPricing(): any {
        // Use constants from subscription-plans.ts as fallback, but prioritize environment variables
        const pricing: Record<string, Record<string, number>> = {};

        // Build pricing object using Prisma enums and constants
        Object.values(SubscriptionTier).forEach((tier) => {
            if (tier === SubscriptionTier.FREE) return; // Skip FREE tier for X402 payments

            pricing[tier] = {};
            Object.values(BillingPeriod).forEach((period) => {
                // Try to get from environment variables first, then fall back to constants
                const envKey = `${tier}_${period}_PRICE`;
                const envPrice = this.configService.get(envKey);

                if (envPrice) {
                    pricing[tier][period] = envPrice;
                } else {
                    // Fallback to constants
                    const planConfig = SUBSCRIPTION_PLANS[tier];
                    if (planConfig) {
                        pricing[tier][period] =
                            period === BillingPeriod.YEARLY
                                ? planConfig.yearlyPrice
                                : planConfig.monthlyPrice;
                    }
                }
            });
        });

        // Log pricing configuration for debugging
        this.logger.log(
            'X402 Subscription Pricing Configuration:',
            JSON.stringify(pricing, null, 2),
        );

        return pricing;
    }

    getMiddleware(): any {
        return this.middleware;
    }

    isAvailable(): boolean {
        return !!this.middleware;
    }
}
