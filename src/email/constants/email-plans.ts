/**
 * Email Subscription Plans Configuration
 * Based on competitor analysis (AgentMail.to)
 * 
 * Competitor Pricing:
 * - Free: $0, 3 inboxes, 3,000 emails/month
 * - Developer: $20, 10 inboxes, 10,000 emails/month
 * - Startup: Custom, 150 inboxes, 150,000 emails/month
 * - Enterprise: Custom, unlimited
 * 
 * Our Pricing (more generous free tier):
 * - Free: $0, 5 inboxes, 5,000 emails/month, 2 webhooks
 * - Developer: $15, 15 inboxes, 15,000 emails/month, 10 webhooks
 * - Startup: $49, 100 inboxes, 100,000 emails/month, 50 webhooks
 * - Enterprise: $99, unlimited inboxes, unlimited emails, unlimited webhooks
 */

export interface EmailPlanConfig {
    id: string;
    name: string;
    description: string;
    monthlyPrice: number;
    yearlyPrice: number;
    limits: {
        inboxes: number;        // -1 = unlimited
        emailsPerMonth: number;  // -1 = unlimited
        emailsPerHour: number;   // Per-inbox rate limit
        emailsPerDay: number;    // Per-inbox rate limit
        webhooks: number;        // -1 = unlimited
        attachmentsPerEmail: number;
        maxAttachmentSize: number; // MB
        storageGB: number;       // -1 = unlimited
        apiCallsPerMinute: number;
        semanticSearch: boolean;
        customDomains: number;   // -1 = unlimited
        teamMembers: number;     // -1 = unlimited
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
            emailsPerMonth: 5000,
            emailsPerHour: 20,
            emailsPerDay: 100,
            webhooks: 2,
            attachmentsPerEmail: 3,
            maxAttachmentSize: 5,
            storageGB: 1,
            apiCallsPerMinute: 60,
            semanticSearch: false,
            customDomains: 0,
            teamMembers: 1,
        },
        features: [
            '5 Email Inboxes',
            '5,000 emails/month',
            '20 emails/hour per inbox',
            '2 Webhook endpoints',
            '3 attachments per email',
            '5 MB attachment limit',
            '1 GB storage',
            'API access',
            'Community support',
        ],
    },
    DEVELOPER: {
        id: 'DEVELOPER',
        name: 'Developer',
        description: 'For indie developers and small projects',
        monthlyPrice: 15,
        yearlyPrice: 150,
        limits: {
            inboxes: 15,
            emailsPerMonth: 15000,
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
            '15,000 emails/month',
            '50 emails/hour per inbox',
            '10 Webhook endpoints',
            '5 attachments per email',
            '10 MB attachment limit',
            '5 GB storage',
            'Semantic search',
            '1 Custom domain',
            'API & MCP access',
            'Priority email support',
        ],
        isPopular: true,
    },
    STARTUP: {
        id: 'STARTUP',
        name: 'Startup',
        description: 'For growing teams and businesses',
        monthlyPrice: 49,
        yearlyPrice: 490,
        limits: {
            inboxes: 100,
            emailsPerMonth: 100000,
            emailsPerHour: 100,
            emailsPerDay: 2000,
            webhooks: 50,
            attachmentsPerEmail: 10,
            maxAttachmentSize: 25,
            storageGB: 25,
            apiCallsPerMinute: 300,
            semanticSearch: true,
            customDomains: 5,
            teamMembers: 5,
        },
        features: [
            '100 Email Inboxes',
            '100,000 emails/month',
            '100 emails/hour per inbox',
            '50 Webhook endpoints',
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
    ENTERPRISE: {
        id: 'ENTERPRISE',
        name: 'Enterprise',
        description: 'For large organizations with custom needs',
        monthlyPrice: 99,
        yearlyPrice: 990,
        limits: {
            inboxes: -1,
            emailsPerMonth: -1,
            emailsPerHour: 200,
            emailsPerDay: 10000,
            webhooks: -1,
            attachmentsPerEmail: 20,
            maxAttachmentSize: 50,
            storageGB: -1,
            apiCallsPerMinute: 1000,
            semanticSearch: true,
            customDomains: -1,
            teamMembers: -1,
        },
        features: [
            'Unlimited Inboxes',
            'Unlimited emails/month',
            '200 emails/hour per inbox',
            'Unlimited Webhooks',
            '20 attachments per email',
            '50 MB attachment limit',
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
export function canCreateInbox(planId: string, currentInboxes: number): boolean {
    const plan = getEmailPlanConfig(planId);
    if (!plan) return false;
    return isUnlimited(plan.limits.inboxes) || currentInboxes < plan.limits.inboxes;
}

/**
 * Check if user can create more webhooks
 */
export function canCreateWebhook(planId: string, currentWebhooks: number): boolean {
    const plan = getEmailPlanConfig(planId);
    if (!plan) return false;
    return isUnlimited(plan.limits.webhooks) || currentWebhooks < plan.limits.webhooks;
}

/**
 * Get rate limits for a plan
 */
export function getRateLimits(planId: string): { perHour: number; perDay: number } {
    const plan = getEmailPlanConfig(planId);
    if (!plan) return { perHour: 20, perDay: 100 };
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
    return plan ? !isUnlimited(plan.limits.customDomains) || plan.limits.customDomains > 0 : false;
}

/**
 * Get max team members
 */
export function getTeamMemberLimit(planId: string): number {
    const plan = getEmailPlanConfig(planId);
    if (!plan) return 1;
    return isUnlimited(plan.limits.teamMembers) ? Infinity : plan.limits.teamMembers;
}
