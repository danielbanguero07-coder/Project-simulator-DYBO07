import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { RedisService } from '../../shared/services/redis.service';
import { UpdatePlayerDto, PlayerResponseDto, PlayerStatsDto } from './dto/player.dto';

@Injectable()
export class PlayerService {
  private readonly logger = new Logger(PlayerService.name);
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getProfile(userId: string): Promise<PlayerResponseDto> {
    // Try cache first
    const cached = await this.redis.getCache<PlayerResponseDto>(`player:profile:${userId}`);
    if (cached) return cached;

    const player = await this.prisma.player.findUnique({
      where: { userId },
      include: {
        user: {
          select: { username: true, email: true },
        },
      },
    });

    if (!player) {
      throw new NotFoundException('Player profile not found');
    }

    const response = this.mapToResponse(player);
    await this.redis.setCache(`player:profile:${userId}`, response, this.CACHE_TTL);
    return response;
  }

  async updateProfile(userId: string, dto: UpdatePlayerDto): Promise<PlayerResponseDto> {
    const player = await this.prisma.player.update({
      where: { userId },
      data: {
        displayName: dto.displayName,
        avatarUrl: dto.avatarUrl,
        bio: dto.bio,
      },
      include: {
        user: { select: { username: true, email: true } },
      },
    });

    // Invalidate cache
    await this.redis.deleteCache(`player:profile:${userId}`);

    this.logger.log(`Player profile updated: ${userId}`);
    return this.mapToResponse(player);
  }

  async getStats(userId: string): Promise<PlayerStatsDto> {
    const cached = await this.redis.getCache<PlayerStatsDto>(`player:stats:${userId}`);
    if (cached) return cached;

    const player = await this.prisma.player.findUnique({
      where: { userId },
      select: {
        totalPlayTime: true,
        buildingsBuilt: true,
        resourcesCollected: true,
        tradesCompleted: true,
        clanId: true,
      },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    // Get leaderboard rank
    const rank = await this.redis.getRank('global:xp', userId);

    const stats: PlayerStatsDto = {
      totalPlayTime: player.totalPlayTime,
      buildingsBuilt: player.buildingsBuilt,
      resourcesCollected: Number(player.resourcesCollected),
      tradesCompleted: player.tradesCompleted,
      clanId: player.clanId,
      rank: rank || null,
    };

    await this.redis.setCache(`player:stats:${userId}`, stats, this.CACHE_TTL);
    return stats;
  }

  async addExperience(userId: string, amount: number): Promise<{ levelUp: boolean; newLevel: number }> {
    return this.prisma.withTransaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { userId } });
      if (!player) throw new NotFoundException('Player not found');

      const newExp = Number(player.experience) + amount;
      let newLevel = player.level;
      let levelUp = false;

      // Calculate level (simple formula: level = floor(sqrt(exp / 100)))
      while (true) {
        const expForNextLevel = this.getExpForLevel(newLevel + 1);
        if (newExp >= expForNextLevel) {
          newLevel++;
          levelUp = true;
        } else {
          break;
        }
      }

      await tx.player.update({
        where: { userId },
        data: {
          experience: newExp,
          level: newLevel,
        },
      });

      // Update leaderboard
      await this.redis.addToLeaderboard('global:xp', userId, newExp);

      // Invalidate cache
      await this.redis.deleteCache(`player:profile:${userId}`);
      await this.redis.deleteCache(`player:stats:${userId}`);

      return { levelUp, newLevel };
    });
  }

  async addGold(userId: string, amount: number): Promise<number> {
    const player = await this.prisma.player.update({
      where: { userId },
      data: { gold: { increment: amount } },
      select: { gold: true },
    });

    await this.redis.deleteCache(`player:profile:${userId}`);
    return Number(player.gold);
  }

  async spendGold(userId: string, amount: number): Promise<boolean> {
    const player = await this.prisma.player.findUnique({
      where: { userId },
      select: { gold: true },
    });

    if (!player || player.gold < amount) {
      return false;
    }

    await this.prisma.player.update({
      where: { userId },
      data: { gold: { decrement: amount } },
    });

    await this.redis.deleteCache(`player:profile:${userId}`);
    return true;
  }

  async incrementStat(userId: string, stat: 'buildingsBuilt' | 'resourcesCollected' | 'tradesCompleted'): Promise<void> {
    await this.prisma.player.update({
      where: { userId },
      data: { [stat]: { increment: 1 } },
    });

    await this.redis.deleteCache(`player:stats:${userId}`);
  }

  async updatePlayTime(userId: string, seconds: number): Promise<void> {
    await this.prisma.player.update({
      where: { userId },
      data: { totalPlayTime: { increment: seconds } },
    });
  }

  private getExpForLevel(level: number): number {
    // Exponential curve: 100 * level^2
    return 100 * level * level;
  }

  private mapToResponse(player: any): PlayerResponseDto {
    const expForNextLevel = this.getExpForLevel(player.level + 1);
    return {
      id: player.id,
      userId: player.userId,
      displayName: player.displayName,
      username: player.user.username,
      avatarUrl: player.avatarUrl,
      bio: player.bio,
      level: player.level,
      experience: Number(player.experience),
      experienceToNextLevel: expForNextLevel - Number(player.experience),
      gold: Number(player.gold),
      premiumCurrency: Number(player.premiumCurrency),
      createdAt: player.createdAt,
      updatedAt: player.updatedAt,
    };
  }
}