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
// LIGHT=Light, STANDARD=Starter, TEAM=Growth, PRO=Pro, ULTIMATE=Scale
export type RateLimitTier = 'LIGHT' | 'STANDARD' | 'TEAM' | 'PRO' | 'ULTIMATE';

/**
 * Email API rate limits per plan tier.
 *
 * Plan mapping (inboxes / emails per month / api req per min):
 *   LIGHT     → Light    (1 inbox,    300 emails/mo,    60 req/min)
 *   STANDARD  → Starter  (5 inboxes,    5K emails/mo,   120 req/min)
 *   TEAM      → Growth   (20 inboxes,  25K emails/mo,   300 req/min)
 *   PRO       → Pro      (100 inboxes, 100K emails/mo,  600 req/min)
 *   ULTIMATE  → Scale    (300 inboxes, 400K emails/mo, 1000 req/min)
 */
export const RATE_LIMITS: Record<string, Record<string, RateLimitConfig>> = {
    LIGHT: {
        send_email: { maxRequests: 300, windowMs: TIME_WINDOWS.DAY },
        create_inbox: { maxRequests: 1, windowMs: TIME_WINDOWS.DAY },
        api_request: { maxRequests: 60, windowMs: TIME_WINDOWS.MINUTE },
        search_emails: { maxRequests: 10, windowMs: TIME_WINDOWS.DAY },
    },
    STANDARD: {
        send_email: { maxRequests: 5000, windowMs: TIME_WINDOWS.DAY },
        create_inbox: { maxRequests: 5, windowMs: TIME_WINDOWS.DAY },
        api_request: { maxRequests: 120, windowMs: TIME_WINDOWS.MINUTE },
        search_emails: { maxRequests: 100, windowMs: TIME_WINDOWS.DAY },
    },
    TEAM: {
        send_email: { maxRequests: 25000, windowMs: TIME_WINDOWS.DAY },
        create_inbox: { maxRequests: 20, windowMs: TIME_WINDOWS.DAY },
        api_request: { maxRequests: 300, windowMs: TIME_WINDOWS.MINUTE },
        search_emails: { maxRequests: 500, windowMs: TIME_WINDOWS.DAY },
    },
    PRO: {
        send_email: { maxRequests: 100000, windowMs: TIME_WINDOWS.DAY },
        create_inbox: { maxRequests: 100, windowMs: TIME_WINDOWS.DAY },
        api_request: { maxRequests: 600, windowMs: TIME_WINDOWS.MINUTE },
        search_emails: { maxRequests: 999999, windowMs: TIME_WINDOWS.DAY },
    },
    ULTIMATE: {
        send_email: { maxRequests: 400000, windowMs: TIME_WINDOWS.DAY },
        create_inbox: { maxRequests: 300, windowMs: TIME_WINDOWS.DAY },
        api_request: { maxRequests: 1000, windowMs: TIME_WINDOWS.MINUTE },
        search_emails: { maxRequests: 999999, windowMs: TIME_WINDOWS.DAY },
    },
};
