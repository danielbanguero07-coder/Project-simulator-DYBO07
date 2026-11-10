/**
 * @sim/engine - Network Serialization
 * MessagePack-based serialization for deterministic state sync
 * Target: packages/engine/src/network/Serialization.ts
 */

import { World, Entity, WorldSnapshot, ComponentSnapshot } from '../core/ecs';
import { MathUtils } from '../math';
import * as msgpack from '@msgpack/msgpack';

// ============================================================================
// Types (matching Serialization_Schema.md)
// ============================================================================

export interface SerializedGameState {
  tick: number;
  time: number;
  players: SerializedPlayerState[];
  entities: SerializedEntityState[];
  checksum: number;
}

export interface SerializedPlayerState {
  playerId: number;
  resources: {
    gold: number;
    wood: number;
    stone: number;
    food: number;
    energy: number;
  };
  population: {
    population: number;
    capacity: number;
    happiness: number;
  };
}

export interface SerializedEntityState {
  entityId: number;
  components: {
    Building?: {
      buildingId: number;
      level: number;
      state: number;
      progress: number;
      efficiency: number;
      lastUpdateTick: number;
    };
    Production?: {
      resourceType: number;
      ratePerTick: number;
      accumulator: number;
    };
    ResourceStorage?: {
      gold: number;
      wood: number;
      stone: number;
      food: number;
      energy: number;
      capacityGold: number;
      capacityWood: number;
      capacityStone: number;
      capacityFood: number;
      capacityEnergy: number;
    };
    Population?: {
      population: number;
      capacity: number;
      happiness: number;
      growthRate: number;
    };
  };
}

export interface DeltaUpdate {
  tick: number;
  entities: EntityDelta[];
  players: PlayerDelta[];
}

export interface EntityDelta {
  entityId: number;
  added: boolean;
  removed: boolean;
  components: Partial<SerializedEntityState['components']>;
}

export interface PlayerDelta {
  playerId: number;
  resources?: Partial<SerializedPlayerState['resources']>;
  population?: Partial<SerializedPlayerState['population']>;
}

// ============================================================================
// Serialization Class
// ============================================================================

export class GameSerializer {
  private world: World;
  private lastFullSnapshot: SerializedGameState | null = null;
  private lastSnapshotTick = 0;
  private entityVersions: Map<number, number> = new Map();
  private playerVersions: Map<number, number> = new Map();
  private fullSnapshotInterval = 60; // Every 60 ticks
  
  constructor(world: World) {
    this.world = world;
  }
  
  // ---------------------------------------------------------------------------
  // Full Snapshot
  // ---------------------------------------------------------------------------
  
  createFullSnapshot(): SerializedGameState {
    const players: SerializedPlayerState[] = [];
    const entities: SerializedEntityState[] = [];
    
    // Serialize players (entities with PopulationComponent)
    for (let entity = 0; entity < this.world.entityCount; entity++) {
      if (!this.world.isAlive(entity)) continue;
      
      // Check if it's a player (has Population)
      const popComp = this.world.storage.getDefinition(0); // placeholder
      // In our ECS, we need to check if entity has Population component
      // For now, serialize all entities that have ResourceStorage
      const hasStorage = this.hasResourceStorage(entity);
      const hasPopulation = this.hasPopulation(entity);
      
      if (hasPopulation || hasStorage) {
        players.push(this.serializePlayer(entity));
      }
    }
    
    // Serialize all entities with Building component
    for (let entity = 0; entity < this.world.entityCount; entity++) {
      if (!this.world.isAlive(entity)) continue;
      if (this.hasBuilding(entity)) {
        entities.push(this.serializeEntity(entity));
      }
    }
    
    const snapshot: SerializedGameState = {
      tick: this.world.tick,
      time: this.world.time,
      players,
      entities,
      checksum: 0,
    };
    
    // Calculate CRC32 checksum
    snapshot.checksum = this.calculateChecksum(snapshot);
    
    this.lastFullSnapshot = snapshot;
    this.lastSnapshotTick = this.world.tick;
    
    // Update version tracking
    for (const player of players) {
      this.playerVersions.set(player.playerId, this.world.tick);
    }
    for (const entity of entities) {
      this.entityVersions.set(entity.entityId, this.world.tick);
    }
    
    return snapshot;
  }
  
