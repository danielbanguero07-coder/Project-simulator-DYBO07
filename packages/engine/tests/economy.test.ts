/**
 * @sim/engine - Deterministic Economy Tests
 * Tests with fixed seeds to ensure reproducible simulation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../src/core/ecs';
import { 
  BuildingType, BuildingState, ResourceType,
  registerEconomyComponents,
  createProductionSystem,
  createUpkeepSystem,
  createMarketSystem,
  createBuildingUpgradeSystem,
  createBuildingCommands,
  createPopulationNeedsSystem,
  updatePopulationCapacity,
} from '../src/index';
import { createSeededRNG } from '../src/math';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestWorld(seed = 'test-seed'): World {
  const world = new World({ maxEntities: 10000 });
  world.rng = createSeededRNG(seed);
  return world;
}

function setupEconomy(world: World) {
  const accessors = registerEconomyComponents(world);
  
  // Create player entity (entity 0)
  const playerId = world.createEntity(); // Should be 0
  
  // Initialize player resources
  const S = accessors.ResourceStorage;
  S.setGold(playerId, 10000);
  S.setWood(playerId, 1000);
  S.setStone(playerId, 1000);
  S.setFood(playerId, 1000);
  S.setEnergy(playerId, 1000);
  
  // Set capacities
  S.setCapacity(playerId, ResourceType.GOLD, 100000);
  S.setCapacity(playerId, ResourceType.WOOD, 10000);
  S.setCapacity(playerId, ResourceType.STONE, 10000);
  S.setCapacity(playerId, ResourceType.FOOD, 10000);
  S.setCapacity(playerId, ResourceType.ENERGY, 10000);
  
  // Initialize population
  const P = accessors.Population;
  P.population.set(world, playerId, 10);
  P.capacity.set(world, playerId, 50);
  P.happiness.set(world, playerId, 1.0);
  P.growthRate.set(world, playerId, 0.01);
  
  // Initialize market
  const M = accessors.Market;
  M.lastTradeTick.set(world, playerId, 0);
  M.tradesThisHour.set(world, playerId, 0);
  M.buyCooldown.set(world, playerId, 0);
  M.sellCooldown.set(world, playerId, 0);
  
  return { accessors, playerId };
}

// ============================================================================
// Deterministic Tests
// ============================================================================

describe('Economy Simulation - Deterministic', () => {
  let world: World;
  let accessors: any;
  let playerId: number;
  
  beforeEach(() => {
    world = createTestWorld('deterministic-test-123');
    const setup = setupEconomy(world);
    accessors = setup.accessors;
    playerId = setup.playerId;
  });
  
  it('should produce identical state with same seed', () => {
    // Create a woodcutter
    const buildingCommands = createBuildingCommands(accessors);
    const result = buildingCommands.startBuild({
      playerId,
      buildingType: BuildingType.WOODCUTTER,
      x: 100,
      y: 100,
    });
    
    expect(result.success).toBe(true);
    const buildingId = result.entityId!;
    
    // Run production system for 10 ticks
    const productionSystem = createProductionSystem(accessors);
    for (let i = 0; i < 10; i++) {
      productionSystem(world, 5000);
    }
    
    // Capture state
    const gold1 = accessors.ResourceStorage.getGold(world, playerId);
    const snapshot1 = world.serialize();
    
    // Reset and run again with same seed
    world.clear();
    world.rng = createSeededRNG('deterministic-test-123');
    const setup2 = setupEconomy(world);
    const accessors2 = setup2.accessors;
    const playerId2 = setup2.playerId;
    
    const buildingCommands2 = createBuildingCommands(accessors2);
    const result2 = buildingCommands2.startBuild({
      playerId: playerId2,
      buildingType: BuildingType.WOODCUTTER,
      x: 100,
      y: 100,
    });
    
    expect(result2.success).toBe(true);
    const buildingId2 = result2.entityId!;
    
    const productionSystem2 = createProductionSystem(accessors2);
    for (let i = 0; i < 10; i++) {
      productionSystem2(world, 5000);
    }
    
    const gold2 = accessors2.ResourceStorage.getGold(world, playerId2);
    const snapshot2 = world.serialize();
    
    // States should be identical
    expect(gold1).toBe(gold2);
    expect(snapshot1.tick).toBe(snapshot2.tick);
    expect(snapshot1.entityCount).toBe(snapshot2.entityCount);
    expect(snapshot1.aliveCount).toBe(snapshot2.aliveCount);
  });
  
  it('should produce resources at correct rate', () => {
    const buildingCommands = createBuildingCommands(accessors);
    const result = buildingCommands.startBuild({
      playerId,
      buildingType: BuildingType.WOODCUTTER,
      x: 0,
      y: 0,
    });
    
    expect(result.success).toBe(true);
    const buildingId = result.entityId!;
    
    // Fast-forward construction (300 seconds = 60 ticks at 5s/tick)
    for (let i = 0; i < 60; i++) {
      world.update(5000);
    }
    
    // Building should now be producing
    const state = accessors.Building.state.get(world, buildingId);
    expect(state).toBe(BuildingState.PRODUCING);
    
    // Run production for 10 ticks
    // Woodcutter level 1: 0.5 gold/tick
    // 10 ticks * 0.5 = 5 gold (plus initial 10000 - 100 cost = 9900)
    const initialGold = accessors.ResourceStorage.getGold(world, playerId);
    
    const productionSystem = createProductionSystem(accessors);
    for (let i = 0; i < 10; i++) {
      productionSystem(world, 5000);
    }
    
    const finalGold = accessors.ResourceStorage.getGold(world, playerId);
    // Should have produced 5 gold (0.5 per tick * 10 ticks)
    expect(finalGold - initialGold).toBe(5);
  });
  
  it('should handle storage capacity limit', () => {
    const buildingCommands = createBuildingCommands(accessors);
    const result = buildingCommands.startBuild({
      playerId,
      buildingType: BuildingType.WOODCUTTER,
      x: 0,
      y: 0,
    });
    
    // Fast-forward construction
    for (let i = 0; i < 60; i++) {
      world.update(5000);
    }
    
    // Set very low capacity
    accessors.ResourceStorage.setCapacity(playerId, ResourceType.GOLD, 5);
    
    const initialGold = accessors.ResourceStorage.getGold(world, playerId);
    
    const productionSystem = createProductionSystem(accessors);
    for (let i = 0; i < 10; i++) {
      productionSystem(world, 5000);
    }
    
    const finalGold = accessors.ResourceStorage.getGold(world, playerId);
    // Should not exceed capacity
    expect(finalGold).toBeLessThanOrEqual(5);
  });
  
  it('should deduct upkeep correctly', () => {
    const buildingCommands = createBuildingCommands(accessors);
    const result = buildingCommands.startBuild({
      playerId,
      buildingType: BuildingType.WOODCUTTER,
      x: 0,
      y: 0,
    });
    
    // Fast-forward construction
    for (let i = 0; i < 60; i++) {
      world.update(5000);
    }
    
    const initialGold = accessors.ResourceStorage.getGold(world, playerId);
    
    // Run upkeep system (runs every 288 ticks)
    // Manually trigger by setting tick
    world.tick = 288;
    const upkeepSystem = createUpkeepSystem(accessors);
    upkeepSystem(world, 5000);
    
    const finalGold = accessors.ResourceStorage.getGold(world, playerId);
    // Upkeep for level 1 woodcutter: 0.5 gold
    expect(initialGold - finalGold).toBe(0.5);
  });
  
  it('should damage buildings when upkeep cannot be paid', () => {
    const buildingCommands = createBuildingCommands(accessors);
    const result = buildingCommands.startBuild({
      playerId,
      buildingType: BuildingType.WOODCUTTER,
      x: 0,
      y: 0,
    });
    
    // Fast-forward construction
    for (let i = 0; i < 60; i++) {
      world.update(5000);
    }
    
    // Drain gold
    accessors.ResourceStorage.setGold(playerId, 0);
    
    // Run upkeep
    world.tick = 288;
    const upkeepSystem = createUpkeepSystem(accessors);
    upkeepSystem(world, 5000);
    
    const buildingId = result.entityId!;
    const state = accessors.Building.state.get(world, buildingId);
    expect(state).toBe(BuildingState.DAMAGED);
  });
  
  it('should execute market trades correctly', () => {
    // Buy 10 wood for gold
    // Base value wood = 0.8, buy multiplier = 0.8
    // Price per wood = 0.8 * 0.8 = 0.64 gold
    // 10 wood = 6.4 gold
    
    const { system: marketSystem, executeTrade } = createMarketSystem(accessors);
    
    const initialGold = accessors.ResourceStorage.getGold(world, playerId);
    const initialWood = accessors.ResourceStorage.getWood(world, playerId);
    
    const result = executeTrade({
      playerId,
      type: 'buy',
      resourceType: ResourceType.WOOD,
      amount: 10,
    });
    
    expect(result.success).toBe(true);
    
    const finalGold = accessors.ResourceStorage.getGold(world, playerId);
    const finalWood = accessors.ResourceStorage.getWood(world, playerId);
    
    expect(finalWood - initialWood).toBe(10);
    expect(initialGold - finalGold).toBeCloseTo(6.4, 1);
  });
  
  it('should reject trades exceeding capacity', () => {
    // Set low wood capacity
    accessors.ResourceStorage.setCapacity(playerId, ResourceType.WOOD, 5);
    
    const { executeTrade } = createMarketSystem(accessors);
    
    const result = executeTrade({
      playerId,
      type: 'buy',
      resourceType: ResourceType.WOOD,
      amount: 10,
    });
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('Storage capacity exceeded');
  });
  
  it('should upgrade buildings and increase production', () => {
    const buildingCommands = createBuildingCommands(accessors);
    const result = buildingCommands.startBuild({
      playerId,
      buildingType: BuildingType.WOODCUTTER,
      x: 0,
      y: 0,
    });
    
    const buildingId = result.entityId!;
    
    // Fast-forward construction
    for (let i = 0; i < 60; i++) {
      world.update(5000);
    }
    
    // Verify level 1 production rate
    const rate1 = accessors.Production.ratePerTick.get(world, buildingId);
    expect(rate1).toBe(0.5);
    
    // Upgrade to level 2
    const upgradeResult = buildingCommands.startUpgrade(buildingId);
    expect(upgradeResult.success).toBe(true);
    
    // Fast-forward upgrade (300 * 1.35 = 405 seconds = 81 ticks)
    for (let i = 0; i < 81; i++) {
      world.update(5000);
    }
    
    // Verify level 2
    const level = accessors.Building.level.get(world, buildingId);
    expect(level).toBe(2);
    
    // Verify increased production rate (0.5 * 2 * 1.35 = 1.35)
    const rate2 = accessors.Production.ratePerTick.get(world, buildingId);
    expect(rate2).toBeCloseTo(1.35, 2);
  });
  
  it('should handle population growth and food consumption', () => {
    // Set up population
    accessors.Population.population.set(world, playerId, 10);
    accessors.Population.capacity.set(world, playerId, 50);
    accessors.Population.happiness.set(world, playerId, 1.0);
    accessors.Population.growthRate.set(world, playerId, 0.1); // 10% per day
    accessors.ResourceStorage.setFood(playerId, 100);
    
    // Run population system (every 288 ticks)
    world.tick = 288;
    const popSystem = createPopulationNeedsSystem(accessors);
    popSystem(world, 5000);
    
    // Should consume 10 food (1 per capita)
    const food = accessors.ResourceStorage.getFood(world, playerId);
    expect(food).toBe(90);
    
    // Population should grow: floor(10 * 0.1 * 1.0) = 1
    const pop = accessors.Population.population.get(world, playerId);
    expect(pop).toBe(11);
  });
  
  it('should reduce happiness when food insufficient', () => {
    accessors.Population.population.set(world, playerId, 10);
    accessors.Population.capacity.set(world, playerId, 50);
    accessors.Population.happiness.set(world, playerId, 1.0);
    accessors.ResourceStorage.setFood(playerId, 5); // Only 5 food for 10 people
    
    world.tick = 288;
    const popSystem = createPopulationNeedsSystem(accessors);
    popSystem(world, 5000);
    
    const happiness = accessors.Population.happiness.get(world, playerId);
    expect(happiness).toBeLessThan(1.0);
    
    const growthRate = accessors.Population.growthRate.get(world, playerId);
    expect(growthRate).toBeLessThan(0.1);
  });
  
  it('should apply overpopulation penalty to production', () => {
    const buildingCommands = createBuildingCommands(accessors);
    const result = buildingCommands.startBuild({
      playerId,
      buildingType: BuildingType.WOODCUTTER,
      x: 0,
      y: 0,
    });
    
    // Fast-forward construction
    for (let i = 0; i < 60; i++) {
      world.update(5000);
    }
    
    // Set population over capacity
    accessors.Population.population.set(world, playerId, 60);
    accessors.Population.capacity.set(world, playerId, 50);
    
    // Run population system to trigger penalty
    world.tick = 288;
    const popSystem = createPopulationNeedsSystem(accessors);
    popSystem(world, 5000);
    
    const buildingId = result.entityId!;
    const efficiency = accessors.Building.efficiency.get(world, buildingId);
    // Should be 0.8 (80% = -20% penalty)
    expect(efficiency / MathUtils.FIXED_POINT_ONE).toBeCloseTo(0.8, 2);
  });
});

// ============================================================================
// Stress Test
// ============================================================================

describe('Economy Simulation - Stress', () => {
  it('should handle 10k buildings efficiently', () => {
    const world = createTestWorld('stress-test');
    const { accessors, playerId } = setupEconomy(world);
    
    const buildingCommands = createBuildingCommands(accessors);
    
    // Create 10k buildings
    const startTime = performance.now();
    for (let i = 0; i < 10000; i++) {
      const result = buildingCommands.startBuild({
        playerId,
        buildingType: BuildingType.WOODCUTTER,
        x: i % 1000,
        y: Math.floor(i / 1000),
      });
      expect(result.success).toBe(true);
    }
    const createTime = performance.now() - startTime;
    console.log(`Created 10k buildings in ${createTime.toFixed(2)}ms`);
    
    // Fast-forward all construction
    for (let tick = 0; tick < 60; tick++) {
      world.update(5000);
    }
    
    // Run production for 100 ticks and measure
    const productionSystem = createProductionSystem(accessors);
    const prodStartTime = performance.now();
    for (let i = 0; i < 100; i++) {
      productionSystem(world, 5000);
    }
    const prodTime = performance.now() - prodStartTime;
    console.log(`100 production ticks for 10k buildings: ${prodTime.toFixed(2)}ms`);
    
    // Should complete in reasonable time (< 100ms for 100 ticks = < 1ms/tick)
    expect(prodTime).toBeLessThan(100);
  });
});

// ============================================================================
// Serialization Tests
// ============================================================================

describe('Serialization - Deterministic', () => {
  it('should serialize and deserialize identically', () => {
    const world = createTestWorld('serialize-test');
    const { accessors, playerId } = setupEconomy(world);
    
    const buildingCommands = createBuildingCommands(accessors);
    const result = buildingCommands.startBuild({
      playerId,
      buildingType: BuildingType.WOODCUTTER,
      x: 10,
      y: 20,
    });
    
    // Run a few ticks
    for (let i = 0; i < 5; i++) {
      world.update(5000);
    }
    
    // Serialize
    const snapshot = world.serialize();
    
    // Create new world and deserialize
    const world2 = createTestWorld('serialize-test');
    const { accessors: accessors2, playerId: playerId2 } = setupEconomy(world2);
    
    world2.deserialize(snapshot);
    
    // Verify state matches
    expect(world2.tick).toBe(world.tick);
    expect(world2.entityCount).toBe(world.entityCount);
    expect(world2.aliveCount).toBe(world.aliveCount);
    
    const buildingId = result.entityId!;
    const buildingId2 = buildingId; // Same entity ID after deserialize
    
    const state1 = accessors.Building.state.get(world, buildingId);
    const state2 = accessors2.Building.state.get(world2, buildingId2);
    expect(state1).toBe(state2);
    
    const gold1 = accessors.ResourceStorage.getGold(world, playerId);
    const gold2 = accessors2.ResourceStorage.getGold(world2, playerId2);
    expect(gold1).toBe(gold2);
  });
});