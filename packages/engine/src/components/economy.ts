/**
 * @sim/engine - Economy Components
 * bitecs-compatible component definitions for the simulation economy
 * Target: packages/engine/src/components/economy.ts
 */

import { World, ComponentId, ComponentAccessors } from '../core/ecs';
import { toFixedPoint } from '../math';

// ============================================================================
// Enums (matching GameDesign/ECS_Components_Types.ts)
// ============================================================================

export enum BuildingType {
  WOODCUTTER = 1,
  STONE_MINE = 2,
  GENERATOR = 3,
  HOUSE = 4,
}

export enum BuildingState {
  IDLE = 0,
  PRODUCING = 1,
  UPGRADING = 2,
  DAMAGED = 3,
  BUILDING = 4,
}

export enum ResourceType {
  GOLD = 0,
  WOOD = 1,
  STONE = 2,
  FOOD = 3,
  ENERGY = 4,
}

// ============================================================================
// Component Definitions (bitecs-compatible)
// ============================================================================

/**
 * BuildingComponent
 * Stores building identity, level, state, owner, position, and production data
 * Fields (9): buildingId, level, state, ownerId, positionX, positionY, progress, efficiency, lastUpdateTick, productionRate
 */
export const BuildingComponent = {
  name: 'BuildingComponent',
  fields: [
    'buildingId',      // ui32 - BuildingType enum
    'level',           // ui16 - current level (1-99)
    'state',           // ui8  - BuildingState enum
    'ownerId',         // ui32 - owning player entity
    'positionX',       // f32  - world X (fixed-point Q16.16)
    'positionY',       // f32  - world Y (fixed-point Q16.16)
    'progress',        // f32  - 0.0-1.0 build/upgrade progress
    'efficiency',      // f32  - 0.0-2.0 production efficiency modifier
    'lastUpdateTick',  // ui32 - last tick this building was processed
    'productionRate',  // f64  - resources produced per tick (base * level * efficiency)
  ] as const,
  types: [
    'uint32',
    'uint16',
    'uint8',
    'uint32',
    'float32',
    'float32',
    'float32',
    'float32',
    'uint32',
    'float64',
  ] as const,
} as const;

/**
 * ResourceStorageComponent
 * Stores current amounts and capacities for all 5 resource types
 * Fields (10): gold, wood, stone, food, energy, capacityGold, capacityWood, capacityStone, capacityFood, capacityEnergy
 */
export const ResourceStorageComponent = {
  name: 'ResourceStorageComponent',
  fields: [
    'gold',            // f64
    'wood',            // f64
    'stone',           // f64
    'food',            // f64
    'energy',          // f64
    'capacityGold',    // f64
    'capacityWood',    // f64
    'capacityStone',   // f64
    'capacityFood',    // f64
    'capacityEnergy',  // f64
  ] as const,
  types: [
    'float64',
    'float64',
    'float64',
    'float64',
    'float64',
    'float64',
    'float64',
    'float64',
    'float64',
    'float64',
  ] as const,
} as const;

/**
 * ProductionComponent
 * Handles per-tick resource production with accumulator for fractional rates
 * Fields (4): resourceType, ratePerTick, lastProductionTick, accumulator
 */
export const ProductionComponent = {
  name: 'ProductionComponent',
  fields: [
    'resourceType',        // ui8  - ResourceType enum
    'ratePerTick',         // f64  - base production rate per tick
    'lastProductionTick',  // ui32 - last tick production occurred
    'accumulator',         // f64  - fractional production accumulator
  ] as const,
  types: [
    'uint8',
    'float64',
    'uint32',
    'float64',
  ] as const,
} as const;

/**
 * PopulationComponent
 * Manages population count, capacity, happiness, and growth
 * Fields (4): population, capacity, happiness, growthRate
 */
export const PopulationComponent = {
  name: 'PopulationComponent',
  fields: [
    'population',    // ui32
    'capacity',      // ui32
    'happiness',     // f32  - 0.0-1.0
    'growthRate',    // f32  - per day (ticks)
  ] as const,
  types: [
    'uint32',
    'uint32',
    'float32',
    'float32',
  ] as const,
} as const;

/**
 * UpgradeQueueComponent
 * Handles building upgrade queue (max 3 concurrent)
 * Fields (3): queue (array of entity IDs), currentIndex, maxQueueSize
 */
