/**
 * @sim/engine - Graphics Components
 * SpriteRef and visual components for PixiJS rendering
 * Target: packages/engine/src/components/graphics.ts
 */

import { World, ComponentAccessors } from '../core/ecs';
import { MathUtils, toFixedPoint } from '../math';

// ============================================================================
// SpriteRef Component (matches spec from team)
// ============================================================================

/**
 * SpriteRefComponent
 * References a texture atlas frame for rendering
 * Fields (8): atlasId, frameId, tint, scale, anchorX, anchorY, zIndex, flags
 * 
 * Naming convention: category/object_variant_state
 * Examples: building/house_l1_idle, resource/gold, ui/icon_hammer_pressed, vfx/particle_smoke
 */
export const SpriteRefComponent = {
  name: 'SpriteRefComponent',
  fields: [
    'atlas',      // ui16 - atlas index (0=buildings, 1=resources, 2=ui, 3=vfx, 4=terrain)
    'frame',      // ui16 - frame index within atlas
    'tint',       // ui32 - ARGB tint color (0xFFFFFF = no tint)
    'scale',      // f32  - scale multiplier (Q16.16 fixed-point)
    'anchorX',    // f32  - anchor X (Q16.16, default 0.5)
    'anchorY',    // f32  - anchor Y (Q16.16, default 0.5)
    'zIndex',     // i16  - render order
    'flags',      // ui16 - bitfield: 1=flipX, 2=flipY, 4=additive, 8=premultiplyAlpha
  ] as const,
  types: [
    'uint16',
    'uint16',
    'uint32',
    'float32',
    'float32',
    'float32',
    'int16',
    'uint16',
  ] as const,
} as const;

// Atlas indices
export enum AtlasIndex {
  BUILDINGS = 0,
  RESOURCES = 1,
  UI = 2,
  VFX = 3,
  TERRAIN = 4,
  UNITS = 5,
}

// SpriteRef flags
export enum SpriteFlags {
  FLIP_X = 1 << 0,
  FLIP_Y = 1 << 1,
  ADDITIVE = 1 << 2,
  PREMULTIPLY_ALPHA = 1 << 3,
}

// ============================================================================
// Animation Component
// ============================================================================

export const AnimationComponent = {
  name: 'AnimationComponent',
  fields: [
    'frameStart',      // ui16 - first frame index
    'frameEnd',        // ui16 - last frame index
    'frameRate',       // f32  - frames per second (Q16.16)
    'currentFrame',    // f32  - current frame (Q16.16)
    'loop',            // ui8  - boolean
    'playing',         // ui8  - boolean
  ] as const,
  types: [
    'uint16',
    'uint16',
    'float32',
    'float32',
    'uint8',
    'uint8',
  ] as const,
} as const;

// ============================================================================
// Particle Effect Component
// ============================================================================

export const ParticleEmitterComponent = {
  name: 'ParticleEmitterComponent',
  fields: [
    'atlas',           // ui16 - atlas index
    'frame',           // ui16 - frame index
    'spawnRate',       // f32  - particles per second (Q16.16)
    'lifetime',        // f32  - particle lifetime in seconds (Q16.16)
    'speedMin',        // f32  - min speed (Q16.16)
    'speedMax',        // f32  - max speed (Q16.16)
    'scaleStart',      // f32  - start scale (Q16.16)
    'scaleEnd',        // f32  - end scale (Q16.16)
    'alphaStart',      // f32  - start alpha (Q16.16)
    'alphaEnd',        // f32  - end alpha (Q16.16)
    'emitting',        // ui8  - boolean
    'accumulator',     // f32  - spawn accumulator (Q16.16)
  ] as const,
  types: [
    'uint16',
    'uint16',
    'float32',
    'float32',
    'float32',
    'float32',
    'float32',
    'float32',
    'float32',
    'float32',
    'uint8',
    'float32',
  ] as const,
} as const;

// ============================================================================
// Registration
// ============================================================================

