// ECS Component & System Specs v0.1
// Target: bitecs implementation
// Path: packages/engine/src/components/economy.ts

import { Types, defineComponent } from 'bitecs';

// Enums
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
}

export const BuildingComponent = defineComponent({
  buildingId: Types.ui32,      // BuildingType
  level: Types.ui16,
  state: Types.ui8,            // BuildingState
  ownerId: Types.ui32,
  positionX: Types.f32,
  positionY: Types.f32,
  progress: Types.f32,         // 0.0-1.0
  efficiency: Types.f32,       // 0.0-2.0
  lastUpdateTick: Types.ui32,
  productionRate: Types.f64,   // per tick
});

export const ResourceStorageComponent = defineComponent({
  gold: Types.f64,
  wood: Types.f64,
  stone: Types.f64,
  food: Types.f64,
  energy: Types.f64,
  capacityGold: Types.f64,
  capacityWood: Types.f64,
  capacityStone: Types.f64,
  capacityFood: Types.f64,
  capacityEnergy: Types.f64,
});

export const ProductionComponent = defineComponent({
  resourceType: Types.ui8,     // 0=gold,1=wood,2=stone,3=energy
  ratePerTick: Types.f64,
  lastProductionTick: Types.ui32,
  accumulator: Types.f64,      // for fractional ticks
});

export const PopulationComponent = defineComponent({
  population: Types.ui32,
  capacity: Types.ui32,
  happiness: Types.f32,        // 0-1
  growthRate: Types.f32,       // per day
});

export const UpgradeQueueComponent = defineComponent({
  queue: Types.array,          // building entity ids
  currentIndex: Types.ui8,
  maxQueueSize: Types.ui8,     // default 3
});

// System Specs - Pseudocode

// ProductionSystem
// Runs every tick
// For each entity with BuildingComponent + ProductionComponent + ResourceStorageComponent
// if state == PRODUCING:
//   delta = ratePerTick * efficiency * dt
//   store delta in accumulator
//   if accumulator >=1: add to storage, subtract

// UpkeepSystem
// Runs daily tick
// Deduct maintenance cost = sum(building.level * upkeepBase)
// Apply daily tax 0.5% storage

// MarketSystem
// Handles buy/sell with spread
// Validates storage capacity

// Serialization contract
// State snapshot: { tick, entities: [{id, components}] }
// Deterministic: same seed + inputs => same state
