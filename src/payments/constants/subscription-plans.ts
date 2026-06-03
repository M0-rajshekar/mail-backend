/**
 * Subscription Plans Configuration
 * Credits-based pricing model matching competitor
 * Plans: FREE | STANDARD | TEAM | PRO | ULTIMATE
 */

export interface SubscriptionPlanConfig {
    name: string;
    monthlyPrice: number;
    yearlyPrice: number;
    channels: number; // max connected social channels; -1 = unlimited
    postsPerMonth: number; // -1 = unlimited
    description: string;
    features: string[];
}

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlanConfig> = {
    FREE: {
        name: 'Free',
        monthlyPrice: 0,
        yearlyPrice: 0,
        channels: 0,
        postsPerMonth: 0,
        description: 'Try it out — limited access',
        features: ['150 Credits', 'Basic Editor'],
    },
    STANDARD: {
        name: 'Standard',
        monthlyPrice: 9,
        yearlyPrice: 83.88,
        channels: 1,
        postsPerMonth: 200,
        description: 'For creators getting started',
        features: [
            '200 Credits / month',
            '1 Social Account',
            'API & MCP Access',
            'Scheduling & Queue',
            'Analytics',
            'Email Support',
        ],
    },
    TEAM: {
        name: 'Team',
        monthlyPrice: 29,
        yearlyPrice: 290,
        channels: 3,
        postsPerMonth: 800,
        description: 'For growing brands',
        features: [
            '800 Credits / month',
            '3 Social Accounts',
            'API & MCP Access',
            'Scheduling & Queue',
            'Analytics',
            'Inbox & Comments',
            'Priority Support',
        ],
    },
    PRO: {
        name: 'Pro',
        monthlyPrice: 59,
        yearlyPrice: 590,
        channels: 7,
        postsPerMonth: 2000,
        description: 'For power users and agencies',
        features: [
            '2,000 Credits / month',
            '7 Social Accounts',
            'API & MCP Access',
            'Scheduling & Queue',
            'Analytics',
            'Inbox & Comments',
            'Webhooks',
            'Priority Support',
        ],
    },
    ULTIMATE: {
        name: 'Ultimate',
        monthlyPrice: 99,
        yearlyPrice: 990,
        channels: 14,
        postsPerMonth: 4000,
        description: 'For large agencies and teams',
        features: [
            '4,000 Credits / month',
            '14 Social Accounts',
            'API & MCP Access',
            'Scheduling & Queue',
            'Analytics',
            'Inbox & Comments',
            'Webhooks',
            'Premium Support',
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
 * Get channel limit for a subscription tier
 * Returns -1 for unlimited
 */
export function getChannelLimit(tier: string): number {
    const plan = SUBSCRIPTION_PLANS[tier];
    if (!plan) return 1;
    return plan.channels;
}

/**
 * Get posts per month limit
 * Returns -1 for unlimited
 */
export function getPostsPerMonth(tier: string): number {
    const plan = SUBSCRIPTION_PLANS[tier];
    if (!plan) return 0;
    return plan.postsPerMonth;
}

/**
 * Check whether a user can connect another channel given their current tier
 * and current connected channel count
 */
export function canConnectChannel(tier: string, currentCount: number): boolean {
    const limit = getChannelLimit(tier);
    if (limit === -1) return true; // unlimited
    return currentCount < limit;
}

/**
 * @deprecated Use getChannelLimit instead
 */
export function getAccountLimit(tier: string): number {
    return getChannelLimit(tier);
}

/**
 * @deprecated Use canConnectChannel instead
 */
export function canConnectAccount(tier: string, currentCount: number): boolean {
    return canConnectChannel(tier, currentCount);
}

/**
 * Get subscription credits based on tier and billing period.
 * Maps postsPerMonth to credits (unlimited = 999999).
 */
export function getSubscriptionCredits(
    tier: string,
    billingPeriod: 'MONTHLY' | 'YEARLY',
): number {
    const creditMap: Record<string, number> = {
        FREE: 150,
        STANDARD: 200,
        TEAM: 800,
        PRO: 2000,
        ULTIMATE: 4000,
    };
    const monthly = creditMap[tier] ?? 0;
    return billingPeriod === 'YEARLY' ? monthly * 12 : monthly;
}

/**
 * @deprecated
 */
export function getPlansBySegment(): Record<string, SubscriptionPlanConfig> {
    return SUBSCRIPTION_PLANS;
}

// Legacy constants retained for any residual imports — values updated to new plans
export const MONTHLY_SUBSCRIPTION_BUILDER = 19;   // STANDARD
export const MONTHLY_BUILDER_CREDITS = 0;
export const YEARLY_SUBSCRIPTION_BUILDER = 190;
export const YEARLY_BUILDER_CREDITS = 0;

export const MONTHLY_SUBSCRIPTION_ARCHITECT = 49; // PRO
export const MONTHLY_ARCHITECT_CREDITS = 0;
export const YEARLY_SUBSCRIPTION_ARCHITECT = 490;
export const YEARLY_ARCHITECT_CREDITS = 0;
