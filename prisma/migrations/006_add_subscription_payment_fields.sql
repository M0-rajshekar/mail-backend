-- Add paymentMethod and paymentNetwork columns to Subscription table
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "paymentNetwork" TEXT;

-- Create index on paymentMethod for better query performance
CREATE INDEX IF NOT EXISTS "Subscription_paymentMethod_idx" ON "Subscription"("paymentMethod");