  // ---------------------------------------------------------------------------
  // Delta Snapshot
  // ---------------------------------------------------------------------------
  
  createDeltaSnapshot(): DeltaUpdate {
    const entities: EntityDelta[] = [];
    const players: PlayerDelta[] = [];
    
    // Check entities for changes
    for (let entity = 0; entity < this.world.entityCount; entity++) {
      if (!this.world.isAlive(entity)) {
        // Check if was previously tracked
        if (this.entityVersions.has(entity)) {
          entities.push({
            entityId: entity,
            added: false,
            removed: true,
            components: {},
          });
          this.entityVersions.delete(entity);
        }
        continue;
      }
      
      if (this.hasBuilding(entity)) {
        const lastVersion = this.entityVersions.get(entity) || 0;
        if (this.world.getVersion(entity) > lastVersion) {
          entities.push({
            entityId: entity,
            added: lastVersion === 0,
            removed: false,
            components: this.getChangedComponents(entity),
          });
          this.entityVersions.set(entity, this.world.tick);
        }
      }
    }
    
    // Check players for changes
    for (let entity = 0; entity < this.world.entityCount; entity++) {
      if (!this.world.isAlive(entity)) continue;
      if (this.hasPopulation(entity)) {
        const lastVersion = this.playerVersions.get(entity) || 0;
        // Simple check: if tick changed, consider dirty
        if (this.world.tick > lastVersion) {
          players.push(this.getPlayerDelta(entity));
          this.playerVersions.set(entity, this.world.tick);
        }
      }
    }
    
    return {
      tick: this.world.tick,
      entities,
      players,
    };
  }
  
  // ---------------------------------------------------------------------------
  // MessagePack Encoding/Decoding
  // ---------------------------------------------------------------------------
  
  encodeFull(snapshot: SerializedGameState): Uint8Array {
    return msgpack.encode(snapshot);
  }
  
  encodeDelta(delta: DeltaUpdate): Uint8Array {
    return msgpack.encode(delta);
  }
  
  decodeFull(data: Uint8Array): SerializedGameState {
    return msgpack.decode(data) as SerializedGameState;
  }
  
  decodeDelta(data: Uint8Array): DeltaUpdate {
    return msgpack.decode(data) as DeltaUpdate;
  }
  
  // ---------------------------------------------------------------------------
  // Apply Snapshots (Client-side)
  // ---------------------------------------------------------------------------
  
  applyFullSnapshot(snapshot: SerializedGameState): void {
    // Validate checksum
    const expectedChecksum = this.calculateChecksum({ ...snapshot, checksum: 0 });
    if (snapshot.checksum !== expectedChecksum) {
      throw new Error('Snapshot checksum mismatch');
    }
    
    // Clear world
    this.world.clear();
    
    // Restore players
    for (const player of snapshot.players) {
      // In a real implementation, we'd recreate entities
      // For now, this is a placeholder
    }
    
    // Restore entities
    for (const entity of snapshot.entities) {
      // Recreate entity with components
    }
    
    this.world.tick = snapshot.tick;
    this.world.time = snapshot.time;
    
    this.lastFullSnapshot = snapshot;
    this.lastSnapshotTick = snapshot.tick;
  }
  
  applyDelta(delta: DeltaUpdate): void {
    // Apply entity changes
    for (const entityDelta of delta.entities) {
      if (entityDelta.removed) {
        this.world.destroyEntity(entityDelta.entityId);
      } else if (entityDelta.added) {
        // Create new entity
        const entity = this.world.createEntity();
        // Apply components
        this.applyEntityComponents(entity, entityDelta.components);
      } else {
        // Update existing entity
        this.applyEntityComponents(entityDelta.entityId, entityDelta.components);
      }
    }
    
    // Apply player changes
    for (const playerDelta of delta.players) {
      this.applyPlayerDelta(playerDelta);
    }
    
    this.world.tick = delta.tick;
  }
  
