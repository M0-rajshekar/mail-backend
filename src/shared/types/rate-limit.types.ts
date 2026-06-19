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

// Tool name type
export type ToolName = string;

// Rate limit tier type — aligns with Prisma SubscriptionTier
// FREE=Free, STANDARD=Standard, TEAM=Team, PRO=Pro, ULTIMATE=Ultimate
export type RateLimitTier = 'FREE' | 'STANDARD' | 'TEAM' | 'PRO' | 'ULTIMATE';

/**
 * Email API rate limits per plan tier.
 *
 * Plan mapping:
 *   FREE      → Free       (5 inboxes,   30 emails/mo,    60 req/min)
 *   STANDARD  → Standard   (15 inboxes,   3K emails/mo,    120 req/min)
 *   TEAM      → Team       (50 inboxes,   12K emails/mo,   300 req/min)
 *   PRO       → Pro        (100 inboxes,  35K emails/mo,   600 req/min)
 *   ULTIMATE  → Ultimate   (250 inboxes, 100K emails/mo,  1000 req/min)
 */
export const RATE_LIMITS: Record<string, Record<string, RateLimitConfig>> = {
    LIGHT: {
        send_email: { maxRequests: 1000, windowMs: TIME_WINDOWS.DAY },
        create_inbox: { maxRequests: 1, windowMs: TIME_WINDOWS.DAY },
        api_request: { maxRequests: 60, windowMs: TIME_WINDOWS.MINUTE },        search_emails: { maxRequests: 10, windowMs: TIME_WINDOWS.DAY },
    },
    STANDARD: {
        send_email: { maxRequests: 10000, windowMs: TIME_WINDOWS.DAY },
        create_inbox: { maxRequests: 10, windowMs: TIME_WINDOWS.DAY },
        api_request: { maxRequests: 120, windowMs: TIME_WINDOWS.MINUTE },        search_emails: { maxRequests: 100, windowMs: TIME_WINDOWS.DAY },
    },
    TEAM: {
        send_email: { maxRequests: 50000, windowMs: TIME_WINDOWS.DAY },
        create_inbox: { maxRequests: 50, windowMs: TIME_WINDOWS.DAY },
        api_request: { maxRequests: 300, windowMs: TIME_WINDOWS.MINUTE },        search_emails: { maxRequests: 500, windowMs: TIME_WINDOWS.DAY },
    },
    PRO: {
        send_email: { maxRequests: 150000, windowMs: TIME_WINDOWS.DAY },
        create_inbox: { maxRequests: 200, windowMs: TIME_WINDOWS.DAY },
        api_request: { maxRequests: 600, windowMs: TIME_WINDOWS.MINUTE },        search_emails: { maxRequests: 999999, windowMs: TIME_WINDOWS.DAY },
    },
    ULTIMATE: {
        send_email: { maxRequests: 500000, windowMs: TIME_WINDOWS.DAY },
        create_inbox: { maxRequests: 500, windowMs: TIME_WINDOWS.DAY },
        api_request: { maxRequests: 1000, windowMs: TIME_WINDOWS.MINUTE },        search_emails: { maxRequests: 999999, windowMs: TIME_WINDOWS.DAY },
    },
};
