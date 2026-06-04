/**
 * Subscription Plans Configuration
 * Email-focused plans matching AgentMail.to competitor
 * Plans: FREE | STANDARD | TEAM | PRO | ULTIMATE
 * 
 * Competitor benchmark (AgentMail.to):
 * - Free: 3 inboxes, 3,000 emails/month
 * - Developer: $20, 10 inboxes, 10,000 emails/month
 * 
 * Our plans (more generous free tier, lower prices):
 * - Free: 5 inboxes, 5,000 emails/month
 * - Standard: $9, 15 inboxes, 15,000 emails/month
 * - Team: $29, 50 inboxes, 50,000 emails/month
 * - Pro: $59, 150 inboxes, 150,000 emails/month
 * - Ultimate: $99, unlimited inboxes, unlimited emails
 */

export interface SubscriptionPlanConfig {
    name: string;
    monthlyPrice: number;
    yearlyPrice: number;
    maxInboxes: number;      // -1 = unlimited
    emailsPerMonth: number;  // -1 = unlimited
    emailsPerHour: number;   // per-inbox rate limit
    emailsPerDay: number;    // per-inbox rate limit
    maxWebhooks: number;     // -1 = unlimited
    maxAttachmentsPerEmail: number;
    maxAttachmentSizeMB: number;
    storageGB: number;       // -1 = unlimited
    apiCallsPerMinute: number;
    semanticSearch: boolean;
    customDomains: number;   // -1 = unlimited
    description: string;
    features: string[];
}

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlanConfig> = {
    FREE: {
        name: 'Free',
        monthlyPrice: 0,
        yearlyPrice: 0,
        maxInboxes: 5,
        emailsPerMonth: 5000,
        emailsPerHour: 20,
        emailsPerDay: 100,
        maxWebhooks: 2,
        maxAttachmentsPerEmail: 3,
        maxAttachmentSizeMB: 5,
        storageGB: 1,
        apiCallsPerMinute: 60,
        semanticSearch: false,
        customDomains: 0,
        description: 'Try it out — perfect for hobby projects',
        features: [
            '5 Email Inboxes',
            '5,000 emails / month',
            '20 emails/hour per inbox',
            '2 Webhook endpoints',
            '3 attachments per email',
            '5 MB attachment limit',
            '1 GB storage',
            'API access',
            'Community support',
        ],
    },
    STANDARD: {
        name: 'Standard',
        monthlyPrice: 9,
        yearlyPrice: 83.88,
        maxInboxes: 15,
        emailsPerMonth: 15000,
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
            '15,000 emails / month',
            '50 emails/hour per inbox',
            '10 Webhook endpoints',
            '5 attachments per email',
            '10 MB attachment limit',
            '5 GB storage',
            'Semantic search',
            '1 Custom domain',
            'API & MCP access',
            'Email support',
        ],
    },
    TEAM: {
        name: 'Team',
        monthlyPrice: 29,
        yearlyPrice: 290,
        maxInboxes: 50,
        emailsPerMonth: 50000,
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
            '50,000 emails / month',
            '100 emails/hour per inbox',
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
        maxInboxes: 150,
        emailsPerMonth: 150000,
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
            '150 Email Inboxes',
            '150,000 emails / month',
            '200 emails/hour per inbox',
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
        maxInboxes: -1,
        emailsPerMonth: -1,
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
            'Unlimited Inboxes',
            'Unlimited emails / month',
            '500 emails/hour per inbox',
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
 * Get emails per month limit
 * Returns -1 for unlimited
 */
export function getEmailsPerMonthLimit(tier: string): number {
    const plan = getSubscriptionPlanConfig(tier);
    if (!plan) return 5000;
    return plan.emailsPerMonth;
}

/**
 * Get emails per hour rate limit (per inbox)
 */
export function getEmailsPerHourLimit(tier: string): number {
    const plan = getSubscriptionPlanConfig(tier);
    if (!plan) return 20;
    return plan.emailsPerHour;
}

/**
 * Get emails per day rate limit (per inbox)
 */
export function getEmailsPerDayLimit(tier: string): number {
    const plan = getSubscriptionPlanConfig(tier);
    if (!plan) return 100;
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
    if (!plan) return 5000;
    return plan.emailsPerMonth;
}

/**
 * Get subscription credits based on tier and billing period.
 * Maps emailsPerMonth to credits (unlimited = 999999).
 */
export function getSubscriptionCredits(
    tier: string,
    billingPeriod: 'MONTHLY' | 'YEARLY',
): number {
    const plan = getSubscriptionPlanConfig(tier);
    if (!plan) return 0;
    const monthly = plan.emailsPerMonth === -1 ? 999999 : plan.emailsPerMonth;
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
export const YEARLY_SUBSCRIPTION_BUILDER = 83.88;
export const YEARLY_BUILDER_CREDITS = 0;

export const MONTHLY_SUBSCRIPTION_ARCHITECT = 59; // PRO
export const MONTHLY_ARCHITECT_CREDITS = 0;
export const YEARLY_SUBSCRIPTION_ARCHITECT = 590;
export const YEARLY_ARCHITECT_CREDITS = 0;
