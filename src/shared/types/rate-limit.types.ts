export interface RateLimitConfig {
    maxRequests: number;
    windowMs: number; // Time window in milliseconds
}

// Time windows
export const TIME_WINDOWS = {
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
} as const;

// Helper function to create rate limit configs with optional window override
const createRateLimitConfig = (
    maxRequests: number,
    windowMs: number = TIME_WINDOWS.HOUR,
): RateLimitConfig => ({
    maxRequests,
    windowMs,
});

// Tool name type
export type ToolName = string;

// Rate limit tier type — aligns with Prisma SubscriptionTier
// FREE=Free, BASIC=Build, PRO=Accelerate, PREMIUM=Unlimited
export type RateLimitTier = 'FREE' | 'TOP_UP' | 'BASIC' | 'PRO' | 'PREMIUM';

/**
 * SocialPilot rate limits per plan tier.
 * Action keys match SpToolName from frontend constants.
 *
 * Plan mapping:
 *   FREE     → Free       (2 profiles,  20 posts/mo,  60 req/min)
 *   BASIC    → Build      (10 profiles, 120 posts/mo, 120 req/min)
 *   PRO      → Accelerate (50 profiles, unlimited,    600 req/min)
 *   PREMIUM  → Unlimited  (∞ profiles,  unlimited,  1200 req/min)
 */
export const RATE_LIMITS: Record<string, Record<string, RateLimitConfig>> = {
    FREE: {
        publish_post: createRateLimitConfig(20, TIME_WINDOWS.DAY),
        schedule_post: createRateLimitConfig(20, TIME_WINDOWS.DAY),
        bulk_schedule: createRateLimitConfig(0, TIME_WINDOWS.DAY),
        connect_account: createRateLimitConfig(2, TIME_WINDOWS.DAY),
        twitter_engage: createRateLimitConfig(10, TIME_WINDOWS.DAY),
        fetch_analytics: createRateLimitConfig(10, TIME_WINDOWS.DAY),
        api_request: createRateLimitConfig(60, TIME_WINDOWS.MINUTE),
    },
    TOP_UP: {
        publish_post: createRateLimitConfig(120, TIME_WINDOWS.DAY),
        schedule_post: createRateLimitConfig(120, TIME_WINDOWS.DAY),
        bulk_schedule: createRateLimitConfig(50, TIME_WINDOWS.DAY),
        connect_account: createRateLimitConfig(10, TIME_WINDOWS.DAY),
        twitter_engage: createRateLimitConfig(100, TIME_WINDOWS.DAY),
        fetch_analytics: createRateLimitConfig(100, TIME_WINDOWS.DAY),
        api_request: createRateLimitConfig(120, TIME_WINDOWS.MINUTE),
    },
    BASIC: {
        publish_post: createRateLimitConfig(120, TIME_WINDOWS.DAY),
        schedule_post: createRateLimitConfig(120, TIME_WINDOWS.DAY),
        bulk_schedule: createRateLimitConfig(50, TIME_WINDOWS.DAY),
        connect_account: createRateLimitConfig(10, TIME_WINDOWS.DAY),
        twitter_engage: createRateLimitConfig(100, TIME_WINDOWS.DAY),
        fetch_analytics: createRateLimitConfig(100, TIME_WINDOWS.DAY),
        api_request: createRateLimitConfig(120, TIME_WINDOWS.MINUTE),
    },
    PRO: {
        publish_post: createRateLimitConfig(999999, TIME_WINDOWS.DAY),
        schedule_post: createRateLimitConfig(999999, TIME_WINDOWS.DAY),
        bulk_schedule: createRateLimitConfig(999999, TIME_WINDOWS.DAY),
        connect_account: createRateLimitConfig(50, TIME_WINDOWS.DAY),
        twitter_engage: createRateLimitConfig(999999, TIME_WINDOWS.DAY),
        fetch_analytics: createRateLimitConfig(999999, TIME_WINDOWS.DAY),
        api_request: createRateLimitConfig(600, TIME_WINDOWS.MINUTE),
    },
    PREMIUM: {
        publish_post: createRateLimitConfig(999999, TIME_WINDOWS.DAY),
        schedule_post: createRateLimitConfig(999999, TIME_WINDOWS.DAY),
        bulk_schedule: createRateLimitConfig(999999, TIME_WINDOWS.DAY),
        connect_account: createRateLimitConfig(999999, TIME_WINDOWS.DAY),
        twitter_engage: createRateLimitConfig(999999, TIME_WINDOWS.DAY),
        fetch_analytics: createRateLimitConfig(999999, TIME_WINDOWS.DAY),
        api_request: createRateLimitConfig(1200, TIME_WINDOWS.MINUTE),
    },
};