  // ---------------------------------------------------------------------------
  // Should Send Full Snapshot?
  // ---------------------------------------------------------------------------
  
  shouldSendFullSnapshot(): boolean {
    return this.world.tick - this.lastSnapshotTick >= this.fullSnapshotInterval;
  }
  
  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------
  
  private hasBuilding(entity: Entity): boolean {
    // Check if entity has BuildingComponent
    // In our SoA ECS, we check if the buildingId field is non-zero
    const B = this.getBuildingAccessors();
    return B.get(this.world, entity) !== 0;
  }
  
  private hasResourceStorage(entity: Entity): boolean {
    // Check if entity has ResourceStorage
    // We check gold field
    const S = this.getStorageAccessors();
    return (S.getGold(this.world, entity) || 0) > 0 || entity === 0; // Player 0 always has storage
  }
  
  private hasPopulation(entity: Entity): boolean {
    const P = this.getPopulationAccessors();
    return P.population.get(this.world, entity) !== undefined;
  }
  
  private serializePlayer(entity: Entity): SerializedPlayerState {
    const S = this.getStorageAccessors();
    const P = this.getPopulationAccessors();
    
    return {
      playerId: entity,
      resources: {
        gold: S.getGold(entity) || 0,
        wood: S.getWood(entity) || 0,
        stone: S.getStone(entity) || 0,
        food: S.getFood(entity) || 0,
        energy: S.getEnergy(entity) || 0,
      },
      population: {
        population: P.population.get(this.world, entity) || 0,
        capacity: P.capacity.get(this.world, entity) || 0,
        happiness: P.happiness.get(this.world, entity) || 0,
      },
    };
  }
  
  private serializeEntity(entity: Entity): SerializedEntityState {
    const B = this.getBuildingAccessors();
    const P = this.getProductionAccessors();
    const S = this.getStorageAccessors();
    const Pop = this.getPopulationAccessors();
    
    const components: SerializedEntityState['components'] = {};
    
    if (this.hasBuilding(entity)) {
      components.Building = {
        buildingId: B.get(this.world, entity),
        level: B.level.get(this.world, entity),
        state: B.state.get(this.world, entity),
        progress: B.progress.get(this.world, entity) / MathUtils.FIXED_POINT_ONE,
        efficiency: B.efficiency.get(this.world, entity) / MathUtils.FIXED_POINT_ONE,
        lastUpdateTick: B.lastUpdateTick.get(this.world, entity),
      };
    }
    
    if (P.resourceType.get(this.world, entity) !== undefined) {
      components.Production = {
        resourceType: P.resourceType.get(this.world, entity),
        ratePerTick: P.ratePerTick.get(this.world, entity),
        accumulator: P.accumulator.get(this.world, entity),
      };
    }
    
    if (this.hasResourceStorage(entity)) {
      components.ResourceStorage = {
        gold: S.getGold(entity) || 0,
        wood: S.getWood(entity) || 0,
        stone: S.getStone(entity) || 0,
        food: S.getFood(entity) || 0,
        energy: S.getEnergy(entity) || 0,
        capacityGold: S.getCapacity(entity, 0) || 0,
        capacityWood: S.getCapacity(entity, 1) || 0,
        capacityStone: S.getCapacity(entity, 2) || 0,
        capacityFood: S.getCapacity(entity, 3) || 0,
        capacityEnergy: S.getCapacity(entity, 4) || 0,
      };
    }
    
    if (this.hasPopulation(entity)) {
      components.Population = {
        population: Pop.population.get(this.world, entity) || 0,
        capacity: Pop.capacity.get(this.world, entity) || 0,
        happiness: Pop.happiness.get(this.world, entity) || 0,
        growthRate: Pop.growthRate.get(this.world, entity) || 0,
      };
    }
    
    return {
      entityId: entity,
      components,
    };
  }
  
