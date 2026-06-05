-- Migration: Add customDomainId to inboxes table
-- Run this SQL directly in your Neon database console

-- Add the column (nullable, since existing rows won't have a custom domain)
ALTER TABLE "inboxes" ADD COLUMN IF NOT EXISTS "customDomainId" TEXT;

-- Add foreign key constraint
ALTER TABLE "inboxes" 
    ADD CONSTRAINT "inboxes_customDomainId_fkey" 
    FOREIGN KEY ("customDomainId") 
    REFERENCES "custom_domains"("id") 
    ON DELETE SET NULL 
    ON UPDATE CASCADE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS "inboxes_customDomainId_idx" ON "inboxes"("customDomainId");

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'inboxes' AND column_name = 'customDomainId';
