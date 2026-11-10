/**
 * @sim/engine - ECS Core
 * Zero-GC, cache-friendly Entity Component System inspired by bitecs
 * Uses typed arrays (Float32Array, Int32Array, Uint32Array) for storage
 */

import { MathUtils, RNG, Vec2 } from '../math';

// ============================================================================
// Types & Constants
// ============================================================================

export type Entity = number; // Entity ID (index in arrays)
export type ComponentId = number;
export type SystemFn = (world: World, dt: number) => void;

export const MAX_ENTITIES = 1_000_000;
export const MAX_COMPONENTS = 1024;
export const INVALID_ENTITY = -1;

export interface ComponentDefinition<T = unknown> {
  name: string;
  size: number; // Number of elements per entity
  type: 'float32' | 'int32' | 'uint32' | 'uint16' | 'uint8';
  defaultValue?: T;
  onAdd?: (world: World, entity: Entity) => void;
  onRemove?: (world: World, entity: Entity) => void;
}

export interface QueryResult {
  entities: Entity[];
  count: number;
}

// ============================================================================
// Component Storage (SoA - Structure of Arrays)
// ============================================================================

class ComponentStorage {
  private float32Arrays: Map<ComponentId, Float32Array> = new Map();
  private int32Arrays: Map<ComponentId, Int32Array> = new Map();
  private uint32Arrays: Map<ComponentId, Uint32Array> = new Map();
  private uint16Arrays: Map<ComponentId, Uint16Array> = new Map();
  private uint8Arrays: Map<ComponentId, Uint8Array> = new Map();
  
  private definitions: Map<ComponentId, ComponentDefinition> = new Map();
  private nextComponentId = 0;
  
  register<T>(definition: ComponentDefinition<T>): ComponentId {
    const id = this.nextComponentId++;
    if (id >= MAX_COMPONENTS) {
      throw new Error(`Max components (${MAX_COMPONENTS}) exceeded`);
    }
    
    this.definitions.set(id, definition);
    
    const arraySize = MAX_ENTITIES * definition.size;
    switch (definition.type) {
      case 'float32':
        this.float32Arrays.set(id, new Float32Array(arraySize));
        break;
      case 'int32':
        this.int32Arrays.set(id, new Int32Array(arraySize));
        break;
      case 'uint32':
        this.uint32Arrays.set(id, new Uint32Array(arraySize));
        break;
      case 'uint16':
        this.uint16Arrays.set(id, new Uint16Array(arraySize));
        break;
      case 'uint8':
        this.uint8Arrays.set(id, new Uint8Array(arraySize));
        break;
    }
    
    return id;
  }
  
  getDefinition(id: ComponentId): ComponentDefinition | undefined {
    return this.definitions.get(id);
  }
  
  getArray(id: ComponentId): Float32Array | Int32Array | Uint32Array | Uint16Array | Uint8Array | undefined {
    return (
      this.float32Arrays.get(id) ||
      this.int32Arrays.get(id) ||
      this.uint32Arrays.get(id) ||
      this.uint16Arrays.get(id) ||
      this.uint8Arrays.get(id)
    );
  }
  
  getFloat32Array(id: ComponentId): Float32Array | undefined {
    return this.float32Arrays.get(id);
  }
  
  getInt32Array(id: ComponentId): Int32Array | undefined {
    return this.int32Arrays.get(id);
  }
  
  getUint32Array(id: ComponentId): Uint32Array | undefined {
    return this.uint32Arrays.get(id);
  }
  
  getUint16Array(id: ComponentId): Uint16Array | undefined {
    return this.uint16Arrays.get(id);
  }
  
  getUint8Array(id: ComponentId): Uint8Array | undefined {
    return this.uint8Arrays.get(id);
  }
  
  setFloat32(id: ComponentId, entity: Entity, index: number, value: number): void {
    const arr = this.float32Arrays.get(id);
    if (arr) arr[entity * this.definitions.get(id)!.size + index] = value;
  }
  
  getFloat32(id: ComponentId, entity: Entity, index: number): number {
    const arr = this.float32Arrays.get(id);
    if (!arr) return 0;
    return arr[entity * this.definitions.get(id)!.size + index];
  }
  
