import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

const ZERNIO_API_BASE = 'https://zernio.com/api/v1';

@Injectable()
export class ZernioService {
    private readonly logger = new Logger(ZernioService.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
    ) {}

    private getHeaders() {
        const apiKey = this.configService.getOrThrow<string>('ZERNIO_API_KEY');
        return {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        };
    }

    async get<T>(path: string): Promise<T> {
        const url = `${ZERNIO_API_BASE}${path}`;
        this.logger.debug(`GET ${url}`);
        const response = await firstValueFrom(
            this.httpService.get<T>(url, { headers: this.getHeaders() }),
        );
        return response.data;
    }

    async post<T>(path: string, body?: any): Promise<T> {
        const url = `${ZERNIO_API_BASE}${path}`;
        this.logger.debug(`POST ${url}`);
        const response = await firstValueFrom(
            this.httpService.post<T>(url, body, {
                headers: this.getHeaders(),
            }),
        );
        return response.data;
    }

    async put<T>(path: string, body?: any): Promise<T> {
        const url = `${ZERNIO_API_BASE}${path}`;
        this.logger.debug(`PUT ${url}`);
        const response = await firstValueFrom(
            this.httpService.put<T>(url, body, {
                headers: this.getHeaders(),
            }),
        );
        return response.data;
    }

    async delete<T>(path: string, body?: any): Promise<T> {
        const url = `${ZERNIO_API_BASE}${path}`;
        this.logger.debug(`DELETE ${url}`);
        const response = await firstValueFrom(
            this.httpService.delete<T>(url, {
                headers: this.getHeaders(),
                data: body,
            }),
        );
        return response.data;
    }

    // ── Posts ──────────────────────────────────────────────────────────────

    async createPost(data: any): Promise<any> {
        return this.post('/posts', data);
    }

    async listPosts(filters?: {
        status?: string;
        profileId?: string;
        platform?: string;
        limit?: number;
        page?: number;
    }): Promise<any> {
        const params = new URLSearchParams();
        if (filters?.status) params.set('status', filters.status);
        if (filters?.profileId) params.set('profileId', filters.profileId);
        if (filters?.platform) params.set('platform', filters.platform);
        if (filters?.limit) params.set('limit', String(filters.limit));
        if (filters?.page) params.set('page', String(filters.page));
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.get(`/posts${query}`);
    }

    async getPost(postId: string): Promise<any> {
        return this.get(`/posts/${postId}`);
    }

    async deletePost(postId: string): Promise<any> {
        return this.delete(`/posts/${postId}`);
    }

    async retryPost(postId: string): Promise<any> {
        return this.post(`/posts/${postId}/retry`);
    }

    async validatePost(data: any): Promise<any> {
        return this.post('/tools/validate/post', data);
    }

    async editPost(
        postId: string,
        platform: string,
        content: string,
    ): Promise<any> {
        return this.post(`/posts/${postId}/edit`, { platform, content });
    }

    // ── Accounts ───────────────────────────────────────────────────────────

    async listAccounts(profileId?: string): Promise<any> {
        const query = profileId ? `?profileId=${profileId}` : '';
        return this.get(`/accounts${query}`);
    }

    async getAccount(accountId: string): Promise<any> {
        // Zernio doesn't have GET /accounts/:id — use listAccounts with profileId instead
        // This is kept for service completeness but the tool is removed
        return this.get(`/accounts/${accountId}`);
    }

    async getConnectUrl(
        platform: string,
        profileId: string,
        redirectUrl?: string,
        headless = false,
    ): Promise<any> {
        const params = new URLSearchParams({ profileId });
        if (redirectUrl) params.set('redirect_url', redirectUrl);
        if (headless) params.set('headless', 'true');
        return this.get(`/connect/${platform}?${params.toString()}`);
    }

    async connectBlueskyCredentials(data: {
        profileId: string;
        handle: string;
        appPassword: string;
    }): Promise<any> {
        return this.post('/connect/bluesky/credentials', data);
    }

    async disconnectAccount(accountId: string): Promise<any> {
        return this.delete(`/accounts/${accountId}`);
    }

    async checkAccountHealth(): Promise<any> {
        return this.get('/accounts/health');
    }

    // ── Profiles ───────────────────────────────────────────────────────────

    async listProfiles(): Promise<any> {
        return this.get('/profiles');
    }

    async createProfile(name: string, description?: string): Promise<any> {
        return this.post('/profiles', { name, description });
    }

    async updateProfile(
        profileId: string,
        data: { name?: string; description?: string; color?: string },
    ): Promise<any> {
        return this.put(`/profiles/${profileId}`, data);
    }

    async deleteProfile(profileId: string): Promise<any> {
        return this.delete(`/profiles/${profileId}`);
    }

    async getProfile(profileId: string): Promise<any> {
        return this.get(`/profiles/${profileId}`);
    }

    // ── Analytics ──────────────────────────────────────────────────────────