  private getChangedComponents(entity: Entity): Partial<SerializedEntityState['components']> {
    const components: Partial<SerializedEntityState['components']> = {};
    
    if (this.hasBuilding(entity)) {
      const B = this.getBuildingAccessors();
      components.Building = {
        buildingId: B.get(this.world, entity),
        level: B.level.get(this.world, entity),
        state: B.state.get(this.world, entity),
        progress: B.progress.get(this.world, entity) / MathUtils.FIXED_POINT_ONE,
        efficiency: B.efficiency.get(this.world, entity) / MathUtils.FIXED_POINT_ONE,
        lastUpdateTick: B.lastUpdateTick.get(this.world, entity),
      };
    }
    
    // Add other components similarly...
    
    return components;
  }
  
  private getPlayerDelta(entity: Entity): PlayerDelta {
    const S = this.getStorageAccessors();
    const P = this.getPopulationAccessors();
    
    return {
      playerId: entity,
      resources: {
        gold: S.getGold(entity) || 0,
        wood: S.getWood(entity) || 0,
        stone: S.getStone(entity) || 0,
        food: S.getFood(entity) || 0,
        energy: S.getEnergy(entity) || 0,
      },
      population: {
        population: P.population.get(this.world, entity) || 0,
        capacity: P.capacity.get(this.world, entity) || 0,
        happiness: P.happiness.get(this.world, entity) || 0,
      },
    };
  }
  
  private applyEntityComponents(entity: Entity, components: Partial<SerializedEntityState['components']>): void {
    // Apply component data to entity
    // This would use the accessors to set values
  }
  
  private applyPlayerDelta(delta: PlayerDelta): void {
    // Apply player resource/population changes
  }
  
  private calculateChecksum(obj: object): number {
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return hash >>> 0;
  }
  
  // Accessor getters (would be injected in real implementation)
  private getBuildingAccessors(): any { return {}; }
  private getProductionAccessors(): any { return {}; }
  private getStorageAccessors(): any { return {}; }
  private getPopulationAccessors(): any { return {}; }
}

// ============================================================================
// Client-side Interpolation
// ============================================================================

export interface InterpolatedState {
  entities: Map<number, InterpolatedEntity>;
  players: Map<number, InterpolatedPlayer>;
}

export interface InterpolatedEntity {
  current: SerializedEntityState;
  previous: SerializedEntityState | null;
  alpha: number;
}

export interface InterpolatedPlayer {
  current: SerializedPlayerState;
  previous: SerializedPlayerState | null;
  alpha: number;
}

export class StateInterpolator {
  private currentState: SerializedGameState | null = null;
  private previousState: SerializedGameState | null = null;
  private interpolationAlpha = 0;
  
  setSnapshot(snapshot: SerializedGameState): void {
    this.previousState = this.currentState;
    this.currentState = snapshot;
    this.interpolationAlpha = 0;
  }
  
  setDelta(delta: DeltaUpdate): void {
    if (!this.currentState) return;
    
    this.previousState = this.cloneState(this.currentState);
    
    // Apply delta to current state
    for (const entityDelta of delta.entities) {
      if (entityDelta.removed) {
        this.currentState!.entities = this.currentState!.entities.filter(e => e.entityId !== entityDelta.entityId);
      } else if (entityDelta.added) {
        // Would add new entity
      } else {
        // Update existing
        const idx = this.currentState!.entities.findIndex(e => e.entityId === entityDelta.entityId);
        if (idx >= 0) {
          this.currentState!.entities[idx] = {
            ...this.currentState!.entities[idx],
            components: { ...this.currentState!.entities[idx].components, ...entityDelta.components },
          };
        }
      }
    }
    
    for (const playerDelta of delta.players) {
      const idx = this.currentState!.players.findIndex(p => p.playerId === playerDelta.playerId);
      if (idx >= 0) {
        this.currentState!.players[idx] = {
          ...this.currentState!.players[idx],
          resources: { ...this.currentState!.players[idx].resources, ...playerDelta.resources },
          population: { ...this.currentState!.players[idx].population, ...playerDelta.population },
        };
      }
    }
    
    this.currentState!.tick = delta.tick;
    this.interpolationAlpha = 0;
  }
  
