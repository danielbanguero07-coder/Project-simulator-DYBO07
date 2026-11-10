import { Controller, Get, Patch, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';

import { PlayerService } from './player.service';
import { UpdatePlayerDto, PlayerResponseDto, PlayerStatsDto } from './dto/player.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { UserPayload } from '../auth/interfaces/user-payload.interface';

@ApiTags('Player')
@Controller('player')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiCookieAuth('access-token')
export class PlayerController {
  constructor(private playerService: PlayerService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get current player profile' })
  @ApiResponse({ status: 200, type: PlayerResponseDto })
  @ApiResponse({ status: 404, description: 'Player not found' })
  async getProfile(@CurrentUser('userId') userId: string): Promise<PlayerResponseDto> {
    return this.playerService.getProfile(userId);
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update player profile' })
  @ApiResponse({ status: 200, type: PlayerResponseDto })
  @ApiResponse({ status: 404, description: 'Player not found' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async updateProfile(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdatePlayerDto,
  ): Promise<PlayerResponseDto> {
    return this.playerService.updateProfile(userId, dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get player statistics' })
  @ApiResponse({ status: 200, type: PlayerStatsDto })
  @ApiResponse({ status: 404, description: 'Player not found' })
  async getStats(@CurrentUser('userId') userId: string): Promise<PlayerStatsDto> {
    return this.playerService.getStats(userId);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Get global XP leaderboard' })
  @ApiResponse({ status: 200, description: 'Top players by XP' })
  async getLeaderboard(): Promise<Array<{ userId: string; rank: number; xp: number }>> {
    // This would use RedisService directly, simplified for now
    return [];
  }
}