export function registerGraphicsComponents(world: World): ComponentAccessors {
  const accessors: ComponentAccessors = {};
  
  // SpriteRefComponent (8 fields)
  const atlas = world.defineComponent({ name: 'SpriteRef.atlas', size: 1, type: 'uint16' });
  const frame = world.defineComponent({ name: 'SpriteRef.frame', size: 1, type: 'uint16' });
  const tint = world.defineComponent({ name: 'SpriteRef.tint', size: 1, type: 'uint32' });
  const scale = world.defineComponent({ name: 'SpriteRef.scale', size: 1, type: 'float32' });
  const anchorX = world.defineComponent({ name: 'SpriteRef.anchorX', size: 1, type: 'float32' });
  const anchorY = world.defineComponent({ name: 'SpriteRef.anchorY', size: 1, type: 'float32' });
  const zIndex = world.defineComponent({ name: 'SpriteRef.zIndex', size: 1, type: 'int16' });
  const flags = world.defineComponent({ name: 'SpriteRef.flags', size: 1, type: 'uint16' });
  
  accessors.SpriteRef = {
    id: atlas,
    atlas: { get: (w, e) => w.storage.getUint32(atlas, e, 0), set: (w, e, v) => w.storage.setUint32(atlas, e, 0, v) },
    frame: { get: (w, e) => w.storage.getUint32(frame, e, 0), set: (w, e, v) => w.storage.setUint32(frame, e, 0, v) },
    tint: { get: (w, e) => w.storage.getUint32(tint, e, 0), set: (w, e, v) => w.storage.setUint32(tint, e, 0, v) },
    scale: { get: (w, e) => w.storage.getFloat32(scale, e, 0), set: (w, e, v) => w.storage.setFloat32(scale, e, 0, v) },
    anchorX: { get: (w, e) => w.storage.getFloat32(anchorX, e, 0), set: (w, e, v) => w.storage.setFloat32(anchorX, e, 0, v) },
    anchorY: { get: (w, e) => w.storage.getFloat32(anchorY, e, 0), set: (w, e, v) => w.storage.setFloat32(anchorY, e, 0, v) },
    zIndex: { get: (w, e) => w.storage.getInt32(zIndex, e, 0), set: (w, e, v) => w.storage.setInt32(zIndex, e, 0, v) },
    flags: { get: (w, e) => w.storage.getUint32(flags, e, 0), set: (w, e, v) => w.storage.setUint32(flags, e, 0, v) },
  };
  
  // AnimationComponent
  const animFrameStart = world.defineComponent({ name: 'Animation.frameStart', size: 1, type: 'uint16' });
  const animFrameEnd = world.defineComponent({ name: 'Animation.frameEnd', size: 1, type: 'uint16' });
  const animFrameRate = world.defineComponent({ name: 'Animation.frameRate', size: 1, type: 'float32' });
  const animCurrentFrame = world.defineComponent({ name: 'Animation.currentFrame', size: 1, type: 'float32' });
  const animLoop = world.defineComponent({ name: 'Animation.loop', size: 1, type: 'uint8' });
  const animPlaying = world.defineComponent({ name: 'Animation.playing', size: 1, type: 'uint8' });
  
  accessors.Animation = {
    id: animFrameStart,
    frameStart: { get: (w, e) => w.storage.getUint32(animFrameStart, e, 0), set: (w, e, v) => w.storage.setUint32(animFrameStart, e, 0, v) },
    frameEnd: { get: (w, e) => w.storage.getUint32(animFrameEnd, e, 0), set: (w, e, v) => w.storage.setUint32(animFrameEnd, e, 0, v) },
    frameRate: { get: (w, e) => w.storage.getFloat32(animFrameRate, e, 0), set: (w, e, v) => w.storage.setFloat32(animFrameRate, e, 0, v) },
    currentFrame: { get: (w, e) => w.storage.getFloat32(animCurrentFrame, e, 0), set: (w, e, v) => w.storage.setFloat32(animCurrentFrame, e, 0, v) },
    loop: { get: (w, e) => w.storage.getUint32(animLoop, e, 0), set: (w, e, v) => w.storage.setUint32(animLoop, e, 0, v) },
    playing: { get: (w, e) => w.storage.getUint32(animPlaying, e, 0), set: (w, e, v) => w.storage.setUint32(animPlaying, e, 0, v) },
  };
  
  // ParticleEmitterComponent
  const peAtlas = world.defineComponent({ name: 'ParticleEmitter.atlas', size: 1, type: 'uint16' });
  const peFrame = world.defineComponent({ name: 'ParticleEmitter.frame', size: 1, type: 'uint16' });
  const peSpawnRate = world.defineComponent({ name: 'ParticleEmitter.spawnRate', size: 1, type: 'float32' });
  const peLifetime = world.defineComponent({ name: 'ParticleEmitter.lifetime', size: 1, type: 'float32' });
  const peSpeedMin = world.defineComponent({ name: 'ParticleEmitter.speedMin', size: 1, type: 'float32' });
  const peSpeedMax = world.defineComponent({ name: 'ParticleEmitter.speedMax', size: 1, type: 'float32' });
  const peScaleStart = world.defineComponent({ name: 'ParticleEmitter.scaleStart', size: 1, type: 'float32' });
  const peScaleEnd = world.defineComponent({ name: 'ParticleEmitter.scaleEnd', size: 1, type: 'float32' });
  const peAlphaStart = world.defineComponent({ name: 'ParticleEmitter.alphaStart', size: 1, type: 'float32' });
  const peAlphaEnd = world.defineComponent({ name: 'ParticleEmitter.alphaEnd', size: 1, type: 'float32' });
  const peEmitting = world.defineComponent({ name: 'ParticleEmitter.emitting', size: 1, type: 'uint8' });
  const peAccumulator = world.defineComponent({ name: 'ParticleEmitter.accumulator', size: 1, type: 'float32' });
  
  accessors.ParticleEmitter = {
    id: peAtlas,
    atlas: { get: (w, e) => w.storage.getUint32(peAtlas, e, 0), set: (w, e, v) => w.storage.setUint32(peAtlas, e, 0, v) },
    frame: { get: (w, e) => w.storage.getUint32(peFrame, e, 0), set: (w, e, v) => w.storage.setUint32(peFrame, e, 0, v) },
    spawnRate: { get: (w, e) => w.storage.getFloat32(peSpawnRate, e, 0), set: (w, e, v) => w.storage.setFloat32(peSpawnRate, e, 0, v) },
    lifetime: { get: (w, e) => w.storage.getFloat32(peLifetime, e, 0), set: (w, e, v) => w.storage.setFloat32(peLifetime, e, 0, v) },
    speedMin: { get: (w, e) => w.storage.getFloat32(peSpeedMin, e, 0), set: (w, e, v) => w.storage.setFloat32(peSpeedMin, e, 0, v) },
    speedMax: { get: (w, e) => w.storage.getFloat32(peSpeedMax, e, 0), set: (w, e, v) => w.storage.setFloat32(peSpeedMax, e, 0, v) },
    scaleStart: { get: (w, e) => w.storage.getFloat32(peScaleStart, e, 0), set: (w, e, v) => w.storage.setFloat32(peScaleStart, e, 0, v) },
    scaleEnd: { get: (w, e) => w.storage.getFloat32(peScaleEnd, e, 0), set: (w, e, v) => w.storage.setFloat32(peScaleEnd, e, 0, v) },
    alphaStart: { get: (w, e) => w.storage.getFloat32(peAlphaStart, e, 0), set: (w, e, v) => w.storage.setFloat32(peAlphaStart, e, 0, v) },
    alphaEnd: { get: (w, e) => w.storage.getFloat32(peAlphaEnd, e, 0), set: (w, e, v) => w.storage.setFloat32(peAlphaEnd, e, 0, v) },
    emitting: { get: (w, e) => w.storage.getUint32(peEmitting, e, 0), set: (w, e, v) => w.storage.setUint32(peEmitting, e, 0, v) },
    accumulator: { get: (w, e) => w.storage.getFloat32(peAccumulator, e, 0), set: (w, e, v) => w.storage.setFloat32(peAccumulator, e, 0, v) },
  };
  
  return accessors;
}

