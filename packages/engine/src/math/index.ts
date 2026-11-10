/**
 * @sim/engine - Core Math Utilities
 * Deterministic RNG, Fixed-point math, Integer-only operations for simulation
 */

// ============================================================================
// Deterministic RNG (seedrandom wrapper)
// ============================================================================

import seedrandom from 'seedrandom';

export interface RNG {
  (): number;
  int32(): number;
  uint32(): number;
  float32(): number;
  bool(probability?: number): boolean;
  range(min: number, max: number): number;
  shuffle<T>(array: T[]): T[];
  choice<T>(array: readonly T[]): T;
  gaussian(mean?: number, stdDev?: number): number;
  seed: string;
  clone(): RNG;
  serialize(): string;
}

function createRNG(seed: string): RNG {
  const rng = seedrandom(seed, { state: true });
  
  const api: RNG = Object.assign(
    () => rng(),
    {
      int32(): number {
        return Math.floor(rng() * 0x100000000) | 0;
      },
      uint32(): number {
        return rng.int32() >>> 0;
      },
      float32(): number {
        return rng.float32();
      },
      bool(probability = 0.5): boolean {
        return rng() < probability;
      },
      range(min: number, max: number): number {
        return min + rng() * (max - min);
      },
      shuffle<T>(array: T[]): T[] {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
      },
      choice<T>(array: readonly T[]): T {
        return array[Math.floor(rng() * array.length)];
      },
      gaussian(mean = 0, stdDev = 1): number {
        // Box-Muller transform
        const u1 = rng();
        const u2 = rng();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return z0 * stdDev + mean;
      },
      get seed(): string {
        return rng.seed;
      },
      clone(): RNG {
        return createRNG(rng.seed);
      },
      serialize(): string {
        return rng.state();
      }
    }
  );
  
  return api;
}

export function createSeededRNG(seed: string = 'default'): RNG {
  return createRNG(seed);
}

export function createRNGFromState(state: string): RNG {
  const rng = seedrandom('', { state: true });
  rng.state(state);
  return createRNG(rng.seed);
}

// ============================================================================
// Fixed-Point Math (Q16.16 format for deterministic simulation)
// ============================================================================

export const FIXED_POINT_SHIFT = 16;
export const FIXED_POINT_ONE = 1 << FIXED_POINT_SHIFT;
export const FIXED_POINT_MASK = FIXED_POINT_ONE - 1;

export function toFixedPoint(value: number): number {
  return Math.round(value * FIXED_POINT_ONE);
}

export function fromFixedPoint(value: number): number {
  return value / FIXED_POINT_ONE;
}

export function fpAdd(a: number, b: number): number {
  return a + b;
}

export function fpSub(a: number, b: number): number {
  return a - b;
}

export function fpMul(a: number, b: number): number {
  return Math.round((a * b) / FIXED_POINT_ONE);
}

export function fpDiv(a: number, b: number): number {
  if (b === 0) return 0;
  return Math.round((a * FIXED_POINT_ONE) / b);
}

export function fpAbs(value: number): number {
  return value < 0 ? -value : value;
}

export function fpMin(a: number, b: number): number {
  return a < b ? a : b;
}

export function fpMax(a: number, b: number): number {
  return a > b ? a : b;
}

export function fpClamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function fpSqrt(value: number): number {
  if (value <= 0) return 0;
  // Newton's method for fixed-point sqrt
  let x = value;
  let y = (x + fpDiv(FIXED_POINT_ONE, x)) >> 1;
  while (fpAbs(x - y) > 1) {
    x = y;
    y = (x + fpDiv(FIXED_POINT_ONE, x)) >> 1;
  }
  return x;
}

export function fpSin(value: number): number {
  // Fixed-point sine using Taylor series approximation
  // Input in fixed-point radians
  const x = fromFixedPoint(value);
  return toFixedPoint(Math.sin(x));
}

export function fpCos(value: number): number {
  const x = fromFixedPoint(value);
  return toFixedPoint(Math.cos(x));
}

export function fpAtan2(y: number, x: number): number {
  return toFixedPoint(Math.atan2(fromFixedPoint(y), fromFixedPoint(x)));
}

// ============================================================================
// Integer Math Utilities (for pure integer simulation logic)
// ============================================================================

export function intMul(a: number, b: number): number {
  return Math.imul(a, b);
}

export function intDiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

export function intMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

export function intClamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function intLerp(a: number, b: number, t: number): number {
  return a + Math.imul(b - a, t) >> FIXED_POINT_SHIFT;
}

// ============================================================================
// Vector Math (Fixed-Point 2D/3D)
// ============================================================================

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function vec2Create(x = 0, y = 0): Vec2 {
  return { x: toFixedPoint(x), y: toFixedPoint(y) };
}

export function vec2CreateFP(x: number, y: number): Vec2 {
  return { x, y };
}

export function vec2Add(out: Vec2, a: Vec2, b: Vec2): Vec2 {
  out.x = fpAdd(a.x, b.x);
  out.y = fpAdd(a.y, b.y);
  return out;
}

