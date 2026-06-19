/**
 * Email Subscription Plans Configuration
 * Aligned with SubscriptionTier enum: FREE | STANDARD | TEAM | PRO | ULTIMATE
 *
 * Pricing model:
 * - Inbound emails (Email Routing): Unlimited on all plans (Cloudflare handles this)
 * - Outbound emails (Email Sending): Included monthly quota per plan, enforced as a
 *   hard cap (no metered overage billing — users upgrade or top up to send more)
 * - Internal cost basis only: ~$0.35 per 1,000 outbound emails
 *
 * 100 Free users cost: 100 × 30 outbound = 3,000 emails = $1.05/month + ~$6 infra = ~$7/month
 * 1 Standard customer ($15) covers all 100 free users with $8 profit.
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
        webhooks: number; // -1 = unlimited
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
    FREE: {
        id: 'FREE',
        name: 'Free',
        description: 'Perfect for hobby projects and testing',
        monthlyPrice: 0,
        yearlyPrice: 0,
        limits: {
            inboxes: 5,
            outboundEmailsPerMonth: 30,
            inboundEmailsPerMonth: -1,
            emailsPerHour: 10,
            emailsPerDay: 30,
            webhooks: 2,
            attachmentsPerEmail: 2,
            maxAttachmentSize: 5,
            storageGB: 1,
            apiCallsPerMinute: 60,
            semanticSearch: false,
            customDomains: 0,
            teamMembers: 1,
        },
        features: [
            '5 Email Inboxes',
            '30 outbound emails/month',
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
        id: 'STANDARD',
        name: 'Standard',
        description: 'For indie developers and small projects',
        monthlyPrice: 15,
        yearlyPrice: 150,
        limits: {
            inboxes: 15,
            outboundEmailsPerMonth: 3000,
            inboundEmailsPerMonth: -1,
            emailsPerHour: 50,
            emailsPerDay: 500,
            webhooks: 10,
            attachmentsPerEmail: 5,
            maxAttachmentSize: 10,
            storageGB: 5,
            apiCallsPerMinute: 120,
            semanticSearch: true,
            customDomains: 1,
            teamMembers: 1,
        },
        features: [
            '15 Email Inboxes',
            '3,000 outbound emails/month',
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
        isPopular: true,
    },
    TEAM: {
        id: 'TEAM',
        name: 'Team',
        description: 'For growing teams and businesses',
        monthlyPrice: 29,
        yearlyPrice: 290,
        limits: {
            inboxes: 50,
            outboundEmailsPerMonth: 12000,
            inboundEmailsPerMonth: -1,
            emailsPerHour: 100,
            emailsPerDay: 2000,
            webhooks: 25,
            attachmentsPerEmail: 10,
            maxAttachmentSize: 25,
            storageGB: 25,
            apiCallsPerMinute: 300,
            semanticSearch: true,
            customDomains: 5,
            teamMembers: 5,
        },
        features: [
            '50 Email Inboxes',
            '12,000 outbound emails/month',
            'Unlimited inbound emails',            '100 emails/hour per inbox',
            '25 Webhook endpoints',
            '10 attachments per email',
            '25 MB attachment limit',
            '25 GB storage',
            'Semantic search',
            '5 Custom domains',
            '5 Team members',
            'API & MCP access',
            'Webhooks & real-time',
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
            outboundEmailsPerMonth: 35000,
            inboundEmailsPerMonth: -1,
            emailsPerHour: 200,
            emailsPerDay: 5000,
            webhooks: -1,
            attachmentsPerEmail: 20,
            maxAttachmentSize: 50,
            storageGB: 100,
            apiCallsPerMinute: 600,
            semanticSearch: true,
            customDomains: -1,
            teamMembers: -1,
        },
        features: [
            '100 Email Inboxes',
            '35,000 outbound emails/month',
            'Unlimited inbound emails',            '200 emails/hour per inbox',
            'Unlimited Webhooks',
            '20 attachments per email',
            '50 MB attachment limit',
            '100 GB storage',
            'Semantic search',
            'Unlimited Custom domains',
            'Unlimited Team members',
            'API & MCP access',
            'Webhooks & real-time',
            'Priority support',
        ],
    },
    ULTIMATE: {
        id: 'ULTIMATE',
        name: 'Ultimate',
        description: 'For large organizations with custom needs',
        monthlyPrice: 99,
        yearlyPrice: 990,
        limits: {
            inboxes: 250,
            outboundEmailsPerMonth: 100000,
            inboundEmailsPerMonth: -1,
            emailsPerHour: 500,
            emailsPerDay: 10000,
            webhooks: -1,
            attachmentsPerEmail: 50,
            maxAttachmentSize: 100,
            storageGB: -1,
            apiCallsPerMinute: 1000,
            semanticSearch: true,
            customDomains: -1,
            teamMembers: -1,
        },
        features: [
            '250 Email Inboxes',
            '100,000 outbound emails/month',
            'Unlimited inbound emails',            '500 emails/hour per inbox',
            'Unlimited Webhooks',
            '50 attachments per email',
            '100 MB attachment limit',
            'Unlimited storage',
            'Semantic search',
            'Unlimited Custom domains',
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
 * Check if user can create more webhooks
 */
export function canCreateWebhook(
    planId: string,
    currentWebhooks: number,
): boolean {
    const plan = getEmailPlanConfig(planId);
    if (!plan) return false;
    return (
        isUnlimited(plan.limits.webhooks) ||
        currentWebhooks < plan.limits.webhooks
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