  setInt32(id: ComponentId, entity: Entity, index: number, value: number): void {
    const arr = this.int32Arrays.get(id);
    if (arr) arr[entity * this.definitions.get(id)!.size + index] = value;
  }
  
  getInt32(id: ComponentId, entity: Entity, index: number): number {
    const arr = this.int32Arrays.get(id);
    if (!arr) return 0;
    return arr[entity * this.definitions.get(id)!.size + index];
  }
  
  setUint32(id: ComponentId, entity: Entity, index: number, value: number): void {
    const arr = this.uint32Arrays.get(id);
    if (arr) arr[entity * this.definitions.get(id)!.size + index] = value;
  }
  
  getUint32(id: ComponentId, entity: Entity, index: number): number {
    const arr = this.uint32Arrays.get(id);
    if (!arr) return 0;
    return arr[entity * this.definitions.get(id)!.size + index];
  }
  
  clearEntity(entity: Entity): void {
    for (const [id, def] of this.definitions) {
      const offset = entity * def.size;
      switch (def.type) {
        case 'float32': {
          const arr = this.float32Arrays.get(id)!;
          if (def.defaultValue !== undefined) {
            const dv = def.defaultValue as number[];
            for (let i = 0; i < def.size; i++) arr[offset + i] = dv[i];
          } else {
            for (let i = 0; i < def.size; i++) arr[offset + i] = 0;
          }
          break;
        }
        case 'int32': {
          const arr = this.int32Arrays.get(id)!;
          if (def.defaultValue !== undefined) {
            const dv = def.defaultValue as number[];
            for (let i = 0; i < def.size; i++) arr[offset + i] = dv[i];
          } else {
            for (let i = 0; i < def.size; i++) arr[offset + i] = 0;
          }
          break;
        }
        case 'uint32': {
          const arr = this.uint32Arrays.get(id)!;
          if (def.defaultValue !== undefined) {
            const dv = def.defaultValue as number[];
            for (let i = 0; i < def.size; i++) arr[offset + i] = dv[i];
          } else {
            for (let i = 0; i < def.size; i++) arr[offset + i] = 0;
          }
          break;
        }
        case 'uint16': {
          const arr = this.uint16Arrays.get(id)!;
          for (let i = 0; i < def.size; i++) arr[offset + i] = 0;
          break;
        }
        case 'uint8': {
          const arr = this.uint8Arrays.get(id)!;
          for (let i = 0; i < def.size; i++) arr[offset + i] = 0;
          break;
        }
      }
    }
  }
  
  reset(): void {
    for (const arr of this.float32Arrays.values()) arr.fill(0);
    for (const arr of this.int32Arrays.values()) arr.fill(0);
    for (const arr of this.uint32Arrays.values()) arr.fill(0);
    for (const arr of this.uint16Arrays.values()) arr.fill(0);
    for (const arr of this.uint8Arrays.values()) arr.fill(0);
  }
}

// ============================================================================
// World - Main ECS Container
// ============================================================================

export interface WorldConfig {
  maxEntities?: number;
  autoClear?: boolean;
}

export class World {
  public readonly storage = new ComponentStorage();
  public readonly entities: Uint32Array;
  public readonly alive: Uint8Array;
  public readonly version: Uint32Array;
  
  public entityCount = 0;
  public aliveCount = 0;
  public tick = 0;
  public time = 0;
  public dt = 0;
  
  public rng: RNG;
  
  private freeList: Entity[] = [];
  private systems: Array<{ fn: SystemFn; priority: number; name: string }> = [];
  private queries: Map<string, Query> = new Map();
  private resources: Map<string, unknown> = new Map();
  
  constructor(config: WorldConfig = {}) {
    const maxEntities = config.maxEntities ?? MAX_ENTITIES;
    this.entities = new Uint32Array(maxEntities);
    this.alive = new Uint8Array(maxEntities);
    this.version = new Uint32Array(maxEntities);
    this.rng = MathUtils.createSeededRNG('world');
    
    // Initialize entity IDs
    for (let i = 0; i < maxEntities; i++) {
      this.entities[i] = i;
    }
  }
  
