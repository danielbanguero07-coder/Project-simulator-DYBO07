import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsResponse,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { RedisService } from '../../shared/services/redis.service';
import { SimulationService } from '../simulation/simulation.service';
import {
  WSClientEvent,
  WSServerEvent,
  JoinWorldPayloadDto,
  ActionPayloadDto,
  ActionAckPayloadDto,
  StateDeltaPayloadDto,
  ChatMessagePayloadDto,
  NotificationPayloadDto,
} from './dto/gateway.dto';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  worldId?: string;
  sessionId?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*', // Configure properly in production
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 10 * 1024 * 1024,
  transports: ['websocket', 'polling'],
})
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameGateway.name);
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set<socketId>
  private worldSubscriptionReady = false;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private redis: RedisService,
    private simulation: SimulationService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('🔌 WebSocket Gateway initialized');

    // Setup Redis adapter for horizontal scaling
    const pubClient = this.redis.getPubClient();
    const subClient = this.redis.getSubClient();

    // Note: In production, use @socket.io/redis-adapter
    // server.adapter(createAdapter(pubClient, subClient));

    // Redis may not be connected yet at this point (gateway `afterInit` runs
    // before provider `onModuleInit`), so the world-state subscription is
    // established lazily on the first `join_world`.
  }

  private async ensureWorldUpdatesSubscription() {
    if (this.worldSubscriptionReady) return;

    try {
      // The simulation publishes deltas to `world:<id>:state` through Redis.
      // Forward them to every socket in the corresponding `world:<id>` room.
      await this.redis.psubscribe('world:*:state', (delta, channel) => {
        const worldId = channel.replace(/^world:/, '').replace(/:state$/, '');
        this.broadcastStateDelta(worldId, delta as any);
      });
      this.worldSubscriptionReady = true;
      this.logger.log('🎧 Subscribed to world state updates');
    } catch (error) {
      this.logger.error(`Failed to subscribe to world updates: ${(error as Error).message}`);
    }
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Authenticate via token in handshake auth or cookie
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '') ||
        (client.handshake.headers as any)?.cookie?.match(/access_token=([^;]+)/)?.[1] ||
        undefined;

      if (!token) {
        this.logger.warn(`Connection rejected: no token - ${client.id}`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      client.userId = payload.userId;
      client.username = payload.username;
      client.sessionId = payload.jti;

      // Track user sockets
      if (!this.userSockets.has(client.userId)) {
        this.userSockets.set(client.userId, new Set());
      }
      this.userSockets.get(client.userId)!.add(client.id);

      // Store session in Redis
      await this.redis.setSession(
        `ws:${client.sessionId}`,
        { userId: client.userId, socketId: client.id, connectedAt: Date.now() },
        86400,
      );

      this.logger.log(`🔌 Client connected: ${client.id} (user: ${client.userId})`);

      // Send welcome message
      client.emit(WSServerEvent.WELCOME, {
        socketId: client.id,
        serverTime: Date.now(),
        userId: client.userId,
      });
    } catch (error) {
      this.logger.warn(`Connection rejected: invalid token - ${client.id}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    // Leave world if joined
    if (client.worldId && client.userId) {
      await this.simulation.removePlayerFromWorld(client.userId, client.worldId);
      this.server.to(`world:${client.worldId}`).emit(WSServerEvent.PLAYER_LEFT, {
        userId: client.userId,
        username: client.username,
      });
    }

    // Clean up tracking
    if (client.userId) {
      const sockets = this.userSockets.get(client.userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(client.userId);
        }
      }
    }

    if (client.sessionId) {
      await this.redis.deleteSession(`ws:${client.sessionId}`);
    }

    this.logger.log(`🔌 Client disconnected: ${client.id} (user: ${client.userId})`);
  }

  @SubscribeMessage(WSClientEvent.JOIN_WORLD)
  async handleJoinWorld(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: JoinWorldPayloadDto,
  ): Promise<WsResponse<any>> {
    if (!client.userId) {
      return { event: WSServerEvent.ERROR, data: { message: 'Not authenticated' } };
    }

    try {
      // Make sure state deltas are forwarded before this client joins.
      await this.ensureWorldUpdatesSubscription();

      // Leave current world if any
      if (client.worldId) {
        await this.simulation.removePlayerFromWorld(client.userId, client.worldId);
        client.leave(`world:${client.worldId}`);
        this.server.to(`world:${client.worldId}`).emit(WSServerEvent.PLAYER_LEFT, {
          userId: client.userId,
          username: client.username,
        });
      }

      // Join new world
      await this.simulation.addPlayerToWorld(client.userId, payload.worldId);
      client.worldId = payload.worldId;
      client.join(`world:${payload.worldId}`);

      // Get initial world state
      const worldState = await this.simulation.getWorldState(payload.worldId);

      // Notify others
      client.to(`world:${payload.worldId}`).emit(WSServerEvent.PLAYER_JOINED, {
        userId: client.userId,
        username: client.username,
      });

      this.logger.log(`User ${client.userId} joined world ${payload.worldId}`);

      return {
        event: WSServerEvent.WORLD_STATE,
        data: worldState,
      };
    } catch (error) {
      this.logger.error(`Failed to join world: ${error.message}`);
      return {
        event: WSServerEvent.ERROR,
        data: { message: 'Failed to join world' },
      };
    }
  }

  @SubscribeMessage(WSClientEvent.LEAVE_WORLD)
  async handleLeaveWorld(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<WsResponse<any>> {
    if (!client.userId || !client.worldId) {
      return { event: WSServerEvent.ERROR, data: { message: 'Not in a world' } };
    }

    await this.simulation.removePlayerFromWorld(client.userId, client.worldId);
    client.leave(`world:${client.worldId}`);

    this.server.to(`world:${client.worldId}`).emit(WSServerEvent.PLAYER_LEFT, {
      userId: client.userId,
      username: client.username,
    });

    client.worldId = undefined;

    return { event: WSServerEvent.NOTIFICATION, data: { message: 'Left world' } };
  }

  @SubscribeMessage(WSClientEvent.ACTION)
  async handleAction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ActionPayloadDto,
  ): Promise<WsResponse<ActionAckPayloadDto>> {
    if (!client.userId || !client.worldId) {
      return {
        event: WSServerEvent.ACTION_REJECTED,
        data: { actionId: payload.actionId, serverTick: 0, success: false, error: 'Not in a world' },
      };
    }

    // Queue action for simulation processing
    await this.simulation.queueAction(client.userId, client.worldId, {
      type: payload.type,
      clientTick: payload.clientTick,
      ...payload.data,
    });

    // Get current server tick (approximate)
    const worldState = await this.simulation.getWorldState(client.worldId);

    return {
      event: WSServerEvent.ACTION_ACK,
      data: {
        actionId: payload.actionId,
        serverTick: worldState?.tick || 0,
        success: true,
      },
    };
  }

  @SubscribeMessage(WSClientEvent.ACTION_BATCH)
  async handleActionBatch(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { actions: ActionPayloadDto[] },
  ): Promise<WsResponse<ActionAckPayloadDto[]>> {
    if (!client.userId || !client.worldId) {
      return {
        event: WSServerEvent.ACTION_REJECTED,
        data: [{ actionId: 'batch', serverTick: 0, success: false, error: 'Not in a world' }],
      };
    }

    const acks: ActionAckPayloadDto[] = [];
    const worldState = await this.simulation.getWorldState(client.worldId);

    for (const action of payload.actions) {
      await this.simulation.queueAction(client.userId, client.worldId, {
        type: action.type,
        clientTick: action.clientTick,
        ...action.data,
      });

      acks.push({
        actionId: action.actionId,
        serverTick: worldState?.tick || 0,
        success: true,
      });
    }

    return { event: WSServerEvent.ACTION_ACK, data: acks };
  }

  @SubscribeMessage(WSClientEvent.PING)
  handlePing(@ConnectedSocket() client: AuthenticatedSocket): WsResponse<any> {
    return { event: WSServerEvent.PONG, data: { serverTime: Date.now() } };
  }

  @SubscribeMessage(WSClientEvent.SYNC_REQUEST)
  async handleSyncRequest(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<WsResponse<any>> {
    if (!client.userId || !client.worldId) {
      return { event: WSServerEvent.ERROR, data: { message: 'Not in a world' } };
    }

    const worldState = await this.simulation.getWorldState(client.worldId);
    return {
      event: WSServerEvent.SYNC_RESPONSE,
      data: worldState,
    };
  }

  @SubscribeMessage(WSClientEvent.CHAT_MESSAGE)
  async handleChatMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatMessagePayloadDto,
  ): Promise<WsResponse<any>> {
    if (!client.userId) {
      return { event: WSServerEvent.ERROR, data: { message: 'Not authenticated' } };
    }

    // Broadcast to channel
    const messageData = {
      userId: client.userId,
      username: client.username,
      channel: payload.channel,
      message: payload.message,
      timestamp: Date.now(),
    };

    if (payload.targetUserId) {
      // Private message
      const targetSockets = this.userSockets.get(payload.targetUserId);
      if (targetSockets) {
        for (const socketId of targetSockets) {
          this.server.to(socketId).emit(WSServerEvent.CHAT_MESSAGE, messageData);
        }
      }
      // Also send to sender
      client.emit(WSServerEvent.CHAT_MESSAGE, messageData);
    } else if (client.worldId) {
      // World chat
      this.server.to(`world:${client.worldId}`).emit(WSServerEvent.CHAT_MESSAGE, messageData);
    }

    return { event: WSServerEvent.NOTIFICATION, data: { message: 'Sent' } };
  }

  // Server-side broadcast methods
  broadcastStateDelta(worldId: string, delta: StateDeltaPayloadDto) {
    this.server.to(`world:${worldId}`).emit(WSServerEvent.STATE_DELTA, delta);
  }

  broadcastToUser(userId: string, event: string, data: any) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      for (const socketId of sockets) {
        this.server.to(socketId).emit(event, data);
      }
    }
  }

  broadcastNotification(userId: string, notification: NotificationPayloadDto) {
    this.broadcastToUser(userId, WSServerEvent.NOTIFICATION, notification);
  }

  getConnectedUsers(): string[] {
    return Array.from(this.userSockets.keys());
  }

  getUserSocketCount(userId: string): number {
    return this.userSockets.get(userId)?.size || 0;
  }
}