    async getAnalytics(filters?: {
        profileId?: string;
        platform?: string;
        fromDate?: string;
        toDate?: string;
        limit?: number;
        page?: number;
    }): Promise<any> {
        const params = new URLSearchParams();
        if (filters?.profileId) params.set('profileId', filters.profileId);
        if (filters?.platform) params.set('platform', filters.platform);
        if (filters?.fromDate) params.set('fromDate', filters.fromDate);
        if (filters?.toDate) params.set('toDate', filters.toDate);
        if (filters?.limit) params.set('limit', String(filters.limit));
        if (filters?.page) params.set('page', String(filters.page));
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.get(`/analytics${query}`);
    }

    async getFacebookPageInsights(
        accountId: string,
        filters?: { fromDate?: string; toDate?: string; pageId?: string },
    ): Promise<any> {
        const params = new URLSearchParams({ accountId });
        if (filters?.fromDate) params.set('fromDate', filters.fromDate);
        if (filters?.toDate) params.set('toDate', filters.toDate);
        if (filters?.pageId) params.set('pageId', filters.pageId);
        return this.get(
            `/analytics/facebook-page-insights?${params.toString()}`,
        );
    }

    // ── Queue ──────────────────────────────────────────────────────────────

    async listQueueSlots(filters?: {
        profileId?: string;
        queueId?: string;
    }): Promise<any> {
        const params = new URLSearchParams();
        if (filters?.profileId) params.set('profileId', filters.profileId);
        if (filters?.queueId) params.set('queueId', filters.queueId);
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.get(`/queue/slots${query}`);
    }

    async setQueueSlots(data: {
        profileId: string;
        slots: { day: string; time: string }[];
        timezone: string;
        queueId?: string;
    }): Promise<any> {
        const dayToNum: Record<string, number> = {
            SUN: 0,
            MON: 1,
            TUE: 2,
            WED: 3,
            THU: 4,
            FRI: 5,
            SAT: 6,
        };
        const apiSlots = data.slots.map((s) => ({
            dayOfWeek: dayToNum[s.day.toUpperCase()] ?? 0,
            time: s.time,
        }));
        return this.put('/queue/slots', { ...data, slots: apiSlots });
    }

    async getNextQueueSlot(filters?: {
        profileId?: string;
        queueId?: string;
    }): Promise<any> {
        const params = new URLSearchParams();
        if (filters?.profileId) params.set('profileId', filters.profileId);
        if (filters?.queueId) params.set('queueId', filters.queueId);
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.get(`/queue/next-slot${query}`);
    }

    async previewQueueSlots(filters?: {
        profileId?: string;
        count?: number;
        queueId?: string;
    }): Promise<any> {
        const params = new URLSearchParams();
        if (filters?.profileId) params.set('profileId', filters.profileId);
        if (filters?.count) params.set('count', String(filters.count));
        if (filters?.queueId) params.set('queueId', filters.queueId);
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.get(`/queue/preview${query}`);
    }

    // ── Inbox ──────────────────────────────────────────────────────────────

    async listConversations(filters?: {
        profileId?: string;
        platform?: string;
        status?: string;
        limit?: number;
    }): Promise<any> {
        const params = new URLSearchParams();
        if (filters?.profileId) params.set('profileId', filters.profileId);
        if (filters?.platform) params.set('platform', filters.platform);
        if (filters?.status) params.set('status', filters.status);
        if (filters?.limit) params.set('limit', String(filters.limit));
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.get(`/inbox/conversations${query}`);
    }

    async getMessages(conversationId: string, accountId: string): Promise<any> {
        return this.get(
            `/inbox/conversations/${conversationId}/messages?accountId=${accountId}`,
        );
    }

    async sendMessage(
        conversationId: string,
        accountId: string,
        message: string,
        attachmentUrl?: string,
    ): Promise<any> {
        return this.post(`/inbox/conversations/${conversationId}/messages`, {
            accountId,
            message,
            ...(attachmentUrl ? { attachmentUrl } : {}),
        });
    }

    // ── Comments ───────────────────────────────────────────────────────────

    async listComments(filters: {
        accountId: string;
        postId?: string;
        limit?: number;
        page?: string;
    }): Promise<any> {
        const params = new URLSearchParams({ accountId: filters.accountId });
        if (filters.postId) params.set('postId', filters.postId);
        if (filters.limit) params.set('limit', String(filters.limit));
        if (filters.page) params.set('page', filters.page);
        return this.get(`/comments?${params.toString()}`);
    }

    async replyToComment(commentId: string, text: string): Promise<any> {
        return this.post(`/comments/${commentId}/reply`, { text });
    }

    async deleteComment(commentId: string): Promise<any> {
        return this.delete(`/comments/${commentId}`);
    }

    async updateCommentStatus(
        commentId: string,
        action: 'like' | 'unlike' | 'hide' | 'unhide',
    ): Promise<any> {
        return this.put(`/comments/${commentId}/${action}`);
    }

    // ── Reviews ────────────────────────────────────────────────────────────

