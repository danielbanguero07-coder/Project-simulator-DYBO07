/**
 * @sim/engine - Main Entry Point
 * Core simulation engine exports
 */

// Core ECS
export { 
  World, 
  Entity, 
  ComponentId, 
  SystemFn,
  Query,
  QueryResult,
  ComponentDefinition,
  ComponentAccessors,
  WorldSnapshot,
  ComponentSnapshot,
  MAX_ENTITIES,
  MAX_COMPONENTS,
  INVALID_ENTITY,
} from './core/ecs';

// Component factory helpers
export { defineComponent, createComponent, getComponent, setComponent, defineComponentAccessors } from './core/ecs';

// Math Utilities
export { 
  MathUtils,
  RNG,
  createSeededRNG,
  createRNGFromState,
  FIXED_POINT_SHIFT,
  FIXED_POINT_ONE,
  toFixedPoint,
  fromFixedPoint,
  fpAdd,
  fpSub,
  fpMul,
  fpDiv,
  fpAbs,
  fpMin,
  fpMax,
  fpClamp,
  fpSqrt,
  fpSin,
  fpCos,
  fpAtan2,
  intMul,
  intDiv,
  intMod,
  intClamp,
  intLerp,
  Vec2,
  Vec3,
  vec2Create,
  vec2CreateFP,
  vec2Add,
  vec2Sub,
  vec2Scale,
  vec2Len,
  vec2LenSq,
  vec2Normalize,
  vec2Lerp,
  vec2Distance,
  vec2DistanceSq,
  vec2ToFloat,
  vec3Create,
  vec3Add,
  vec3Sub,
  vec3Scale,
  vec3Len,
  vec3Normalize,
  hashString,
  hashCombine,
  hashInt,
  TICK_RATE,
  TICK_DURATION_MS,
  TICK_DURATION_FP,
  ticksToMs,
  msToTicks,
  ticksToSeconds,
  secondsToTicks,
} from './math';

// Economy Components
export {
  BuildingType,
  BuildingState,
  ResourceType,
  BuildingComponent,
  ResourceStorageComponent,
  ProductionComponent,
  PopulationComponent,
  UpgradeQueueComponent,
  MarketComponent,
  EconomyParams,
  DEFAULT_ECONOMY_PARAMS,
  registerEconomyComponents,
  createBuilding,
  setWorldReference as setEconomyWorldReference,
} from './components/economy';

// Graphics Components
export {
  SpriteRefComponent,
  registerGraphicsComponents,
  SpriteRef,
  SpriteRefData,
  AtlasIndex,
  SpriteFlags,
  AnimationComponent,
  ParticleEmitterComponent,
  createSpriteRef,
  getBuildingSprite,
} from './components/graphics';

// Systems
export {
  createProductionSystem,
  createUpkeepSystem,
  createMarketSystem,
  MarketTradeRequest,
  MarketTradeResult,
  setWorldReference as setEconomySystemsWorldReference,
} from './systems/economy';

export {
  createBuildingUpgradeSystem,
  BuildingCommands,
  BuildRequest,
  BuildResult,
  setWorldReference as setBuildingWorldReference,
} from './systems/building';

export {
  createPopulationNeedsSystem,
  updatePopulationCapacity,
  getPopulationStats,
  PopulationStats,
  setWorldReference as setPopulationWorldReference,
} from './systems/population';

// Scheduler
export {
  SystemScheduler,
  SystemDefinition,
  SchedulerStats,
  createDefaultScheduler,
  FixedTimestepLoop,
  ServerLoop,
  LoopConfig,
} from './scheduler/SystemScheduler';

// Network
export {
  GameSerializer,
  StateInterpolator,
  StateReconciler,
  SerializedGameState,
  SerializedPlayerState,
  SerializedEntityState,
  DeltaUpdate,
  EntityDelta,
  PlayerDelta,
  InterpolatedState,
  InterpolatedEntity,
  InterpolatedPlayer,
  ReconciliationResult,
  EntityCorrection,
} from './network/Serialization';

// DevTools
export {
  DevTools,
  createDevTools,
} from './devtools/DevTools';