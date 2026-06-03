import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';
import { X402MiddlewareService } from './x402-middleware.service';
import { X402SubscriptionService } from './x402-subscription.service';
import { ConfigService } from '@nestjs/config';
import { validateAndNormalizeNetwork } from '../../shared/config/network.config';
import { SubscriptionTier } from 'generated/prisma';

export interface PaymentVerificationResult {
  success: boolean;
  message: string;
  plan: string;
  billing: string;
  subscriptionId?: string;
}

@Injectable()
export class SubscriptionPaymentService {
  private readonly logger = new Logger(SubscriptionPaymentService.name);

  constructor(
    private readonly x402Middleware: X402MiddlewareService,
    private readonly subscriptionService: X402SubscriptionService,
    private readonly configService: ConfigService,
  ) {
    // X402 v1 implementation uses facilitator endpoints directly
    // No need for PayAI X402PaymentHandler - we call facilitator REST APIs
    this.logger.log('✅ X402 v1 service initialized (using facilitator endpoints)');
  }

  async processPayment(
    req: Request,
    res: Response,
    plan: string,
    billingPeriod: string,
    amount: number,
    customHandler?: (walletAddress: string, network: string) => Promise<any>,
  ): Promise<void> {
    const requestedNetwork = this.extractNetworkInfo(req);
    const isSolanaRequest = requestedNetwork && requestedNetwork.toLowerCase().includes('solana');
    
    this.logger.log(`Processing payment request for ${plan} ${billingPeriod} - Network: ${requestedNetwork}, isSolana: ${isSolanaRequest}`);

    if (isSolanaRequest) {
      // Use ONLY official PayAI X402PaymentHandler v2 - NO MANUAL VERIFICATION
      await this.processOfficialSolanaX402V2(req, res, plan, billingPeriod, amount, customHandler);
      return;
    }

    // Handle EVM payments with x402-express middleware
    const middleware = this.x402Middleware.getMiddleware();

    if (!middleware) {
      this.logger.error('X402 middleware not initialized');
      res.status(500).json({ error: 'Payment middleware not initialized' });
      return;
    }

    this.logger.log(`Applying X402 middleware for ${plan} ${billingPeriod}`);

    // Apply X402 middleware - this will return 402 if payment headers are missing
    // The PayAI facilitator automatically handles EVM networks
    middleware(req, res, async () => {
      try {
        this.logger.log('X402 payment verified! Processing...');
        
        let result: PaymentVerificationResult;
        if (customHandler) {
          // Use custom handler (for top-ups)
          const walletAddress = this.extractWalletAddress(req);
          const network = this.extractNetworkInfo(req);
          result = await customHandler(walletAddress, network);
        } else {
          // Use default handler (for subscriptions)
          const subscriptionId = await this.handleVerifiedPayment(req, plan, billingPeriod, amount);
          result = {
            success: true,
            message: 'Payment verified and subscription created',
            plan,
            billing: billingPeriod,
            subscriptionId,
          };
        }

        this.logger.log('Payment processed successfully:', result);
        res.json(result);
      } catch (error) {
        this.logger.error('Error processing verified payment:', error);
        
        // Return error response
        res.status(500).json({
          success: false,
          error: 'Payment processing failed',
          message: error.message || 'An error occurred while processing payment',
        });
      }
    });
  }