    async listReviews(filters: {
        accountId: string;
        limit?: number;
        page?: string;
    }): Promise<any> {
        const params = new URLSearchParams({ accountId: filters.accountId });
        if (filters.limit) params.set('limit', String(filters.limit));
        if (filters.page) params.set('page', filters.page);
        return this.get(`/reviews?${params.toString()}`);
    }

    async replyToReview(reviewId: string, text: string): Promise<any> {
        return this.post(`/reviews/${reviewId}/reply`, { text });
    }

    async getUsageStats(): Promise<any> {
        return this.get('/usage-stats');
    }

    // ── Twitter ────────────────────────────────────────────────────────────

    async retweetPost(accountId: string, tweetId: string): Promise<any> {
        return this.post('/twitter/retweet', { accountId, tweetId });
    }

    async undoRetweet(accountId: string, tweetId: string): Promise<any> {
        return this.delete('/twitter/retweet', { accountId, tweetId });
    }

    async bookmarkTweet(accountId: string, tweetId: string): Promise<any> {
        return this.post('/twitter/bookmark', { accountId, tweetId });
    }

    async removeBookmark(accountId: string, tweetId: string): Promise<any> {
        return this.delete('/twitter/bookmark', { accountId, tweetId });
    }

    async followUser(accountId: string, targetUserId: string): Promise<any> {
        return this.post('/twitter/follow', { accountId, targetUserId });
    }

    async unfollowUser(accountId: string, targetUserId: string): Promise<any> {
        return this.delete('/twitter/follow', { accountId, targetUserId });
    }

    // ── Media ──────────────────────────────────────────────────────────────

    async getUploadUrl(
        fileName: string,
        fileType: string,
        fileSize?: number,
    ): Promise<any> {
        const { S3Client, PutObjectCommand } =
            await import('@aws-sdk/client-s3');
        const { randomUUID } = await import('crypto');

        const region = process.env.S3_REGION || 'blr1';
        const bucket = process.env.S3_BUCKET || 'onlyhurs';
        const cdnUrl =
            process.env.S3_CDN_URL ||
            `https://${bucket}.${region}.digitaloceanspaces.com`;
        const endpoint =
            process.env.S3_ENDPOINT ||
            `https://${region}.digitaloceanspaces.com`;

        const ext = fileType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin';
        const key = `media/${randomUUID()}.${ext}`;

        // Return a fake "uploadUrl" that the MCP tool will show as a curl command.
        // The actual upload happens via uploadMediaFromBase64 for server-side flows.
        // For CLI direct uploads, we return a presigned PUT URL from our own bucket.
        const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
        const s3 = new S3Client({
            endpoint,
            region,
            credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY_ID!,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
            },
            forcePathStyle: false,
        });

        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: fileType,
            ACL: 'public-read' as any,
        });

        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        const publicUrl = `${cdnUrl}/${key}`;

        return {
            uploadUrl,
            publicUrl,
            key,
            type: fileType.startsWith('video') ? 'video' : 'image',
        };
    }

    /**
     * Full server-side upload to our DigitalOcean Spaces bucket.
     */
    async uploadMediaFromBase64(
        base64Data: string,
        fileType: string,
        fileName: string,
    ): Promise<{ publicUrl: string; type: string }> {
        const { S3Client, PutObjectCommand } =
            await import('@aws-sdk/client-s3');
        const { randomUUID } = await import('crypto');

        const region = process.env.S3_REGION || 'blr1';
        const bucket = process.env.S3_BUCKET || 'onlyhurs';
        const cdnUrl =
            process.env.S3_CDN_URL ||
            `https://${bucket}.${region}.digitaloceanspaces.com`;
        const endpoint =
            process.env.S3_ENDPOINT ||
            `https://${region}.digitaloceanspaces.com`;

        const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
        const fileBuffer = Buffer.from(cleanBase64, 'base64');
        const ext = fileType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin';
        const key = `media/${randomUUID()}.${ext}`;

        const s3 = new S3Client({
            endpoint,
            region,
            credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY_ID!,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
            },
            forcePathStyle: false,
        });

        await s3.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: fileBuffer,
                ContentType: fileType,
                ACL: 'public-read' as any,
            }),
        );

        return {
            publicUrl: `${cdnUrl}/${key}`,
            type: fileType.startsWith('video') ? 'video' : 'image',
        };
    }

    // ── Broadcasts ─────────────────────────────────────────────────────────

    async listBroadcasts(profileId?: string): Promise<any> {
        const query = profileId ? `?profileId=${profileId}` : '';
        return this.get(`/broadcasts${query}`);
    }

    async createBroadcast(data: {
        profileId: string;
        accountId: string;
        platform: string;
        name: string;
        message?: string;
        template?: { name: string; language: string };
    }): Promise<any> {
        return this.post('/broadcasts', data);
    }

    async sendBroadcast(broadcastId: string): Promise<any> {
        return this.post(`/broadcasts/${broadcastId}/send`);
    }
}
