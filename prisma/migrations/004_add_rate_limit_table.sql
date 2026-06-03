-- Migration: Add RateLimit table for API rate limiting
-- This migration adds the missing RateLimit table to support API rate limiting functionality

-- Create RateLimit table
CREATE TABLE IF NOT EXISTS "rate_limits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "resetDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "featureType" TEXT NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- Create unique index on userId, featureType, and resetDate (composite unique constraint)
CREATE UNIQUE INDEX IF NOT EXISTS "rate_limits_userId_featureType_resetDate_key" ON "rate_limits"("userId", "featureType", "resetDate");

-- Create index on userId and featureType for faster lookups
CREATE INDEX IF NOT EXISTS "rate_limits_userId_featureType_idx" ON "rate_limits"("userId", "featureType");

-- Create index on resetDate for cleanup operations
CREATE INDEX IF NOT EXISTS "rate_limits_resetDate_idx" ON "rate_limits"("resetDate");