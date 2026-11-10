/**
 * @sim/engine - Economy Systems
 * Deterministic simulation systems: Production, Upkeep, Market
 * Target: packages/engine/src/systems/economy.ts
 */

import { World, Entity, SystemFn } from '../core/ecs';
import { 
  BuildingType, BuildingState, ResourceType,
  DEFAULT_ECONOMY_PARAMS, EconomyParams,
  registerEconomyComponents,
  type ComponentAccessors 
} from '../components/economy';
import { MathUtils } from '../math';

// ============================================================================
// Upkeep Base Costs per Building Type (from balance_tables.csv)
// ============================================================================

const UPKEEP_BASE: Record<BuildingType, number> = {
  [BuildingType.WOODCUTTER]: 0.5,
  [BuildingType.STONE_MINE]: 0.6,
  [BuildingType.GENERATOR]: 0.8,
  [BuildingType.HOUSE]: 0.3,
};

// ============================================================================
// System: ProductionSystem
// Runs every tick, generates resources for producing buildings
// ============================================================================

export function createProductionSystem(accessors: ComponentAccessors): SystemFn {
  return (world: World, dt: number): void => {
    const B = accessors.Building;
    const P = accessors.Production;
    const S = accessors.ResourceStorage;
    
    // Query all entities with Building, Production, and ResourceStorage
    // In our ECS, we iterate all alive entities and check components
    for (let entity = 0; entity < world.entityCount; entity++) {
      if (!world.isAlive(entity)) continue;
      if (B.get(world, entity) === 0) continue; // No BuildingComponent
      if (P.resourceType.get(world, entity) === undefined) continue; // No ProductionComponent
      // ResourceStorage is on player entity, not building - need to find owner's storage
      
      const buildingId = B.get(world, entity);
      const state = B.state.get(world, entity);
      
      if (state !== BuildingState.PRODUCING) continue;
      
      const ownerId = B.ownerId.get(world, entity);
      if (!world.isAlive(ownerId)) continue;
      
      // Get resource type and rate
      const resourceType = P.resourceType.get(world, entity);
      const ratePerTick = P.ratePerTick.get(world, entity);
      const efficiency = B.efficiency.get(world, entity) / MathUtils.FIXED_POINT_ONE;
      const lastUpdateTick = B.lastUpdateTick.get(world, entity);
      
      // Calculate delta ticks
      const dtTicks = world.tick - lastUpdateTick;
      if (dtTicks <= 0) continue;
      
      B.lastUpdateTick.set(world, entity, world.tick);
      
      // Accumulate production
      const production = dtTicks * efficiency * ratePerTick;
      let accumulator = P.accumulator.get(world, entity);
      accumulator += production;
      
      // Process whole units
      while (accumulator >= 1.0) {
        const currentAmount = S.get(ownerId, getResourceField(resourceType)) || 0;
        const capacity = S.getCapacity(ownerId, resourceType);
        
        if (currentAmount >= capacity) {
          // Storage full - halt production
          B.state.set(world, entity, BuildingState.IDLE);
          // Emit event: ProductionHaltedEvent
          break;
        }
        
        // Add 1 unit
        S.set(ownerId, getResourceField(resourceType), currentAmount + 1);
        accumulator -= 1.0;
        
        // Emit event: ResourceGainedEvent
      }
      
      P.accumulator.set(world, entity, accumulator);
    }
  };
}

function getResourceField(type: ResourceType): string {
  switch (type) {
    case ResourceType.GOLD: return 'gold';
    case ResourceType.WOOD: return 'wood';
    case ResourceType.STONE: return 'stone';
    case ResourceType.FOOD: return 'food';
    case ResourceType.ENERGY: return 'energy';
    default: return 'gold';
  }
}

// ============================================================================
// System: UpkeepSystem
// Runs every 288 ticks (24h), deducts maintenance costs and daily tax
// ============================================================================

export function createUpkeepSystem(accessors: ComponentAccessors): SystemFn {
  return (world: World, dt: number): void => {
    // Only run every 288 ticks
    if (world.tick % 288 !== 0) return;
    
    const B = accessors.Building;
    const S = accessors.ResourceStorage;
    const params = world.getResource('economyParams') as EconomyParams;
    
    // Track upkeep per player
    const playerUpkeep = new Map<Entity, number>();
    
    // Calculate total upkeep per player
    for (let entity = 0; entity < world.entityCount; entity++) {
      if (!world.isAlive(entity)) continue;
      if (B.get(world, entity) === 0) continue;
      
      const ownerId = B.ownerId.get(world, entity);
      const buildingId = B.get(world, entity);
      const level = B.level.get(world, entity);
      
      const upkeep = level * (UPKEEP_BASE[buildingId] || 0);
      playerUpkeep.set(ownerId, (playerUpkeep.get(ownerId) || 0) + upkeep);
    }
    
    // Apply upkeep
    for (const [playerId, upkeep] of playerUpkeep) {
      if (!world.isAlive(playerId)) continue;
      
      const gold = S.getGold(playerId) || 0;
      
      if (gold < upkeep) {
        // Insufficient gold - mark buildings as DAMAGED
        for (let entity = 0; entity < world.entityCount; entity++) {
          if (!world.isAlive(entity)) continue;
          if (B.get(world, entity) === 0) continue;
          if (B.ownerId.get(world, entity) !== playerId) continue;
          
          B.state.set(world, entity, BuildingState.DAMAGED);
        }
        // Emit event: UpkeepFailedEvent
      } else {
        S.setGold(playerId, gold - upkeep);
      }
    }
    
    // Daily tax: 0.5% on all resources
    const taxRate = params.dailyTaxRate;
    for (let entity = 0; entity < world.entityCount; entity++) {
      if (!world.isAlive(entity)) continue;
      if (S.get(world, entity, 'gold') === undefined) continue; // Not a storage entity
      
      for (const resourceType of [ResourceType.GOLD, ResourceType.WOOD, ResourceType.STONE, ResourceType.FOOD, ResourceType.ENERGY]) {
        const field = getResourceField(resourceType);
        const amount = S.get(entity, field) || 0;
        const tax = Math.floor(amount * taxRate);
        if (tax > 0) {
          S.set(entity, field, amount - tax);
        }
      }
    }
  };
}

