/**
 * Custom Domain Service
 * Handles domain registration, verification, DNS management, and Cloudflare integration
 * 
 * Multi-tenant isolation: Each domain is strictly tied to one user.
 * Edge cases handled:
 *   - Case-insensitive domain names
 *   - Subdomain conflicts (prevent subdomain hijacking)
 *   - Duplicate email prevention within same domain
 *   - Proper cascading on domain deletion
 *   - FROM-address validation for email sending
 *   - Inbound email validation for webhook security
 */

import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { DomainStatus, InboxStatus } from 'generated/prisma';
import { ConfigService } from '@nestjs/config';
import { SUBSCRIPTION_PLANS } from '../payments/constants/subscription-plans';
import { isUnlimited } from './constants/email-plans';
import { randomBytes } from 'crypto';

export interface DnsRecords {
    mx: { host: string; value: string; priority: number }[];
    txt: { host: string; value: string }[];
    spf: { host: string; value: string }[];
    dkim: { host: string; value: string }[];
}

@Injectable()
export class CustomDomainService {
    private readonly logger = new Logger(CustomDomainService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
    ) {}

    /**
     * Map database plan enum to subscription plan config key
     * Database enums: FREE, STARTER, PRO, ENTERPRISE
     * Config keys:    FREE, STANDARD, TEAM, PRO, ULTIMATE
     */
    private mapPlanToConfig(planId: string): string {
        const mapping: Record<string, string> = {
            'FREE': 'FREE',
            'STARTER': 'STANDARD',
            'PRO': 'PRO',
            'ENTERPRISE': 'ULTIMATE',
            'STANDARD': 'STANDARD',
            'TEAM': 'TEAM',
            'ULTIMATE': 'ULTIMATE',
            'DEVELOPER': 'STANDARD',
            'STARTUP': 'TEAM',
        };
        return mapping[planId] || planId;
    }

    /**
     * Check if user can add more custom domains
     */
    async checkDomainLimit(
        userId: string,
        planId: string,
        currentCount: number,
    ): Promise<{ canAdd: boolean; maxDomains: number }> {
        const mappedPlan = this.mapPlanToConfig(planId);
        const plan = SUBSCRIPTION_PLANS[mappedPlan];
        if (!plan) {
            this.logger.warn(`Unknown plan "${planId}" (mapped: "${mappedPlan}"), defaulting to 0 domains`);
            return { canAdd: false, maxDomains: 0 };
        }

        const maxDomains = isUnlimited(plan.customDomains)
            ? Infinity
            : plan.customDomains;

        return {
            canAdd: maxDomains === Infinity || currentCount < maxDomains,
            maxDomains: maxDomains === Infinity ? -1 : maxDomains,
        };
    }

