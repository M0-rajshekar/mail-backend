/**
 * Cloudflare Zones & DNS Service
 * Integrates with Cloudflare API to manage zones, DNS records, and email routing
 * 
 * Uses the Cloudflare REST API with Bearer token authentication.
 * API Reference: https://developers.cloudflare.com/api/
 */

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { randomBytes } from 'crypto';

interface CfResponse<T = any> {
    success: boolean;
    errors: Array<{ code: number; message: string }>;
    messages: string[];
    result: T;
    result_info?: {
        count: number;
        page: number;
        per_page: number;
        total_count: number;
        total_pages: number;
    };
}

interface Zone {
    id: string;
    name: string;
    status: string;
    paused: boolean;
    type: string;
    development_mode: number;
    name_servers: string[];
}

interface DnsRecord {
    id: string;
    type: string;
    name: string;
    content: string;
    proxiable: boolean;
    proxied: boolean;
    ttl: number;
    priority?: number;
    locked: boolean;
    zone_id: string;
    zone_name: string;
}

interface EmailRoutingRule {
    id: string;
    actions: Array<{
        type: 'drop' | 'forward' | 'worker';
        value: string[];
    }>;
    enabled: boolean;
    matchers: Array<{
        type: 'all' | 'literal';
        field?: 'to';
        value?: string;
    }>;
    name: string;
    priority?: number;
    tag?: string;
}

@Injectable()
export class CloudflareZonesService {
    private readonly logger = new Logger(CloudflareZonesService.name);
    private readonly baseUrl = 'https://api.cloudflare.com/client/v4';

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {}

