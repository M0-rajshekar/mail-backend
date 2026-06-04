import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

/**
 * WebSocket Gateway for real-time email updates
 *
 * Events:
 * - subscribe:inbox { inboxId } -> Subscribe to inbox updates
 * - unsubscribe:inbox { inboxId } -> Unsubscribe from inbox updates
 *
 * Server emits:
 * - email:received { email } -> New email received
 * - email:sent { email } -> Email sent confirmation
 * - inbox:updated { inbox } -> Inbox stats updated
 */

@WebSocketGateway({
    cors: {
        origin: '*',
    },
    namespace: '/ws/email',
})
export class EmailGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(EmailGateway.name);
    private userSockets = new Map<string, Set<string>>(); // userId -> socketIds
    private socketUsers = new Map<string, string>(); // socketId -> userId
    private inboxSubscriptions = new Map<string, Set<string>>(); // inboxId -> socketIds

    handleConnection(client: Socket) {
        this.logger.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);

        // Clean up subscriptions
        const userId = this.socketUsers.get(client.id);
        if (userId) {
            this.userSockets.get(userId)?.delete(client.id);
            this.socketUsers.delete(client.id);
        }

        // Remove from all inbox subscriptions
        this.inboxSubscriptions.forEach((sockets, inboxId) => {
            sockets.delete(client.id);
            if (sockets.size === 0) {
                this.inboxSubscriptions.delete(inboxId);
            }
        });
    }

    @SubscribeMessage('auth')
    async handleAuth(
        @MessageBody() data: { apiKey: string },
        @ConnectedSocket() client: Socket,
    ) {
        try {
            // Simple auth - in production validate against ApiKeyValidationService
            // For now, accept any connection (real auth would check the key)
            client.emit('auth:success', { message: 'Authenticated' });
        } catch (error) {
            client.emit('auth:error', { message: 'Authentication failed' });
            client.disconnect();
        }
    }

    @SubscribeMessage('subscribe:inbox')
    handleSubscribeInbox(
        @MessageBody() data: { inboxId: string },
        @ConnectedSocket() client: Socket,
    ) {
        const { inboxId } = data;

        if (!this.inboxSubscriptions.has(inboxId)) {
            this.inboxSubscriptions.set(inboxId, new Set());
        }
        this.inboxSubscriptions.get(inboxId)!.add(client.id);

        client.emit('subscribed', {
            inboxId,
            message: `Subscribed to inbox ${inboxId}`,
        });
        this.logger.debug(`Socket ${client.id} subscribed to inbox ${inboxId}`);
    }

    @SubscribeMessage('unsubscribe:inbox')
    handleUnsubscribeInbox(
        @MessageBody() data: { inboxId: string },
        @ConnectedSocket() client: Socket,
    ) {
        const { inboxId } = data;
        this.inboxSubscriptions.get(inboxId)?.delete(client.id);
        client.emit('unsubscribed', { inboxId });
    }

    @SubscribeMessage('subscribe:user')
    handleSubscribeUser(
        @MessageBody() data: { userId: string },
        @ConnectedSocket() client: Socket,
    ) {
        const { userId } = data;

        if (!this.userSockets.has(userId)) {
            this.userSockets.set(userId, new Set());
        }
        this.userSockets.get(userId)!.add(client.id);
        this.socketUsers.set(client.id, userId);

        client.emit('subscribed', {
            userId,
            message: `Subscribed to user updates`,
        });
    }

    /**
     * Emit email received event to subscribers
     */
    emitEmailReceived(inboxId: string, email: any) {
        const sockets = this.inboxSubscriptions.get(inboxId);
        if (sockets) {
            sockets.forEach((socketId) => {
                this.server
                    .to(socketId)
                    .emit('email:received', { inboxId, email });
            });
        }
    }

    /**
     * Emit email sent event
     */
    emitEmailSent(userId: string, email: any) {
        const sockets = this.userSockets.get(userId);
        if (sockets) {
            sockets.forEach((socketId) => {
                this.server.to(socketId).emit('email:sent', { email });
            });
        }
    }

    /**
     * Emit inbox stats update
     */
    emitInboxUpdate(inboxId: string, stats: any) {
        const sockets = this.inboxSubscriptions.get(inboxId);
        if (sockets) {
            sockets.forEach((socketId) => {
                this.server
                    .to(socketId)
                    .emit('inbox:updated', { inboxId, stats });
            });
        }
    }
}
