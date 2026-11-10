/**
 * @sim/engine - System Scheduler
 * Priority-based system execution with dependency resolution
 * Target: packages/engine/src/scheduler/SystemScheduler.ts
 */

import { World, SystemFn } from '../core/ecs';

// ============================================================================
// Types
// ============================================================================

export interface SystemDefinition {
  name: string;
  fn: SystemFn;
  priority: number;           // Lower = runs first
  phase?: string;             // Phase grouping: 'input', 'simulation', 'network', 'render'
  dependencies?: string[];    // System names that must run before this
  runCondition?: (world: World) => boolean; // Optional condition to run
}

export interface SchedulerStats {
  systemTimes: Record<string, number>;
  totalTime: number;
  tick: number;
}

// ============================================================================
// SystemScheduler
// ============================================================================

export class SystemScheduler {
  private systems: SystemDefinition[] = [];
  private executionOrder: SystemDefinition[] = [];
  private phaseOrder: string[] = ['input', 'simulation', 'network', 'render'];
  private stats: SchedulerStats = {
    systemTimes: {},
    totalTime: 0,
    tick: 0,
  };
  private enabled = true;
  
  constructor(private world: World) {}
  
  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------
  
  addSystem(def: SystemDefinition): this {
    // Validate dependencies exist
    if (def.dependencies) {
      for (const dep of def.dependencies) {
        if (!this.systems.some(s => s.name === dep)) {
          console.warn(`SystemScheduler: Dependency '${dep}' for system '${def.name}' not registered yet`);
        }
      }
    }
    
    this.systems.push(def);
    this.rebuildExecutionOrder();
    return this;
  }
  
  removeSystem(name: string): boolean {
    const idx = this.systems.findIndex(s => s.name === name);
    if (idx >= 0) {
      this.systems.splice(idx, 1);
      this.rebuildExecutionOrder();
      return true;
    }
    return false;
  }
  
  getSystem(name: string): SystemDefinition | undefined {
    return this.systems.find(s => s.name === name);
  }
  
  getSystems(): ReadonlyArray<SystemDefinition> {
    return this.systems;
  }
  
  // ---------------------------------------------------------------------------
  // Execution Order Resolution (Topological Sort)
  // ---------------------------------------------------------------------------
  
  private rebuildExecutionOrder(): void {
    // Group by phase
    const phaseMap = new Map<string, SystemDefinition[]>();
    for (const phase of this.phaseOrder) {
      phaseMap.set(phase, []);
    }
    
    for (const sys of this.systems) {
      const phase = sys.phase || 'simulation';
      const arr = phaseMap.get(phase) || [];
      arr.push(sys);
      phaseMap.set(phase, arr);
    }
    
    // Topological sort within each phase
    this.executionOrder = [];
    for (const phase of this.phaseOrder) {
      const phaseSystems = phaseMap.get(phase) || [];
      const sorted = this.topologicalSort(phaseSystems);
      this.executionOrder.push(...sorted);
    }
  }
  
  private topologicalSort(systems: SystemDefinition[]): SystemDefinition[] {
    const graph = new Map<string, SystemDefinition>();
    const inDegree = new Map<string, number>();
    
    for (const sys of systems) {
      graph.set(sys.name, sys);
      inDegree.set(sys.name, 0);
    }
    
    for (const sys of systems) {
      if (sys.dependencies) {
        for (const dep of sys.dependencies) {
          if (graph.has(dep)) {
            inDegree.set(sys.name, (inDegree.get(sys.name) || 0) + 1);
          }
        }
      }
    }
    
    const queue: SystemDefinition[] = [];
    for (const [name, degree] of inDegree) {
      if (degree === 0) {
        queue.push(graph.get(name)!);
      }
    }
    
    const result: SystemDefinition[] = [];
    while (queue.length > 0) {
      // Sort by priority within same dependency level
      queue.sort((a, b) => a.priority - b.priority);
      const current = queue.shift()!;
      result.push(current);
      
      // Reduce in-degree of dependents
      for (const sys of systems) {
        if (sys.dependencies?.includes(current.name)) {
          const newDegree = (inDegree.get(sys.name) || 0) - 1;
          inDegree.set(sys.name, newDegree);
          if (newDegree === 0) {
            queue.push(sys);
          }
        }
      }
    }
    
    // Check for cycles
    if (result.length !== systems.length) {
      console.error('SystemScheduler: Circular dependency detected!');
      // Fallback to priority sort
      return [...systems].sort((a, b) => a.priority - b.priority);
    }
    
    return result;
  }
  
  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------
  