// ============================================================================
// Helper: Create SpriteRef for Building
// ============================================================================

export interface SpriteRefData {
  atlas: AtlasIndex;
  frame: number;
  tint?: number;
  scale?: number;
  anchorX?: number;
  anchorY?: number;
  zIndex?: number;
  flags?: number;
}

export function createSpriteRef(
  world: World,
  accessors: ComponentAccessors,
  entity: number,
  data: SpriteRefData
): void {
  const S = accessors.SpriteRef;
  S.atlas.set(world, entity, data.atlas);
  S.frame.set(world, entity, data.frame);
  S.tint.set(world, entity, data.tint ?? 0xFFFFFF);
  S.scale.set(world, entity, toFixedPoint(data.scale ?? 1.0));
  S.anchorX.set(world, entity, toFixedPoint(data.anchorX ?? 0.5));
  S.anchorY.set(world, entity, toFixedPoint(data.anchorY ?? 0.5));
  S.zIndex.set(world, entity, data.zIndex ?? 0);
  S.flags.set(world, entity, data.flags ?? 0);
}

// Building type to sprite mapping
export const BUILDING_SPRITES: Record<number, { atlas: AtlasIndex; frameBase: number }> = {
  1: { atlas: AtlasIndex.BUILDINGS, frameBase: 0 },   // WOODCUTTER
  2: { atlas: AtlasIndex.BUILDINGS, frameBase: 10 },  // STONE_MINE
  3: { atlas: AtlasIndex.BUILDINGS, frameBase: 20 },  // GENERATOR
  4: { atlas: AtlasIndex.BUILDINGS, frameBase: 30 },  // HOUSE
};

// SpriteRef accessor (single field for entity)
export const SpriteRef = {
  get: (_world: World, entity: Entity, _field: string): any => null,
  set: (_world: World, _entity: Entity, _field: string, _value: any) => {},
};

export function getBuildingSprite(buildingType: number, level: number, state: number): { atlas: AtlasIndex; frame: number } {
  const base = BUILDING_SPRITES[buildingType] || { atlas: AtlasIndex.BUILDINGS, frameBase: 0 };
  // frame = frameBase + (level-1)*4 + state
  // state: 0=idle, 1=producing, 2=upgrading, 3=damaged, 4=building
  const frame = base.frameBase + (level - 1) * 4 + Math.min(state, 3);
  return { atlas: base.atlas, frame };
}