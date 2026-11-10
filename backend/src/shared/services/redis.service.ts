import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private pubClient: Redis;
  private subClient: Redis;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisConfig = this.configService.get('redis') || {};
    const url = redisConfig.url || process.env.REDIS_URL || 'redis://localhost:6379';

    const baseOptions: any = {
      maxRetriesPerRequest: redisConfig.maxRetriesPerRequest ?? 3,
      enableReadyCheck: redisConfig.enableReadyCheck ?? true,
      lazyConnect: redisConfig.lazyConnect ?? false,
      family: redisConfig.family ?? 4,
      connectTimeout: 5000,
      retryStrategy: (times) => {
        if (times > 10) {
          this.logger.error('Redis max retries reached');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    };

    // Main client (ioredis for BullMQ compatibility)
    this.client = new Redis(url, { ...baseOptions, connectionName: 'backend-main' });
    this.client.on('connect', () => this.logger.log('🔴 Redis (ioredis) connected'));
    this.client.on('error', (err) => this.logger.error(`Redis (ioredis) error: ${err.message}`));
    this.client.on('close', () => this.logger.warn('Redis (ioredis) connection closed'));

    // Dedicated connections for pub/sub (a subscribed connection cannot be
    // reused for regular commands). ioredis works with older Redis servers
    // where node-redis' HELLO handshake would fail.
    this.pubClient = this.client.duplicate({ connectionName: 'backend-pub' });
    this.subClient = this.client.duplicate({ connectionName: 'backend-sub' });
    this.pubClient.on('error', (err) => this.logger.error(`Redis Pub error: ${err.message}`));
    this.subClient.on('error', (err) => this.logger.error(`Redis Sub error: ${err.message}`));

    try {
      await this.client.ping();
      await Promise.all([this.pubClient.ping(), this.subClient.ping()]);
      this.logger.log('🔴 Redis Pub/Sub clients connected');
    } catch (error) {
      // Redis is optional for basic HTTP/health operation; do not block startup.
      this.logger.error(`Redis unavailable: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await Promise.allSettled([
      this.client?.quit(),
      this.pubClient?.quit(),
      this.subClient?.quit(),
    ]);
    this.logger.log('🔴 Redis connections closed');
  }

  // Main client getters
  getClient(): Redis {
    return this.client;
  }

  getPubClient(): Redis {
    return this.pubClient;
  }

  getSubClient(): Redis {
    return this.subClient;
  }

  // Session management
  async setSession(sessionId: string, data: any, ttlSeconds: number = 86400): Promise<void> {
    await this.client.setex(`session:${sessionId}`, ttlSeconds, JSON.stringify(data));
  }

  async getSession<T>(sessionId: string): Promise<T | null> {
    const data = await this.client.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.client.del(`session:${sessionId}`);
  }

  async extendSession(sessionId: string, ttlSeconds: number = 86400): Promise<void> {
    await this.client.expire(`session:${sessionId}`, ttlSeconds);
  }

  // Cache helpers
  async setCache<T>(key: string, value: T, ttlSeconds: number = 3600): Promise<void> {
    await this.client.setex(`cache:${key}`, ttlSeconds, JSON.stringify(value));
  }

  async getCache<T>(key: string): Promise<T | null> {
    const data = await this.client.get(`cache:${key}`);
    return data ? JSON.parse(data) : null;
  }

  async deleteCache(key: string): Promise<void> {
    await this.client.del(`cache:${key}`);
  }

  async deleteCachePattern(pattern: string): Promise<void> {
    const keys = await this.client.keys(`cache:${pattern}*`);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  // Rate limiting
  async incrementRateLimit(key: string, windowSeconds: number): Promise<number> {
    const current = await this.client.incr(`ratelimit:${key}`);
    if (current === 1) {
      await this.client.expire(`ratelimit:${key}`, windowSeconds);
    }
    return current;
  }

  // Leaderboards (Sorted Sets)
  async addToLeaderboard(leaderboard: string, member: string, score: number): Promise<void> {
    await this.client.zadd(`leaderboard:${leaderboard}`, score, member);
  }

  async getLeaderboard(
    leaderboard: string,
    start: number,
    end: number,
  ): Promise<Array<{ member: string; score: number }>> {
    const results = await this.client.zrevrange(
      `leaderboard:${leaderboard}`,
      start,
      end,
      'WITHSCORES',
    );
    const leaderboardData = [];
    for (let i = 0; i < results.length; i += 2) {
      leaderboardData.push({
        member: results[i],
        score: parseFloat(results[i + 1]),
      });
    }
    return leaderboardData;
  }

  async getRank(leaderboard: string, member: string): Promise<number | null> {
    const rank = await this.client.zrevrank(`leaderboard:${leaderboard}`, member);
    return rank !== null ? rank + 1 : null;
  }

  // Pub/Sub
  async publish(channel: string, message: any): Promise<void> {
    await this.pubClient.publish(channel, JSON.stringify(message));
  }

  async subscribe(channel: string, handler: (message: any) => void): Promise<void> {
    this.subClient.on('message', (incomingChannel, message) => {
      if (incomingChannel !== channel) return;
      try {
        handler(JSON.parse(message));
      } catch (error) {
        this.logger.error(`Failed to parse message on ${channel}:`, error);
      }
    });
    await this.subClient.subscribe(channel);
  }

  // Pattern subscription (e.g. `world:*:state`). The handler receives the
  // parsed payload plus the concrete channel it arrived on.
  async psubscribe(
    pattern: string,
    handler: (message: any, channel: string) => void,
  ): Promise<void> {
    this.subClient.on('pmessage', (incomingPattern, channel, message) => {
      if (incomingPattern !== pattern) return;
      try {
        handler(JSON.parse(message), channel);
      } catch (error) {
        this.logger.error(`Failed to parse message on ${channel}:`, error);
      }
    });
    await this.subClient.psubscribe(pattern);
  }

  // Distributed locking
  async acquireLock(lockName: string, ttlMs: number = 10000): Promise<boolean> {
    const result = await this.client.set(`lock:${lockName}`, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async releaseLock(lockName: string): Promise<void> {
    await this.client.del(`lock:${lockName}`);
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}