/**
 * @sim/engine - Building Systems
 * Building construction and upgrade progression
 * Target: packages/engine/src/systems/building.ts
 */

import { World, SystemFn } from '../core/ecs';
import { 
  BuildingType, BuildingState, ResourceType,
  EconomyParams,
  registerEconomyComponents,
  type ComponentAccessors 
} from '../components/economy';
import { MathUtils } from '../math';

// ============================================================================
// Build Time and Cost Calculation
// ============================================================================

interface BuildingConfig {
  baseCostGold: number;
  baseCostWood: number;
  baseCostStone: number;
  baseCostEnergy: number;
  buildTimeSec: number;
}

const BUILDING_CONFIGS: Record<BuildingType, BuildingConfig> = {
  [BuildingType.WOODCUTTER]: {
    baseCostGold: 100,
    baseCostWood: 50,
    baseCostStone: 0,
    baseCostEnergy: 0,
    buildTimeSec: 300,
  },
  [BuildingType.STONE_MINE]: {
    baseCostGold: 120,
    baseCostWood: 0,
    baseCostStone: 60,
    baseCostEnergy: 0,
    buildTimeSec: 360,
  },
  [BuildingType.GENERATOR]: {
    baseCostGold: 150,
    baseCostWood: 0,
    baseCostStone: 80,
    baseCostEnergy: 0,
    buildTimeSec: 420,
  },
  [BuildingType.HOUSE]: {
    baseCostGold: 80,
    baseCostWood: 40,
    baseCostStone: 0,
    baseCostEnergy: 0,
    buildTimeSec: 180,
  },
};

const UPGRADE_MULTIPLIER = 1.35;

// ============================================================================
// System: BuildingUpgradeSystem
// Handles building construction progress and level upgrades
// ============================================================================

export function createBuildingUpgradeSystem(accessors: ComponentAccessors): SystemFn {
  return (world: World, dt: number): void => {
    const B = accessors.Building;
    
    for (let entity = 0; entity < world.entityCount; entity++) {
      if (!world.isAlive(entity)) continue;
      if (B.get(world, entity) === 0) continue;
      
      const state = B.state.get(world, entity);
      
      if (state === BuildingState.BUILDING) {
        // Initial construction
        const buildTime = getBuildTime(B.get(world, entity), 1);
        const progress = B.progress.get(world, entity) / MathUtils.FIXED_POINT_ONE;
        const dtSec = dt / 1000; // dt in ms, convert to seconds
        
        const newProgress = progress + dtSec / buildTime;
        
        if (newProgress >= 1.0) {
          // Construction complete
          B.state.set(world, entity, BuildingState.PRODUCING);
          B.progress.set(world, entity, MathUtils.FIXED_POINT_ONE);
          B.lastUpdateTick.set(world, entity, world.tick);
          
          // Initialize production rate
          initializeProductionRate(world, accessors, entity);
          
          // Emit event: BuildCompletedEvent
        } else {
          B.progress.set(world, entity, MathUtils.toFixedPoint(newProgress));
        }
      } else if (state === BuildingState.UPGRADING) {
        // Upgrade in progress
        const level = B.level.get(world, entity);
        const buildTime = getBuildTime(B.get(world, entity), level);
        const progress = B.progress.get(world, entity) / MathUtils.FIXED_POINT_ONE;
        const dtSec = dt / 1000;
        
        const newProgress = progress + dtSec / buildTime;
        
        if (newProgress >= 1.0) {
          // Upgrade complete
          B.level.set(world, entity, level + 1);
          B.state.set(world, entity, BuildingState.PRODUCING);
          B.progress.set(world, entity, MathUtils.FIXED_POINT_ONE);
          B.lastUpdateTick.set(world, entity, world.tick);
          
          // Recalculate production rate
          initializeProductionRate(world, accessors, entity);
          
          // Emit event: UpgradeCompletedEvent
        } else {
          B.progress.set(world, entity, MathUtils.toFixedPoint(newProgress));
        }
      }
    }
  };
}

function getBuildTime(buildingType: BuildingType, targetLevel: number): number {
  const config = BUILDING_CONFIGS[buildingType];
  return config.buildTimeSec * Math.pow(UPGRADE_MULTIPLIER, targetLevel - 1);
}