  updateAlpha(alpha: number): void {
    this.interpolationAlpha = alpha;
  }
  
  getInterpolatedState(): InterpolatedState {
    const entities = new Map<number, InterpolatedEntity>();
    const players = new Map<number, InterpolatedPlayer>();
    
    if (this.currentState) {
      for (const entity of this.currentState.entities) {
        const prev = this.previousState?.entities.find(e => e.entityId === entity.entityId) || null;
        entities.set(entity.entityId, { current: entity, previous: prev, alpha: this.interpolationAlpha });
      }
      
      for (const player of this.currentState.players) {
        const prev = this.previousState?.players.find(p => p.playerId === player.playerId) || null;
        players.set(player.playerId, { current: player, previous: prev, alpha: this.interpolationAlpha });
      }
    }
    
    return { entities, players };
  }
  
  private cloneState(state: SerializedGameState): SerializedGameState {
    return JSON.parse(JSON.stringify(state));
  }
}

// ============================================================================
// Reconciliation (Server-authoritative correction)
// ============================================================================

export interface ReconciliationResult {
  corrected: boolean;
  corrections: EntityCorrection[];
}

export interface EntityCorrection {
  entityId: number;
  field: string;
  serverValue: any;
  clientValue: any;
}

export class StateReconciler {
  private serverHistory: SerializedGameState[] = [];
  private maxHistory = 60; // 60 ticks = 5 minutes at 5s/tick
  
  recordServerState(state: SerializedGameState): void {
    this.serverHistory.push(state);
    if (this.serverHistory.length > this.maxHistory) {
      this.serverHistory.shift();
    }
  }
  
  reconcile(clientState: SerializedGameState, clientTick: number): ReconciliationResult {
    // Find server state at client's tick
    const serverState = this.serverHistory.find(s => s.tick === clientTick);
    
    if (!serverState) {
      // No history for this tick, request full snapshot
      return { corrected: true, corrections: [] };
    }
    
    const corrections: EntityCorrection[] = [];
    
    // Compare entities
    for (const clientEntity of clientState.entities) {
      const serverEntity = serverState.entities.find(e => e.entityId === clientEntity.entityId);
      if (!serverEntity) continue;
      
      // Compare Building component
      if (clientEntity.components.Building && serverEntity.components.Building) {
        const c = clientEntity.components.Building;
        const s = serverEntity.components.Building;
        
        for (const key of Object.keys(c) as (keyof typeof c)[]) {
          if (c[key] !== s[key]) {
            corrections.push({
              entityId: clientEntity.entityId,
              field: `Building.${key}`,
              serverValue: s[key],
              clientValue: c[key],
            });
          }
        }
      }
      
      // Compare Production component
      if (clientEntity.components.Production && serverEntity.components.Production) {
        const c = clientEntity.components.Production;
        const s = serverEntity.components.Production;
        
        for (const key of Object.keys(c) as (keyof typeof c)[]) {
          if (Math.abs(c[key] - s[key]) > 0.001) {
            corrections.push({
              entityId: clientEntity.entityId,
              field: `Production.${key}`,
              serverValue: s[key],
              clientValue: c[key],
            });
          }
        }
      }
    }
    
    return {
      corrected: corrections.length > 0,
      corrections,
    };
  }
  
  getServerStateAtTick(tick: number): SerializedGameState | undefined {
    return this.serverHistory.find(s => s.tick === tick);
  }
}