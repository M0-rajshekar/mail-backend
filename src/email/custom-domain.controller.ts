/**
 * Custom Domain Controller
 * Manages custom domain onboarding, verification, and DNS configuration
 */

import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    Req,
    UseGuards,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import {
    ApiTags,
    ApiBearerAuth,
    ApiOperation,
    ApiProperty,
} from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CustomDomainService } from './custom-domain.service';
import { EmailService } from './email.service';
import { PrismaService } from '../services/prisma.service';
import { SUBSCRIPTION_PLANS } from '../payments/constants/subscription-plans';

class RegisterDomainDto {
    @ApiProperty({ description: 'Domain to register (e.g., yourcompany.com)' })
    @IsString()
    @IsNotEmpty()
    domain: string;
}

@ApiTags('Custom Domains')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('email/domains')
export class CustomDomainController {
    constructor(
        private readonly customDomainService: CustomDomainService,
        private readonly emailService: EmailService,
        private readonly prisma: PrismaService,
    ) {}

    @Post()
    @ApiOperation({ summary: 'Register a new custom domain' })
    async registerDomain(@Body() dto: RegisterDomainDto, @Req() req: Request) {
        const userId = req.user as string;

        // Check plan allows custom domains
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                CustomDomains: true,
                Subscription: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Use subscription's plan tier if available, otherwise fall back to currentPlan
        const subscriptionPlan = user.Subscription[0]?.subscriptionPlan;
        const planId = subscriptionPlan || user.currentPlan;
        const currentDomains = user.CustomDomains.length;

        // Map database plan enum to config key
        // Database: FREE, STARTER, PRO, ENTERPRISE (PaymentPlan)
        // SubscriptionTier: FREE, STANDARD, TEAM, PRO, ULTIMATE
        // Config: FREE, STANDARD, TEAM, PRO, ULTIMATE
        const planMapping: Record<string, string> = {
            FREE: 'FREE',
            STARTER: 'STANDARD',
            PRO: 'PRO',
            ENTERPRISE: 'ULTIMATE',
            STANDARD: 'STANDARD',
            TEAM: 'TEAM',
            ULTIMATE: 'ULTIMATE',
            DEVELOPER: 'STANDARD',
            STARTUP: 'TEAM',
            SUBSCRIPTION: 'PRO', // User on subscription — check actual tier from Subscription record
        };
        const mappedPlan = planMapping[planId] || planId;
        const planConfig = SUBSCRIPTION_PLANS[mappedPlan];

        if (!planConfig || planConfig.customDomains === 0) {
            throw new ForbiddenException(
                'Your plan does not support custom domains. Upgrade to enable this feature.',
            );
        }

        // Check domain limit
        const plan = user.Subscription[0]?.subscriptionPlan || planId;
        const { canAdd, maxDomains } =
            await this.customDomainService.checkDomainLimit(
                userId,
                plan,
                currentDomains,
            );

        if (!canAdd) {
            throw new ForbiddenException(
                `Domain limit reached. Maximum ${maxDomains} custom domains allowed on your plan.`,
            );
        }

        return this.customDomainService.registerDomain(userId, dto.domain);
    }

    @Get()
    @ApiOperation({ summary: 'List all custom domains for user' })
    async getDomains(@Req() req: Request) {
        const userId = req.user as string;
        return this.customDomainService.getUserDomains(userId);
    }

    @Get('verified/list')
    @ApiOperation({
        summary: 'Get verified domains for inbox creation dropdown',
    })
    async getVerifiedDomains(@Req() req: Request) {
        const userId = req.user as string;
        return this.customDomainService.getVerifiedDomainsWithDetails(userId);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get domain details and DNS records' })
    async getDomain(@Param('id') id: string, @Req() req: Request) {
        const userId = req.user as string;
        return this.customDomainService.getDomainDetails(userId, id);
    }

    @Post(':id/verify')
    @ApiOperation({ summary: 'Trigger domain verification check' })
    async verifyDomain(@Param('id') id: string, @Req() req: Request) {
        const userId = req.user as string;
        return this.customDomainService.verifyDomain(userId, id);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Remove a custom domain' })
    async deleteDomain(@Param('id') id: string, @Req() req: Request) {
        const userId = req.user as string;
        return this.customDomainService.deleteDomain(userId, id);
    }

    @Get(':id/dns-records')
    @ApiOperation({ summary: 'Get required DNS records for domain' })
    async getDnsRecords(@Param('id') id: string, @Req() req: Request) {
        const userId = req.user as string;
        return this.customDomainService.getDnsRecords(userId, id);
    }
}