function initializeProductionRate(world: World, accessors: ComponentAccessors, entity: number): void {
  const B = accessors.Building;
  const P = accessors.Production;
  
  const buildingType = B.get(world, entity);
  const level = B.level.get(world, entity);
  const efficiency = B.efficiency.get(world, entity) / MathUtils.FIXED_POINT_ONE;
  
  const baseRate = getBaseProductionRate(buildingType);
  const ratePerTick = baseRate * level * efficiency;
  
  P.ratePerTick.set(world, entity, ratePerTick);
}

function getBaseProductionRate(type: BuildingType): number {
  switch (type) {
    case BuildingType.WOODCUTTER: return 0.5;
    case BuildingType.STONE_MINE: return 0.6;
    case BuildingType.GENERATOR: return 1.0;
    case BuildingType.HOUSE: return 0; // Houses provide population capacity
    default: return 0;
  }
}

// ============================================================================
// Public API for Building Commands
// ============================================================================

export interface BuildRequest {
  playerId: number;
  buildingType: BuildingType;
  x: number;
  y: number;
}

export interface BuildResult {
  success: boolean;
  error?: string;
  entityId?: number;
  cost?: { gold: number; wood: number; stone: number; energy: number };
}

export function createBuildingCommands(accessors: ComponentAccessors) {
  const B = accessors.Building;
  const S = accessors.ResourceStorage;
  const P = accessors.Production;
  
  function canAfford(playerId: number, cost: { gold: number; wood: number; stone: number; energy: number }): boolean {
    return (S.getGold(playerId) || 0) >= cost.gold &&
           (S.getWood(playerId) || 0) >= cost.wood &&
           (S.getStone(playerId) || 0) >= cost.stone &&
           (S.getEnergy(playerId) || 0) >= cost.energy;
  }
  
  function deductCost(playerId: number, cost: { gold: number; wood: number; stone: number; energy: number }): void {
    S.setGold(playerId, (S.getGold(playerId) || 0) - cost.gold);
    S.setWood(playerId, (S.getWood(playerId) || 0) - cost.wood);
    S.setStone(playerId, (S.getStone(playerId) || 0) - cost.stone);
    S.setEnergy(playerId, (S.getEnergy(playerId) || 0) - cost.energy);
  }
  
  function getBuildCost(buildingType: BuildingType, level: number): { gold: number; wood: number; stone: number; energy: number } {
    const config = BUILDING_CONFIGS[buildingType];
    const mult = Math.pow(UPGRADE_MULTIPLIER, level - 1);
    return {
      gold: Math.floor(config.baseCostGold * mult),
      wood: Math.floor(config.baseCostWood * mult),
      stone: Math.floor(config.baseCostStone * mult),
      energy: Math.floor(config.baseCostEnergy * mult),
    };
  }
  
  return {
    // Start building a new structure
    startBuild(request: BuildRequest): BuildResult {
      const { playerId, buildingType, x, y } = request;
      
      if (!world.isAlive(playerId)) {
        return { success: false, error: 'Player not found' };
      }
      
      const cost = getBuildCost(buildingType, 1);
      
      if (!canAfford(playerId, cost)) {
        return { success: false, error: 'Insufficient resources' };
      }
      
      // Check population capacity for houses
      if (buildingType === BuildingType.HOUSE) {
        const pop = accessors.Population.population.get(world, playerId) || 0;
        const cap = accessors.Population.capacity.get(world, playerId) || 0;
        // Houses increase capacity, so this is fine
      }
      
      deductCost(playerId, cost);
      
      const entity = world.createEntity();
      
      // Initialize building
      B.set(world, entity, buildingType);
      B.level.set(world, entity, 1);
      B.state.set(world, entity, BuildingState.BUILDING);
      B.ownerId.set(world, entity, playerId);
      B.positionX.set(world, entity, MathUtils.toFixedPoint(x));
      B.positionY.set(world, entity, MathUtils.toFixedPoint(y));
      B.progress.set(world, entity, 0);
      B.efficiency.set(world, entity, MathUtils.FIXED_POINT_ONE);
      B.lastUpdateTick.set(world, entity, world.tick);
      B.productionRate.set(world, entity, 0);
      
      // Initialize production component
      const resourceType = getResourceTypeForBuilding(buildingType);
      P.resourceType.set(world, entity, resourceType);
      P.ratePerTick.set(world, entity, 0); // Will be set when building completes
      P.lastProductionTick.set(world, entity, world.tick);
      P.accumulator.set(world, entity, 0);
      
      // Emit event: BuildStartedEvent
      
      return { success: true, entityId: entity, cost };
    },
    
    // Start upgrade
    startUpgrade(entity: number): BuildResult {
      if (!world.isAlive(entity)) {
        return { success: false, error: 'Building not found' };
      }
      
      if (B.get(world, entity) === 0) {
        return { success: false, error: 'Not a building' };
      }
      
      const state = B.state.get(world, entity);
      if (state !== BuildingState.PRODUCING && state !== BuildingState.IDLE) {
        return { success: false, error: 'Building not ready for upgrade' };
      }
      
      const buildingType = B.get(world, entity);
      const level = B.level.get(world, entity);
      const ownerId = B.ownerId.get(world, entity);
      
      if (!world.isAlive(ownerId)) {
        return { success: false, error: 'Owner not found' };
      }
      
      const cost = getBuildCost(buildingType, level + 1);
      
      if (!canAfford(ownerId, cost)) {
        return { success: false, error: 'Insufficient resources for upgrade' };
      }
      
      deductCost(ownerId, cost);
      
      B.state.set(world, entity, BuildingState.UPGRADING);
      B.progress.set(world, entity, 0);
      
      // Emit event: UpgradeStartedEvent
      
      return { success: true, entityId: entity, cost };
    },
    
    // Cancel construction/upgrade
    cancelBuild(entity: number): BuildResult {
      if (!world.isAlive(entity)) {
        return { success: false, error: 'Building not found' };
      }
      
      const state = B.state.get(world, entity);
      if (state !== BuildingState.BUILDING && state !== BuildingState.UPGRADING) {
        return { success: false, error: 'Not building or upgrading' };
      }
      
      const buildingType = B.get(world, entity);
      const level = B.level.get(world, entity);
      const ownerId = B.ownerId.get(world, entity);
      
      if (!world.isAlive(ownerId)) {
        return { success: false, error: 'Owner not found' };
      }
      
      // Refund 50%
      const cost = getBuildCost(buildingType, state === BuildingState.BUILDING ? 1 : level);
      const refund = {
        gold: Math.floor(cost.gold * 0.5),
        wood: Math.floor(cost.wood * 0.5),
        stone: Math.floor(cost.stone * 0.5),
        energy: Math.floor(cost.energy * 0.5),
      };
      
      S.setGold(ownerId, (S.getGold(ownerId) || 0) + refund.gold);
      S.setWood(ownerId, (S.getWood(ownerId) || 0) + refund.wood);
      S.setStone(ownerId, (S.getStone(ownerId) || 0) + refund.stone);
      S.setEnergy(ownerId, (S.getEnergy(ownerId) || 0) + refund.energy);
      
      // Destroy entity if was building, revert state if upgrading
      if (state === BuildingState.BUILDING) {
        world.destroyEntity(entity);
      } else {
        B.state.set(world, entity, BuildingState.PRODUCING);
        B.progress.set(world, entity, MathUtils.FIXED_POINT_ONE);
      }
      
      // Emit event: BuildCancelledEvent
      
      return { success: true, entityId: entity, cost: refund };
    },
  };
}

function getResourceTypeForBuilding(type: BuildingType): ResourceType {
  switch (type) {
    case BuildingType.WOODCUTTER: return ResourceType.GOLD;
    case BuildingType.STONE_MINE: return ResourceType.STONE;
    case BuildingType.GENERATOR: return ResourceType.ENERGY;
    case BuildingType.HOUSE: return ResourceType.FOOD;
    default: return ResourceType.GOLD;
  }
}

// Need world reference
let world: World;
export function setWorldReference(w: World): void { world = w; }