// ============================================================================
// System: MarketSystem
// On-demand system for player-initiated trades
// ============================================================================

export interface MarketTradeRequest {
  playerId: Entity;
  type: 'buy' | 'sell';
  resourceType: ResourceType;
  amount: number;
}

export interface MarketTradeResult {
  success: boolean;
  error?: string;
  tradeId?: number;
  newGold?: number;
  newResourceAmount?: number;
}

let tradeCounter = 0;

export function createMarketSystem(accessors: ComponentAccessors): {
  system: SystemFn;
  executeTrade: (request: MarketTradeRequest) => MarketTradeResult;
} {
  const S = accessors.ResourceStorage;
  const M = accessors.Market;
  const params = { ...DEFAULT_ECONOMY_PARAMS } as EconomyParams;
  
  const executeTrade = (request: MarketTradeRequest): MarketTradeResult => {
    const { playerId, type, resourceType, amount } = request;
    
    if (!world.isAlive(playerId)) {
      return { success: false, error: 'Player not found' };
    }
    
    // Check cooldown (5 seconds = 1 tick at 5s/tick, but let's use 1 tick cooldown)
    const lastTrade = M.lastTradeTick.get(world, playerId);
    if (world.tick - lastTrade < 1) {
      return { success: false, error: 'Trade cooldown active' };
    }
    
    // Check hourly limit
    const tradesThisHour = M.tradesThisHour.get(world, playerId);
    if (tradesThisHour >= 100) {
      return { success: false, error: 'Hourly trade limit reached' };
    }
    
    const baseValue = getBaseValue(params, resourceType);
    const multiplier = type === 'buy' ? params.marketBuyMultiplier : params.marketSellMultiplier;
    const pricePerUnit = baseValue * multiplier;
    const totalPrice = pricePerUnit * amount;
    
    const currentGold = S.getGold(playerId) || 0;
    const currentResource = S.get(playerId, getResourceField(resourceType)) || 0;
    const capacity = S.getCapacity(playerId, resourceType);
    
    if (type === 'buy') {
      if (currentGold < totalPrice) {
        return { success: false, error: 'Insufficient gold' };
      }
      if (currentResource + amount > capacity) {
        return { success: false, error: 'Storage capacity exceeded' };
      }
      
      S.setGold(playerId, currentGold - totalPrice);
      S.set(playerId, getResourceField(resourceType), currentResource + amount);
    } else {
      if (currentResource < amount) {
        return { success: false, error: 'Insufficient resources' };
      }
      
      S.set(playerId, getResourceField(resourceType), currentResource - amount);
      S.setGold(playerId, currentGold + totalPrice);
    }
    
    // Update market component
    M.lastTradeTick.set(world, playerId, world.tick);
    M.tradesThisHour.set(world, playerId, tradesThisHour + 1);
    
    // Emit event: MarketTradeEvent
    
    return {
      success: true,
      tradeId: ++tradeCounter,
      newGold: type === 'buy' ? currentGold - totalPrice : currentGold + totalPrice,
      newResourceAmount: type === 'buy' ? currentResource + amount : currentResource - amount,
    };
  };
  
  // System runs every tick to reset hourly counter
  const system: SystemFn = (world: World, dt: number): void => {
    // Reset hourly trade counter every 720 ticks (1 hour at 5s/tick)
    if (world.tick % 720 === 0) {
      for (let entity = 0; entity < world.entityCount; entity++) {
        if (!world.isAlive(entity)) continue;
        if (M.lastTradeTick.get(world, entity) !== undefined) {
          M.tradesThisHour.set(world, entity, 0);
        }
      }
    }
  };
  
  return { system, executeTrade };
}

function getBaseValue(params: EconomyParams, type: ResourceType): number {
  switch (type) {
    case ResourceType.GOLD: return params.baseValueGold;
    case ResourceType.WOOD: return params.baseValueWood;
    case ResourceType.STONE: return params.baseValueStone;
    case ResourceType.ENERGY: return params.baseValueEnergy;
    default: return 1.0;
  }
}

// Need world reference
let world: World;
export function setWorldReference(w: World): void { world = w; }