export const UpgradeQueueComponent = {
  name: 'UpgradeQueueComponent',
  fields: [
    'queue',           // array of entity IDs (stored as flat array in separate buffer)
    'currentIndex',    // ui8
    'maxQueueSize',    // ui8 (default 3)
  ] as const,
  types: [
    'uint32',  // queue stored separately
    'uint8',
    'uint8',
  ] as const,
} as const;

/**
 * MarketComponent
 * Tracks market state for a player: cooldowns, transaction limits
 * Fields (4): lastTradeTick, tradesThisHour, buyCooldown, sellCooldown
 */
export const MarketComponent = {
  name: 'MarketComponent',
  fields: [
    'lastTradeTick',     // ui32
    'tradesThisHour',    // ui16
    'buyCooldown',       // ui32 (ticks)
    'sellCooldown',      // ui32 (ticks)
  ] as const,
  types: [
    'uint32',
    'uint16',
    'uint32',
    'uint32',
  ] as const,
} as const;

/**
 * EconomyParamsComponent (Singleton/Resource)
 * Global economy parameters loaded from balance_tables.csv
 * Stored as Resource in World, not per-entity
 */
export interface EconomyParams {
  // Resource base values
  baseValueGold: number;
  baseValueWood: number;
  baseValueStone: number;
  baseValueEnergy: number;
  
  // Building base rates (per tick at level 1)
  woodcutterRateGold: number;
  stoneMineRateStone: number;
  generatorRateEnergy: number;
  housePopulationCapacity: number;
  
  // Building base costs
  woodcutterCostGold: number;
  woodcutterCostWood: number;
  stoneMineCostGold: number;
  stoneMineCostStone: number;
  generatorCostGold: number;
  generatorCostStone: number;
  houseCostGold: number;
  houseCostWood: number;
  
  // Upgrade multiplier per level
  upgradeMultiplier: number;
  
  // Build times (seconds)
  woodcutterBuildTime: number;
  stoneMineBuildTime: number;
  generatorBuildTime: number;
  houseBuildTime: number;
  
  // Market multipliers
  marketBuyMultiplier: number;
  marketSellMultiplier: number;
  
  // Economy
  dailyTaxRate: number;
  globalGenerationMultiplier: number;
  constructionQueueMax: number;
  
  // XP curve
  xpPerLevel: number[];  // xp needed for each level
}

export const DEFAULT_ECONOMY_PARAMS: EconomyParams = {
  baseValueGold: 1.0,
  baseValueWood: 0.8,
  baseValueStone: 1.2,
  baseValueEnergy: 0.5,
  
  woodcutterRateGold: 0.5,
  stoneMineRateStone: 0.6,
  generatorRateEnergy: 1.0,
  housePopulationCapacity: 10,
  
  woodcutterCostGold: 100,
  woodcutterCostWood: 50,
  stoneMineCostGold: 120,
  stoneMineCostStone: 60,
  generatorCostGold: 150,
  generatorCostStone: 80,
  houseCostGold: 80,
  houseCostWood: 40,
  
  upgradeMultiplier: 1.35,
  
  woodcutterBuildTime: 300,
  stoneMineBuildTime: 360,
  generatorBuildTime: 420,
  houseBuildTime: 180,
  
  marketBuyMultiplier: 0.8,
  marketSellMultiplier: 0.6,
  
  dailyTaxRate: 0.005,
  globalGenerationMultiplier: 1.0,
  constructionQueueMax: 3,
  
  xpPerLevel: [100, 112, 125, 140, 157, 175, 195, 217, 241, 268],
};

// ============================================================================
// Component Registration Helpers
// ============================================================================