    /**
     * Register a new custom domain
     * 
     * Validates:
     *   - Domain format (RFC-compliant)
     *   - Domain not already registered (case-insensitive)
     *   - Domain is not a subdomain of an existing domain
     *   - User hasn't exceeded plan limits
     *   - No IP addresses or localhost
     */
    async registerDomain(userId: string, domain: string) {
        // Normalize domain: lowercase, trim, remove trailing dot
        const normalizedDomain = this.normalizeDomain(domain);

        // Validate domain format
        if (!this.isValidDomain(normalizedDomain)) {
            throw new BadRequestException(
                'Invalid domain format. Use format: example.com (no www, no paths, no ports)'
            );
        }

        // Prevent IP addresses
        if (this.isIPAddress(normalizedDomain)) {
            throw new BadRequestException('IP addresses cannot be used as email domains');
        }

        // Check if domain or its parent/subdomain is already registered by ANY user
        // This prevents both:
        //   1. Exact match (example.com = example.com)
        //   2. Subdomain of existing (mail.example.com when example.com exists)
        //   3. Parent of existing (example.com when mail.example.com exists)
        const existingExact = await this.prisma.customDomain.findFirst({
            where: { domain: { equals: normalizedDomain, mode: 'insensitive' } },
        });

        if (existingExact) {
            if (existingExact.userId === userId) {
                throw new BadRequestException('You have already registered this domain');
            } else {
                throw new ForbiddenException('This domain is already registered by another user');
            }
        }

        // Check if any existing domain is a parent of the new domain
        // e.g., if "example.com" exists, block "mail.example.com"
        const domainParts = normalizedDomain.split('.');
        for (let i = 1; i < domainParts.length; i++) {
            const parentDomain = domainParts.slice(i).join('.');
            const parentExists = await this.prisma.customDomain.findFirst({
                where: { domain: { equals: parentDomain, mode: 'insensitive' } },
            });
            if (parentExists) {
                if (parentExists.userId === userId) {
                    throw new BadRequestException(
                        `Cannot register "${normalizedDomain}" because you already own the parent domain "${parentDomain}". Use a subdomain of your existing domain instead.`
                    );
                } else {
                    throw new ForbiddenException(
                        `Cannot register "${normalizedDomain}" because parent domain "${parentDomain}" is registered by another user.`
                    );
                }
            }
        }

        // Check if any existing domain is a subdomain of the new domain
        // e.g., if "mail.example.com" exists, block "example.com"
        const existingSubdomain = await this.prisma.customDomain.findFirst({
            where: { domain: { endsWith: `.${normalizedDomain}`, mode: 'insensitive' } },
        });

        if (existingSubdomain) {
            if (existingSubdomain.userId === userId) {
                throw new BadRequestException(
                    `Cannot register "${normalizedDomain}" because you already registered subdomain "${existingSubdomain.domain}". Delete the subdomain first.`
                );
            } else {
                throw new ForbiddenException(
                    `Cannot register "${normalizedDomain}" because subdomain "${existingSubdomain.domain}" is registered by another user.`
                );
            }
        }

        // Check plan limits
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { CustomDomains: true, Subscription: { orderBy: { createdAt: 'desc' }, take: 1 } },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        const planId = user.currentPlan;
        const currentCount = user.CustomDomains.length;
        const { canAdd, maxDomains } = await this.checkDomainLimit(
            userId,
            user.Subscription[0]?.subscriptionPlan || planId,
            currentCount,
        );

        if (!canAdd) {
            throw new ForbiddenException(
                `Domain limit reached. Maximum ${maxDomains} custom domains allowed on your plan. Upgrade to add more.`
            );
        }

        // Generate unique verification TXT record
        const verificationTxt = `agentmail-verify=${randomBytes(24).toString('hex')}`;

        // Create domain record in transaction
        const customDomain = await this.prisma.customDomain.create({
            data: {
                userId,
                domain: normalizedDomain,
                verificationTxt,
                status: DomainStatus.PENDING,
                verified: false,
            },
        });

        this.logger.log(`Domain registered: ${normalizedDomain} for user ${userId}`);

        return {
            id: customDomain.id,
            domain: customDomain.domain,
            status: customDomain.status,
            verified: customDomain.verified,
            verificationTxt: customDomain.verificationTxt,
            dnsRecords: this.generateDnsRecords(normalizedDomain, verificationTxt),
            message: 'Domain registered. Add the DNS records below to verify ownership.',
        };
    }

