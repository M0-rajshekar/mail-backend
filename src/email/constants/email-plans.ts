/**
 * Email Subscription Plans Configuration
 * Aligned with SubscriptionTier enum: LIGHT | STANDARD | TEAM | PRO | ULTIMATE
 *
 * Pricing model:
 * - Inbound emails (Email Routing): Unlimited on all plans (Cloudflare handles this)
 * - Outbound emails (Email Sending): Included monthly quota per plan, enforced as a
 *   hard cap (no metered overage billing — users upgrade or top up to send more)
 * - Custom domains are the primary upgrade lever, kept scarce: 0/1/3/10/25
 * - Internal cost basis only: ~$0.35 per 1,000 outbound emails
 */

export interface EmailPlanConfig {
    id: string;
    name: string;
    description: string;
    monthlyPrice: number;
    yearlyPrice: number;
    limits: {
        inboxes: number; // -1 = unlimited
        outboundEmailsPerMonth: number; // Outbound (sending) quota. -1 = unlimited
        inboundEmailsPerMonth: number; // Always -1 (unlimited)
        emailsPerHour: number; // Per-inbox rate limit
        emailsPerDay: number; // Per-inbox rate limit
        attachmentsPerEmail: number;
        maxAttachmentSize: number; // MB
        storageGB: number; // -1 = unlimited
        apiCallsPerMinute: number;
        semanticSearch: boolean;
        customDomains: number; // -1 = unlimited
        teamMembers: number; // -1 = unlimited
    };
    features: string[];
    isPopular?: boolean;
}

export const EMAIL_PLANS: Record<string, EmailPlanConfig> = {
    LIGHT: {
        id: 'LIGHT',
        name: 'Light',
        description: 'A light starting point for small projects',
        monthlyPrice: 1,
        yearlyPrice: 10,
        limits: {
            inboxes: 1,
            outboundEmailsPerMonth: 300,
            inboundEmailsPerMonth: -1,
            emailsPerHour: 20,
            emailsPerDay: 100,
            attachmentsPerEmail: 2,
            maxAttachmentSize: 5,
            storageGB: 1,
            apiCallsPerMinute: 60,
            semanticSearch: false,
            customDomains: 0,
            teamMembers: 1,
        },
        features: [
            '1 Email Inbox',
            '300 emails/month',
            '1 GB storage',
            'API & MCP access',
            'Email support',
        ],
    },
    STANDARD: {
        id: 'STANDARD',
        name: 'Starter',
        description: 'For indie developers and small projects',
        monthlyPrice: 9,
        yearlyPrice: 90,
        limits: {
            inboxes: 5,
            outboundEmailsPerMonth: 5000,
            inboundEmailsPerMonth: -1,
            emailsPerHour: 100,
            emailsPerDay: 1000,
            attachmentsPerEmail: 5,
            maxAttachmentSize: 10,
            storageGB: 10,
            apiCallsPerMinute: 120,
            semanticSearch: true,
            customDomains: 1,
            teamMembers: 1,
        },
        features: [
            '5 Email Inboxes',
            '5,000 emails/month',
            '100 emails/hour per inbox',
            '5 attachments per email',
            '10 MB attachment limit',
            '10 GB storage',
            'Semantic search',
            '1 Custom domain',
            'API & MCP access',
            'Email support',
        ],
        isPopular: true,
    },
    TEAM: {
        id: 'TEAM',
        name: 'Growth',
        description: 'For growing teams and businesses',
        monthlyPrice: 29,
        yearlyPrice: 290,
        limits: {
            inboxes: 20,
            outboundEmailsPerMonth: 25000,
            inboundEmailsPerMonth: -1,
            emailsPerHour: 300,
            emailsPerDay: 5000,
            attachmentsPerEmail: 10,
            maxAttachmentSize: 25,
            storageGB: 50,
            apiCallsPerMinute: 300,
            semanticSearch: true,
            customDomains: 3,
            teamMembers: 5,
        },
        features: [
            '20 Email Inboxes',
            '25,000 emails/month',
            '300 emails/hour per inbox',
            '10 attachments per email',
            '25 MB attachment limit',
            '50 GB storage',
            'Semantic search',
            '3 Custom domains',
            '5 Team members',
            'API & MCP access',
            'Priority support',
        ],
    },
    PRO: {
        id: 'PRO',
        name: 'Pro',
        description: 'For power users and agencies',
        monthlyPrice: 59,
        yearlyPrice: 590,
        limits: {
            inboxes: 100,
            outboundEmailsPerMonth: 100000,
            inboundEmailsPerMonth: -1,
            emailsPerHour: 600,
            emailsPerDay: 10000,
            attachmentsPerEmail: 20,
            maxAttachmentSize: 50,
            storageGB: 150,
            apiCallsPerMinute: 600,
            semanticSearch: true,
            customDomains: 10,
            teamMembers: -1,
        },
        features: [
            '100 Email Inboxes',
            '100,000 emails/month',
            '600 emails/hour per inbox',
            '20 attachments per email',
            '50 MB attachment limit',
            '150 GB storage',
            'Semantic search',
            '10 Custom domains',
            'Unlimited Team members',
            'API & MCP access',
            'Priority support',
        ],
    },
    ULTIMATE: {
        id: 'ULTIMATE',
        name: 'Scale',
        description: 'For large organizations with custom needs',
        monthlyPrice: 99,
        yearlyPrice: 990,
        limits: {
            inboxes: 300,
            outboundEmailsPerMonth: 400000,
            inboundEmailsPerMonth: -1,
            emailsPerHour: 1000,
            emailsPerDay: 20000,
            attachmentsPerEmail: 50,
            maxAttachmentSize: 100,
            storageGB: 500,
            apiCallsPerMinute: 1000,
            semanticSearch: true,
            customDomains: 25,
            teamMembers: -1,
        },
        features: [
            '300 Email Inboxes',
            '400,000 emails/month',
            '1,000 emails/hour per inbox',
            '50 attachments per email',
            '100 MB attachment limit',
            '500 GB storage',
            'Semantic search',
            '25 Custom domains',
            'Unlimited Team members',
            'API & MCP access',
            'Dedicated support',
            'SLA guarantee',
            'Custom integrations',
        ],
    },
};