export function registerEconomyComponents(world: World): ComponentAccessors {
  const accessors: ComponentAccessors = {};
  
  // BuildingComponent (10 fields, mixed types - use separate arrays per type)
  // We'll register as multiple typed components for zero-GC SoA storage
  const buildingId = world.defineComponent({
    name: 'BuildingComponent.buildingId',
    size: 1,
    type: 'uint32',
  });
  const buildingLevel = world.defineComponent({
    name: 'BuildingComponent.level',
    size: 1,
    type: 'uint16',
  });
  const buildingState = world.defineComponent({
    name: 'BuildingComponent.state',
    size: 1,
    type: 'uint8',
  });
  const buildingOwnerId = world.defineComponent({
    name: 'BuildingComponent.ownerId',
    size: 1,
    type: 'uint32',
  });
  const buildingPosX = world.defineComponent({
    name: 'BuildingComponent.positionX',
    size: 1,
    type: 'float32',
  });
  const buildingPosY = world.defineComponent({
    name: 'BuildingComponent.positionY',
    size: 1,
    type: 'float32',
  });
  const buildingProgress = world.defineComponent({
    name: 'BuildingComponent.progress',
    size: 1,
    type: 'float32',
  });
  const buildingEfficiency = world.defineComponent({
    name: 'BuildingComponent.efficiency',
    size: 1,
    type: 'float32',
  });
  const buildingLastUpdate = world.defineComponent({
    name: 'BuildingComponent.lastUpdateTick',
    size: 1,
    type: 'uint32',
  });
  const buildingProdRate = world.defineComponent({
    name: 'BuildingComponent.productionRate',
    size: 1,
    type: 'float64',
  });
  
  accessors.Building = {
    id: buildingId,
    get: (w, e) => w.storage.getUint32(buildingId, e, 0),
    set: (w, e, v) => w.storage.setUint32(buildingId, e, 0, v),
    level: {
      get: (w, e) => w.storage.getUint32(buildingLevel, e, 0),
      set: (w, e, v) => w.storage.setUint32(buildingLevel, e, 0, v),
    },
    state: {
      get: (w, e) => w.storage.getUint32(buildingState, e, 0),
      set: (w, e, v) => w.storage.setUint32(buildingState, e, 0, v),
    },
    ownerId: {
      get: (w, e) => w.storage.getUint32(buildingOwnerId, e, 0),
      set: (w, e, v) => w.storage.setUint32(buildingOwnerId, e, 0, v),
    },
    positionX: {
      get: (w, e) => w.storage.getFloat32(buildingPosX, e, 0),
      set: (w, e, v) => w.storage.setFloat32(buildingPosX, e, 0, v),
    },
    positionY: {
      get: (w, e) => w.storage.getFloat32(buildingPosY, e, 0),
      set: (w, e, v) => w.storage.setFloat32(buildingPosY, e, 0, v),
    },
    progress: {
      get: (w, e) => w.storage.getFloat32(buildingProgress, e, 0),
      set: (w, e, v) => w.storage.setFloat32(buildingProgress, e, 0, v),
    },
    efficiency: {
      get: (w, e) => w.storage.getFloat32(buildingEfficiency, e, 0),
      set: (w, e, v) => w.storage.setFloat32(buildingEfficiency, e, 0, v),
    },
    lastUpdateTick: {
      get: (w, e) => w.storage.getUint32(buildingLastUpdate, e, 0),
      set: (w, e, v) => w.storage.setUint32(buildingLastUpdate, e, 0, v),
    },
    productionRate: {
      get: (w, e) => {
        const arr = w.storage.getArray(buildingProdRate);
        if (!arr) return 0;
        const idx = e * 1;
        // Float64Array view
        const f64 = new Float64Array(arr.buffer);
        return f64[idx];
      },
      set: (w, e, v) => {
        const arr = w.storage.getArray(buildingProdRate);
        if (!arr) return;
        const idx = e * 1;
        const f64 = new Float64Array(arr.buffer);
        f64[idx] = v;
      },
    },
  };
  
  // ResourceStorageComponent (10 float64 fields)
  const resFields = ['gold', 'wood', 'stone', 'food', 'energy', 'capacityGold', 'capacityWood', 'capacityStone', 'capacityFood', 'capacityEnergy'];
  const resComponentIds: ComponentId[] = [];
  for (let i = 0; i < 10; i++) {
    resComponentIds.push(world.defineComponent({
      name: `ResourceStorageComponent.${resFields[i]}`,
      size: 1,
      type: 'float64',
    }));
  }
  
  accessors.ResourceStorage = {
    id: resComponentIds[0],
    get: (w, e, field: string) => {
      const idx = resFields.indexOf(field);
      if (idx < 0) return 0;
      const arr = w.storage.getArray(resComponentIds[idx]);
      if (!arr) return 0;
      const f64 = new Float64Array(arr.buffer);
      return f64[e];
    },
    set: (w, e, field: string, value: number) => {
      const idx = resFields.indexOf(field);
      if (idx < 0) return;
      const arr = w.storage.getArray(resComponentIds[idx]);
      if (!arr) return;
      const f64 = new Float64Array(arr.buffer);
      f64[e] = value;
    },
    // Convenience methods
    getGold: (w, e) => { const arr = w.storage.getArray(resComponentIds[0]); if (!arr) return 0; return new Float64Array(arr.buffer)[e]; },
    setGold: (w, e, v) => { const arr = w.storage.getArray(resComponentIds[0]); if (!arr) return; new Float64Array(arr.buffer)[e] = v; },
    getWood: (w, e) => { const arr = w.storage.getArray(resComponentIds[1]); if (!arr) return 0; return new Float64Array(arr.buffer)[e]; },
    setWood: (w, e, v) => { const arr = w.storage.getArray(resComponentIds[1]); if (!arr) return; new Float64Array(arr.buffer)[e] = v; },
    getStone: (w, e) => { const arr = w.storage.getArray(resComponentIds[2]); if (!arr) return 0; return new Float64Array(arr.buffer)[e]; },
    setStone: (w, e, v) => { const arr = w.storage.getArray(resComponentIds[2]); if (!arr) return; new Float64Array(arr.buffer)[e] = v; },
    getFood: (w, e) => { const arr = w.storage.getArray(resComponentIds[3]); if (!arr) return 0; return new Float64Array(arr.buffer)[e]; },
    setFood: (w, e, v) => { const arr = w.storage.getArray(resComponentIds[3]); if (!arr) return; new Float64Array(arr.buffer)[e] = v; },
    getEnergy: (w, e) => { const arr = w.storage.getArray(resComponentIds[4]); if (!arr) return 0; return new Float64Array(arr.buffer)[e]; },
    setEnergy: (w, e, v) => { const arr = w.storage.getArray(resComponentIds[4]); if (!arr) return; new Float64Array(arr.buffer)[e] = v; },
    getCapacity: (w, e, resourceType: ResourceType) => {
      const capIdx = 5 + resourceType;
      const arr = w.storage.getArray(resComponentIds[capIdx]);
      if (!arr) return 0;
      return new Float64Array(arr.buffer)[e];
    },
    setCapacity: (w, e, resourceType: ResourceType, v: number) => {
      const capIdx = 5 + resourceType;
      const arr = w.storage.getArray(resComponentIds[capIdx]);
      if (!arr) return;
      new Float64Array(arr.buffer)[e] = v;
    },
  };
  
  // ProductionComponent (4 fields)
  const prodResourceType = world.defineComponent({ name: 'ProductionComponent.resourceType', size: 1, type: 'uint8' });
  const prodRatePerTick = world.defineComponent({ name: 'ProductionComponent.ratePerTick', size: 1, type: 'float64' });
  const prodLastTick = world.defineComponent({ name: 'ProductionComponent.lastProductionTick', size: 1, type: 'uint32' });
  const prodAccumulator = world.defineComponent({ name: 'ProductionComponent.accumulator', size: 1, type: 'float64' });
  
  accessors.Production = {
    id: prodResourceType,
    resourceType: {
      get: (w, e) => w.storage.getUint32(prodResourceType, e, 0),
      set: (w, e, v) => w.storage.setUint32(prodResourceType, e, 0, v),
    },
    ratePerTick: {
      get: (w, e) => {
        const arr = w.storage.getArray(prodRatePerTick);
        if (!arr) return 0;
        return new Float64Array(arr.buffer)[e];
      },
      set: (w, e, v) => {
        const arr = w.storage.getArray(prodRatePerTick);
        if (!arr) return;
        new Float64Array(arr.buffer)[e] = v;
      },
    },
    lastProductionTick: {
      get: (w, e) => w.storage.getUint32(prodLastTick, e, 0),
      set: (w, e, v) => w.storage.setUint32(prodLastTick, e, 0, v),
    },
    accumulator: {
      get: (w, e) => {
        const arr = w.storage.getArray(prodAccumulator);
        if (!arr) return 0;
        return new Float64Array(arr.buffer)[e];
      },
      set: (w, e, v) => {
        const arr = w.storage.getArray(prodAccumulator);
        if (!arr) return;
        new Float64Array(arr.buffer)[e] = v;
      },
    },
  };
  
  // PopulationComponent (4 fields)
  const popPopulation = world.defineComponent({ name: 'PopulationComponent.population', size: 1, type: 'uint32' });
  const popCapacity = world.defineComponent({ name: 'PopulationComponent.capacity', size: 1, type: 'uint32' });
  const popHappiness = world.defineComponent({ name: 'PopulationComponent.happiness', size: 1, type: 'float32' });
  const popGrowthRate = world.defineComponent({ name: 'PopulationComponent.growthRate', size: 1, type: 'float32' });
  
  accessors.Population = {
    id: popPopulation,
    population: {
      get: (w, e) => w.storage.getUint32(popPopulation, e, 0),
      set: (w, e, v) => w.storage.setUint32(popPopulation, e, 0, v),
    },
    capacity: {
      get: (w, e) => w.storage.getUint32(popCapacity, e, 0),
      set: (w, e, v) => w.storage.setUint32(popCapacity, e, 0, v),
    },
    happiness: {
      get: (w, e) => w.storage.getFloat32(popHappiness, e, 0),
      set: (w, e, v) => w.storage.setFloat32(popHappiness, e, 0, v),
    },
    growthRate: {
      get: (w, e) => w.storage.getFloat32(popGrowthRate, e, 0),
      set: (w, e, v) => w.storage.setFloat32(popGrowthRate, e, 0, v),
    },
  };
  
  // MarketComponent (4 fields)
  const marketLastTrade = world.defineComponent({ name: 'MarketComponent.lastTradeTick', size: 1, type: 'uint32' });
  const marketTradesHour = world.defineComponent({ name: 'MarketComponent.tradesThisHour', size: 1, type: 'uint16' });
  const marketBuyCD = world.defineComponent({ name: 'MarketComponent.buyCooldown', size: 1, type: 'uint32' });
  const marketSellCD = world.defineComponent({ name: 'MarketComponent.sellCooldown', size: 1, type: 'uint32' });
  
  accessors.Market = {
    id: marketLastTrade,
    lastTradeTick: {
      get: (w, e) => w.storage.getUint32(marketLastTrade, e, 0),
      set: (w, e, v) => w.storage.setUint32(marketLastTrade, e, 0, v),
    },
    tradesThisHour: {
      get: (w, e) => w.storage.getUint32(marketTradesHour, e, 0),
      set: (w, e, v) => w.storage.setUint32(marketTradesHour, e, 0, v),
    },
    buyCooldown: {
      get: (w, e) => w.storage.getUint32(marketBuyCD, e, 0),
      set: (w, e, v) => w.storage.setUint32(marketBuyCD, e, 0, v),
    },
    sellCooldown: {
      get: (w, e) => w.storage.getUint32(marketSellCD, e, 0),
      set: (w, e, v) => w.storage.setUint32(marketSellCD, e, 0, v),
    },
  };
  
  // Register EconomyParams as World resource
  world.setResource('economyParams', DEFAULT_ECONOMY_PARAMS);
  
  return accessors;
}