    private getHeaders(): Record<string, string> {
        const token = this.configService.get<string>('CLOUDFLARE_API_TOKEN');
        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        };
    }

    /**
     * Create a new Cloudflare zone for a domain.
     * Returns nameservers that the user must configure at their domain registrar.
     */
    async createZone(domain: string): Promise<{
        zoneId: string;
        nameservers: string[];
        status: string;
    } | null> {
        try {
            const accountId = this.configService.get<string>('CLOUDFLARE_ACCOUNT_ID');

            const response = await firstValueFrom(
                this.httpService.post<CfResponse<Zone>>(
                    `${this.baseUrl}/zones`,
                    {
                        name: domain,
                        type: 'full',
                        account: { id: accountId },
                    },
                    { headers: this.getHeaders() },
                ),
            );

            if (!response.data.success) {
                const errors = response.data.errors
                    .map((e) => `${e.code}: ${e.message}`)
                    .join('; ');
                this.logger.error(`Failed to create zone for ${domain}: ${errors}`);
                
                // Check if zone already exists (code 1061)
                const alreadyExists = response.data.errors?.some(e => 
                    e.code === 1061 || e.message?.includes('already exists')
                );
                
                if (alreadyExists) {
                    this.logger.log(`Zone for ${domain} already exists, fetching existing zone...`);
                    return this.getZoneDetails(domain);
                }
                
                return null;
            }

            const zone = response.data.result;
            this.logger.log(
                `Created zone for ${domain}: ${zone.id}, nameservers: ${zone.name_servers.join(', ')}`,
            );

            return {
                zoneId: zone.id,
                nameservers: zone.name_servers,
                status: zone.status,
            };
        } catch (error: any) {
            this.logger.error(`Failed to create zone for ${domain}: ${error.message}`);
            
            // Check if error is because zone already exists
            if (error.response?.data?.errors?.some(e => 
                e.code === 1061 || e.message?.includes('already exists')
            )) {
                this.logger.log(`Zone for ${domain} already exists, fetching existing zone...`);
                return this.getZoneDetails(domain);
            }
            
            return null;
        }
    }

    /**
     * Get zone details including nameservers
     */
    async getZoneDetails(domain: string): Promise<{
        zoneId: string;
        nameservers: string[];
        status: string;
    } | null> {
        const zoneId = await this.getZoneId(domain);
        if (!zoneId) return null;

        try {
            const response = await firstValueFrom(
                this.httpService.get<CfResponse<Zone>>(
                    `${this.baseUrl}/zones/${zoneId}`,
                    { headers: this.getHeaders() },
                ),
            );

            if (!response.data.success) return null;

            const zone = response.data.result;
            return {
                zoneId: zone.id,
                nameservers: zone.name_servers || [],
                status: zone.status,
            };
        } catch (error: any) {
            this.logger.error(`Failed to get zone details for ${domain}: ${error.message}`);
            return null;
        }
    }

    /**
     * Get Zone ID for a domain (existing zone) */
    async getZoneId(domain: string): Promise<string | null> {
        try {
            const response = await firstValueFrom(
                this.httpService.get<CfResponse<Zone[]>>(
                    `${this.baseUrl}/zones`,
                    {
                        headers: this.getHeaders(),
                        params: { name: domain }, // Don't filter by status - zone may be pending
                    },
                ),
            );

            const zones = response.data.result;
            if (!zones || zones.length === 0) {
                this.logger.warn(`No Cloudflare zone found for ${domain}`);
                return null;
            }

            return zones[0].id;
        } catch (error: any) {
            this.logger.error(`Failed to get zone ID for ${domain}: ${error.message}`);
            return null;
        }
    }

    /**
     * Get DNS records for a zone
     */
    async getDnsRecords(zoneId: string): Promise<DnsRecord[]> {
        try {
            const response = await firstValueFrom(
                this.httpService.get<CfResponse<DnsRecord[]>>(
                    `${this.baseUrl}/zones/${zoneId}/dns_records`,
                    { headers: this.getHeaders() },
                ),
            );
            return response.data.result || [];
        } catch (error: any) {
            this.logger.error(`Failed to get DNS records: ${error.message}`);
            return [];
        }
    }

    /**
     * Create a DNS record
     */
    async createDnsRecord(
        zoneId: string,
        record: Partial<DnsRecord>,
    ): Promise<DnsRecord | null> {
        try {
            const response = await firstValueFrom(
                this.httpService.post<CfResponse<DnsRecord>>(
                    `${this.baseUrl}/zones/${zoneId}/dns_records`,
                    record,
                    { headers: this.getHeaders() },
                ),
            );

            if (!response.data.success) {
                this.logger.error(
                    `Failed to create DNS record: ${JSON.stringify(response.data.errors)}`,
                );
                return null;
            }

            return response.data.result;
        } catch (error: any) {
            this.logger.error(`Failed to create DNS record: ${error.message}`);
            return null;
        }
    }

    /**
     * Delete a DNS record
     */
    async deleteDnsRecord(zoneId: string, recordId: string): Promise<boolean> {
        try {
            const response = await firstValueFrom(
                this.httpService.delete<CfResponse>(
                    `${this.baseUrl}/zones/${zoneId}/dns_records/${recordId}`,
                    { headers: this.getHeaders() },
                ),
            );
            return response.data.success;
        } catch (error: any) {
            this.logger.error(`Failed to delete DNS record: ${error.message}`);
            return false;
        }
    }

    /**
     * Get Email Routing rules for a zone
     */
    async getRoutingRules(zoneId: string): Promise<EmailRoutingRule[]> {
        try {
            const response = await firstValueFrom(
                this.httpService.get<CfResponse<EmailRoutingRule[]>>(
                    `${this.baseUrl}/zones/${zoneId}/email/routing/rules`,
                    { headers: this.getHeaders() },
                ),
            );
            return response.data.result || [];
        } catch (error: any) {
            this.logger.error(`Failed to get routing rules: ${error.message}`);
            return [];
        }
    }

    /**
     * Create Email Routing rule (catch-all → Worker)
     */
    async createRoutingRule(
        zoneId: string,
        options: {
            workerName: string;
            matcher?: { type: 'all' | 'literal'; value?: string };
        },
    ): Promise<EmailRoutingRule | null> {
        try {
            const body = {
                actions: [{ type: 'worker' as const, value: [options.workerName] }],
                matchers: [
                    options.matcher || { type: 'all' as const },
                ],
                enabled: true,
                name: `AgentMail — Route to ${options.workerName}`,
            };

            const response = await firstValueFrom(
                this.httpService.post<CfResponse<EmailRoutingRule>>(
                    `${this.baseUrl}/zones/${zoneId}/email/routing/rules`,
                    body,
                    { headers: this.getHeaders() },
                ),
            );

            if (!response.data.success) {
                const errors = response.data.errors
                    .map((e) => `${e.code}: ${e.message}`)
                    .join('; ');
                this.logger.error(`Failed to create routing rule: ${errors}`);
                return null;
            }

            this.logger.log(
                `Created routing rule for zone ${zoneId}: ${response.data.result.id}`,
            );
            return response.data.result;
        } catch (error: any) {
            this.logger.error(`Failed to create routing rule: ${error.message}`);
            return null;
        }
    }

    /**
     * Delete an Email Routing rule
     */
    async deleteRoutingRule(zoneId: string, ruleId: string): Promise<boolean> {
        try {
            const response = await firstValueFrom(
                this.httpService.delete<CfResponse>(
                    `${this.baseUrl}/zones/${zoneId}/email/routing/rules/${ruleId}`,
                    { headers: this.getHeaders() },
                ),
            );
            return response.data.success;
        } catch (error: any) {
            this.logger.error(`Failed to delete routing rule: ${error.message}`);
            return false;
        }
    }

    /**
     * Get the catch-all routing rule
     */
    async getCatchAllRule(zoneId: string): Promise<any> {
        try {
            const response = await firstValueFrom(
                this.httpService.get<CfResponse>(
                    `${this.baseUrl}/zones/${zoneId}/email/routing/rules/catch_all`,
                    { headers: this.getHeaders() },
                ),
            );
            return response.data.result;
        } catch (error: any) {
            this.logger.error(`Failed to get catch-all rule: ${error.message}`);
            return null;
        }
    }

    /**
     * FULL ONBOARDING: Setup a domain for AgentMail email routing
     * 
     * This performs the complete Cloudflare setup:
     * 1. Get or verify zone exists
     * 2. Add MX records for email routing
     * 3. Add SPF record (merge with existing if needed)
     * 4. Create Email Routing rule (catch-all → Worker)
     * 5. Verify DNS propagation
     */
    async onboardDomainForEmail(
        domain: string,
        workerName: string = 'calm-scene-39ae',
    ): Promise<{
        success: boolean;
        zoneId?: string;
        errors: string[];
        steps: string[];
        mxRecords?: { name: string; content: string }[];
    }> {
        const errors: string[] = [];
        const steps: string[] = [];

        // Step 1: Get Zone ID
        this.logger.log(`Onboarding domain: ${domain}`);
        const zoneId = await this.getZoneId(domain);

        if (!zoneId) {
            errors.push(
                `Domain "${domain}" not found in Cloudflare. Make sure the domain is added to your Cloudflare account first.`,
            );
            return { success: false, errors, steps };
        }
        steps.push(`Zone found: ${zoneId}`);

        // Step 2: Get existing DNS records
        const existingRecords = await this.getDnsRecords(zoneId);
        steps.push(`Found ${existingRecords.length} existing DNS records`);

        // Step 3: Add MX records for email routing
        const mxRecords = [
            { name: domain, content: 'route1.mx.cloudflare.net', priority: 10 },
            { name: domain, content: 'route2.mx.cloudflare.net', priority: 20 },
            { name: domain, content: 'route3.mx.cloudflare.net', priority: 30 },
        ];

        // Check for existing MX records from other providers (Zoho, Google, Microsoft, etc.)
        const allExistingMx = existingRecords.filter((r) => r.type === 'MX');
        const existingCloudflareMx = allExistingMx.filter(
            (r) => r.content?.includes('mx.cloudflare.net'),
        );
        const otherProviderMx = allExistingMx.filter(
            (r) => !r.content?.includes('mx.cloudflare.net'),
        );

        // Warn about existing email providers
        if (otherProviderMx.length > 0) {
            const providers: string[] = otherProviderMx.map((r) => {
                const content = r.content?.toLowerCase() || '';
                if (content.includes('zoho')) return 'Zoho Mail';
                if (content.includes('google') || content.includes('googlemail')) return 'Google Workspace (Gmail)';
                if (content.includes('outlook') || content.includes('protection.outlook')) return 'Microsoft 365 (Outlook)';
                if (content.includes('protonmail')) return 'ProtonMail';
                if (content.includes('fastmail')) return 'Fastmail';
                if (content.includes('namecheap')) return 'Namecheap Private Email';
                if (content.includes('crazydomains')) return 'Crazy Domains';
                if (content.includes('hostinger')) return 'Hostinger Email';
                return `Other (${r.content})`;
            });
            const uniqueProviders = [...new Set(providers)];
            
            steps.push(`⚠️  Detected existing email provider(s): ${uniqueProviders.join(', ')}`);
            steps.push(`   Existing MX records: ${otherProviderMx.map(r => r.content).join(', ')}`);
            steps.push(`   Cloudflare MX records will be added with priority 10/20/30`);
            steps.push(`   ⚠️  WARNING: Having multiple MX providers may cause emails to be split between services`);
            steps.push(`   Recommendation: Remove other provider MX records to ensure all emails route through Cloudflare`);
        }

        if (existingCloudflareMx.length === 0) {
            for (const mx of mxRecords) {
                const result = await this.createDnsRecord(zoneId, {
                    type: 'MX',
                    name: mx.name,
                    content: mx.content,
                    priority: mx.priority,
                    ttl: 1, // Auto
                });

                if (result) {
                    steps.push(`MX record added: ${mx.content} (priority: ${mx.priority})`);
                } else {
                    errors.push(`Failed to add MX record: ${mx.content}`);
                }
            }
        } else {
            steps.push(`Cloudflare MX records already exist (${existingCloudflareMx.length})`);
        }

        // Step 4: Add/merge SPF record
        const existingSpf = existingRecords.find(
            (r) => r.type === 'TXT' && r.name === domain && r.content?.includes('v=spf1'),
        );

        const spfValue = 'v=spf1 include:_spf.mx.cloudflare.net ~all';

        if (!existingSpf) {
            const result = await this.createDnsRecord(zoneId, {
                type: 'TXT',
                name: domain,
                content: spfValue,
                ttl: 1,
            });

            if (result) {
                steps.push('SPF record added');
            } else {
                errors.push('Failed to add SPF record');
            }
        } else if (!existingSpf.content?.includes('_spf.mx.cloudflare.net')) {
            // Detect other providers in SPF
            const spfContent = existingSpf.content || '';
            const otherProviders: string[] = [];
            if (spfContent.includes('zoho')) otherProviders.push('Zoho Mail');
            if (spfContent.includes('google') || spfContent.includes('_spf.google')) otherProviders.push('Google Workspace');
            if (spfContent.includes('outlook') || spfContent.includes('spf.protection.outlook')) otherProviders.push('Microsoft 365');
            if (spfContent.includes('protonmail')) otherProviders.push('ProtonMail');
            if (spfContent.includes('fastmail')) otherProviders.push('Fastmail');
            
            if (otherProviders.length > 0) {
                steps.push(`⚠️  Existing SPF includes: ${otherProviders.join(', ')}`);
                steps.push(`   Merging with Cloudflare SPF...`);
            }

            // Merge existing SPF with Cloudflare's
            const merged = existingSpf.content.replace(
                /~all|-all|\?all/,
                ` include:_spf.mx.cloudflare.net ~all`,
            );

            const updated = await this.deleteDnsRecord(zoneId, existingSpf.id);
            if (updated) {
                const result = await this.createDnsRecord(zoneId, {
                    type: 'TXT',
                    name: domain,
                    content: merged,
                    ttl: 1,
                });

                if (result) {
                    steps.push(`SPF record merged (kept: ${otherProviders.join(', ')}, added: Cloudflare)`);
                } else {
                    errors.push('Failed to update SPF record');
                }
            }
        } else {
            steps.push('SPF record already configured for Cloudflare');
        }

        // Step 4.5: Check for existing DKIM/DMARC from other providers
        const dkimRecords = existingRecords.filter(
            (r) => r.type === 'TXT' && r.name?.startsWith('dkim.') || r.name?.startsWith('_domainkey'),
        );
        const dmarcRecord = existingRecords.find(
            (r) => r.type === 'TXT' && r.name === '_dmarc.' + domain,
        );
        
        if (dkimRecords.length > 0) {
            steps.push(`⚠️  Found ${dkimRecords.length} existing DKIM record(s) - these may belong to another email provider`);
            steps.push(`   DKIM names: ${dkimRecords.map(r => r.name).join(', ')}`);
            steps.push(`   Cloudflare Email Routing handles DKIM automatically - existing keys may cause conflicts`);
        }
        
        if (dmarcRecord) {
            steps.push(`⚠️  Found existing DMARC record`);
            steps.push(`   Current: ${dmarcRecord.content}`);
            steps.push(`   Cloudflare will use this DMARC policy for email delivery`);
        }

        // Step 5: Create Email Routing rule (catch-all → Worker)
        const existingRules = await this.getRoutingRules(zoneId);
        const hasWorkerRule = existingRules.some(
            (r) => r.actions?.[0]?.type === 'worker' && r.actions?.[0]?.value?.includes(workerName),
        );

        if (!hasWorkerRule) {
            const rule = await this.createRoutingRule(zoneId, { workerName });

            if (rule) {
                steps.push(`Email Routing rule created: catch-all → ${workerName}`);
            } else {
                errors.push('Failed to create Email Routing rule');
            }
        } else {
            steps.push('Email Routing rule already exists');
        }

        return {
            success: errors.length === 0,
            zoneId,
            errors,
            steps,
            mxRecords: mxRecords.map((m) => ({ name: m.name, content: m.content })),
        };
    }

    /**
     * Verify DNS TXT record exists for domain verification
     * Uses Node.js dns module for actual DNS lookup
     */
    async verifyDnsTxt(domain: string, expectedValue: string): Promise<boolean> {
        try {
            const dns = await import('dns').then((m) => m.promises);
            const records = await dns.resolveTxt(domain);

            return records.some((record) =>
                record.some((entry) => entry === expectedValue),
            );
        } catch (error: any) {
            this.logger.warn(`DNS TXT check failed for ${domain}: ${error.message}`);
            return false;
        }
    }

    /**
     * Verify MX records are properly configured
     */
    async verifyMxRecords(domain: string): Promise<{
        valid: boolean;
        records: string[];
    }> {
        try {
            const dns = await import('dns').then((m) => m.promises);
            const records = await dns.resolveMx(domain);

            const mxValues = records.map((r) => r.exchange.toLowerCase());
            const hasCloudflare = mxValues.some((v) =>
                v.includes('mx.cloudflare.net'),
            );

            return {
                valid: hasCloudflare,
                records: records.map((r) => `${r.exchange} (${r.priority})`),
            };
        } catch (error: any) {
            return { valid: false, records: [] };
        }
    }

    /**
     * Cleanup: Remove a domain's email routing setup
     */
    async removeDomainSetup(domain: string): Promise<{
        success: boolean;
        errors: string[];
    }> {
        const errors: string[] = [];
        const zoneId = await this.getZoneId(domain);

        if (!zoneId) {
            return { success: true, errors: [] };
        }

        // Delete routing rules created by AgentMail
        const existingRules = await this.getRoutingRules(zoneId);
        const agentMailRules = existingRules.filter(
            (r) => r.name?.includes('AgentMail'),
        );

        for (const rule of agentMailRules) {
            if (rule.id) {
                await this.deleteRoutingRule(zoneId, rule.id);
            }
        }

        return { success: errors.length === 0, errors };
    }
}
