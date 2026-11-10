# @sim/engine

Core simulation engine for web simulation games. Deterministic ECS, fixed-timestep game loop, and simulation systems.

## Features

- **ECS (Entity Component System)**: Zero-GC, cache-friendly SoA storage using TypedArrays
- **Fixed Timestep Loop**: 5s server ticks + 60Hz client interpolation
- **Deterministic**: seedrandom PRNG, fixed-point math, snapshot/rollback
- **Systems**: Economy, Building, Population, Time - pure functions, testable
- **Network Sync**: Full snapshots + deltas, MessagePack serialization, client prediction
- **DevTools**: ECS inspector, time-travel debugging, performance overlay

## Installation

```bash
pnpm add @sim/engine
```

## Quick Start

```typescript
import { 
  World, 
  createDefaultScheduler, 
  FixedTimestepLoop,
  registerEconomyComponents,
  createProductionSystem,
  createBuildingUpgradeSystem,
  createUpkeepSystem,
  createPopulationNeedsSystem,
  createBuildingCommands,
  BuildingType,
} from '@sim/engine';

// 1. Create world
const world = new World({ maxEntities: 10000 });
world.rng = createSeededRNG('my-game-seed');

// 2. Register components
const accessors = registerEconomyComponents(world);

// 3. Create systems
const scheduler = createDefaultScheduler(world);
scheduler.addSystem({
  name: 'ProductionSystem',
  fn: createProductionSystem(accessors),
  priority: 20,
  phase: 'simulation',
  dependencies: ['BuildingUpgradeSystem'],
});
scheduler.addSystem({
  name: 'BuildingUpgradeSystem',
  fn: createBuildingUpgradeSystem(accessors),
  priority: 10,
  phase: 'simulation',
  dependencies: ['InputSystem'],
});
scheduler.addSystem({
  name: 'UpkeepSystem',
  fn: createUpkeepSystem(accessors),
  priority: 30,
  phase: 'simulation',
  dependencies: ['ProductionSystem'],
});
scheduler.addSystem({
  name: 'PopulationNeedsSystem',
  fn: createPopulationNeedsSystem(accessors),
  priority: 40,
  phase: 'simulation',
  dependencies: ['UpkeepSystem'],
});

// 4. Run simulation (server)
const serverLoop = new ServerLoop(scheduler);
serverLoop.start();

// Or client with interpolation
const loop = new FixedTimestepLoop(scheduler);
loop.start(
  (tick, dt) => console.log(`Server tick ${tick}`),
  (alpha) => render(alpha) // Client render with interpolation
);
```

## Architecture

```
packages/engine/
├── src/
│   ├── core/           # ECS: World, Query, Component storage
│   ├── math/           # RNG, fixed-point, vectors, hash
│   ├── components/     # Economy, Graphics, etc.
│   ├── systems/        # Production, Upkeep, Building, Population, Market
│   ├── scheduler/      # SystemScheduler, FixedTimestepLoop, ServerLoop
│   ├── network/        # Serialization, Interpolation, Reconciliation
│   └── devtools/       # Inspector, Time-travel, Perf overlay
├── tests/              # Deterministic unit tests
├── demo/               # 10k entities @ 60fps demo
└── docs/               # ADDING_SYSTEMS, COMPONENT_CONVENTIONS, ASSET_PIPELINE
```

## Key Concepts

### Deterministic Simulation
- Same seed + same inputs = identical state tick-for-tick
- No `Date.now()`, `Math.random()`, or non-deterministic APIs
- Fixed-point math (Q16.16) for positions/rates
- Server-authoritative with client prediction

### ECS Data Layout (SoA)
```typescript
// Component storage uses TypedArrays
const positionX = new Float32Array(MAX_ENTITIES);
const positionY = new Float32Array(MAX_ENTITIES);
const velocityX = new Float32Array(MAX_ENTITIES);
// ... cache-friendly, zero-GC
```

### System Execution Order
```
InputSystem → BuildingUpgradeSystem → ProductionSystem → UpkeepSystem → PopulationNeedsSystem → NetworkSyncSystem → RenderSystem
```

## Testing

```bash
pnpm test           # Run all tests
pnpm test:watch     # Watch mode
```

Tests use fixed seeds for deterministic verification.

## Demo

```bash
pnpm demo           # Open 10k entities demo
pnpm demo:build     # Build demo for production
```

## Documentation

- [Adding Systems](docs/ADDING_SYSTEMS.md)
- [Component Conventions](docs/COMPONENT_CONVENTIONS.md)
- [Asset Pipeline](docs/ASSET_PIPELINE.md)

## License

MIT