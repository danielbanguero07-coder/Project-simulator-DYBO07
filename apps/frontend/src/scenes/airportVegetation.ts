import * as THREE from 'three';
import { mulberry32 } from './airportTextures';
import { AIRPORT_LAYOUT } from './groundNetwork';

/**
 * Detailed airfield vegetation.
 *
 * The procedural world already paints the plateau as grass and scatters city
 * trees outside the operational core, but the airfield itself was a flat green
 * disc. This module adds the layer that is actually visible from the cockpit
 * and from the apron:
 *
 * - a mowed-lawn overlay with subtle mowing stripes that fades out at its
 *   border (one transparent draw call, hidden below pavement by depth test);
 * - tens of thousands of wind-animated grass clumps in a single InstancedMesh;
 * - low shrubs and wildflowers along the runway edges, taxiway strips and the
 *   grass south of the apron.
 *
 * Everything is instanced and uses zero new lights, so the day/night look of
 * the rest of the scene is untouched.
 */

export interface AirportVegetationOptions {
  premium?: boolean;
  heightAt: (x: number, z: number) => number;
}

export interface AirportVegetationHandle {
  group: THREE.Group;
  update: (dt: number) => void;
  dispose: () => void;
}

interface ScatterZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Relative number of plants placed in this rectangle. */
  weight: number;
}

/**
 * Grass areas that are not paved. The airfield envelope is deliberately kept
 * inside |x| < 350 and |z| < 1490, the operational core that the city grid
 * leaves empty.
 */
const ZONES: ScatterZone[] = [
  // Wide field west of the runway.
  { minX: -338, maxX: -30, minZ: -1250, maxZ: 1250, weight: 2.8 },
  // Narrow verge between the runway shoulder and Alpha.
  { minX: 28, maxX: 50, minZ: -1080, maxZ: 1080, weight: 3.6 },
  // Grass south of the apron, around the fire station and helipad.
  { minX: 90, maxX: 338, minZ: -1150, maxZ: -582, weight: 1.3 },
  // Runway end fields.
  { minX: -330, maxX: 330, minZ: 1252, maxZ: 1465, weight: 1.1 },
  { minX: -330, maxX: 330, minZ: -1465, maxZ: -1252, weight: 1.1 },
  // Additional west perimeter beyond the runway ends.
  { minX: -338, maxX: -120, minZ: 1252, maxZ: 1465, weight: 0.7 },
  { minX: -338, maxX: -120, minZ: -1465, maxZ: -1252, weight: 0.7 }
];

const ZONE_TOTAL_WEIGHT = ZONES.reduce((sum, zone) => sum + zone.weight, 0);

function distanceToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq === 0) return Math.hypot(px - ax, pz - az);
  const t = THREE.MathUtils.clamp(((px - ax) * dx + (pz - az) * dz) / lengthSq, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** True where a plant would sit on asphalt, concrete, markings or a building. */
function isPaved(x: number, z: number): boolean {
  const ax = Math.abs(x);
  const az = Math.abs(z);

  // Runway, shoulders and blast pads.
  if (ax < 47 && az < 1338) return true;
  // Approach-light bars on the extended centreline.
  if (ax < 24 && az > 1140) return true;
  // Alpha taxiway (36 m wide, x = 72).
  if (x > 50 && x < 94 && az < 1128) return true;
  // Bravo taxilane and gate lead-in lines.
  if (x > 80 && x < 112 && z > -570 && z < 790) return true;

  // Four high-speed exits: runway edge (20, z) -> Alpha centre (72, z-130).
  for (const exitZ of AIRPORT_LAYOUT.runwayExitZ) {
    if (distanceToSegment(x, z, 20, exitZ, 72, exitZ - AIRPORT_LAYOUT.runwayExitDrop) < 26) {
      return true;
    }
  }
  // Runway-end connectors from the threshold to Alpha.
  for (const sign of [1, -1]) {
    if (distanceToSegment(x, z, 0, 1150 * sign, 72, 1100 * sign) < 25) return true;
  }
  // Cross taxilanes Alpha -> Bravo.
  for (const crossZ of AIRPORT_LAYOUT.crossTaxilaneZ) {
    if (x > 42 && x < 128 && Math.abs(z - crossZ) < 26) return true;
  }

  // Passenger apron and cargo ramp.
  if (x > 84 && x < 344 && z > -572 && z < 792) return true;
  // Terminal drop-off lane and its links.
  if (x > 248 && x < 348 && z > -220 && z < 452) return true;
  // ARFF station and its concrete apparatus apron.
  if (x > 116 && x < 184 && z > -690 && z < -586) return true;
  // Helipad.
  if (Math.hypot(x - 230, z + 720) < 31) return true;

  return false;
}

function makeGrassClumpCanvas(size = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D context unavailable');
  context.clearRect(0, 0, size, size);

  const random = mulberry32(0x51a55e);
  const blades = 42;
  for (let i = 0; i < blades; i++) {
    const baseX = size * (0.08 + random() * 0.84);
    const height = size * (0.32 + random() * 0.62);
    const lean = (random() - 0.5) * size * 0.34;
    const width = Math.max(1.1, size * 0.009 * (0.7 + random() * 0.9));
    const shade = 0.55 + random() * 0.55;
    const red = Math.floor(46 * shade);
    const green = Math.floor((88 + random() * 58) * shade);
    const blue = Math.floor(34 * shade);
    context.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${0.72 + random() * 0.28})`;
    context.lineWidth = width;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(baseX, size + 1);
    context.quadraticCurveTo(baseX + lean * 0.45, size - height * 0.55, baseX + lean, size - height);
    context.stroke();
  }

  return canvas;
}

function makeFlowerCanvas(size = 64): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D context unavailable');
  context.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size * 0.42;
  const petal = size * 0.17;
  context.fillStyle = 'rgba(255,255,255,0.96)';
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    context.beginPath();
    context.ellipse(
      cx + Math.cos(angle) * petal * 1.05,
      cy + Math.sin(angle) * petal * 1.05,
      petal * 0.72,
      petal * 0.5,
      angle,
      0,
      Math.PI * 2
    );
    context.fill();
  }
  context.fillStyle = 'rgba(255,214,96,1)';
  context.beginPath();
  context.arc(cx, cy, petal * 0.55, 0, Math.PI * 2);
  context.fill();

  // Thin stem so the flower does not float.
  context.strokeStyle = 'rgba(72,108,52,0.9)';
  context.lineWidth = Math.max(1, size * 0.035);
  context.beginPath();
  context.moveTo(cx, cy + petal);
  context.lineTo(cx - size * 0.02, size);
  context.stroke();

  return canvas;
}

function makeMowedLawnCanvas(size = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D context unavailable');
  const random = mulberry32(0x1a3f00d);

  // Eight mowing lanes per tile. Even widths keep the pattern seamless.
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    const x0 = (i / stripes) * size;
    const shift = i % 2 === 0 ? 0 : 26;
    context.fillStyle = `rgb(${50 + shift}, ${80 + shift}, ${40 + shift})`;
    context.fillRect(x0, 0, size / stripes + 1, size);
  }

  // Slight tonal patches, like grass recovering at different rates.
  for (let i = 0; i < 150; i++) {
    const x = random() * size;
    const y = random() * size;
    const radius = size * (0.01 + random() * 0.055);
    const light = 92 + Math.floor(random() * 48);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${Math.floor(light * 0.72)}, ${light}, ${Math.floor(light * 0.55)}, 0.10)`);
    gradient.addColorStop(1, `rgba(${Math.floor(light * 0.72)}, ${light}, ${Math.floor(light * 0.55)}, 0)`);
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Fine blade grain so the overlay still has texture at walking distance.
  const blades = Math.floor(size * 14);
  for (let i = 0; i < blades; i++) {
    const light = 70 + Math.floor(random() * 80);
    context.fillStyle = `rgba(${Math.floor(light * 0.62)}, ${light}, ${Math.floor(light * 0.46)}, ${0.06 + random() * 0.14})`;
    const height = 1 + random() * (size / 180);
    context.fillRect(random() * size, random() * size, Math.max(1, size / 512), height);
  }

  return canvas;
}

function makeCrossedPlaneGeometry(planes: number, width: number, height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < planes; i++) {
    const plane = new THREE.PlaneGeometry(width, height);
    plane.translate(0, height / 2, 0);
    plane.rotateY((i / planes) * Math.PI);
    parts.push(plane);
  }
  const merged = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const part of parts) {
    const position = part.getAttribute('position');
    const uv = part.getAttribute('uv');
    const index = part.getIndex();
    for (let i = 0; i < position.count; i++) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      uvs.push(uv.getX(i), uv.getY(i));
    }
    if (index) {
      for (let i = 0; i < index.count; i++) indices.push(index.getX(i) + offset);
    } else {
      for (let i = 0; i < position.count; i++) indices.push(offset + i);
    }
    offset += position.count;
    part.dispose();
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.setIndex(indices);
  merged.computeVertexNormals();
  return merged;
}

