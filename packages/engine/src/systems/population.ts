/**
 * @sim/engine - Population Systems
 * Population needs, happiness, and growth
 * Target: packages/engine/src/systems/population.ts
 */

import { World, SystemFn } from '../core/ecs';
import { 
  ResourceType,
  EconomyParams,
  type ComponentAccessors 
} from '../components/economy';
import { MathUtils } from '../math';

// ============================================================================
// Constants
// ============================================================================

const FOOD_PER_CAPITA_PER_DAY = 1.0;  // 1 food per person per day
const BASE_GROWTH_RATE = 0.01;        // 1% per day base
const MAX_HAPPINESS = 1.0;
const MIN_HAPPINESS = 0.0;
const OVERPOPULATION_PENALTY = 0.8;   // -20% production

// ============================================================================
// System: PopulationNeedsSystem
// Runs daily (every 288 ticks), handles food consumption, happiness, growth
// ============================================================================

export function createPopulationNeedsSystem(accessors: ComponentAccessors): SystemFn {
  return (world: World, dt: number): void => {
    // Only run daily (every 288 ticks = 24 hours at 5s/tick)
    if (world.tick % 288 !== 0) return;
    
    const P = accessors.Population;
    const S = accessors.ResourceStorage;
    const B = accessors.Building;
    
    // Find all player entities (those with PopulationComponent)
    for (let entity = 0; entity < world.entityCount; entity++) {
      if (!world.isAlive(entity)) continue;
      if (P.population.get(world, entity) === undefined) continue;
      
      const population = P.population.get(world, entity);
      const capacity = P.capacity.get(world, entity);
      let happiness = P.happiness.get(world, entity);
      const growthRate = P.growthRate.get(world, entity);
      
      if (population === 0) continue;
      
      // Calculate food need
      const foodNeed = population * FOOD_PER_CAPITA_PER_DAY;
      const currentFood = S.getFood(entity) || 0;
      
      if (currentFood < foodNeed) {
        // Food shortage - reduce happiness
        const deficitRatio = currentFood / foodNeed;
        happiness = Math.max(MIN_HAPPINESS, happiness - (1 - deficitRatio) * 0.2);
        
        // Reduce growth rate
        const newGrowthRate = growthRate * 0.9;
        P.growthRate.set(world, entity, newGrowthRate);
        
        // Consume all available food
        S.setFood(entity, 0);
        
        // Emit event: FoodShortageEvent
      } else {
        // Sufficient food - consume and grow
        S.setFood(entity, currentFood - foodNeed);
        
        // Increase happiness slightly
        happiness = Math.min(MAX_HAPPINESS, happiness + 0.02);
        
        // Population growth
        const growth = Math.floor(population * growthRate * happiness);
        if (growth > 0 && population + growth <= capacity) {
          P.population.set(world, entity, population + growth);
        } else if (population + growth > capacity) {
          // Overpopulation - cap at capacity and apply penalty
          P.population.set(world, entity, capacity);
          // Production penalty will be applied in ProductionSystem via Building.efficiency
        }
        
        // Emit event: PopulationGrowthEvent
      }
      
      P.happiness.set(world, entity, happiness);
      
      // Apply overpopulation penalty to buildings
      if (population > capacity) {
        // Reduce efficiency of all buildings owned by this player
        for (let i = 0; i < world.entityCount; i++) {
          if (!world.isAlive(i)) continue;
          if (B.get(world, i) === 0) continue;
          if (B.ownerId.get(world, i) !== entity) continue;
          
          // Apply -20% efficiency penalty
          B.efficiency.set(world, i, MathUtils.toFixedPoint(OVERPOPULATION_PENALTY));
        }
      } else {
        // Restore normal efficiency
        for (let i = 0; i < world.entityCount; i++) {
          if (!world.isAlive(i)) continue;
          if (B.get(world, i) === 0) continue;
          if (B.ownerId.get(world, i) !== entity) continue;
          
          B.efficiency.set(world, i, MathUtils.FIXED_POINT_ONE);
        }
      }
    }
  };
}

// ============================================================================
// Helper: Update Population Capacity from Houses
// ============================================================================

export function updatePopulationCapacity(world: World, accessors: ComponentAccessors): void {
  const P = accessors.Population;
  const B = accessors.Building;
  
  for (let entity = 0; entity < world.entityCount; entity++) {
    if (!world.isAlive(entity)) continue;
    if (P.population.get(world, entity) === undefined) continue;
    
    let capacity = 0;
    
    // Sum capacity from all houses owned by this player
    for (let i = 0; i < world.entityCount; i++) {
      if (!world.isAlive(i)) continue;
      if (B.get(world, i) === 0) continue;
      if (B.ownerId.get(world, i) !== entity) continue;
      
      // Check if it's a house
      // BuildingType.HOUSE = 4
      if (B.get(world, i) === 4) {
        const level = B.level.get(world, i);
        capacity += level * 10; // 10 population per house level
      }
    }
    
    P.capacity.set(world, entity, capacity);
  }
}

// ============================================================================
// Public API
// ============================================================================

export interface PopulationStats {
  population: number;
  capacity: number;
  happiness: number;
  growthRate: number;
  utilization: number; // 0-1
}

export function getPopulationStats(world: World, accessors: ComponentAccessors, playerId: number): PopulationStats | null {
  if (!world.isAlive(playerId)) return null;
  const P = accessors.Population;
  
  const population = P.population.get(world, playerId) || 0;
  const capacity = P.capacity.get(world, playerId) || 0;
  const happiness = P.happiness.get(world, playerId) || 0;
  const growthRate = P.growthRate.get(world, playerId) || 0;
  
  return {
    population,
    capacity,
    happiness,
    growthRate,
    utilization: capacity > 0 ? population / capacity : 0,
  };
}

// Need world reference
let world: World;
export function setWorldReference(w: World): void { world = w; }