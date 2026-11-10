import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';

import { SocialService } from './social.service';
import {
  CreateClanDto,
  UpdateClanDto,
  ClanInviteDto,
  ClanResponseDto,
  ClanMemberDto,
  FriendRequestDto,
  FriendResponseDto,
  ClanRole,
} from './dto/social.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { UserPayload } from '../auth/interfaces/user-payload.interface';

@ApiTags('Social')
@Controller('social')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiCookieAuth('access-token')
export class SocialController {
  constructor(private socialService: SocialService) {}

  // Clan endpoints
  @Post('clan')
  @ApiOperation({ summary: 'Create a new clan' })
  @ApiResponse({ status: 201, type: ClanResponseDto })
  @ApiResponse({ status: 409, description: 'Already in a clan or name/tag taken' })
  async createClan(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateClanDto,
  ): Promise<ClanResponseDto> {
    return this.socialService.createClan(userId, dto);
  }

  @Get('clan/me')
  @ApiOperation({ summary: 'Get my clan' })
  @ApiResponse({ status: 200, type: ClanResponseDto })
  @ApiResponse({ status: 404, description: 'Not in a clan' })
  async getMyClan(@CurrentUser('userId') userId: string): Promise<ClanResponseDto | null> {
    return this.socialService.getMyClan(userId);
  }

  @Get('clan/:id')
  @ApiOperation({ summary: 'Get clan by ID' })
  @ApiResponse({ status: 200, type: ClanResponseDto })
  @ApiResponse({ status: 404, description: 'Clan not found' })
  async getClan(@Param('id') clanId: string): Promise<ClanResponseDto | null> {
    return this.socialService.getClan(clanId);
  }

  @Patch('clan')
  @ApiOperation({ summary: 'Update clan settings (leader/officer)' })
  @ApiResponse({ status: 200, type: ClanResponseDto })
  async updateClan(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateClanDto,
  ): Promise<ClanResponseDto> {
    return this.socialService.updateClan(userId, dto);
  }

  @Delete('clan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disband clan (leader only)' })
  @ApiResponse({ status: 200, description: 'Clan disbanded' })
  async disbandClan(@CurrentUser('userId') userId: string): Promise<void> {
    return this.socialService.disbandClan(userId);
  }

  @Post('clan/invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invite player to clan' })
  @ApiResponse({ status: 200, description: 'Invite sent' })
  async inviteToClan(
    @CurrentUser('userId') userId: string,
    @Body() dto: ClanInviteDto,
  ): Promise<void> {
    return this.socialService.inviteToClan(userId, dto);
  }

  @Post('clan/invite/:inviteId/respond')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept or reject clan invite' })
  @ApiResponse({ status: 200, description: 'Invite processed' })
  async respondToInvite(
    @CurrentUser('userId') userId: string,
    @Param('inviteId') inviteId: string,
    @Body('accept') accept: boolean,
  ): Promise<void> {
    return this.socialService.respondToInvite(userId, inviteId, accept);
  }

  @Get('clan/invites/me')
  @ApiOperation({ summary: 'Get my pending clan invites' })
  @ApiResponse({ status: 200, description: 'List of pending invites' })
  async getMyInvites(@CurrentUser('userId') userId: string) {
    return this.socialService.getMyInvites(userId);
  }

  @Get('clan/:id/members')
  @ApiOperation({ summary: 'Get clan members' })
  @ApiResponse({ status: 200, type: [ClanMemberDto] })
  async getClanMembers(@Param('id') clanId: string): Promise<ClanMemberDto[]> {
    return this.socialService.getClanMembers(clanId);
  }

  @Delete('clan/members/:targetUserId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kick member from clan (officer/leader)' })
  @ApiResponse({ status: 200, description: 'Member kicked' })
  async kickMember(
    @CurrentUser('userId') userId: string,
    @Param('targetUserId') targetUserId: string,
  ): Promise<void> {
    return this.socialService.kickMember(userId, targetUserId);
  }

  @Patch('clan/members/:targetUserId/promote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Promote/demote member (leader only)' })
  @ApiResponse({ status: 200, description: 'Role updated' })
  async promoteMember(
    @CurrentUser('userId') userId: string,
    @Param('targetUserId') targetUserId: string,
    @Body('role') role: ClanRole,
  ): Promise<void> {
    return this.socialService.promoteMember(userId, targetUserId, role);
  }

  @Post('clan/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave current clan' })
  @ApiResponse({ status: 200, description: 'Left clan' })
  async leaveClan(@CurrentUser('userId') userId: string): Promise<void> {
    return this.socialService.leaveClan(userId);
  }

  // Friends endpoints
  @Post('friends/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send friend request' })
  @ApiResponse({ status: 200, description: 'Request sent' })
  async sendFriendRequest(
    @CurrentUser('userId') userId: string,
    @Body() dto: FriendRequestDto,
  ): Promise<void> {
    return this.socialService.sendFriendRequest(userId, dto);
  }

  @Post('friends/request/:requestId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept friend request' })
  @ApiResponse({ status: 200, description: 'Request accepted' })
  async acceptFriendRequest(
    @CurrentUser('userId') userId: string,
    @Param('requestId') requestId: string,
  ): Promise<void> {
    return this.socialService.acceptFriendRequest(userId, requestId);
  }

  @Get('friends')
  @ApiOperation({ summary: 'Get friends list' })
  @ApiResponse({ status: 200, type: [FriendResponseDto] })
  async getFriends(@CurrentUser('userId') userId: string): Promise<FriendResponseDto[]> {
    return this.socialService.getFriends(userId);
  }

  @Get('friends/requests/pending')
  @ApiOperation({ summary: 'Get pending friend requests' })
  @ApiResponse({ status: 200, description: 'List of pending requests' })
  async getPendingRequests(@CurrentUser('userId') userId: string) {
    return this.socialService.getPendingRequests(userId);
  }
}