  update(dt: number): void {
    if (!this.enabled) return;
    
    this.stats.tick = this.world.tick;
    this.stats.totalTime = 0;
    this.stats.systemTimes = {};
    
    const startTotal = performance.now();
    
    for (const sys of this.executionOrder) {
      // Check run condition
      if (sys.runCondition && !sys.runCondition(this.world)) {
        this.stats.systemTimes[sys.name] = 0;
        continue;
      }
      
      const start = performance.now();
      try {
        sys.fn(this.world, dt);
      } catch (e) {
        console.error(`SystemScheduler: Error in system '${sys.name}':`, e);
      }
      const elapsed = performance.now() - start;
      
      this.stats.systemTimes[sys.name] = elapsed;
      this.stats.totalTime += elapsed;
    }
    
    this.stats.totalTime = performance.now() - startTotal;
  }
  
  // ---------------------------------------------------------------------------
  // Control
  // ---------------------------------------------------------------------------
  
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  
  isEnabled(): boolean {
    return this.enabled;
  }
  
  getStats(): SchedulerStats {
    return { ...this.stats };
  }
  
  // ---------------------------------------------------------------------------
  // Debug / DevTools
  // ---------------------------------------------------------------------------
  
  getExecutionOrder(): ReadonlyArray<SystemDefinition> {
    return this.executionOrder;
  }
  
  printExecutionOrder(): void {
    console.group('SystemScheduler Execution Order');
    for (let i = 0; i < this.executionOrder.length; i++) {
      const sys = this.executionOrder[i];
      console.log(`${i + 1}. ${sys.name} (priority: ${sys.priority}, phase: ${sys.phase || 'simulation'})`);
      if (sys.dependencies?.length) {
        console.log(`   depends on: ${sys.dependencies.join(', ')}`);
      }
    }
    console.groupEnd();
  }
}

// ============================================================================
// Default Scheduler Factory
// Creates the standard simulation scheduler per System_Dependencies_Graph.md
// ============================================================================

export function createDefaultScheduler(world: World): SystemScheduler {
  const scheduler = new SystemScheduler(world);
  
  // Phase: Input
  scheduler.addSystem({
    name: 'InputSystem',
    fn: (world, dt) => { /* Input processing - implemented by client */ },
    priority: 0,
    phase: 'input',
  });
  
  // Phase: Simulation
  scheduler.addSystem({
    name: 'BuildingUpgradeSystem',
    fn: (world, dt) => { /* Building construction/upgrade progress */ },
    priority: 10,
    phase: 'simulation',
    dependencies: ['InputSystem'],
  });
  
  scheduler.addSystem({
    name: 'ProductionSystem',
    fn: (world, dt) => { /* Resource production */ },
    priority: 20,
    phase: 'simulation',
    dependencies: ['BuildingUpgradeSystem'],
  });
  
  scheduler.addSystem({
    name: 'UpkeepSystem',
    fn: (world, dt) => { /* Maintenance costs and daily tax */ },
    priority: 30,
    phase: 'simulation',
    dependencies: ['ProductionSystem'],
  });
  
  scheduler.addSystem({
    name: 'PopulationNeedsSystem',
    fn: (world, dt) => { /* Food consumption, happiness, growth */ },
    priority: 40,
    phase: 'simulation',
    dependencies: ['UpkeepSystem'],
  });
  
  scheduler.addSystem({
    name: 'MarketSystem',
    fn: (world, dt) => { /* Trade cooldown reset */ },
    priority: 50,
    phase: 'simulation',
    dependencies: ['InputSystem'],
  });
  
  // Phase: Network
  scheduler.addSystem({
    name: 'NetworkSyncSystem',
    fn: (world, dt) => { /* Delta serialization */ },
    priority: 100,
    phase: 'network',
    dependencies: ['ProductionSystem', 'UpkeepSystem', 'PopulationNeedsSystem', 'MarketSystem'],
  });
  
  // Phase: Render (client only)
  scheduler.addSystem({
    name: 'RenderSystem',
    fn: (world, dt) => { /* Visual interpolation/rendering */ },
    priority: 200,
    phase: 'render',
    dependencies: ['NetworkSyncSystem'],
  });
  
  return scheduler;
}