/**
 * Get plan configuration by ID
 */
export function getEmailPlanConfig(planId: string): EmailPlanConfig | null {
    return EMAIL_PLANS[planId] || null;
}

/**
 * Check if a limit is unlimited (-1)
 */
export function isUnlimited(value: number): boolean {
    return value === -1;
}

/**
 * Get effective limit (returns Infinity for unlimited)
 */
export function getEffectiveLimit(value: number): number {
    return isUnlimited(value) ? Infinity : value;
}

/**
 * Check if user can create more inboxes
 */
export function canCreateInbox(
    planId: string,
    currentInboxes: number,
): boolean {
    const plan = getEmailPlanConfig(planId);
    if (!plan) return false;
    return (
        isUnlimited(plan.limits.inboxes) || currentInboxes < plan.limits.inboxes
    );
}

/**
 * Get rate limits for a plan
 */
export function getRateLimits(planId: string): {
    perHour: number;
    perDay: number;
} {
    const plan = getEmailPlanConfig(planId);
    if (!plan) return { perHour: 10, perDay: 30 };
    return {
        perHour: plan.limits.emailsPerHour,
        perDay: plan.limits.emailsPerDay,
    };
}

/**
 * Check if plan has semantic search
 */
export function hasSemanticSearch(planId: string): boolean {
    const plan = getEmailPlanConfig(planId);
    return plan?.limits.semanticSearch || false;
}

/**
 * Check if plan allows custom domains
 */
export function allowsCustomDomains(planId: string): boolean {
    const plan = getEmailPlanConfig(planId);
    return plan
        ? !isUnlimited(plan.limits.customDomains) ||
              plan.limits.customDomains > 0
        : false;
}

/**
 * Get max team members
 */
export function getTeamMemberLimit(planId: string): number {
    const plan = getEmailPlanConfig(planId);
    if (!plan) return 1;
    return isUnlimited(plan.limits.teamMembers)
        ? Infinity
        : plan.limits.teamMembers;
}