// ============================================================================
// Helper Functions for Building Creation
// ============================================================================

export function createBuilding(
  world: World,
  accessors: ComponentAccessors,
  entity: number,
  buildingType: BuildingType,
  level: number,
  ownerId: number,
  x: number,
  y: number
): void {
  const B = accessors.Building;
  B.set(world, entity, buildingType);
  B.level.set(world, entity, level);
  B.state.set(world, entity, BuildingState.BUILDING);
  B.ownerId.set(world, entity, ownerId);
  B.positionX.set(world, entity, toFixedPoint(x));
  B.positionY.set(world, entity, toFixedPoint(y));
  B.progress.set(world, entity, 0);
  B.efficiency.set(world, entity, toFixedPoint(1.0));
  B.lastUpdateTick.set(world, entity, world.tick);
  B.productionRate.set(world, entity, 0);
  
  // Add production component based on building type
  const P = accessors.Production;
  P.resourceType.set(world, entity, getResourceTypeForBuilding(buildingType));
  P.ratePerTick.set(world, entity, getBaseRateForBuilding(buildingType));
  P.lastProductionTick.set(world, entity, world.tick);
  P.accumulator.set(world, entity, 0);
}

function getResourceTypeForBuilding(type: BuildingType): ResourceType {
  switch (type) {
    case BuildingType.WOODCUTTER: return ResourceType.GOLD;
    case BuildingType.STONE_MINE: return ResourceType.STONE;
    case BuildingType.GENERATOR: return ResourceType.ENERGY;
    case BuildingType.HOUSE: return ResourceType.FOOD; // Houses consume food
    default: return ResourceType.GOLD;
  }
}

function getBaseRateForBuilding(type: BuildingType): number {
  const params = world.getResource('economyParams') as EconomyParams;
  switch (type) {
    case BuildingType.WOODCUTTER: return params.woodcutterRateGold;
    case BuildingType.STONE_MINE: return params.stoneMineRateStone;
    case BuildingType.GENERATOR: return params.generatorRateEnergy;
    case BuildingType.HOUSE: return 0; // Houses don't produce, they provide capacity
    default: return 0;
  }
}

// Need world reference for getBaseRateForBuilding
let world: World;
export function setWorldReference(w: World): void { world = w; }