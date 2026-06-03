-- Migration: Remove all non-X402 related tables and fields
-- This migration removes all tables and fields not needed for X402 subscription payments

-- Drop all non-X402 related tables
DROP TABLE IF EXISTS "RefreshToken" CASCADE;
DROP TABLE IF EXISTS "messages" CASCADE;
DROP TABLE IF EXISTS "conversation" CASCADE;
DROP TABLE IF EXISTS "TokenAnalysis" CASCADE;
DROP TABLE IF EXISTS "WatchlistItem" CASCADE;
DROP TABLE IF EXISTS "saved_articles" CASCADE;
DROP TABLE IF EXISTS "followed_publications" CASCADE;
DROP TABLE IF EXISTS "articles" CASCADE;
DROP TABLE IF EXISTS "NewsSignal" CASCADE;
DROP TABLE IF EXISTS "user_news_cache" CASCADE;
DROP TABLE IF EXISTS "user_keyword_cache" CASCADE;
DROP TABLE IF EXISTS "monitor_webhook_events" CASCADE;
DROP TABLE IF EXISTS "event_groups" CASCADE;
DROP TABLE IF EXISTS "monitors" CASCADE;
DROP TABLE IF EXISTS "global_insights" CASCADE;
DROP TABLE IF EXISTS "rate_limits" CASCADE;
DROP TABLE IF EXISTS "crypto_insights" CASCADE;

-- Drop unused enums
DROP TYPE IF EXISTS "NewsSignalFrequency";

-- Remove unused fields from User table
ALTER TABLE "users" DROP COLUMN IF EXISTS "profileUrl";
ALTER TABLE "users" DROP COLUMN IF EXISTS "referralPoints";
ALTER TABLE "users" DROP COLUMN IF EXISTS "totalPoints";
ALTER TABLE "users" DROP COLUMN IF EXISTS "isAlreadyApplied";
ALTER TABLE "users" DROP COLUMN IF EXISTS "isElizaEligible";

-- Add performance indexes for X402 operations
CREATE INDEX IF NOT EXISTS "Transaction_walletAddress_idx" ON "Transaction"("walletAddress");
CREATE INDEX IF NOT EXISTS "Transaction_subscriptionPlan_idx" ON "Transaction"("subscriptionPlan");
CREATE INDEX IF NOT EXISTS "Subscription_userId_subscriptionStatus_idx" ON "Subscription"("userId", "subscriptionStatus");

-- Update any existing NULL values to defaults where needed
UPDATE "users" SET "preferredNetwork" = NULL WHERE "preferredNetwork" = '';
UPDATE "users" SET "lastPaymentNetwork" = NULL WHERE "lastPaymentNetwork" = '';
UPDATE "Transaction" SET "network" = 'ethereum' WHERE "network" IS NULL OR "network" = '';
UPDATE "Subscription" SET "paymentNetwork" = 'ethereum' WHERE "paymentNetwork" IS NULL OR "paymentNetwork" = '';

-- Add comments for documentation
COMMENT ON TABLE "users" IS 'X402 subscription users with wallet-based authentication';
COMMENT ON TABLE "Transaction" IS 'X402 payment transactions for subscriptions';
COMMENT ON TABLE "Subscription" IS 'X402 subscription plans and billing information';

COMMENT ON COLUMN "users"."walletAddress" IS 'Unique wallet address for X402 payments';
COMMENT ON COLUMN "users"."preferredNetwork" IS 'User preferred payment network for X402 subscriptions';
COMMENT ON COLUMN "users"."lastPaymentNetwork" IS 'Last network used for X402 payment';
COMMENT ON COLUMN "Transaction"."network" IS 'X402 payment network (ethereum, base, bsc, polygon, solana, sepolia, base-sepolia, solana-devnet)';
COMMENT ON COLUMN "Transaction"."payinId" IS 'X402 payment hash identifier';
COMMENT ON COLUMN "Transaction"."isTestnet" IS 'Whether transaction was made on testnet';
COMMENT ON COLUMN "Subscription"."paymentNetwork" IS 'Network used for X402 subscription payment';
COMMENT ON COLUMN "Subscription"."paymentHash" IS 'X402 payment hash for subscription';
COMMENT ON COLUMN "Subscription"."isTestnetSubscription" IS 'Whether subscription was created on testnet';
COMMENT ON COLUMN "Subscription"."autoRenew" IS 'Auto-renewal preference for X402 subscriptions';