export function vec2Sub(out: Vec2, a: Vec2, b: Vec2): Vec2 {
  out.x = fpSub(a.x, b.x);
  out.y = fpSub(a.y, b.y);
  return out;
}

export function vec2Scale(out: Vec2, a: Vec2, scale: number): Vec2 {
  out.x = fpMul(a.x, scale);
  out.y = fpMul(a.y, scale);
  return out;
}

export function vec2Len(a: Vec2): number {
  return fpSqrt(fpAdd(fpMul(a.x, a.x), fpMul(a.y, a.y)));
}

export function vec2LenSq(a: Vec2): number {
  return fpAdd(fpMul(a.x, a.x), fpMul(a.y, a.y));
}

export function vec2Normalize(out: Vec2, a: Vec2): Vec2 {
  const len = vec2Len(a);
  if (len === 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  out.x = fpDiv(a.x, len);
  out.y = fpDiv(a.y, len);
  return out;
}

export function vec2Lerp(out: Vec2, a: Vec2, b: Vec2, t: number): Vec2 {
  out.x = fpAdd(a.x, fpMul(fpSub(b.x, a.x), t));
  out.y = fpAdd(a.y, fpMul(fpSub(b.y, a.y), t));
  return out;
}

export function vec2Distance(a: Vec2, b: number): number {
  const dx = fpSub(a.x, b);
  const dy = fpSub(a.y, b);
  return fpSqrt(fpAdd(fpMul(dx, dx), fpMul(dy, dy)));
}

export function vec2DistanceSq(a: Vec2, b: Vec2): number {
  const dx = fpSub(a.x, b.x);
  const dy = fpSub(a.y, b.y);
  return fpAdd(fpMul(dx, dx), fpMul(dy, dy));
}

export function vec2ToFloat(v: Vec2): { x: number; y: number } {
  return { x: fromFixedPoint(v.x), y: fromFixedPoint(v.y) };
}

export function vec3Create(x = 0, y = 0, z = 0): Vec3 {
  return { x: toFixedPoint(x), y: toFixedPoint(y), z: toFixedPoint(z) };
}

export function vec3Add(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = fpAdd(a.x, b.x);
  out.y = fpAdd(a.y, b.y);
  out.z = fpAdd(a.z, b.z);
  return out;
}

export function vec3Sub(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = fpSub(a.x, b.x);
  out.y = fpSub(a.y, b.y);
  out.z = fpSub(a.z, b.z);
  return out;
}

export function vec3Scale(out: Vec3, a: Vec3, scale: number): Vec3 {
  out.x = fpMul(a.x, scale);
  out.y = fpMul(a.y, scale);
  out.z = fpMul(a.z, scale);
  return out;
}

export function vec3Len(a: Vec3): number {
  return fpSqrt(fpAdd(fpAdd(fpMul(a.x, a.x), fpMul(a.y, a.y)), fpMul(a.z, a.z)));
}

export function vec3Normalize(out: Vec3, a: Vec3): Vec3 {
  const len = vec3Len(a);
  if (len === 0) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }
  out.x = fpDiv(a.x, len);
  out.y = fpDiv(a.y, len);
  out.z = fpDiv(a.z, len);
  return out;
}

// ============================================================================
// Deterministic Hash Functions
// ============================================================================

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(hash, 31) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function hashCombine(a: number, b: number): number {
  return Math.imul(a ^ (b + 0x9e3779b9 + (a << 6) + (a >> 2)), 0x85ebca6b) | 0;
}

export function hashInt(x: number): number {
  x = (x ^ (x >>> 16)) | 0;
  x = Math.imul(x, 0x85ebca6b) | 0;
  x = (x ^ (x >>> 13)) | 0;
  x = Math.imul(x, 0xc2b2ae35) | 0;
  x = (x ^ (x >>> 16)) | 0;
  return x;
}

// ============================================================================
// Time Utilities
// ============================================================================

export const TICK_RATE = 60;
export const TICK_DURATION_MS = 1000 / TICK_RATE;
export const TICK_DURATION_FP = toFixedPoint(TICK_DURATION_MS / 1000);

export function ticksToMs(ticks: number): number {
  return ticks * TICK_DURATION_MS;
}

export function msToTicks(ms: number): number {
  return Math.floor(ms / TICK_DURATION_MS);
}

export function ticksToSeconds(ticks: number): number {
  return ticks / TICK_RATE;
}

export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}

// ============================================================================
// Export all
// ============================================================================

export const MathUtils = {
  // RNG
  createSeededRNG,
  createRNGFromState,
  // Fixed-point
  FIXED_POINT_SHIFT,
  FIXED_POINT_ONE,
  FIXED_POINT_MASK,
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
  // Integer
  intMul,
  intDiv,
  intMod,
  intClamp,
  intLerp,
  // Vec2
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
  // Vec3
  vec3Create,
  vec3Add,
  vec3Sub,
  vec3Scale,
  vec3Len,
  vec3Normalize,
  // Hash
  hashString,
  hashCombine,
  hashInt,
  // Time
  TICK_RATE,
  TICK_DURATION_MS,
  TICK_DURATION_FP,
  ticksToMs,
  msToTicks,
  ticksToSeconds,
  secondsToTicks,
};