/** Inject a cheap world-space wind sway into a standard instanced material. */
function addWind(
  material: THREE.MeshStandardMaterial,
  uniforms: { value: number },
  amplitude: number,
  cacheKey: string
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = uniforms;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uWindTime;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float windPhase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.29;
  float windWave = sin(uWindTime * 1.6 + windPhase) + 0.42 * sin(uWindTime * 3.2 + windPhase * 1.8);
  float windBend = max(transformed.y, 0.0);
  transformed.x += windWave * ${amplitude.toFixed(3)} * windBend * windBend;
  transformed.z += windWave * ${(amplitude * 0.55).toFixed(3)} * windBend * windBend;
#endif`
      );
  };
  material.customProgramCacheKey = () => cacheKey;
}

function pickZone(random: () => number): ScatterZone {
  let target = random() * ZONE_TOTAL_WEIGHT;
  for (const zone of ZONES) {
    target -= zone.weight;
    if (target <= 0) return zone;
  }
  return ZONES[0];
}

export function buildAirportVegetation(
  scene: THREE.Scene,
  options: AirportVegetationOptions
): AirportVegetationHandle {
  const premium = options.premium ?? true;
  const heightAt = options.heightAt;
  const group = new THREE.Group();
  group.name = 'airportVegetation';
  scene.add(group);

  const random = mulberry32(0x0a17e5);
  const timeUniform = { value: 0 };
  const textures: THREE.Texture[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const registerTexture = (texture: THREE.Texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    return texture;
  };

  /* --------------------------- mowed lawn overlay --------------------------- */
  const lawnCanvas = makeMowedLawnCanvas(512);
  const lawnTexture = registerTexture(new THREE.CanvasTexture(lawnCanvas));
  lawnTexture.wrapS = THREE.RepeatWrapping;
  lawnTexture.wrapT = THREE.RepeatWrapping;
  lawnTexture.repeat.set(720 / 120, 3000 / 120);
  lawnTexture.anisotropy = 8;

  const lawnMaterial = new THREE.MeshStandardMaterial({
    map: lawnTexture,
    transparent: true,
    opacity: 0.7,
    roughness: 0.97,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  lawnMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLawnUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLawnUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLawnUv;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  float lawnEdge = smoothstep(0.0, 0.075, vLawnUv.x)
    * (1.0 - smoothstep(0.925, 1.0, vLawnUv.x))
    * smoothstep(0.0, 0.05, vLawnUv.y)
    * (1.0 - smoothstep(0.95, 1.0, vLawnUv.y));
  diffuseColor.a *= lawnEdge;`
      );
  };
  lawnMaterial.customProgramCacheKey = () => 'airport-lawn-overlay';
  materials.push(lawnMaterial);

  const lawnGeometry = new THREE.PlaneGeometry(720, 3000);
  lawnGeometry.rotateX(-Math.PI / 2);
  geometries.push(lawnGeometry);
  const lawn = new THREE.Mesh(lawnGeometry, lawnMaterial);
  lawn.name = 'airfieldLawn';
  lawn.position.set(0, 0.012, 0);
  lawn.receiveShadow = true;
  lawn.renderOrder = 1;
  group.add(lawn);

  /* ------------------------------ grass clumps ----------------------------- */
  const grassCanvas = makeGrassClumpCanvas(256);
  const grassTexture = registerTexture(new THREE.CanvasTexture(grassCanvas));
  grassTexture.anisotropy = 4;

  const grassMaterial = new THREE.MeshStandardMaterial({
    map: grassTexture,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.93,
    metalness: 0,
    color: 0xffffff
  });
  addWind(grassMaterial, timeUniform, 0.14, 'airport-grass-wind');
  materials.push(grassMaterial);

  const grassGeometry = makeCrossedPlaneGeometry(premium ? 3 : 2, 1.35, 0.95);
  geometries.push(grassGeometry);

  const grassCount = premium ? 46000 : 16000;
  const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, grassCount);
  grass.name = 'airportGrassClumps';
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let placed = 0;
  let attempts = 0;
  const maxAttempts = grassCount * 8;
  while (placed < grassCount && attempts < maxAttempts) {
    attempts++;
    const zone = pickZone(random);
    const x = THREE.MathUtils.lerp(zone.minX, zone.maxX, random());
    const z = THREE.MathUtils.lerp(zone.minZ, zone.maxZ, random());
    if (isPaved(x, z)) continue;
    const y = heightAt(x, z);
    if (!Number.isFinite(y) || y > 2.5) continue;

    const scale = 0.55 + random() * 0.75;
    dummy.position.set(x, y + 0.035, z);
    dummy.rotation.set(0, random() * Math.PI, 0);
    dummy.scale.set(
      scale * (0.85 + random() * 0.45),
      scale * 0.78,
      scale * (0.85 + random() * 0.45)
    );
    dummy.updateMatrix();
    grass.setMatrixAt(placed, dummy.matrix);
    tint.setRGB(0.72 + random() * 0.3, 0.86 + random() * 0.22, 0.66 + random() * 0.28);
    grass.setColorAt(placed, tint);
    placed++;
  }
  grass.count = placed;
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  grass.computeBoundingSphere();
  grass.receiveShadow = true;
  group.add(grass);

  /* -------------------------------- shrubs --------------------------------- */
  const bushGeometry = new THREE.IcosahedronGeometry(1, 0);
  bushGeometry.scale(1.15, 0.72, 1.15);
  bushGeometry.translate(0, 0.55, 0);
  geometries.push(bushGeometry);
  const bushMaterial = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0, color: 0xffffff });
  materials.push(bushMaterial);

  const bushCount = premium ? 1100 : 380;
  const bushes = new THREE.InstancedMesh(bushGeometry, bushMaterial, bushCount);
  bushes.name = 'airportShrubs';
  let bushPlaced = 0;
  attempts = 0;
  while (bushPlaced < bushCount && attempts < bushCount * 10) {
    attempts++;
    const zone = pickZone(random);
    const x = THREE.MathUtils.lerp(zone.minX, zone.maxX, random());
    const z = THREE.MathUtils.lerp(zone.minZ, zone.maxZ, random());
    if (isPaved(x, z)) continue;
    const y = heightAt(x, z);
    if (!Number.isFinite(y) || y > 2.5) continue;

    const scale = 0.55 + random() * 1.15;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.scale.set(scale * (0.85 + random() * 0.4), scale * (0.65 + random() * 0.5), scale);
    dummy.updateMatrix();
    bushes.setMatrixAt(bushPlaced, dummy.matrix);
    tint.setHSL(0.25 + random() * 0.07, 0.32 + random() * 0.26, 0.16 + random() * 0.16);
    bushes.setColorAt(bushPlaced, tint);
    bushPlaced++;
  }
  bushes.count = bushPlaced;
  bushes.instanceMatrix.needsUpdate = true;
  if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
  bushes.computeBoundingSphere();
  bushes.castShadow = false;
  bushes.receiveShadow = true;
  group.add(bushes);

  /* ------------------------------- wildflowers ----------------------------- */
  const flowerCanvas = makeFlowerCanvas(64);
  const flowerTexture = registerTexture(new THREE.CanvasTexture(flowerCanvas));
  flowerTexture.anisotropy = 2;

  const flowerMaterial = new THREE.MeshStandardMaterial({
    map: flowerTexture,
    alphaTest: 0.38,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
    color: 0xffffff
  });
  addWind(flowerMaterial, timeUniform, 0.07, 'airport-flower-wind');
  materials.push(flowerMaterial);

  const flowerGeometry = makeCrossedPlaneGeometry(2, 0.42, 0.42);
  geometries.push(flowerGeometry);
  const flowerCount = premium ? 2600 : 900;
  const flowers = new THREE.InstancedMesh(flowerGeometry, flowerMaterial, flowerCount);
  flowers.name = 'airportWildflowers';
  const flowerPalette = [0xfff4d6, 0xffe066, 0xf2b6d8, 0xc9a6ff, 0xfff7f0];
  let flowerPlaced = 0;
  attempts = 0;
  while (flowerPlaced < flowerCount && attempts < flowerCount * 10) {
    attempts++;
    const zone = pickZone(random);
    const x = THREE.MathUtils.lerp(zone.minX, zone.maxX, random());
    const z = THREE.MathUtils.lerp(zone.minZ, zone.maxZ, random());
    if (isPaved(x, z)) continue;
    const y = heightAt(x, z);
    if (!Number.isFinite(y) || y > 2.5) continue;

    dummy.position.set(x, y + 0.035, z);
    dummy.rotation.set(0, random() * Math.PI, 0);
    const scale = 0.7 + random() * 0.8;
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    flowers.setMatrixAt(flowerPlaced, dummy.matrix);
    tint.setHex(flowerPalette[Math.floor(random() * flowerPalette.length)]);
    tint.offsetHSL((random() - 0.5) * 0.03, 0, (random() - 0.5) * 0.08);
    flowers.setColorAt(flowerPlaced, tint);
    flowerPlaced++;
  }
  flowers.count = flowerPlaced;
  flowers.instanceMatrix.needsUpdate = true;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  flowers.computeBoundingSphere();
  flowers.receiveShadow = true;
  group.add(flowers);

  return {
    group,
    update: (dt: number) => {
      timeUniform.value += Math.min(dt, 0.05);
    },
    dispose: () => {
      scene.remove(group);
      group.clear();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    }
  };
}
