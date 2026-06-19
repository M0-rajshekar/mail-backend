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
 * Margin calculation:
 * - STANDARD ($15): 3,000 outbound = $1.05 cost → 93% margin
 * - TEAM ($29): 12,000 outbound = $4.20 cost → 85.5% margin
 * - PRO ($59): 35,000 outbound = $12.25 cost → 79.2% margin
 * - ULTIMATE ($99): 100,000 outbound = $35 cost → 64.6% margin
 */

export interface SubscriptionPlanConfig {
    name: string;
    monthlyPrice: number;
    yearlyPrice: number;
    maxInboxes: number; // -1 = unlimited
    outboundEmailsPerMonth: number; // Outbound (sending) quota. -1 = unlimited
    inboundEmailsPerMonth: number; // Always -1 (unlimited) for all plans
    emailsPerHour: number; // per-inbox rate limit
    emailsPerDay: number; // per-inbox rate limit
    maxWebhooks: number; // -1 = unlimited
    maxAttachmentsPerEmail: number;
    maxAttachmentSizeMB: number;
    storageGB: number; // -1 = unlimited
    apiCallsPerMinute: number;
    semanticSearch: boolean;
    customDomains: number; // -1 = unlimited
    description: string;
    features: string[];
}

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlanConfig> = {
    FREE: {
        name: 'Free',
        monthlyPrice: 0,
        yearlyPrice: 0,
        maxInboxes: 5,
        outboundEmailsPerMonth: 30,
        inboundEmailsPerMonth: -1,
        emailsPerHour: 10,
        emailsPerDay: 30,
        maxWebhooks: 2,
        maxAttachmentsPerEmail: 2,
        maxAttachmentSizeMB: 5,
        storageGB: 1,
        apiCallsPerMinute: 60,
        semanticSearch: false,
        customDomains: 0,
        description: 'Try it out — perfect for hobby projects',
        features: [
            '5 Email Inboxes',
            '30 outbound emails / month',
            'Unlimited inbound emails',
            '10 emails/hour per inbox',
            '2 Webhook endpoints',
            '2 attachments per email',
            '5 MB attachment limit',
            '1 GB storage',
            'API access',
            'Community support',
        ],
    },
    STANDARD: {
        name: 'Standard',
        monthlyPrice: 15,
        yearlyPrice: 150,
        maxInboxes: 15,
        outboundEmailsPerMonth: 3000,
        inboundEmailsPerMonth: -1,
        emailsPerHour: 50,
        emailsPerDay: 500,
        maxWebhooks: 10,
        maxAttachmentsPerEmail: 5,
        maxAttachmentSizeMB: 10,
        storageGB: 5,
        apiCallsPerMinute: 120,
        semanticSearch: true,
        customDomains: 1,
        description: 'For developers getting started',
        features: [
            '15 Email Inboxes',
            '3,000 outbound emails / month',
            'Unlimited inbound emails',            '50 emails/hour per inbox',
            '10 Webhook endpoints',
            '5 attachments per email',
            '10 MB attachment limit',
            '5 GB storage',
            'Semantic search',
            '1 Custom domain',
            'API & MCP access',
            'Priority support',
        ],
    },
    TEAM: {
        name: 'Team',
        monthlyPrice: 29,
        yearlyPrice: 290,
        maxInboxes: 50,
        outboundEmailsPerMonth: 12000,
        inboundEmailsPerMonth: -1,
        emailsPerHour: 100,
        emailsPerDay: 2000,
        maxWebhooks: 25,
        maxAttachmentsPerEmail: 10,
        maxAttachmentSizeMB: 25,
        storageGB: 25,
        apiCallsPerMinute: 300,
        semanticSearch: true,
        customDomains: 5,
        description: 'For growing teams and businesses',
        features: [
            '50 Email Inboxes',
            '12,000 outbound emails / month',
            'Unlimited inbound emails',            '100 emails/hour per inbox',
            '25 Webhook endpoints',
            '10 attachments per email',
            '25 MB attachment limit',
            '25 GB storage',
            'Semantic search',
            '5 Custom domains',
            'API & MCP access',
            'Webhooks & real-time',
            'Priority support',
        ],
    },
    PRO: {
        name: 'Pro',
        monthlyPrice: 59,
        yearlyPrice: 590,
        maxInboxes: 100,
        outboundEmailsPerMonth: 35000,
        inboundEmailsPerMonth: -1,
        emailsPerHour: 200,
        emailsPerDay: 5000,
        maxWebhooks: -1,
        maxAttachmentsPerEmail: 20,
        maxAttachmentSizeMB: 50,
        storageGB: 100,
        apiCallsPerMinute: 600,
        semanticSearch: true,
        customDomains: -1,
        description: 'For power users and agencies',
        features: [
            '100 Email Inboxes',
            '35,000 outbound emails / month',
            'Unlimited inbound emails',            '200 emails/hour per inbox',
            'Unlimited Webhooks',
            '20 attachments per email',
            '50 MB attachment limit',
            '100 GB storage',
            'Semantic search',
            'Unlimited Custom domains',
            'API & MCP access',
            'Webhooks & real-time',
            'Priority support',
        ],
    },
    ULTIMATE: {
        name: 'Ultimate',
        monthlyPrice: 99,
        yearlyPrice: 990,
        maxInboxes: 250,
        outboundEmailsPerMonth: 100000,
        inboundEmailsPerMonth: -1,
        emailsPerHour: 500,
        emailsPerDay: 10000,
        maxWebhooks: -1,
        maxAttachmentsPerEmail: 50,
        maxAttachmentSizeMB: 100,
        storageGB: -1,
        apiCallsPerMinute: 1000,
        semanticSearch: true,
        customDomains: -1,
        description: 'For large organizations',
        features: [
            '250 Email Inboxes',
            '100,000 outbound emails / month',
            'Unlimited inbound emails',            '500 emails/hour per inbox',
            'Unlimited Webhooks',
            '50 attachments per email',
            '100 MB attachment limit',
            'Unlimited storage',
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
    if (!plan) return 5;
    return plan.maxInboxes;
}

/**
 * Get outbound emails per month limit
 * Returns -1 for unlimited
 */
export function getEmailsPerMonthLimit(tier: string): number {
    const plan = getSubscriptionPlanConfig(tier);
    if (!plan) return 30;
    return plan.outboundEmailsPerMonth;
}

/**
 * Get emails per hour rate limit (per inbox)
 */
export function getEmailsPerHourLimit(tier: string): number {
    const plan = getSubscriptionPlanConfig(tier);
    if (!plan) return 10;
    return plan.emailsPerHour;
}

/**
 * Get emails per day rate limit (per inbox)
 */
export function getEmailsPerDayLimit(tier: string): number {
    const plan = getSubscriptionPlanConfig(tier);
    if (!plan) return 30;
    return plan.emailsPerDay;
}

/**
 * Get max webhooks for a subscription tier
 */
export function getWebhookLimit(tier: string): number {
    const plan = getSubscriptionPlanConfig(tier);
    if (!plan) return 2;
    return plan.maxWebhooks;
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
 * Check whether a user can create another webhook given their current tier
 */
export function canCreateWebhook(tier: string, currentCount: number): boolean {
    const limit = getWebhookLimit(tier);
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
export const MONTHLY_SUBSCRIPTION_BUILDER = 15; // STANDARD
export const MONTHLY_BUILDER_CREDITS = 0;
export const YEARLY_SUBSCRIPTION_BUILDER = 150;
export const YEARLY_BUILDER_CREDITS = 0;

export const MONTHLY_SUBSCRIPTION_ARCHITECT = 59; // PRO
export const MONTHLY_ARCHITECT_CREDITS = 0;
export const YEARLY_SUBSCRIPTION_ARCHITECT = 590;
export const YEARLY_ARCHITECT_CREDITS = 0;