  // ---------------------------------------------------------------------------
  // Entity Management
  // ---------------------------------------------------------------------------
  
  createEntity(): Entity {
    let entity: Entity;
    
    if (this.freeList.length > 0) {
      entity = this.freeList.pop()!;
    } else if (this.entityCount < this.entities.length) {
      entity = this.entityCount++;
    } else {
      throw new Error('Max entities reached');
    }
    
    this.alive[entity] = 1;
    this.version[entity]++;
    this.aliveCount++;
    
    // Initialize components to defaults
    this.storage.clearEntity(entity);
    
    return entity;
  }
  
  destroyEntity(entity: Entity): boolean {
    if (entity < 0 || entity >= this.entities.length || this.alive[entity] === 0) {
      return false;
    }
    
    this.alive[entity] = 0;
    this.aliveCount--;
    this.freeList.push(entity);
    
    // Call onRemove callbacks
    for (const [id, def] of this.storage['definitions']) {
      if (def.onRemove) {
        try { def.onRemove(this, entity); } catch (e) { console.error(e); }
      }
    }
    
    return true;
  }
  
  isAlive(entity: Entity): boolean {
    return entity >= 0 && entity < this.entities.length && this.alive[entity] === 1;
  }
  
  getVersion(entity: Entity): number {
    return this.version[entity];
  }
  
  // ---------------------------------------------------------------------------
  // Component Management
  // ---------------------------------------------------------------------------
  
  defineComponent<T>(definition: ComponentDefinition<T>): ComponentId {
    return this.storage.register(definition);
  }
  
  hasComponent(entity: Entity, componentId: ComponentId): boolean {
    return this.isAlive(entity);
  }
  
  addComponent(entity: Entity, componentId: ComponentId): boolean {
    if (!this.isAlive(entity)) return false;
    
    const def = this.storage.getDefinition(componentId);
    if (def?.onAdd) {
      try { def.onAdd(this, entity); } catch (e) { console.error(e); }
    }
    
    return true;
  }
  
  removeComponent(entity: Entity, componentId: ComponentId): boolean {
    if (!this.isAlive(entity)) return false;
    
    const def = this.storage.getDefinition(componentId);
    if (def?.onRemove) {
      try { def.onRemove(this, entity); } catch (e) { console.error(e); }
    }
    
    return true;
  }
  
  // ---------------------------------------------------------------------------
  // Resource Management (Singletons)
  // ---------------------------------------------------------------------------
  
  setResource<T>(key: string, value: T): void {
    this.resources.set(key, value);
  }
  
  getResource<T>(key: string): T | undefined {
    return this.resources.get(key) as T | undefined;
  }
  
  hasResource(key: string): boolean {
    return this.resources.has(key);
  }
  
  removeResource(key: string): boolean {
    return this.resources.delete(key);
  }
  
  // ---------------------------------------------------------------------------
  // System Management
  // ---------------------------------------------------------------------------
  
  addSystem(fn: SystemFn, priority = 0, name = fn.name || 'anonymous'): void {
    this.systems.push({ fn, priority, name });
    this.systems.sort((a, b) => a.priority - b.priority);
  }
  
  removeSystem(fn: SystemFn): boolean {
    const idx = this.systems.findIndex(s => s.fn === fn);
    if (idx >= 0) {
      this.systems.splice(idx, 1);
      return true;
    }
    return false;
  }
  
  getSystems(): ReadonlyArray<{ fn: SystemFn; priority: number; name: string }> {
    return this.systems;
  }
  
  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------
  
  query(...componentIds: ComponentId[]): Query {
    const key = componentIds.sort((a, b) => a - b).join(',');
    let query = this.queries.get(key);
    if (!query) {
      query = new Query(this, componentIds);
      this.queries.set(key, query);
    }
    return query;
  }
  
  // ---------------------------------------------------------------------------
  // Tick / Update
  // ---------------------------------------------------------------------------
  
  update(dt: number): void {
    this.dt = dt;
    this.time += dt;
    this.tick++;
    
    for (const system of this.systems) {
      try {
        system.fn(this, dt);
      } catch (e) {
        console.error(`Error in system ${system.name}:`, e);
      }
    }
    
    // Update queries
    for (const query of this.queries.values()) {
      query.update();
    }
  }
  
  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------
  
