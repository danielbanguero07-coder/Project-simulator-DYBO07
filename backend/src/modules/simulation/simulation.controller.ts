import { Controller, Get, Post, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';

import { SimulationService } from './simulation.service';
import { GameActionBatchDto, GameStateDeltaDto, WorldStateDto, ActionType } from './dto/simulation.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { UserPayload } from '../auth/interfaces/user-payload.interface';

@ApiTags('Simulation')
@Controller('simulation')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiCookieAuth('access-token')
export class SimulationController {
  constructor(private simulationService: SimulationService) {}

  @Get('world/:worldId')
  @ApiOperation({ summary: 'Get current world state' })
  @ApiResponse({ status: 200, type: WorldStateDto })
  @ApiResponse({ status: 404, description: 'World not found' })
  async getWorldState(@Param('worldId') worldId: string): Promise<WorldStateDto | null> {
    return this.simulationService.getWorldState(worldId);
  }

  @Post('world/:worldId/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join a world (enter simulation)' })
  @ApiResponse({ status: 200, description: 'Joined world successfully' })
  @ApiResponse({ status: 404, description: 'World not found' })
  async joinWorld(
    @CurrentUser('userId') userId: string,
    @Param('worldId') worldId: string,
  ): Promise<{ success: boolean }> {
    await this.simulationService.addPlayerToWorld(userId, worldId);
    return { success: true };
  }

  @Post('world/:worldId/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave a world (exit simulation)' })
  @ApiResponse({ status: 200, description: 'Left world successfully' })
  async leaveWorld(
    @CurrentUser('userId') userId: string,
    @Param('worldId') worldId: string,
  ): Promise<{ success: boolean }> {
    await this.simulationService.removePlayerFromWorld(userId, worldId);
    return { success: true };
  }

  @Post('world/:worldId/action')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Submit game action(s) for processing' })
  @ApiResponse({ status: 202, description: 'Action queued for processing' })
  @ApiResponse({ status: 400, description: 'Invalid action' })
  async submitAction(
    @CurrentUser('userId') userId: string,
    @Param('worldId') worldId: string,
    @Body() dto: GameActionBatchDto,
  ): Promise<{ accepted: number }> {
    let accepted = 0;
    for (const action of dto.actions) {
      await this.simulationService.queueAction(userId, worldId, action);
      accepted++;
    }
    return { accepted };
  }

  @Get('actions/types')
  @ApiOperation({ summary: 'Get available action types' })
  @ApiResponse({ status: 200, type: [String] })
  getActionTypes(): string[] {
    return Object.values(ActionType);
  }
}