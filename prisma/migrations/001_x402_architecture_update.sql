-- Migration: X402 Architecture Update
-- This migration updates the database schema to support the new X402 payment architecture

-- Update User table for X402
ALTER TABLE "users" 
ADD COLUMN "email" TEXT,
ADD COLUMN "preferredNetwork" TEXT,
ADD COLUMN "lastPaymentNetwork" TEXT,
ALTER COLUMN "signedMessage" DROP NOT NULL,
DROP COLUMN IF EXISTS "currentPaymentMethodId",
DROP COLUMN IF EXISTS "customerId";

-- Update Transaction table for X402
ALTER TABLE "Transaction" 
ADD COLUMN "network" TEXT,
ADD COLUMN "facilitatorUrl" TEXT,
ADD COLUMN "paymentMethod" TEXT,
ADD COLUMN "isTestnet" BOOLEAN DEFAULT false;

-- Create indexes for Transaction table
CREATE INDEX IF NOT EXISTS "Transaction_payinId_idx" ON "Transaction"("payinId");
CREATE INDEX IF NOT EXISTS "Transaction_network_idx" ON "Transaction"("network");
CREATE INDEX IF NOT EXISTS "Transaction_isTestnet_idx" ON "Transaction"("isTestnet");

-- Update Subscription table for X402
ALTER TABLE "Subscription" 
ADD COLUMN "paymentNetwork" TEXT,
ADD COLUMN "paymentHash" TEXT,
ADD COLUMN "isTestnetSubscription" BOOLEAN DEFAULT false,
ADD COLUMN "autoRenew" BOOLEAN DEFAULT true,
ALTER COLUMN "creditUsage" SET DEFAULT 0;

-- Create indexes for Subscription table
CREATE INDEX IF NOT EXISTS "Subscription_paymentHash_idx" ON "Subscription"("paymentHash");
CREATE INDEX IF NOT EXISTS "Subscription_paymentNetwork_idx" ON "Subscription"("paymentNetwork");
CREATE INDEX IF NOT EXISTS "Subscription_subscriptionStatus_idx" ON "Subscription"("subscriptionStatus");
CREATE INDEX IF NOT EXISTS "Subscription_nextBillingDate_idx" ON "Subscription"("nextBillingDate");

-- Create X402PaymentStatus enum
CREATE TYPE "X402PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'EXPIRED');

-- Create X402PaymentLog table
CREATE TABLE "x402_payment_logs" (
    "id" TEXT NOT NULL,
    "paymentHash" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "facilitatorUrl" TEXT NOT NULL,
    "status" "X402PaymentStatus" NOT NULL,
    "errorMessage" TEXT,
    "userId" TEXT,
    "subscriptionId" TEXT,
    "transactionId" TEXT,
    "isTestnet" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "x402_payment_logs_pkey" PRIMARY KEY ("id")
);

-- Create indexes for X402PaymentLog table
CREATE UNIQUE INDEX "x402_payment_logs_paymentHash_key" ON "x402_payment_logs"("paymentHash");
CREATE INDEX "x402_payment_logs_paymentHash_idx" ON "x402_payment_logs"("paymentHash");
CREATE INDEX "x402_payment_logs_walletAddress_idx" ON "x402_payment_logs"("walletAddress");
CREATE INDEX "x402_payment_logs_network_idx" ON "x402_payment_logs"("network");
CREATE INDEX "x402_payment_logs_status_idx" ON "x402_payment_logs"("status");
CREATE INDEX "x402_payment_logs_isTestnet_idx" ON "x402_payment_logs"("isTestnet");

-- Create NetworkConfiguration table
CREATE TABLE "network_configurations" (
    "id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "chainType" "ChainType" NOT NULL,
    "usdcAddress" TEXT NOT NULL,
    "usdcDecimals" INTEGER NOT NULL DEFAULT 6,
    "isTestnet" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "paymentAddress" TEXT NOT NULL,
    "facilitatorUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_configurations_pkey" PRIMARY KEY ("id")
);

-- Create indexes for NetworkConfiguration table
CREATE UNIQUE INDEX "network_configurations_network_key" ON "network_configurations"("network");
CREATE INDEX "network_configurations_network_idx" ON "network_configurations"("network");
CREATE INDEX "network_configurations_isTestnet_idx" ON "network_configurations"("isTestnet");
CREATE INDEX "network_configurations_isActive_idx" ON "network_configurations"("isActive");

-- Insert default network configurations
INSERT INTO "network_configurations" ("id", "network", "chainId", "chainType", "usdcAddress", "isTestnet", "paymentAddress", "facilitatorUrl") VALUES
-- Mainnet configurations
('net_ethereum', 'ethereum', '1', 'ETHEREUM', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', false, '0x077Fa73F5F13EA67af069fd7987DD30f1FAb5740', 'https://facilitator.payai.network'),
('net_base', 'base', '8453', 'ETHEREUM', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', false, '0x077Fa73F5F13EA67af069fd7987DD30f1FAb5740', 'https://facilitator.payai.network'),
('net_bsc', 'bsc', '56', 'ETHEREUM', '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', false, '0x077Fa73F5F13EA67af069fd7987DD30f1FAb5740', 'https://facilitator.payai.network'),
('net_polygon', 'polygon', '137', 'ETHEREUM', '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', false, '0x077Fa73F5F13EA67af069fd7987DD30f1FAb5740', 'https://facilitator.payai.network'),
('net_solana', 'solana', '900', 'SOLANA', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', false, 'BXvYRtXAAWpyRThTwPoWUW36Ju3zVkvihBJ4KHhCTNrW', 'https://facilitator.payai.network'),
-- Testnet configurations
('net_sepolia', 'sepolia', '11155111', 'ETHEREUM', '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', true, '0x077Fa73F5F13EA67af069fd7987DD30f1FAb5740', 'https://facilitator.payai.network'),
('net_base_sepolia', 'base-sepolia', '84532', 'ETHEREUM', '0x036CbD53842c5426634e7929541eC2318f3dCF7e', true, '0x077Fa73F5F13EA67af069fd7987DD30f1FAb5740', 'https://facilitator.payai.network'),
('net_solana_devnet', 'solana-devnet', '901', 'SOLANA', '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', true, '7RYYc2mJ9BaSaFJVY28X17j8vWokcFTtDNuFsuxRugHK', 'https://facilitator.payai.network');

-- Update existing transactions to have network field (set to 'ethereum' as default)
UPDATE "Transaction" SET "network" = 'ethereum' WHERE "network" IS NULL;

-- Update existing subscriptions to set default values
UPDATE "Subscription" SET "creditUsage" = 0 WHERE "creditUsage" IS NULL;
UPDATE "Subscription" SET "autoRenew" = true WHERE "autoRenew" IS NULL;
UPDATE "Subscription" SET "isTestnetSubscription" = false WHERE "isTestnetSubscription" IS NULL;