// ============================================================================
// Fixed Timestep Loop (for server/authoritative simulation)
// ============================================================================

export interface LoopConfig {
  tickRate: number;           // Ticks per second (default 20 for 5s ticks)
  maxSubSteps: number;        // Max catch-up steps
  timeScale: number;          // Simulation speed multiplier
}

export class FixedTimestepLoop {
  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  private frameId = 0;
  
  private config: LoopConfig;
  private scheduler: SystemScheduler;
  private onTick?: (tick: number, dt: number) => void;
  private onFrame?: (interpolationAlpha: number) => void;
  
  constructor(
    scheduler: SystemScheduler,
    config: Partial<LoopConfig> = {}
  ) {
    this.config = {
      tickRate: 20,           // 20 ticks/sec = 50ms per tick (but we use 5s = 0.2 Hz)
      maxSubSteps: 10,
      timeScale: 1.0,
      ...config,
    };
    
    // For 5-second ticks: tickRate = 0.2, tickDuration = 5000ms
    // But FixedTimestepLoop expects Hz, so we'll use a different approach
    this.scheduler = scheduler;
  }
  
  // For 5-second ticks, we use a custom step
  private tickDurationMs = 5000; // 5 seconds per tick
  
  start(onTick?: (tick: number, dt: number) => void, onFrame?: (alpha: number) => void): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.onTick = onTick;
    this.onFrame = onFrame;
    this.tick();
  }
  
  stop(): void {
    this.running = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }
  }
  
  private tick = (): void => {
    if (!this.running) return;
    
    const now = performance.now();
    const frameDt = (now - this.lastTime) * this.config.timeScale;
    this.lastTime = now;
    
    this.accumulator += frameDt;
    
    // Process fixed timesteps
    while (this.accumulator >= this.tickDurationMs) {
      const tickDt = this.tickDurationMs;
      this.accumulator -= tickDt;
      
      this.scheduler.update(tickDt);
      
      if (this.onTick) {
        this.onTick(this.scheduler['world'].tick, tickDt);
      }
    }
    
    // Interpolation alpha for rendering (0-1)
    const alpha = this.accumulator / this.tickDurationMs;
    
    if (this.onFrame) {
      this.onFrame(alpha);
    }
    
    this.frameId = requestAnimationFrame(this.tick);
  };
  
  // For server: step manually without requestAnimationFrame
  step(dtMs: number): number {
    this.accumulator += dtMs * this.config.timeScale;
    let steps = 0;
    
    while (this.accumulator >= this.tickDurationMs && steps < this.config.maxSubSteps) {
      this.accumulator -= this.tickDurationMs;
      this.scheduler.update(this.tickDurationMs);
      steps++;
    }
    
    return steps;
  }
  
  getInterpolationAlpha(): number {
    return this.accumulator / this.tickDurationMs;
  }
  
  setTimeScale(scale: number): void {
    this.config.timeScale = scale;
  }
  
  getConfig(): LoopConfig {
    return { ...this.config };
  }
  
  isRunning(): boolean {
    return this.running;
  }
}

// ============================================================================
// Server Loop (simpler, no render)
// ============================================================================

export class ServerLoop {
  private running = false;
  private intervalId: NodeJS.Timeout | null = null;
  private lastTick = 0;
  
  constructor(
    private scheduler: SystemScheduler,
    private tickRate = 0.2 // 5 seconds per tick = 0.2 Hz
  ) {}
  
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTick = Date.now();
    
    const tickIntervalMs = 1000 / this.tickRate; // 5000ms
    
    this.intervalId = setInterval(() => {
      const now = Date.now();
      const dt = now - this.lastTick;
      this.lastTick = now;
      
      this.scheduler.update(dt);
    }, tickIntervalMs);
  }
  
  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  
  // Manual step for testing
  step(dtMs: number): void {
    this.scheduler.update(dtMs);
  }
  
  isRunning(): boolean {
    return this.running;
  }
}