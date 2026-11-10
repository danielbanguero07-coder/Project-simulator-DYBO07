import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { RedisService } from '../../shared/services/redis.service';
import {
  CreateClanDto,
  UpdateClanDto,
  ClanInviteDto,
  ClanResponseDto,
  ClanMemberDto,
  FriendRequestDto,
  FriendResponseDto,
  ClanRole,
  ClanInviteStatus,
} from './dto/social.dto';

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // Clan management
  async createClan(userId: string, dto: CreateClanDto): Promise<ClanResponseDto> {
    // Check if user is already in a clan
    const existingMembership = await this.prisma.clanMember.findUnique({
      where: { userId },
    });

    if (existingMembership) {
      throw new ConflictException('You are already in a clan');
    }

    // Check name/tag uniqueness
    const existingClan = await this.prisma.clan.findFirst({
      where: { OR: [{ name: dto.name }, { tag: dto.tag }] },
    });

    if (existingClan) {
      throw new ConflictException('Clan name or tag already taken');
    }

    return this.prisma.withTransaction(async (tx) => {
      const clan = await tx.clan.create({
        data: {
          name: dto.name,
          tag: dto.tag.toUpperCase(),
          description: dto.description,
          isPublic: dto.isPublic ?? true,
          leaderId: userId,
          level: 1,
          experience: 0,
        },
      });

      await tx.clanMember.create({
        data: {
          clanId: clan.id,
          userId,
          role: ClanRole.LEADER,
        },
      });

      // Update player clanId
      await tx.player.update({
        where: { userId },
        data: { clanId: clan.id },
      });

      this.logger.log(`Clan created: ${clan.name} [${clan.tag}] by ${userId}`);
      return this.mapClanToResponse(clan, 1);
    });
  }

  async getClan(clanId: string): Promise<ClanResponseDto | null> {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      include: {
        _count: { select: { members: true } },
      },
    });

    if (!clan) return null;
    return this.mapClanToResponse(clan, clan._count.members);
  }

  async getMyClan(userId: string): Promise<ClanResponseDto | null> {
    const membership = await this.prisma.clanMember.findUnique({
      where: { userId },
      include: { clan: { include: { _count: { select: { members: true } } } } },
    });

    if (!membership) return null;
    return this.mapClanToResponse(membership.clan, membership.clan._count.members);
  }

  async updateClan(userId: string, dto: UpdateClanDto): Promise<ClanResponseDto> {
    const membership = await this.prisma.clanMember.findUnique({
      where: { userId },
      include: { clan: true },
    });

    if (!membership) throw new NotFoundException('Not in a clan');
    if (membership.role !== ClanRole.LEADER && membership.role !== ClanRole.OFFICER) {
      throw new BadRequestException('Insufficient permissions');
    }

    const clan = await this.prisma.clan.update({
      where: { id: membership.clanId },
      data: {
        description: dto.description,
        isPublic: dto.isPublic,
        bannerUrl: dto.bannerUrl,
      },
      include: { _count: { select: { members: true } } },
    });

    return this.mapClanToResponse(clan, clan._count.members);
  }

  async disbandClan(userId: string): Promise<void> {
    const membership = await this.prisma.clanMember.findUnique({
      where: { userId },
      include: { clan: true },
    });

    if (!membership) throw new NotFoundException('Not in a clan');
    if (membership.role !== ClanRole.LEADER) {
      throw new BadRequestException('Only leader can disband clan');
    }

    await this.prisma.withTransaction(async (tx) => {
      // Remove clanId from all members
      await tx.player.updateMany({
        where: { clanId: membership.clanId },
        data: { clanId: null },
      });

      // Delete clan (cascades to members, invites, etc.)
      await tx.clan.delete({ where: { id: membership.clanId } });
    });

    this.logger.log(`Clan disbanded: ${membership.clan.name} by ${userId}`);
  }

  // Clan invites
  async inviteToClan(userId: string, dto: ClanInviteDto): Promise<void> {
    const membership = await this.prisma.clanMember.findUnique({
      where: { userId },
      include: { clan: true },
    });

    if (!membership) throw new NotFoundException('Not in a clan');
    if (membership.role === ClanRole.MEMBER) {
      throw new BadRequestException('Only officers and leaders can invite');
    }

    // Check target not already in clan
    const targetMembership = await this.prisma.clanMember.findUnique({
      where: { userId: dto.targetUserId },
    });

    if (targetMembership) {
      throw new ConflictException('User already in a clan');
    }

    // Check existing invite
    const existingInvite = await this.prisma.clanInvite.findFirst({
      where: { clanId: membership.clanId, targetUserId: dto.targetUserId, status: ClanInviteStatus.PENDING },
    });

    if (existingInvite) {
      throw new ConflictException('Invite already pending');
    }

    await this.prisma.clanInvite.create({
      data: {
        clanId: membership.clanId,
        inviterId: userId,
        targetUserId: dto.targetUserId,
        status: ClanInviteStatus.PENDING,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });
  }

  async respondToInvite(userId: string, inviteId: string, accept: boolean): Promise<void> {
    const invite = await this.prisma.clanInvite.findUnique({
      where: { id: inviteId },
      include: { clan: true },
    });

    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.targetUserId !== userId) throw new BadRequestException('Not your invite');
    if (invite.status !== ClanInviteStatus.PENDING) throw new BadRequestException('Invite already processed');

    if (accept) {
      // Check clan capacity
      const memberCount = await this.prisma.clanMember.count({ where: { clanId: invite.clanId } });
      if (memberCount >= invite.clan.maxMembers) {
        throw new BadRequestException('Clan is full');
      }

      await this.prisma.withTransaction(async (tx) => {
        await tx.clanMember.create({
          data: { clanId: invite.clanId, userId, role: ClanRole.MEMBER },
        });

        await tx.player.update({
          where: { userId },
          data: { clanId: invite.clanId },
        });

        await tx.clanInvite.update({
          where: { id: inviteId },
          data: { status: ClanInviteStatus.ACCEPTED },
        });
      });
    } else {
      await this.prisma.clanInvite.update({
        where: { id: inviteId },
        data: { status: ClanInviteStatus.REJECTED },
      });
    }
  }

  async getMyInvites(userId: string) {
    return this.prisma.clanInvite.findMany({
      where: { targetUserId: userId, status: ClanInviteStatus.PENDING },
      include: { clan: true, inviter: { select: { username: true, displayName: true } } },
    });
  }

  // Clan members
  async getClanMembers(clanId: string): Promise<ClanMemberDto[]> {
    const members = await this.prisma.clanMember.findMany({
      where: { clanId },
      include: {
        user: { select: { username: true, displayName: true } },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    return members.map((m) => ({
      userId: m.userId,
      username: m.user.username,
      displayName: m.user.displayName,
      role: m.role as unknown as ClanRole,
      joinedAt: m.joinedAt,
      contribution: Number(m.contribution),
    }));
  }

  async kickMember(userId: string, targetUserId: string): Promise<void> {
    const membership = await this.prisma.clanMember.findUnique({
      where: { userId },
      include: { clan: true },
    });

    if (!membership) throw new NotFoundException('Not in a clan');
    if (membership.role === ClanRole.MEMBER) throw new BadRequestException('Insufficient permissions');

    const targetMembership = await this.prisma.clanMember.findUnique({
      where: { userId: targetUserId },
    });

    if (!targetMembership || targetMembership.clanId !== membership.clanId) {
      throw new NotFoundException('Target not in your clan');
    }

    if (membership.role !== ClanRole.LEADER && targetMembership.role !== ClanRole.MEMBER) {
      throw new BadRequestException('Cannot kick officer or leader');
    }

    await this.prisma.withTransaction(async (tx) => {
      await tx.clanMember.delete({ where: { userId: targetUserId } });
      await tx.player.update({
        where: { userId: targetUserId },
        data: { clanId: null },
      });
    });
  }

  async promoteMember(userId: string, targetUserId: string, newRole: ClanRole): Promise<void> {
    const membership = await this.prisma.clanMember.findUnique({
      where: { userId },
    });

    if (!membership || membership.role !== ClanRole.LEADER) {
      throw new BadRequestException('Only leader can promote');
    }

    if (newRole === ClanRole.LEADER) {
      throw new BadRequestException('Use transfer leadership instead');
    }

    const targetMembership = await this.prisma.clanMember.findUnique({
      where: { userId: targetUserId },
    });

    if (!targetMembership || targetMembership.clanId !== membership.clanId) {
      throw new NotFoundException('Target not in your clan');
    }

    await this.prisma.clanMember.update({
      where: { userId: targetUserId },
      data: { role: newRole },
    });
  }

  async leaveClan(userId: string): Promise<void> {
    const membership = await this.prisma.clanMember.findUnique({
      where: { userId },
      include: { clan: true },
    });

    if (!membership) throw new NotFoundException('Not in a clan');

    if (membership.role === ClanRole.LEADER) {
      // Leader must disband or transfer leadership
      const otherMembers = await this.prisma.clanMember.count({
        where: { clanId: membership.clanId, userId: { not: userId } },
      });
      if (otherMembers > 0) {
        throw new BadRequestException('Transfer leadership before leaving');
      }
      await this.disbandClan(userId);
      return;
    }

    await this.prisma.withTransaction(async (tx) => {
      await tx.clanMember.delete({ where: { userId } });
      await tx.player.update({
        where: { userId },
        data: { clanId: null },
      });
    });
  }

  // Friends
  async sendFriendRequest(userId: string, dto: FriendRequestDto): Promise<void> {
    if (userId === dto.targetUserId) {
      throw new BadRequestException('Cannot friend yourself');
    }

    const existing = await this.prisma.friend.findFirst({
      where: {
        OR: [
          { userId, friendId: dto.targetUserId },
          { userId: dto.targetUserId, friendId: userId },
        ],
      },
    });

    if (existing) {
      throw new ConflictException('Already friends or request pending');
    }

    await this.prisma.friend.create({
      data: {
        userId,
        friendId: dto.targetUserId,
        status: 'PENDING',
      },
    });
  }

  async acceptFriendRequest(userId: string, requestId: string): Promise<void> {
    const request = await this.prisma.friend.findUnique({ where: { id: requestId } });
    if (!request || request.friendId !== userId || request.status !== 'PENDING') {
      throw new NotFoundException('Request not found');
    }

    await this.prisma.friend.update({
      where: { id: requestId },
      data: { status: 'ACCEPTED' },
    });
  }

  async getFriends(userId: string): Promise<FriendResponseDto[]> {
    const friends = await this.prisma.friend.findMany({
      where: {
        OR: [{ userId, status: 'ACCEPTED' }, { friendId: userId, status: 'ACCEPTED' }],
      },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, lastLoginAt: true } },
        friend: { select: { id: true, username: true, displayName: true, avatarUrl: true, lastLoginAt: true } },
      },
    });

    return friends.map((f) => {
      const other = f.userId === userId ? f.friend : f.user;
      return {
        userId: other.id,
        username: other.username,
        displayName: other.displayName,
        avatarUrl: other.avatarUrl,
        isOnline: false, // Would check Redis presence
        lastSeen: other.lastLoginAt,
      };
    });
  }

  async getPendingRequests(userId: string) {
    return this.prisma.friend.findMany({
      where: { friendId: userId, status: 'PENDING' },
      include: { user: { select: { username: true, displayName: true, avatarUrl: true } } },
    });
  }

  private mapClanToResponse(clan: any, memberCount: number): ClanResponseDto {
    return {
      id: clan.id,
      name: clan.name,
      tag: clan.tag,
      description: clan.description,
      isPublic: clan.isPublic,
      bannerUrl: clan.bannerUrl,
      level: clan.level,
      experience: Number(clan.experience),
      memberCount,
      maxMembers: clan.maxMembers,
      createdAt: clan.createdAt,
    };
  }
}