  serialize(): WorldSnapshot {
    const components: Record<string, ComponentSnapshot> = {};
    
    for (const [id, def] of this.storage['definitions']) {
      const arr = this.storage.getArray(id);
      if (!arr) continue;
      
      components[def.name] = {
        type: def.type,
        size: def.size,
        data: Array.from(arr.slice(0, this.entityCount * def.size)),
      };
    }
    
    return {
      tick: this.tick,
      time: this.time,
      entityCount: this.entityCount,
      aliveCount: this.aliveCount,
      alive: Array.from(this.alive.slice(0, this.entityCount)),
      version: Array.from(this.version.slice(0, this.entityCount)),
      components,
      resources: Object.fromEntries(this.resources),
    };
  }
  
  deserialize(snapshot: WorldSnapshot): void {
    this.tick = snapshot.tick;
    this.time = snapshot.time;
    this.entityCount = snapshot.entityCount;
    this.aliveCount = snapshot.aliveCount;
    
    this.alive.set(snapshot.alive);
    this.version.set(snapshot.version);
    
    for (const [name, comp] of Object.entries(snapshot.components)) {
      const def = Array.from(this.storage['definitions'].values()).find(d => d.name === name);
      if (!def) continue;
      
      const id = Array.from(this.storage['definitions'].entries()).find(([, d]) => d.name === name)?.[0];
      if (id === undefined) continue;
      
      const arr = this.storage.getArray(id);
      if (!arr) continue;
      
      arr.set(comp.data);
    }
    
    this.resources.clear();
    for (const [key, value] of Object.entries(snapshot.resources)) {
      this.resources.set(key, value);
    }
    
    // Rebuild free list
    this.freeList = [];
    for (let i = 0; i < this.entityCount; i++) {
      if (this.alive[i] === 0) this.freeList.push(i);
    }
    
    // Update queries
    for (const query of this.queries.values()) {
      query.update();
    }
  }
  
  // ---------------------------------------------------------------------------
  // Reset / Clear
  // ---------------------------------------------------------------------------
  
  clear(): void {
    this.entityCount = 0;
    this.aliveCount = 0;
    this.tick = 0;
    this.time = 0;
    this.dt = 0;
    this.alive.fill(0);
    this.version.fill(0);
    this.freeList = [];
    this.storage.reset();
    this.resources.clear();
    for (const query of this.queries.values()) {
      query.entities.length = 0;
      query.count = 0;
    }
  }
}

// ============================================================================
// Query - Efficient Entity Filtering
// ============================================================================

export class Query {
  public entities: Entity[] = [];
  public count = 0;
  
  private world: World;
  private required: ComponentId[];
  private lastTick = -1;
  
  constructor(world: World, required: ComponentId[]) {
    this.world = world;
    this.required = required;
    this.update();
  }
  
  update(): void {
    if (this.lastTick === this.world.tick) return;
    this.lastTick = this.world.tick;
    
    this.entities.length = 0;
    
    for (let i = 0; i < this.world.entityCount; i++) {
      if (!this.world.alive[i]) continue;
      
      let hasAll = true;
      for (const compId of this.required) {
        // In this simple implementation, we assume all alive entities have all components
        // A more sophisticated version would track component masks per entity
      }
      
      if (hasAll) {
        this.entities.push(i);
      }
    }
    
    this.count = this.entities.length;
  }
  
  *[Symbol.iterator](): IterableIterator<Entity> {
    for (const entity of this.entities) {
      yield entity;
    }
  }
  
  forEach(fn: (entity: Entity) => void): void {
    for (const entity of this.entities) {
      fn(entity);
    }
  }
  
  map<T>(fn: (entity: Entity) => T): T[] {
    const result: T[] = [];
    for (const entity of this.entities) {
      result.push(fn(entity));
    }
    return result;
  }
  
  filter(fn: (entity: Entity) => boolean): Entity[] {
    const result: Entity[] = [];
    for (const entity of this.entities) {
      if (fn(entity)) result.push(entity);
    }
    return result;
  }
  
