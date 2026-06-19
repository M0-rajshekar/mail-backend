/**
 * Subscription Plans Configuration
 * Email-focused plans: FREE | STANDARD | TEAM | PRO | ULTIMATE
 *
 * Pricing model:
 * - Inbound emails (Email Routing): Unlimited on all plans (handled by Cloudflare)
 * - Outbound emails (Email Sending): Included monthly quota per plan, enforced as a
 *   hard cap (no metered overage billing — users upgrade or top up to send more)
 * - Internal cost basis only: ~$0.35 per 1,000 outbound emails
 *
 * Margin calculation (at ~$0.35/1,000 internal cost):
 * - STARTER ($9): 10,000 outbound = $3.50 cost → 61% margin
 * - GROWTH ($29): 50,000 outbound = $17.50 cost → 40% margin
 * - PRO ($59): 150,000 outbound = $52.50 cost → 11% margin
 * - SCALE ($99): 500,000 outbound = $175 cost → negative at full usage
 *   (volume caps assume typical usage well below the quota)
 */

export interface SubscriptionPlanConfig {
    name: string;
    monthlyPrice: number;
    yearlyPrice: number;
    maxInboxes: number; // -1 = unlimited
    outboundEmailsPerMonth: number; // Outbound (sending) quota. -1 = unlimited
    inboundEmailsPerMonth: number; // Always -1 (unlimited) for all plans
    emailsPerHour: number; // per-inbox rate limit
    emailsPerDay: number; // per-inbox rate limit    maxAttachmentsPerEmail: number;
    maxAttachmentSizeMB: number;
    storageGB: number; // -1 = unlimited
    apiCallsPerMinute: number;
    semanticSearch: boolean;
    customDomains: number; // -1 = unlimited
    description: string;
    features: string[];
}

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlanConfig> = {
    LIGHT: {
        name: 'Light',
        monthlyPrice: 1,
        yearlyPrice: 10,
        maxInboxes: 1,
        // Single combined "emails / month" allowance shown to users. Metering is
        // still applied to outbound only (inbound continues to be delivered).
        outboundEmailsPerMonth: 1000,
        inboundEmailsPerMonth: -1,
        emailsPerHour: 20,
        emailsPerDay: 200,        maxAttachmentsPerEmail: 2,
        maxAttachmentSizeMB: 5,
        storageGB: 1,
        apiCallsPerMinute: 60,
        semanticSearch: false,
        customDomains: 0,
        description: 'A light starting point for small projects',
        features: [
            '1 Email Inbox',
            '1,000 emails / month',
            '1 GB storage',            'API & MCP access',
            'Email support',
        ],
    },
    STANDARD: {
        name: 'Starter',
        monthlyPrice: 9,
        yearlyPrice: 90,
        maxInboxes: 10,
        outboundEmailsPerMonth: 10000,
        inboundEmailsPerMonth: -1,
        emailsPerHour: 100,
        emailsPerDay: 1000,        maxAttachmentsPerEmail: 5,
        maxAttachmentSizeMB: 10,
        storageGB: 20,
        apiCallsPerMinute: 120,
        semanticSearch: true,
        customDomains: 10,
        description: 'For developers getting started',
        features: [
            '10 Email Inboxes',
            '10,000 emails / month',            '100 emails/hour per inbox',            '5 attachments per email',
            '10 MB attachment limit',
            '20 GB storage',
            'Semantic search',
            '10 Custom domains',
            'API & MCP access',
            'Email support',
        ],
    },
    TEAM: {
        name: 'Growth',
        monthlyPrice: 29,
        yearlyPrice: 290,
        maxInboxes: 50,
        outboundEmailsPerMonth: 50000,
        inboundEmailsPerMonth: -1,
        emailsPerHour: 300,
        emailsPerDay: 5000,        maxAttachmentsPerEmail: 10,
        maxAttachmentSizeMB: 25,
        storageGB: 50,
        apiCallsPerMinute: 300,
        semanticSearch: true,
        customDomains: 25,
        description: 'For growing teams and businesses',
        features: [
            '50 Email Inboxes',
            '50,000 emails / month',            '300 emails/hour per inbox',            '10 attachments per email',
            '25 MB attachment limit',
            '50 GB storage',
            'Semantic search',
            '25 Custom domains',
            'API & MCP access',            'Priority support',
        ],
    },
    PRO: {
        name: 'Pro',
        monthlyPrice: 59,
        yearlyPrice: 590,
        maxInboxes: 200,
        outboundEmailsPerMonth: 150000,
        inboundEmailsPerMonth: -1,
        emailsPerHour: 600,
        emailsPerDay: 10000,        maxAttachmentsPerEmail: 20,
        maxAttachmentSizeMB: 50,
        storageGB: 150,
        apiCallsPerMinute: 600,
        semanticSearch: true,
        customDomains: -1,
        description: 'For power users and agencies',
        features: [
            '200 Email Inboxes',
            '150,000 emails / month',            '600 emails/hour per inbox',            '20 attachments per email',
            '50 MB attachment limit',
            '150 GB storage',
            'Semantic search',
            'Unlimited Custom domains',
            'API & MCP access',            'Priority support',
        ],
    },
    ULTIMATE: {
        name: 'Scale',
        monthlyPrice: 99,
        yearlyPrice: 990,
        maxInboxes: 500,
        outboundEmailsPerMonth: 500000,
        inboundEmailsPerMonth: -1,
        emailsPerHour: 1000,
        emailsPerDay: 20000,        maxAttachmentsPerEmail: 50,
        maxAttachmentSizeMB: 100,
        storageGB: 500,
        apiCallsPerMinute: 1000,
        semanticSearch: true,
        customDomains: -1,
        description: 'For large organizations',
        features: [
            '500 Email Inboxes',
            '500,000 emails / month',            '1,000 emails/hour per inbox',            '50 attachments per email',
            '100 MB attachment limit',
            '500 GB storage',
            'Semantic search',
            'Unlimited Custom domains',
            'API & MCP access',
            'Dedicated support',
            'SLA guarantee',
        ],
    },
};

