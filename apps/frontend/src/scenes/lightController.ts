import * as THREE from 'three';

/**
 * Day/night lighting controller.
 *
 * Responsible for two things:
 *   1. Scaling emissive intensity on registered structural materials (terminal,
 *      control tower, hangars, roofs) from a smooth day/night curve.
 *   2. Driving the PAPI lamps from the player aircraft's real position so the
 *      indicator behaves like the real thing: white above each unit's angle,
 *      red below. 2 white / 2 red on a ~3° glide path.
 */

interface EditableEntry {
  material: THREE.MeshStandardMaterial;
  color: THREE.Color;
  nightIntensity: number;
  dayIntensity: number;
}

export interface EditableLightOptions {
  /** Emissive tint used at night. */
  color?: number;
  /** Emissive intensity at full night. */
  nightIntensity?: number;
  /** Emissive intensity during the day (usually 0). */
  dayIntensity?: number;
}

const editableMaterials: EditableEntry[] = [];
const beaconLights: THREE.Mesh[] = [];

let isNight = false;
let nightFactor = 0;

/**
 * Registers a standard material whose emissive glow follows the time of day.
 * `emissiveMap` (when present) limits the glow to the lit windows.
 */
export function registerEditableLight(
  material: THREE.MeshStandardMaterial,
  options: EditableLightOptions = {}
) {
  editableMaterials.push({
    material,
    color: new THREE.Color(options.color ?? 0xffd9a0),
    nightIntensity: options.nightIntensity ?? 1.6,
    dayIntensity: options.dayIntensity ?? 0
  });
}

/** Registers a mesh whose opacity/glow should follow the night factor. */
export function registerBeacon(mesh: THREE.Mesh) {
  beaconLights.push(mesh);
}

/** Smooth 0..1 night factor from the hour (0 = noon, 1 = deep night). */
function computeNightFactor(hour: number): number {
  const elevation = Math.sin(((hour - 6) / 12) * Math.PI);
  const daylight = THREE.MathUtils.clamp(elevation, 0, 1);
  return 1 - daylight;
}

/**
 * Updates emissive materials for the current hour. Called every frame by the
 * scene, so it must stay cheap.
 */
export function updateLighting(hour: number) {
  nightFactor = computeNightFactor(hour);
  isNight = nightFactor > 0.5;

  // Ease the glow in as the sun sets; keep a trace at dusk.
  const eased = nightFactor * nightFactor * (3 - 2 * nightFactor);

  for (const entry of editableMaterials) {
    const intensity =
      entry.dayIntensity + (entry.nightIntensity - entry.dayIntensity) * eased;
    if (entry.material.emissiveIntensity !== intensity) {
      entry.material.emissiveIntensity = intensity;
    }
    entry.material.emissive.copy(entry.color);
  }

  for (const mesh of beaconLights) {
    const material = mesh.material as THREE.MeshBasicMaterial;
    if (material && 'opacity' in material) {
      material.opacity = 0.35 + nightFactor * 0.65;
    }
  }
}

/** Active PAPI group + cached lamp list. */
let cachedPapi: THREE.Group | null = null;
let cachedPapiLamps: THREE.Mesh[] = [];
let cachedPapiAngles: number[] = [];
let cachedPapiX = 0;
let cachedPapiZ = 0;

const white = new THREE.Color(0xf7f7f2);
const red = new THREE.Color(0xff2222);

/** Registers the PAPI returned by `createRunwayLights`. */
export function setPapiGroup(group: THREE.Group) {
  cachedPapi = group;
  cachedPapiLamps = group.children.filter(
    (child) => child.userData?.isPapiLight
  ) as THREE.Mesh[];
  cachedPapiAngles = (group.userData?.unitAngles as number[]) ?? [2.5, 2.83, 3.17, 3.5];
  cachedPapiX = (group.userData?.papiX as number) ?? group.position.x;
  cachedPapiZ = (group.userData?.papiZ as number) ?? group.position.z;
}

export function findPapiGroup(): THREE.Group | null {
  return cachedPapi;
}

/**
 * Applies the PAPI colour pattern.
 *
 * @param aircraftPosition Player aircraft position in world space (null keeps
 *   the neutral 2 white / 2 red indication).
 */
function updatePapi(aircraftPosition?: THREE.Vector3 | null) {
  if (!cachedPapi || cachedPapiLamps.length === 0) return;

  // Neutral indication when the aircraft is not on an approach.
  const above = [true, true, false, false];

  if (aircraftPosition) {
    // PAPI sits 300m before the landing threshold (z = +1150).
    // For a 3° glide path, crossing at 2150m distance from the threshold,
    // the height is ~115m when on path.
    //
    // Approach vectors: aircraft comes from +Z, crosses threshold at z=1150,
    // continues to lower z values.
    const runwayCenterX = 0;
    const thresholdZ = 1150;

    // Distance to threshold (positive = before threshold, negative = past it)
    const dz = thresholdZ - aircraftPosition.z;
    // Lateral offset from centre line
    const dx = aircraftPosition.x - runwayCenterX;

    // Only process when approaching from the north and within ~2km of threshold
    if (dz > 0 && dz < 2500) {
      const lateral = dx === 0 || Math.abs(dx) > 5 ? Math.abs(dx) : 15; // 15m runway width / 2
      const horizontal = Math.sqrt(dz * dz + lateral * lateral);
      if (horizontal > 10) {
        const height = Math.max(0, aircraftPosition.y);
        const angleDeg = THREE.MathUtils.radToDeg(Math.atan2(height, dz));
        for (let i = 0; i < 4; i++) {
          above[i] = angleDeg >= cachedPapiAngles[i];
        }
      }
    }
  }

  for (let i = 0; i < cachedPapiLamps.length; i++) {
    const lamp = cachedPapiLamps[i];
    const material = lamp.material as THREE.MeshBasicMaterial;
    material.color.copy(above[i] ? white : red);
  }
}

/**
 * Per-frame animation hook.
 * @param _dt elapsed seconds (kept for API compatibility / future beacons)
 * @param aircraftPosition optional player position used by the PAPI
 */
export function animateLights(_dt: number, aircraftPosition?: THREE.Vector3 | null) {
  updatePapi(aircraftPosition);
}

/** Current computed night factor (0 day .. 1 night). */
export function getNightFactor(): number {
  return nightFactor;
}

export const LightController = {
  isNight: () => isNight,
  nightFactor: () => nightFactor,
  registerBeacon,
  findPapiGroup
};