  /**
   * X402 v1 implementation using facilitator endpoints ONLY
   */
  private async processOfficialSolanaX402V2(
    req: Request,
    res: Response,
    plan: string,
    billingPeriod: string,
    amount: number,
    customHandler?: (walletAddress: string, network: string) => Promise<any>,
  ): Promise<void> {
    try {
      this.logger.log(`🚀 X402 v1 processing for ${plan} ${billingPeriod}`);
      
      const resourceUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      
      // 1. Check for X-PAYMENT header (v1 format)
      this.logger.log('🔍 Checking for X-PAYMENT header (v1 format)...');
      const xPaymentHeader = req.headers['x-payment'] || req.headers['X-PAYMENT'];
      
      if (!xPaymentHeader) {
        // Return 402 with v1 format payment requirements
        this.logger.log('❌ No X-PAYMENT header found - returning 402 with v1 requirements');
        
        // Create v1 format payment requirements
        const paymentRequirements = {
          x402Version: 1, // v1 format
          error: "X-PAYMENT header is required",
          accepts: [
            {
              scheme: "exact",
              network: "solana", // Simple format for v1
              maxAmountRequired: (amount * 1000000).toString(), // Convert to micro USDC
              asset: this.configService.get('NEXT_PUBLIC_USDC_MINT_ADDRESS'),
              payTo: this.configService.get('SOLANA_PAYMENT_ADDRESS'),
              resource: resourceUrl,
              description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} ${billingPeriod} subscription`,
              mimeType: "application/json",
              maxTimeoutSeconds: 300,
              extra: {
                // PayAI facilitator's fee payer address for Solana mainnet
                feePayer: "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4"
              }
            }
          ]
        };

        // Validate required configuration
        if (!paymentRequirements.accepts[0].asset) {
          throw new Error('NEXT_PUBLIC_USDC_MINT_ADDRESS environment variable is required');
        }
        if (!paymentRequirements.accepts[0].payTo) {
          throw new Error('SOLANA_PAYMENT_ADDRESS environment variable is required');
        }

        res.status(402).json(paymentRequirements);
        return;
      }

      this.logger.log('📦 Found X-PAYMENT header (v1 format) - verifying with v1 facilitator...');

      // 2. Parse v1 X-PAYMENT header
      let paymentData: any;
      try {
        const paymentJson = Buffer.from(xPaymentHeader as string, 'base64').toString('utf-8');
        paymentData = JSON.parse(paymentJson);
        
        this.logger.log('📋 v1 Payment data:', {
          version: paymentData.x402Version,
          scheme: paymentData.scheme,
          network: paymentData.network,
          hasTransaction: !!paymentData.payload?.transaction
        });
      } catch (parseError) {
        this.logger.error('❌ Failed to parse X-PAYMENT header:', parseError);
        res.status(402).json({
          error: 'Invalid X-PAYMENT header format',
          reason: 'payment_parsing_failed'
        });
        return;
      }

      // 3. Verify payment using v1 facilitator endpoints ONLY
      let walletAddress: string;
      let transactionHash: string;
      try {
        // Create payment requirements for verification
        const paymentRequirements = {
          scheme: "exact",
          network: "solana", // Simple format for v1
          maxAmountRequired: (amount * 1000000).toString(),
          resource: resourceUrl,
          description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} ${billingPeriod} subscription`,
          mimeType: "application/json",
          payTo: this.configService.get('SOLANA_PAYMENT_ADDRESS'),
          maxTimeoutSeconds: 300,
          asset: this.configService.get('NEXT_PUBLIC_USDC_MINT_ADDRESS'),
          extra: {
            // PayAI facilitator's fee payer address for Solana mainnet
            feePayer: "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4"
          }
        };

        // Validate required configuration
        if (!paymentRequirements.asset) {
          throw new Error('NEXT_PUBLIC_USDC_MINT_ADDRESS environment variable is required');
        }
        if (!paymentRequirements.payTo) {
          throw new Error('SOLANA_PAYMENT_ADDRESS environment variable is required');
        }

        this.logger.log('🔐 Calling v1 facilitator for payment verification...');
        
        // Use PayAI v1 facilitator endpoints - no hardcoded URLs
        const facilitatorUrl = this.configService.get('X402_FACILITATOR_URL');
        if (!facilitatorUrl) {
          throw new Error('X402_FACILITATOR_URL environment variable is required');
        }
        
        // First, check what networks are supported
        try {
          const supportedResponse = await fetch(`${facilitatorUrl}/supported`);
          if (supportedResponse.ok) {
            const supportedData = await supportedResponse.json();
            this.logger.log('📋 Facilitator supported networks:', JSON.stringify(supportedData.kinds.filter((k: any) => k.network.includes('solana')), null, 2));
          } else {
            this.logger.warn('Could not fetch supported networks:', supportedResponse.status, supportedResponse.statusText);
          }
        } catch (supportError) {
          this.logger.warn('Could not fetch supported networks:', supportError.message);
        }
        
        // Call v1 verify endpoint
        this.logger.log('📤 Sending verify request to facilitator...');
        this.logger.log('📤 Request body:', JSON.stringify({
          paymentPayload: paymentData,
          paymentRequirements: paymentRequirements
        }, null, 2));
        
        const verifyResponse = await fetch(`${facilitatorUrl}/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            paymentPayload: paymentData,
            paymentRequirements: paymentRequirements
          })
        });

        if (!verifyResponse.ok) {
          const errorBody = await verifyResponse.text();
          this.logger.error('❌ Facilitator verify response:', {
            status: verifyResponse.status,
            statusText: verifyResponse.statusText,
            body: errorBody
          });
          throw new Error(`Facilitator verify failed: ${verifyResponse.status} - ${errorBody}`);
        }

        const verifyResult = await verifyResponse.json();
        
        if (!verifyResult.isValid) {
          this.logger.error('❌ Payment verification failed:', verifyResult.invalidReason);
          throw new Error(`Payment verification failed: ${verifyResult.invalidReason || 'Unknown error'}`);
        }
        
        this.logger.log('✅ v1 facilitator verified payment');

        // 4. Settle payment using v1 facilitator - REQUIRED before creating subscription
        this.logger.log('💰 Settling payment with v1 facilitator...');
        
        const settleResponse = await fetch(`${facilitatorUrl}/settle`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            paymentPayload: paymentData,
            paymentRequirements: paymentRequirements
          })
        });

        if (!settleResponse.ok) {
          const errorBody = await settleResponse.text();
          this.logger.error('❌ Payment settlement failed:', {
            status: settleResponse.status,
            statusText: settleResponse.statusText,
            body: errorBody
          });
          throw new Error(`Facilitator settle failed: ${settleResponse.status} - ${errorBody}`);
        }

        const settleResult = await settleResponse.json();
        
        if (!settleResult.success) {
          this.logger.error('❌ Payment settlement unsuccessful:', settleResult);
          throw new Error(`Payment settlement failed: ${settleResult.error || 'Unknown error'}`);
        }
        
        this.logger.log('✅ v1 facilitator settled payment (real USDC transfer)');
        this.logger.log('📄 Transaction hash:', settleResult.transaction);

        // Validate settlement result
        if (!settleResult.transaction) {
          throw new Error('Settlement completed but no transaction hash received');
        }

        // Store transaction hash for error handling
        transactionHash = settleResult.transaction;

        // Extract wallet address from payment data or settlement result
        walletAddress = settleResult.payer || verifyResult.payer;
        
        if (!walletAddress) {
          // Try to extract from transaction as last resort
          try {
            const { Transaction } = require('@solana/web3.js');
            const transaction = Transaction.from(Buffer.from(paymentData.payload.transaction, 'base64'));
            
            // Get the first signer (should be the user who authorized the transfer)
            const signers = transaction.signatures.filter(sig => sig.signature !== null);
            if (signers.length > 0) {
              walletAddress = signers[0].publicKey.toString();
              this.logger.log(`✅ Extracted wallet address from transaction signers: ${walletAddress}`);
            } else {
              throw new Error('No valid signers found in transaction');
            }
          } catch (extractError) {
            this.logger.error('❌ Could not extract wallet address from payment:', extractError);
            throw new Error('Payment processed but could not identify payer wallet address');
          }
        }

        // Validate wallet address before proceeding
        if (!this.validateWalletAddress(walletAddress)) {
          throw new Error(`Invalid wallet address extracted from payment: ${walletAddress}`);
        }

        this.logger.log(`✅ X402 v1 payment verified and settled for wallet: ${walletAddress}`);

      } catch (facilitatorError) {
        this.logger.error('❌ v1 facilitator error:', facilitatorError.message);
        
        // Check for specific error types
        let errorReason = 'payment_verification_failed';
        let errorMessage = 'Payment verification failed. Please ensure you have sufficient USDC and try again.';
        
        if (facilitatorError.message.includes('500') || facilitatorError.message.includes('Internal server error')) {
          errorReason = 'facilitator_error';
          errorMessage = 'Payment facilitator is temporarily unavailable. Please try again in a moment.';
        } else if (facilitatorError.message.includes('insufficient') || facilitatorError.message.includes('balance')) {
          errorReason = 'insufficient_funds';
          errorMessage = 'Insufficient USDC balance. Please add USDC to your wallet and try again.';
        } else if (facilitatorError.message.includes('timeout')) {
          errorReason = 'timeout';
          errorMessage = 'Payment verification timed out. Please try again.';
        } else if (facilitatorError.message.includes('environment variable is required')) {
          errorReason = 'configuration_error';
          errorMessage = 'Server configuration error. Please contact support.';
        }
        
        // NO MANUAL FALLBACK - If facilitator fails, payment fails
        // This ensures only real USDC payments create subscriptions
        res.status(402).json({
          error: 'Payment verification failed',
          reason: errorReason,
          message: errorMessage,
          details: facilitatorError.message
        });
        return;
      }

      // Process business logic ONLY after successful payment verification and settlement
      let result: PaymentVerificationResult;
      try {
        if (customHandler) {
          result = await customHandler(walletAddress, 'solana');
        } else {
          // Create subscription ONLY after payment is verified and settled
          const subscriptionResult = await this.subscriptionService.createSubscription({
            walletAddress: walletAddress, // Keep Solana addresses as-is (case-sensitive base58)
            network: 'solana',
            plan,
            billingPeriod,
            amount,
          });

          result = {
            success: true,
            message: `X402 v1 payment verified and subscription created`,
            plan,
            billing: billingPeriod,
            subscriptionId: subscriptionResult.subscriptionId,
          };
        }

        this.logger.log(`🎉 X402 v1 payment processed successfully:`, result);
        res.json(result);
      } catch (subscriptionError) {
        this.logger.error('❌ Error creating subscription after successful payment:', subscriptionError);
        
        // Payment was successful but subscription creation failed
        // This is a critical error that needs manual intervention
        res.status(500).json({
          success: false,
          error: 'Subscription creation failed',
          message: 'Payment was processed successfully but subscription creation failed. Please contact support.',
          transactionHash: transactionHash,
          walletAddress: walletAddress
        });
        return;
      }

    } catch (error) {
      this.logger.error('💥 Error processing X402 v1 request:', error);
      res.status(500).json({
        success: false,
        error: 'X402 v1 payment processing failed',
        message: error.message || 'An error occurred while processing X402 v1 payment',
      });
    }
  }

  private async handleVerifiedPayment(
    req: Request,
    plan: string,
    billingPeriod: string,
    amount: number,
  ): Promise<string> {
    const walletAddress = this.extractWalletAddress(req);
    
    // Validate wallet address (supports both EVM and Solana formats)
    if (!this.validateWalletAddress(walletAddress)) {
      throw new BadRequestException(`Invalid wallet address: ${walletAddress}`);
    }

    // Validate amount is positive
    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }

    const network = this.extractNetworkInfo(req);

    this.logger.log(
      `Processing ${plan} ${billingPeriod} subscription for wallet: ${walletAddress}`,
    );

    // Only lowercase EVM addresses, keep Solana addresses as-is (case-sensitive base58)
    const normalizedWalletAddress = walletAddress.startsWith('0x') 
      ? walletAddress.toLowerCase() 
      : walletAddress;

    const result = await this.subscriptionService.createSubscription({
      walletAddress: normalizedWalletAddress,
      network,
      plan,
      billingPeriod,
      amount,
    });

    return result.subscriptionId;
  }

  private extractWalletAddress(req: Request): string {
    this.logger.log('=== WALLET ADDRESS EXTRACTION ===');
    
    // For EVM requests, use the existing x402-express approach
    const requestedNetwork = this.extractNetworkInfo(req);
    const isSolanaRequest = requestedNetwork && requestedNetwork.toLowerCase().includes('solana');
    
    if (isSolanaRequest) {
      // For Solana, wallet address should be extracted from payment header in processSolanaX402Simple
      // This method shouldn't be called for Solana requests
      this.logger.warn('extractWalletAddress called for Solana request - this should not happen');
    }
    
    // EVM wallet address extraction (from x402-express middleware)
    const xPaymentHeader = req.headers['x-payment'] || req.headers['X-Payment'];
    
    let walletAddress = 
      (req as any).payment?.from ||
      (req as any).payment?.wallet ||
      (req as any).payment?.address;

    if (!walletAddress && xPaymentHeader) {
      try {
        const paymentJson = Buffer.from(xPaymentHeader as string, 'base64').toString('utf-8');
        const paymentData = JSON.parse(paymentJson);
        
        walletAddress = 
          paymentData.payload?.authorization?.from ||
          paymentData.payload?.from ||
          paymentData.from;
        
        this.logger.log(`Extracted wallet from X-PAYMENT: ${walletAddress}`);
      } catch (error) {
        this.logger.error(`Error parsing X-PAYMENT: ${error.message}`);
      }
    }

    if (!walletAddress) {
      throw new BadRequestException('Wallet address not found in X402 payment request');
    }

    return walletAddress as string;
  }

  private validateWalletAddress(address: string): boolean {
    if (!address) {
      return false;
    }

    // Validate Ethereum-style addresses (0x followed by 40 hex characters)
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (ethAddressRegex.test(address)) {
      return true;
    }

    // Validate Solana addresses (base58 encoded, typically 32-44 characters)
    const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (solanaAddressRegex.test(address)) {
      return true;
    }

    return false;
  }

  private extractNetworkInfo(req: Request): string {
    // First try to extract network from URL path: /x402/subscriptions/{network}/{plan}/{period}
    const pathParts = req.path.split('/');
    if (pathParts.length >= 4 && pathParts[1] === 'x402' && pathParts[2] === 'subscriptions') {
      const networkFromPath = pathParts[3];
      // Check if it's not a subscription plan (use Prisma enums)
      const subscriptionPlans = Object.values(SubscriptionTier).map(tier => tier.toLowerCase());
      if (networkFromPath && !subscriptionPlans.includes(networkFromPath)) {
        return networkFromPath;
      }
    }

    // Fallback to headers and query parameters
    const network = 
      (req as any).paymentNetwork ||
      req.headers['x-network'] ||
      req.headers['network'] ||
      req.headers['x402-network'] ||
      req.headers['x-402-network'] ||
      req.query?.network;

    return network as string || validateAndNormalizeNetwork();
  }
}
