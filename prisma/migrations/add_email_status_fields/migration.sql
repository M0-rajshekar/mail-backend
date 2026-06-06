-- Add new fields to EmailMessage for read/star/trash support

-- Add isRead column
ALTER TABLE "email_messages" ADD COLUMN IF NOT EXISTS "isRead" BOOLEAN NOT NULL DEFAULT false;

-- Add starred column
ALTER TABLE "email_messages" ADD COLUMN IF NOT EXISTS "starred" BOOLEAN NOT NULL DEFAULT false;

-- Update existing emails to mark all as read (since they existed before this feature)
UPDATE "email_messages" SET "isRead" = true WHERE "isRead" = false;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "email_messages_isRead_idx" ON "email_messages"("isRead");
CREATE INDEX IF NOT EXISTS "email_messages_starred_idx" ON "email_messages"("starred");
