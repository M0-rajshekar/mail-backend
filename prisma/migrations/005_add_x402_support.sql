-- Add X402 payment support fields to existing tables

-- Add X402 fields to Subscription table
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "paymentNetwork" TEXT;

-- Add X402 fields to Transaction table  
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "paymentNetwork" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "transactionHash" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "blockchainNetwork" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "isTestnet" BOOLEAN DEFAULT FALSE;

-- Update existing records to have default payment method
UPDATE "Subscription" SET "paymentMethod" = 'ATLOS' WHERE "paymentMethod" IS NULL;
UPDATE "Transaction" SET "paymentMethod" = 'ATLOS' WHERE "paymentMethod" IS NULL;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS "idx_subscription_payment_method" ON "Subscription"("paymentMethod");
CREATE INDEX IF NOT EXISTS "idx_transaction_payment_method" ON "Transaction"("paymentMethod");
CREATE INDEX IF NOT EXISTS "idx_transaction_blockchain_network" ON "Transaction"("blockchainNetwork");
CREATE INDEX IF NOT EXISTS "idx_transaction_testnet" ON "Transaction"("isTestnet");