/**
 * Get subscription plan configuration by tier
 */
export function getSubscriptionPlanConfig(
    tier: string,
): SubscriptionPlanConfig | null {
    return SUBSCRIPTION_PLANS[tier] || null;
}

/**
 * Get price for a subscription tier and billing period
 */
export function getSubscriptionPrice(
    tier: string,
    billingPeriod: 'MONTHLY' | 'YEARLY',
): number {
    const plan = SUBSCRIPTION_PLANS[tier];
    if (!plan) return 0;
    return billingPeriod === 'YEARLY' ? plan.yearlyPrice : plan.monthlyPrice;
}

/**
 * Get max inboxes for a subscription tier
 * Returns -1 for unlimited
 */
export function getInboxLimit(tier: string): number {
    const plan = getSubscriptionPlanConfig(tier);
    // No active subscription: allow 1 inbox so users can onboard, but no sending.
    if (!plan) return 1;
    return plan.maxInboxes;
}

/**
 * Get outbound emails per month limit
 * Returns -1 for unlimited
 */
export function getEmailsPerMonthLimit(tier: string): number {
    const plan = getSubscriptionPlanConfig(tier);
    // No active subscription: cannot send until a paid plan is chosen.
    if (!plan) return 0;
    return plan.outboundEmailsPerMonth;
}

/**
 * Get emails per hour rate limit (per inbox)
 */
export function getEmailsPerHourLimit(tier: string): number {
    const plan = getSubscriptionPlanConfig(tier);
    if (!plan) return 0;
    return plan.emailsPerHour;
}

/**
 * Get emails per day rate limit (per inbox)
 */
export function getEmailsPerDayLimit(tier: string): number {
    const plan = getSubscriptionPlanConfig(tier);
    if (!plan) return 0;
    return plan.emailsPerDay;
}

/**
 * Check whether a user can create another inbox given their current tier
 */
export function canCreateInbox(tier: string, currentCount: number): boolean {
    const limit = getInboxLimit(tier);
    if (limit === -1) return true;
    return currentCount < limit;
}

/**
 * Check if plan has semantic search
 */
export function hasSemanticSearch(tier: string): boolean {
    const plan = getSubscriptionPlanConfig(tier);
    return plan?.semanticSearch || false;
}

/**
 * Check if plan allows custom domains
 */
export function allowsCustomDomains(tier: string): boolean {
    const plan = getSubscriptionPlanConfig(tier);
    if (!plan) return false;
    return plan.customDomains === -1 || plan.customDomains > 0;
}

/**
 * @deprecated Use getInboxLimit instead
 */
export function getChannelLimit(tier: string): number {
    return getInboxLimit(tier);
}

/**
 * @deprecated Use canCreateInbox instead
 */
export function canConnectChannel(tier: string, currentCount: number): boolean {
    return canCreateInbox(tier, currentCount);
}

/**
 * @deprecated Use getInboxLimit instead
 */
export function getAccountLimit(tier: string): number {
    return getInboxLimit(tier);
}

/**
 * @deprecated Use canCreateInbox instead
 */
export function canConnectAccount(tier: string, currentCount: number): boolean {
    return canCreateInbox(tier, currentCount);
}

/**
 * Get posts per month limit
 * Returns -1 for unlimited
 */
export function getPostsPerMonth(tier: string): number {
    const plan = getSubscriptionPlanConfig(tier);
    if (!plan) return 30;
    return plan.outboundEmailsPerMonth;
}

/**
 * Get subscription credits based on tier and billing period.
 * Maps outboundEmailsPerMonth to credits (unlimited = 999999).
 */
export function getSubscriptionCredits(
    tier: string,
    billingPeriod: 'MONTHLY' | 'YEARLY',
): number {
    const plan = getSubscriptionPlanConfig(tier);
    if (!plan) return 0;
    const monthly = plan.outboundEmailsPerMonth === -1 ? 999999 : plan.outboundEmailsPerMonth;
    return billingPeriod === 'YEARLY' ? monthly * 12 : monthly;
}

/**
 * @deprecated
 */
export function getPlansBySegment(): Record<string, SubscriptionPlanConfig> {
    return SUBSCRIPTION_PLANS;
}

// Legacy constants retained for any residual imports
export const MONTHLY_SUBSCRIPTION_BUILDER = 9; // STANDARD
export const MONTHLY_BUILDER_CREDITS = 0;
export const YEARLY_SUBSCRIPTION_BUILDER = 90;
export const YEARLY_BUILDER_CREDITS = 0;

export const MONTHLY_SUBSCRIPTION_ARCHITECT = 59; // PRO
export const MONTHLY_ARCHITECT_CREDITS = 0;
export const YEARLY_SUBSCRIPTION_ARCHITECT = 590;
export const YEARLY_ARCHITECT_CREDITS = 0;
