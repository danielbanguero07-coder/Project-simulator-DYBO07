import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/services/prisma.service';
import { RedisService } from '../../shared/services/redis.service';
import {
  GameActionDto,
  GameActionBatchDto,
  GameStateDeltaDto,
  WorldStateDto,
  ActionType,
  BuildingStateDto,
  ResourceStateDto,
  PositionDto,
} from './dto/simulation.dto';

interface PlayerSession {
  userId: string;
  worldId: string;
  lastProcessedTick: number;
  pendingActions: GameActionDto[];
}

interface WorldState {
  tick: number;
  buildings: Map<string, BuildingStateDto>;
  resources: Map<string, ResourceStateDto>;
  players: Map<string, PlayerSession>;
}

@Injectable()
export class SimulationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulationService.name);
  private tickInterval: NodeJS.Timeout | null = null;
  private broadcastInterval: NodeJS.Timeout | null = null;
  private worlds: Map<string, WorldState> = new Map();
  private tickRate: number;
  private broadcastIntervalMs: number;
  private isRunning = false;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private redis: RedisService,
  ) {
    this.tickRate = configService.get<number>('simulation.tickRate') || 20;
    this.broadcastIntervalMs = configService.get<number>('simulation.stateBroadcastInterval') || 50;
  }

  async onModuleInit() {
    await this.loadWorlds();
    this.startGameLoop();
    this.startStateBroadcast();
    this.logger.log(`🎮 Simulation started at ${this.tickRate} ticks/sec`);
  }

  async onModuleDestroy() {
    this.stopGameLoop();
    await this.saveWorlds();
    this.logger.log('🎮 Simulation stopped');
  }

  private async loadWorlds() {
    // Load worlds from database
    const worlds = await this.prisma.world.findMany({
      where: { status: 'ACTIVE' },
      include: {
        buildings: true,
        resources: true,
      },
    });

    for (const world of worlds) {
      const state: WorldState = {
        tick: Number(world.currentTick),
        buildings: new Map(),
        resources: new Map(),
        players: new Map(),
      };

      // Load buildings
      for (const building of world.buildings) {
        state.buildings.set(building.id, this.mapBuildingToState(building));
      }

      // Load resources
      for (const resource of world.resources) {
        state.resources.set(resource.type, this.mapResourceToState(resource));
      }

      this.worlds.set(world.id, state);
      this.logger.log(`Loaded world: ${world.id} (tick: ${Number(world.currentTick)})`);
    }
  }

  private async saveWorlds() {
    for (const [worldId, state] of this.worlds) {
      await this.prisma.withTransaction(async (tx) => {
        await tx.world.update({
          where: { id: worldId },
          data: { currentTick: state.tick },
        });

        // Batch update buildings
        for (const [id, building] of state.buildings) {
          await tx.building.update({
            where: { id },
            data: {
              level: building.level,
              status: building.status,
              progress: building.progress,
              productionEndAt: building.productionEndAt,
              storedResources: building.storedResources,
            },
          });
        }

        // Batch update resources
        for (const [type, resource] of state.resources) {
          await tx.resource.update({
            where: { worldId_type: { worldId, type } },
            data: {
              amount: resource.amount,
              rate: resource.rate,
            },
          });
        }
      });
    }
    this.logger.log('World states saved');
  }

  private startGameLoop() {
    if (this.isRunning) return;
    this.isRunning = true;

    const tickIntervalMs = 1000 / this.tickRate;

    this.tickInterval = setInterval(async () => {
      try {
        await this.processTick();
      } catch (error) {
        this.logger.error('Error in game loop tick:', error);
      }
    }, tickIntervalMs);
  }

  private stopGameLoop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
    this.isRunning = false;
  }

  private startStateBroadcast() {
    this.broadcastInterval = setInterval(async () => {
      try {
        await this.broadcastState();
      } catch (error) {
        this.logger.error('Error broadcasting state:', error);
      }
    }, this.broadcastIntervalMs);
  }

  private async processTick() {
    for (const [worldId, state] of this.worlds) {
      state.tick++;

      // Process building production
      await this.processBuildingProduction(worldId, state);

      // Process resource regeneration
      await this.processResourceRegeneration(worldId, state);

      // Process player actions
      await this.processPlayerActions(worldId, state);

      // Periodic snapshot
      if (state.tick % (this.tickRate * 60 * 5) === 0) { // Every 5 minutes
        await this.saveWorlds?.();
      }
    }
  }

  private async processBuildingProduction(worldId: string, state: WorldState) {
    const now = new Date();

    for (const [id, building] of state.buildings) {
      if (building.status === 'PRODUCING' && building.productionEndAt) {
        if (new Date(building.productionEndAt) <= now) {
          // Production complete
          building.status = 'IDLE';
          building.productionEndAt = null;

          // Add produced resources to building storage
          const template = await this.getBuildingTemplate(building.templateId);
          if (template?.production?.output) {
            for (const [resourceType, amount] of Object.entries(template.production.output)) {
              building.storedResources[resourceType] = ((building.storedResources as any)[resourceType] || 0) + amount;
            }
          }
        }
      }
    }
  }

  private async processResourceRegeneration(worldId: string, state: WorldState) {
    for (const [type, resource] of state.resources) {
      if (resource.rate > 0 && resource.amount < resource.capacity) {
        const regenAmount = resource.rate / this.tickRate; // Per tick
        resource.amount = Math.min(resource.capacity, resource.amount + regenAmount);
      }
    }
  }

  private async processPlayerActions(worldId: string, state: WorldState) {
    for (const [userId, session] of state.players) {
      while (session.pendingActions.length > 0) {
        const action = session.pendingActions.shift()!;
        await this.processAction(worldId, state, userId, action);
        session.lastProcessedTick = state.tick;
      }
    }
  }

  private async processAction(
    worldId: string,
    state: WorldState,
    userId: string,
    action: GameActionDto,
  ): Promise<void> {
    // Validate action against server state (anti-cheat)
    if (!this.validateAction(state, userId, action)) {
      this.logger.warn(`Invalid action from ${userId}: ${action.type}`);
      return;
    }

    switch (action.type) {
      case ActionType.BUILD:
        await this.handleBuild(worldId, state, userId, action);
        break;
      case ActionType.UPGRADE:
        await this.handleUpgrade(worldId, state, userId, action);
        break;
      case ActionType.COLLECT:
        await this.handleCollect(worldId, state, userId, action);
        break;
      case ActionType.MOVE:
        await this.handleMove(worldId, state, userId, action);
        break;
      // Add other action handlers
    }
  }

  private validateAction(state: WorldState, userId: string, action: GameActionDto): boolean {
    // Basic validation - expand for anti-cheat
    const session = state.players.get(userId);
    if (!session) return false;

    // Check action queue size
    if (session.pendingActions.length > 100) return false;

    // Validate client tick is not too far behind
    if (state.tick - action.clientTick > 100) return false;

    return true;
  }

  private async handleBuild(
    worldId: string,
    state: WorldState,
    userId: string,
    action: GameActionDto,
  ): Promise<void> {
    if (!action.buildingId || !action.position) return;

    const template = await this.getBuildingTemplate(action.buildingId);
    if (!template) return;

    // Check resources
    const playerResources = await this.getPlayerResources(userId);
    for (const [resource, cost] of Object.entries(template.buildCost || {})) {
      if (((playerResources as any)?.[resource] || 0) < cost) return;
    }

    // Deduct resources
    await this.deductPlayerResources(userId, template.buildCost);

    // Create building
    const building: BuildingStateDto = {
      id: `building_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      templateId: action.buildingId,
      level: 1,
      position: action.position,
      status: 'IDLE',
      progress: 0,
      productionEndAt: null,
      storedResources: {},
    };

    state.buildings.set(building.id, building);
    await this.incrementPlayerStat(userId, 'buildingsBuilt');
  }

  private async handleUpgrade(
    worldId: string,
    state: WorldState,
    userId: string,
    action: GameActionDto,
  ): Promise<void> {
    if (!action.targetId) return;

    const building = state.buildings.get(action.targetId);
    if (!building || building.status !== 'IDLE') return;

    const template = await this.getBuildingTemplate(building.templateId);
    const nextLevelCost = template?.upgradeCost?.[building.level + 1];
    if (!nextLevelCost) return;

    const playerResources = await this.getPlayerResources(userId);
    for (const [resource, cost] of Object.entries(nextLevelCost)) {
      if (((playerResources as any)?.[resource] || 0) < cost) return;
    }

    await this.deductPlayerResources(userId, nextLevelCost);
    building.status = 'UPGRADING';
    building.progress = 0;
    // Set upgrade completion time
  }

  private async handleCollect(
    worldId: string,
    state: WorldState,
    userId: string,
    action: GameActionDto,
  ): Promise<void> {
    if (!action.targetId) return;

    const building = state.buildings.get(action.targetId);
    if (!building || Object.keys(building.storedResources).length === 0) return;

    // Transfer resources to player
    await this.addPlayerResources(userId, building.storedResources);
    building.storedResources = {};
    await this.incrementPlayerStat(userId, 'resourcesCollected');
  }

  private async handleMove(
    worldId: string,
    state: WorldState,
    userId: string,
    action: GameActionDto,
  ): Promise<void> {
    if (!action.position) return;

    const session = state.players.get(userId);
    if (session) {
      // Validate movement (max distance per tick, obstacles, etc.)
      session.pendingActions = []; // Clear pending for movement
    }
  }

  private async broadcastState() {
    for (const [worldId, state] of this.worlds) {
      const delta = this.createStateDelta(worldId, state);
      await this.redis.publish(`world:${worldId}:state`, delta);
    }
  }

  private createStateDelta(worldId: string, state: WorldState): GameStateDeltaDto {
    return {
      tick: state.tick,
      buildings: Array.from(state.buildings.values()),
      resources: Array.from(state.resources.values()),
      playerStats: {
        gold: 0, // Would aggregate from player sessions
        experience: 0,
        level: 1,
      },
      timestamp: Date.now(),
    };
  }

  // Helper methods
  private async getBuildingTemplate(templateId: string): Promise<any> {
    // In production, load from cache/database
    return {
      buildCost: { gold: 100 },
      upgradeCost: { 2: { gold: 200 } },
      production: { output: { gold: 10 } },
    };
  }

  private async getPlayerResources(userId: string): Promise<Record<string, number>> {
    const cached = await this.redis.getCache<Record<string, number>>(`player:resources:${userId}`);
    if (cached) return cached;

    const player = await this.prisma.player.findUnique({
      where: { userId },
      select: { gold: true, premiumCurrency: true },
    });

    const resources = {
      gold: Number(player?.gold ?? 0),
      premiumCurrency: Number(player?.premiumCurrency ?? 0),
    };
    await this.redis.setCache(`player:resources:${userId}`, resources, 60);
    return resources;
  }

  private async deductPlayerResources(userId: string, cost: Record<string, number>): Promise<void> {
    // Use transaction for atomicity
    await this.prisma.withTransaction(async (tx) => {
      for (const [resource, amount] of Object.entries(cost)) {
        if (resource === 'gold') {
          await tx.player.update({
            where: { userId },
            data: { gold: { decrement: amount } },
          });
        }
      }
    });
    await this.redis.deleteCache(`player:resources:${userId}`);
  }

  private async addPlayerResources(userId: string, resources: Record<string, number>): Promise<void> {
    await this.prisma.withTransaction(async (tx) => {
      for (const [resource, amount] of Object.entries(resources)) {
        if (resource === 'gold') {
          await tx.player.update({
            where: { userId },
            data: { gold: { increment: amount } },
          });
        }
      }
    });
    await this.redis.deleteCache(`player:resources:${userId}`);
  }

  private async incrementPlayerStat(userId: string, stat: string): Promise<void> {
    await this.prisma.player.update({
      where: { userId },
      data: { [stat]: { increment: 1 } },
    });
  }

  private mapBuildingToState(building: any): BuildingStateDto {
    return {
      id: building.id,
      templateId: building.templateId,
      level: building.level,
      position: { x: building.positionX, y: building.positionY },
      status: building.status,
      progress: building.progress,
      productionEndAt: building.productionEndAt,
      storedResources: building.storedResources || {},
    };
  }

  private mapResourceToState(resource: any): ResourceStateDto {
    return {
      type: resource.type,
      amount: resource.amount,
      rate: resource.rate,
      capacity: resource.capacity,
    };
  }

  // Public API for WebSocket gateway
  async addPlayerToWorld(userId: string, worldId: string): Promise<void> {
    const state = this.worlds.get(worldId);
    if (!state) throw new Error(`World ${worldId} not found`);

    state.players.set(userId, {
      userId,
      worldId,
      lastProcessedTick: state.tick,
      pendingActions: [],
    });
  }

  async removePlayerFromWorld(userId: string, worldId: string): Promise<void> {
    const state = this.worlds.get(worldId);
    if (state) {
      state.players.delete(userId);
    }
  }

  async queueAction(userId: string, worldId: string, action: GameActionDto): Promise<void> {
    const state = this.worlds.get(worldId);
    if (!state) return;

    const session = state.players.get(userId);
    if (session) {
      session.pendingActions.push(action);
    }
  }

  async getWorldState(worldId: string): Promise<WorldStateDto | null> {
    const state = this.worlds.get(worldId);
    if (!state) return null;

    return {
      worldId,
      tick: state.tick,
      buildings: Array.from(state.buildings.values()),
      resources: Array.from(state.resources.values()),
      players: Array.from(state.players.values()).map((p) => ({
        userId: p.userId,
        username: '', // Would fetch from cache
        position: { x: 0, y: 0 },
      })),
    };
  }
}