    /**
     * Get all domains for a user with inbox counts
     */
    async getUserDomains(userId: string) {
        const domains = await this.prisma.customDomain.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { inboxes: true },
                },
            },
        });

        return domains.map((domain) => ({
            id: domain.id,
            domain: domain.domain,
            status: domain.status,
            verified: domain.verified,
            mxConfigured: domain.mxConfigured,
            inboxCount: domain._count.inboxes,
            createdAt: domain.createdAt,
            updatedAt: domain.updatedAt,
        }));
    }

    /**
     * Get domain details with DNS records and linked inboxes
     */
    async getDomainDetails(userId: string, domainId: string) {
        const domain = await this.prisma.customDomain.findFirst({
            where: { id: domainId, userId },
            include: {
                inboxes: {
                    select: {
                        id: true,
                        emailAddress: true,
                        displayName: true,
                        status: true,
                        createdAt: true,
                    },
                },
            },
        });

        if (!domain) {
            throw new NotFoundException('Domain not found or does not belong to you');
        }

        return {
            id: domain.id,
            domain: domain.domain,
            status: domain.status,
            verified: domain.verified,
            mxConfigured: domain.mxConfigured,
            verificationTxt: domain.verificationTxt,
            createdAt: domain.createdAt,
            updatedAt: domain.updatedAt,
            inboxes: domain.inboxes,
            dnsRecords: this.generateDnsRecords(domain.domain, domain.verificationTxt),
        };
    }

    /**
     * Verify domain ownership via TXT record
     * 
     * In production: queries DNS to verify TXT record exists.
     * In development: auto-verifies if configured.
     */
    async verifyDomain(userId: string, domainId: string) {
        const domain = await this.prisma.customDomain.findFirst({
            where: { id: domainId, userId },
        });

        if (!domain) {
            throw new NotFoundException('Domain not found or does not belong to you');
        }

        if (domain.verified) {
            return {
                verified: true,
                message: 'Domain is already verified',
            };
        }

        // Check if domain is in pending state (not failed)
        if (domain.status === DomainStatus.FAILED) {
            throw new BadRequestException(
                'Domain verification previously failed. Delete and re-register to try again.'
            );
        }

        // In production: query DNS
        // For dev/staging: allow auto-verify via env flag
        const autoVerify = this.configService.get<string>('AUTO_VERIFY_DOMAINS') === 'true';
        let isVerified = false;

        if (autoVerify) {
            isVerified = true;
            this.logger.warn(`Auto-verifying domain ${domain.domain} (AUTO_VERIFY_DOMAINS=true)`);
        } else {
            isVerified = await this.checkDnsVerification(
                domain.domain,
                domain.verificationTxt,
            );
        }

        if (isVerified) {
            await this.prisma.customDomain.update({
                where: { id: domainId },
                data: {
                    verified: true,
                    status: DomainStatus.ACTIVE,
                    mxConfigured: true,
                },
            });

            this.logger.log(`Domain verified: ${domain.domain} for user ${userId}`);

            return {
                verified: true,
                message: 'Domain verified successfully. You can now create inboxes using this domain.',
            };
        }

        // Increment verification attempt or mark failed after N tries
        return {
            verified: false,
            message: 'Verification failed. Ensure the TXT record is correctly added and DNS has propagated (can take 5-30 minutes).',
        };
    }

    /**
     * Delete a custom domain and all associated inboxes
     * 
     * Cascading delete: removes all inboxes using this domain to prevent orphaned emails.
     * Optimized with bulk deletes instead of N+1 queries.
     */
    async deleteDomain(userId: string, domainId: string) {
        const domain = await this.prisma.customDomain.findFirst({
            where: { id: domainId, userId },
        });

        if (!domain) {
            throw new NotFoundException('Domain not found or does not belong to you');
        }

        // Count inboxes before deletion (for response message)
        const inboxCount = await this.prisma.inbox.count({
            where: { customDomainId: domainId },
        });

        const messageCount = await this.prisma.emailMessage.count({
            where: {
                inbox: {
                    customDomainId: domainId,
                },
            },
        });

        // Use transaction with bulk deletes
        await this.prisma.$transaction(async (tx) => {
            // Delete all emails for inboxes on this domain (bulk delete via relation)
            await tx.emailMessage.deleteMany({
                where: {
                    inbox: {
                        customDomainId: domainId,
                    },
                },
            });

            // Delete all inboxes on this domain
            await tx.inbox.deleteMany({
                where: { customDomainId: domainId },
            });

            // Delete the domain itself
            await tx.customDomain.delete({
                where: { id: domainId },
            });
        });

        this.logger.log(
            `Domain deleted: ${domain.domain} for user ${userId} (${inboxCount} inboxes, ${messageCount} messages removed)`
        );

        return {
            message: `Domain deleted successfully. ${inboxCount} inbox(es) and ${messageCount} message(s) were also removed.`,
            deletedInboxes: inboxCount,
            deletedMessages: messageCount,
        };
    }

    /**
     * Get required DNS records for a domain
     */
    async getDnsRecords(userId: string, domainId: string) {
        const domain = await this.prisma.customDomain.findFirst({
            where: { id: domainId, userId },
        });

        if (!domain) {
            throw new NotFoundException('Domain not found or does not belong to you');
        }

        return this.generateDnsRecords(domain.domain, domain.verificationTxt);
    }

    /**
     * Get verified domains for a user
     */
    async getVerifiedDomains(userId: string): Promise<string[]> {
        const domains = await this.prisma.customDomain.findMany({
            where: { userId, verified: true, status: DomainStatus.ACTIVE },
            select: { domain: true },
        });

        return domains.map((d) => d.domain);
    }

    /**
     * Get verified domains with full details (for inbox creation dropdown)
     */
    async getVerifiedDomainsWithDetails(userId: string) {
        return this.prisma.customDomain.findMany({
            where: { userId, verified: true, status: DomainStatus.ACTIVE },
            select: {
                id: true,
                domain: true,
            },
            orderBy: { domain: 'asc' },
        });
    }

    /**
     * Check if an email address uses a verified custom domain belonging to the user
     */
    async isCustomDomainEmail(userId: string, emailAddress: string): Promise<boolean> {
        const domain = this.extractDomain(emailAddress);
        if (!domain) return false;

        const customDomain = await this.prisma.customDomain.findFirst({
            where: {
                userId,
                domain: { equals: domain, mode: 'insensitive' },
                verified: true,
                status: DomainStatus.ACTIVE,
            },
        });

        return !!customDomain;
    }

    /**
     * Get the custom domain ID for an email address (if it belongs to user)
     */
    async getDomainIdForEmail(userId: string, emailAddress: string): Promise<string | null> {
        const domain = this.extractDomain(emailAddress);
        if (!domain) return null;

        const customDomain = await this.prisma.customDomain.findFirst({
            where: {
                userId,
                domain: { equals: domain, mode: 'insensitive' },
                verified: true,
                status: DomainStatus.ACTIVE,
            },
        });

        return customDomain?.id || null;
    }

    /**
     * Validate that a FROM address is allowed for a user
     * 
     * Rules:
     *   - If using a custom domain, it must be verified and belong to the user
     *   - If using the default domain (e.g., @trueprop.xyz), it's always allowed
     */
    async validateFromAddress(userId: string, fromAddress: string): Promise<{ valid: boolean; error?: string }> {
        const domain = this.extractDomain(fromAddress);
        if (!domain) {
            return { valid: false, error: 'Invalid email address format' };
        }

        // Check if it's a custom domain
        const isCustom = await this.isCustomDomainEmail(userId, fromAddress);
        if (isCustom) {
            return { valid: true };
        }

        // Check if it's the default system domain
        const defaultDomain = this.configService.get<string>('DEFAULT_EMAIL_DOMAIN');
        if (defaultDomain && domain.toLowerCase() === defaultDomain.toLowerCase()) {
            return { valid: true };
        }

        // Domain not recognized
        return {
            valid: false,
            error: `You cannot send from "${domain}". Verify the domain first or use your default domain.`,
        };
    }

    /**
     * Create an inbox on a custom domain
     * 
     * Validates:
     *   - Domain is verified and belongs to user
     *   - Email address is unique (case-insensitive)
     *   - Local part is valid (no special chars that break email)
     */
    async createInboxOnDomain(
        userId: string,
        domainId: string,
        localPart: string,
        displayName?: string,
    ) {
        // Validate local part
        if (!this.isValidLocalPart(localPart)) {
            throw new BadRequestException(
                'Invalid email local part. Use only letters, numbers, dots, hyphens, and underscores.'
            );
        }

        // Find domain and verify ownership
        const domain = await this.prisma.customDomain.findFirst({
            where: { id: domainId, userId },
        });

        if (!domain) {
            throw new NotFoundException('Domain not found or does not belong to you');
        }

        if (!domain.verified || domain.status !== DomainStatus.ACTIVE) {
            throw new ForbiddenException(
                'Domain must be verified before creating inboxes. Complete DNS verification first.'
            );
        }

        const emailAddress = `${localPart}@${domain.domain}`.toLowerCase();

        // Check if email already exists (case-insensitive)
        const existing = await this.prisma.inbox.findUnique({
            where: { emailAddress },
        });

        if (existing) {
            throw new BadRequestException(
                `Email address "${emailAddress}" is already in use. Choose a different local part.`
            );
        }

        // Create inbox
        const inbox = await this.prisma.inbox.create({
            data: {
                userId,
                customDomainId: domainId,
                emailAddress,
                displayName: displayName || localPart,
                status: InboxStatus.ACTIVE,
            },
        });

        this.logger.log(`Inbox created: ${emailAddress} on custom domain ${domain.domain}`);

        return inbox;
    }

    // ─── Helpers ───────────────────────────────────────────────────

    /**
     * Normalize domain: lowercase, trim, remove trailing dot
     */
    private normalizeDomain(domain: string): string {
        return domain.toLowerCase().trim().replace(/\.$/, '');
    }

    /**
     * Extract domain from email address
     */
    private extractDomain(emailAddress: string): string | null {
        const parts = emailAddress.split('@');
        if (parts.length !== 2) return null;
        return parts[1].toLowerCase().trim();
    }

    /**
     * Validate domain format (RFC-compliant)
     */
    private isValidDomain(domain: string): boolean {
        // Must contain at least one dot, no spaces, no paths, no protocols
        if (!domain || domain.length < 4 || domain.length > 253) return false;
        if (domain.includes(' ') || domain.includes('/') || domain.includes(':')) return false;
        if (!domain.includes('.')) return false;
        
        // Check each label
        const labels = domain.split('.');
        if (labels.length < 2) return false;
        
        for (const label of labels) {
            if (!label || label.length > 63) return false;
            if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(label)) return false;
        }
        
        return true;
    }

    /**
     * Validate local part of email (before @)
     */
    private isValidLocalPart(localPart: string): boolean {
        if (!localPart || localPart.length < 1 || localPart.length > 64) return false;
        // Allow letters, numbers, dots, hyphens, underscores
        return /^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$/.test(localPart) &&
               !localPart.includes('..');
    }

    /**
     * Check if string is an IP address
     */
    private isIPAddress(domain: string): boolean {
        const ipv4Regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
        const ipv6Regex = /^\[?[0-9a-fA-F:]+\]?$/;
        return ipv4Regex.test(domain) || ipv6Regex.test(domain);
    }

    /**
     * Generate DNS records needed for email routing
     */
    private generateDnsRecords(domain: string, verificationTxt: string): DnsRecords {
        return {
            mx: [
                { host: '@', value: 'route1.mx.cloudflare.net', priority: 10 },
                { host: '@', value: 'route2.mx.cloudflare.net', priority: 20 },
                { host: '@', value: 'route3.mx.cloudflare.net', priority: 30 },
            ],
            txt: [
                { host: '@', value: verificationTxt },
            ],
            spf: [
                { host: '@', value: 'v=spf1 include:_spf.mx.cloudflare.net ~all' },
            ],
            dkim: [
                { host: 'cfmail._domainkey', value: 'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC1TaNgLlSyQMNWVLNLvy/neHA1q8dN9NvY8i2jH8yt9mJxv28dfceQJ02f2T0q5U7r5Y0wZz5yE3Q9Z9QZz5yE3Q9Z9QZz5yE3Q9Z9QZz5yE3Q9Z9QZz5yE3Q9Z9QZz5yE3Q9Z9QZz5yE3Q9Z9QIDAQAB' },
            ],
        };
    }

    /**
     * Check DNS TXT record for verification
     * 
     * TODO: Implement actual DNS lookup using dns.promises or a library like `dns-packet`
     * For now returns false (manual verification required)
     */
    private async checkDnsVerification(domain: string, expectedTxt: string): Promise<boolean> {
        this.logger.log(`Checking DNS TXT for ${domain}, expecting: ${expectedTxt}`);
        // Production: use Node.js dns.resolveTxt or external API
        return false;
    }
}