  find(fn: (entity: Entity) => boolean): Entity | undefined {
    for (const entity of this.entities) {
      if (fn(entity)) return entity;
    }
    return undefined;
  }
  
  some(fn: (entity: Entity) => boolean): boolean {
    for (const entity of this.entities) {
      if (fn(entity)) return true;
    }
    return false;
  }
  
  every(fn: (entity: Entity) => boolean): boolean {
    for (const entity of this.entities) {
      if (!fn(entity)) return false;
    }
    return true;
  }
}

// ============================================================================
// Component Helpers - Type-safe accessors
// ============================================================================

export function createComponent<T extends Record<string, number>>(
  world: World,
  name: string,
  fields: (keyof T)[],
  type: 'float32' | 'int32' | 'uint32' = 'float32',
  defaultValues?: Partial<T>
): { id: ComponentId; fields: Record<keyof T, number> } {
  const fieldIndices: Record<string, number> = {};
  fields.forEach((f, i) => { fieldIndices[f] = i; });
  
  const id = world.defineComponent({
    name,
    size: fields.length,
    type,
    defaultValue: fields.map(f => defaultValues?.[f] ?? 0) as any,
  });
  
  return { id, fields: fieldIndices as Record<keyof T, number> };
}

export function getComponent<T>(
  world: World,
  entity: Entity,
  componentId: ComponentId,
  field: number
): number {
  const def = world.storage.getDefinition(componentId);
  if (!def) return 0;
  
  switch (def.type) {
    case 'float32':
      return world.storage.getFloat32(componentId, entity, field) ?? 0;
    case 'int32':
      return world.storage.getInt32(componentId, entity, field) ?? 0;
    case 'uint32':
      return world.storage.getUint32(componentId, entity, field) ?? 0;
    default:
      return 0;
  }
}

export function setComponent(
  world: World,
  entity: Entity,
  componentId: ComponentId,
  field: number,
  value: number
): void {
  const def = world.storage.getDefinition(componentId);
  if (!def) return;
  
  switch (def.type) {
    case 'float32':
      world.storage.setFloat32(componentId, entity, field, value);
      break;
    case 'int32':
      world.storage.setInt32(componentId, entity, field, value);
      break;
    case 'uint32':
      world.storage.setUint32(componentId, entity, field, value);
      break;
  }
}

// ============================================================================
// Snapshot Types
// ============================================================================

export interface ComponentSnapshot {
  type: 'float32' | 'int32' | 'uint32' | 'uint16' | 'uint8';
  size: number;
  data: number[];
}

export interface WorldSnapshot {
  tick: number;
  time: number;
  entityCount: number;
  aliveCount: number;
  alive: number[];
  version: number[];
  components: Record<string, ComponentSnapshot>;
  resources: Record<string, unknown>;
}

// ============================================================================
// Type-safe Component Access (for common components)
// ============================================================================

export interface ComponentAccessors {
  [componentName: string]: {
    id: ComponentId;
    get: (world: World, entity: Entity, field: string) => number;
    set: (world: World, entity: Entity, field: string, value: number) => void;
  };
}

// Standalone defineComponent helper (wraps World.defineComponent)
export function defineComponent<T>(definition: ComponentDefinition<T> & { name: string; size: number; type: ComponentDefinition<T>['type'] }): ComponentId {
  // This is a factory function for when you need to define a component
  // without a world instance (returns a placeholder ID)
  // In practice, use world.defineComponent() directly
  // This is exported for bitecs API compatibility
  console.warn('defineComponent() called without world instance - use world.defineComponent() instead');
  return 0;
}

export function defineComponentAccessors(world: World, definitions: Record<string, { fields: string[]; type?: 'float32' | 'int32' | 'uint32' }>): ComponentAccessors {
  const accessors: ComponentAccessors = {};
  
  for (const [name, def] of Object.entries(definitions)) {
    const { id, fields } = createComponent(world, name, def.fields, def.type ?? 'float32');
    
    accessors[name] = {
      id,
      get: (w, e, field) => getComponent(w, e, id, fields[field as keyof typeof fields]),
      set: (w, e, field, value) => setComponent(w, e, id, fields[field as keyof typeof fields], value),
    };
  }
  
  return accessors;
}