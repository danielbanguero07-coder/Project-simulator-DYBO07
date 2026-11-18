import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { registerEditableLight } from './lightController';
import type { TextureStreamer } from './textureStreaming';
import {
  HOME_AIRPORT,
  REMOTE_AIRPORTS,
  type AirportDefinition
} from './airports';

/**
 * Procedural world around the airport.
 *
 * Everything is deterministic (seeded value noise) so the landscape is stable
 * between reloads: a flattened airport plateau, rolling plains, mountain
 * ranges, carved river valleys with water, roads connecting cities, instanced
 * city blocks and forests, plus simplified remote airports that can be seen
 * from the air.
 *
 * The whole world is static geometry created once (a few instanced meshes), so
 * per-frame cost is essentially zero.
 */

const WORLD_SIZE = 16000;
const WATER_LEVEL = -0.6;

/* ------------------------------------------------------------------ */
/* Deterministic helpers                                               */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, octaves: number): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise(x * frequency, y * frequency);
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return value / total;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------------ */
/* Layout data                                                         */
/* ------------------------------------------------------------------ */

interface Pad {
  x: number;
  z: number;
  radius: number;
  blend: number;
  elevation: number;
}

interface River {
  width: number;
  points: Array<[number, number]>;
}

interface CitySeed {
  name: string;
  x: number;
  z: number;
  elevation: number;
  radius: number;
}

const CITIES: CitySeed[] = [
  { name: 'Ciudad de México', x: 3600, z: -1900, elevation: 20, radius: 1250 },
  { name: 'Guadalajara', x: -3600, z: -2300, elevation: 95, radius: 1000 },
  { name: 'Monterrey', x: 3900, z: -2700, elevation: 70, radius: 1000 },
  { name: 'Cancún', x: 4400, z: 3200, elevation: 12, radius: 900 },
  { name: 'Tijuana', x: -5100, z: 3000, elevation: 220, radius: 800 },
  { name: 'Querétaro', x: 900, z: 4300, elevation: 140, radius: 820 },
  { name: 'Mérida', x: 2700, z: 5400, elevation: 18, radius: 760 }
];

const RIVERS: River[] = [
  {
    width: 240,
    points: [
      [-7200, -5200],
      [-5600, -4200],
      [-4200, -3700],
      [-3000, -4000],
      [-1800, -4700],
      [-600, -5600],
      [200, -7000]
    ]
  },
  {
    width: 200,
    points: [
      [7200, -5600],
      [5900, -4300],
      [5000, -2600],
      [4400, -900],
      [4100, 900],
      [4300, 2600],
      [3900, 4600],
      [4400, 6600]
    ]
  },
  {
    width: 175,
    points: [
      [-6800, 5600],
      [-5200, 4800],
      [-3600, 4300],
      [-2100, 4400],
      [-900, 5200],
      [100, 6400]
    ]
  }
];

/* Pads flatten the terrain for the airport, cities and remote airfields. */
const PADS: Pad[] = [
  {
    x: HOME_AIRPORT.x,
    z: HOME_AIRPORT.z,
    radius: 2600,
    blend: 1100,
    elevation: HOME_AIRPORT.elevation
  },
  ...CITIES.map<Pad>((city) => ({
    x: city.x,
    z: city.z,
    radius: city.radius,
    blend: 750,
    elevation: city.elevation
  })),
  ...REMOTE_AIRPORTS.map<Pad>((airport) => ({
    x: airport.x,
    z: airport.z,
    radius: airport.runwayLength * 0.7 + 500,
    blend: 900,
    elevation: airport.elevation
  }))
];

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
  let t = ((px - ax) * dx + (pz - az) * dz) / lengthSq;
  t = THREE.MathUtils.clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function distanceToRiver(px: number, pz: number, river: River): number {
  let best = Infinity;
  for (let i = 0; i < river.points.length - 1; i++) {
    const [ax, az] = river.points[i];
    const [bx, bz] = river.points[i + 1];
    best = Math.min(best, distanceToSegment(px, pz, ax, az, bx, bz));
  }
  return best;
}

function baseHeight(x: number, z: number): number {
  const radius = Math.hypot(x, z);

  // Continental shape: low plains near the coast rising into ranges inland.
  const continental = fbm(x * 0.00009 + 11.3, z * 0.00009 - 7.1, 5);
  const ridges = fbm(x * 0.00028 + 3.7, z * 0.00028 + 9.2, 4);
  const mountainMask = smoothstep(0.48, 0.9, ridges);

  let height = continental * 460 - 70;
  height += Math.pow(mountainMask, 2.2) * 700;

  // Extra alpine belt far from the airport so the horizon reads as mountains.
  const belt = smoothstep(3800, 7200, radius) * (1 - smoothstep(7200, 9000, radius));
  height += belt * Math.pow(fbm(x * 0.00042 - 5.5, z * 0.00042 + 2.3, 3), 2) * 680;

  return height;
}

/** Carve wide river valleys down below the water plane. */
function carveRivers(x: number, z: number, height: number): number {
  let carved = height;
  for (const river of RIVERS) {
    const distance = distanceToRiver(x, z, river);
    const reach = river.width * 2.2;
    if (distance < reach) {
      const influence = 1 - smoothstep(river.width * 0.35, reach, distance);
      const bed = WATER_LEVEL - 4;
      carved = carved * (1 - influence) + bed * influence;
    }
  }
  return carved;
}

function terrainHeight(x: number, z: number): number {
  let height = baseHeight(x, z);

  for (const pad of PADS) {
    const distance = Math.hypot(x - pad.x, z - pad.z);
    if (distance >= pad.radius + pad.blend) continue;
    if (distance <= pad.radius) {
      height = pad.elevation;
      break;
    }
    const t = smoothstep(pad.radius, pad.radius + pad.blend, distance);
    height = pad.elevation + (height - pad.elevation) * t;
  }

  return carveRivers(x, z, height);
}

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

function makeWindowTextures(size = 256): {
  facade: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
} {
  const columns = 6;
  const rows = 11;

  const facadeCanvas = document.createElement('canvas');
  facadeCanvas.width = size;
  facadeCanvas.height = size * 2;
  const facade = facadeCanvas.getContext('2d')!;
  facade.fillStyle = '#c9ced6';
  facade.fillRect(0, 0, facadeCanvas.width, facadeCanvas.height);
  facade.fillStyle = '#dfe4ea';
  facade.fillRect(0, 0, facadeCanvas.width, 6);
  const cellW = facadeCanvas.width / columns;
  const cellH = facadeCanvas.height / rows;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      facade.fillStyle = row % 3 === 0 ? '#5c7285' : '#3f5366';
      facade.fillRect(
        column * cellW + cellW * 0.18,
        row * cellH + cellH * 0.2,
        cellW * 0.64,
        cellH * 0.55
      );
    }
  }

  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = size;
  emissiveCanvas.height = size * 2;
  const emissive = emissiveCanvas.getContext('2d')!;
  emissive.fillStyle = '#000000';
  emissive.fillRect(0, 0, emissiveCanvas.width, emissiveCanvas.height);
  const rng = mulberry32(0x51ed3a);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (rng() < 0.55) continue;
      emissive.fillStyle = rng() < 0.4 ? '#ffd79a' : '#cfe6ff';
      emissive.fillRect(
        column * cellW + cellW * 0.18,
        row * cellH + cellH * 0.2,
        cellW * 0.64,
        cellH * 0.55
      );
    }
  }

  const facadeTexture = new THREE.CanvasTexture(facadeCanvas);
  facadeTexture.colorSpace = THREE.SRGBColorSpace;
  facadeTexture.wrapS = facadeTexture.wrapT = THREE.RepeatWrapping;
  const emissiveTexture = new THREE.CanvasTexture(emissiveCanvas);
  emissiveTexture.colorSpace = THREE.SRGBColorSpace;
  emissiveTexture.wrapS = emissiveTexture.wrapT = THREE.RepeatWrapping;
  return { facade: facadeTexture, emissive: emissiveTexture };
}

/**
 * Seamless, resolution-independent detail map for the terrain.
 *
 * The map is nearly white so it multiplies cleanly over the terrain vertex
 * colours: soft vegetation/dry patches break the flat vertex-colour gradients
 * and fine grain adds high-frequency texture all the way to 4K. Patches are
 * drawn in a 3x3 wrapped grid so the tile is seamless.
 */
function makeTerrainDetailCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D context unavailable');

  context.fillStyle = '#f0f0e9';
  context.fillRect(0, 0, size, size);

  const rng = mulberry32(0x7e44a1);
  const wrapped = (draw: (offsetX: number, offsetY: number) => void) => {
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) draw(ox * size, oy * size);
    }
  };

  // Broad biome patches (vegetation, dry soil, rock dust).
  const patchCount = Math.round(size * 0.22);
  for (let i = 0; i < patchCount; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = size * (0.008 + rng() * 0.05);
    const alpha = 0.03 + rng() * 0.08;
    const tint =
      rng() < 0.5
        ? `rgba(82, 102, 60, ${alpha})`
        : rng() < 0.6
          ? `rgba(168, 158, 112, ${alpha})`
          : `rgba(255, 252, 232, ${alpha})`;
    wrapped((offsetX, offsetY) => {
      const gradient = context.createRadialGradient(
        x + offsetX, y + offsetY, 0,
        x + offsetX, y + offsetY, radius
      );
      gradient.addColorStop(0, tint);
      gradient.addColorStop(1, 'rgba(128, 128, 128, 0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x + offsetX, y + offsetY, radius, 0, Math.PI * 2);
      context.fill();
    });
  }

  // Fine grain (single draw: a couple of pixels at the seam is invisible).
  const speckles = Math.round(size * 7);
  for (let i = 0; i < speckles; i++) {
    const value = 118 + Math.floor(rng() * 96);
    const alpha = 0.04 + rng() * 0.1;
    const radius = size < 1024 ? 0.8 : 0.8 + rng() * 2.2;
    context.fillStyle = `rgba(${value}, ${value}, ${value - 6}, ${alpha})`;
    context.beginPath();
    context.arc(rng() * size, rng() * size, radius, 0, Math.PI * 2);
    context.fill();
  }

  return canvas;
}

/** Seamless tangent-space normal map for the water surface. */
function makeWaterNormalCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D context unavailable');

  // Integer-frequency sinusoids are perfectly periodic: the tile has no seam.
  const waves: Array<[number, number, number, number]> = [
    [1, 2, 0.55, 0.7],
    [2, -1, 0.4, 2.1],
    [3, 1, 0.3, 4.2],
    [1, -3, 0.25, 1.3],
    [4, 2, 0.18, 5.4],
    [5, -2, 0.14, 3.7],
    [2, 4, 0.12, 0.4],
    [7, 3, 0.08, 2.8]
  ];
  const tau = Math.PI * 2;
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let height = 0;
      for (const [fx, fy, amplitude, phase] of waves) {
        height += Math.sin(tau * (fx * u + fy * v) + phase) * amplitude;
      }
      heights[y * size + x] = height;
    }
  }

  const image = context.createImageData(size, size);
  const data = image.data;
  const strength = size * 0.018;
  for (let y = 0; y < size; y++) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const dx = (heights[row + right] - heights[row + left]) * strength;
      const dy = (heights[down + x] - heights[up + x]) * strength;
      const length = Math.hypot(dx, dy, 1);
      const index = (row + x) * 4;
      data[index] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
      data[index + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
      data[index + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/** Soft cloud puff used by the billboard cloud layer. */
function makeCloudCanvas(size = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D context unavailable');
  const rng = mulberry32(0xc10d5);
  // A cluster of soft blobs with a flat-ish base reads as a cumulus puff.
  for (let i = 0; i < 26; i++) {
    const angle = rng() * Math.PI * 2;
    const distance = Math.sqrt(rng()) * size * 0.22;
    const x = size * 0.5 + Math.cos(angle) * distance;
    const y = size * 0.52 + Math.sin(angle) * distance * 0.55;
    const radius = size * (0.08 + rng() * 0.16);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
    gradient.addColorStop(0.55, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  return canvas;
}

/** White runway designator (e.g. "11") on a transparent tile. */
function makeRunwayNumberTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D context unavailable');
  context.clearRect(0, 0, 256, 256);
  context.font = 'bold 190px Arial';
  context.fillStyle = '#f4f4ea';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, 128, 136);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function buildRibbon(
  points: THREE.Vector3[],
  width: number,
  yOffset: number
): THREE.BufferGeometry {
  const samples = 96;
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.35);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const length = Math.hypot(tangent.x, tangent.z) || 1;
    const perpendicularX = -tangent.z / length;
    const perpendicularZ = tangent.x / length;
    const half = width / 2;

    for (const side of [-1, 1]) {
      const x = point.x + perpendicularX * half * side;
      const z = point.z + perpendicularZ * half * side;
      // Keep roads above the water plane: where a leg crosses a carved river
      // valley this turns the ribbon into a causeway/bridge deck.
      const y = Math.max(
        terrainHeight(x, z) + yOffset,
        WATER_LEVEL + 1.6,
        yOffset
      );
      positions.push(x, y, z);
      uvs.push(side === -1 ? 0 : 1, t);
    }

    if (i < samples) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addRoad(
  parent: THREE.Object3D,
  material: THREE.Material,
  nodes: THREE.Vector2[],
  seed: number,
  width = 18
): void {
  if (nodes.length < 2) return;
  const rng = mulberry32(seed);
  const points: THREE.Vector3[] = [];

  // Subdivide every leg and add a gentle organic bend. The amplitude is a
  // small percentage of the leg length, so trunk roads read as engineered
  // highways instead of a random scribble.
  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i];
    const to = nodes[i + 1];
    const dx = to.x - from.x;
    const dz = to.y - from.y;
    const length = Math.hypot(dx, dz) || 1;
    const perpendicularX = -dz / length;
    const perpendicularZ = dx / length;
    const steps = Math.max(1, Math.round(length / 1200));

    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      const wander = step === 0 ? 0 : (rng() - 0.5) * length * 0.04;
      points.push(
        new THREE.Vector3(
          from.x + dx * t + perpendicularX * wander,
          0,
          from.y + dz * t + perpendicularZ * wander
        )
      );
    }
  }
  const last = nodes[nodes.length - 1];
  points.push(new THREE.Vector3(last.x, 0, last.y));

  const geometry = buildRibbon(points, width, 0.8);
  const road = new THREE.Mesh(geometry, material);
  road.receiveShadow = true;
  parent.add(road);
}

/* ------------------------------------------------------------------ */
/* Remote airports                                                     */
/* ------------------------------------------------------------------ */

function buildRemoteAirport(
  parent: THREE.Object3D,
  airport: AirportDefinition,
  asphalt: THREE.Material,
  concrete: THREE.Material,
  building: THREE.Material,
  disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>
): void {
  const heading = THREE.MathUtils.degToRad(airport.headingDeg);
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const group = new THREE.Group();
  group.position.set(airport.x, airport.elevation, airport.z);
  group.rotation.y = heading;
  parent.add(group);

  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(46, airport.runwayLength),
    asphalt
  );
  runway.rotation.x = -Math.PI / 2;
  runway.position.y = 0.28;
  runway.receiveShadow = true;
  group.add(runway);

  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(420, airport.runwayLength * 0.55),
    concrete
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(250, 0.26, 0);
  apron.receiveShadow = true;
  group.add(apron);

  // Taxiway connector from the runway edge to the apron.
  const taxiway = new THREE.Mesh(new THREE.PlaneGeometry(60, 28), asphalt);
  taxiway.rotation.x = -Math.PI / 2;
  taxiway.position.set(42, 0.29, 0);
  taxiway.receiveShadow = true;
  group.add(taxiway);

  const taxiLineMaterial = new THREE.MeshBasicMaterial({
    color: 0xe0b21c,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const taxiLine = new THREE.Mesh(new THREE.PlaneGeometry(44, 0.8), taxiLineMaterial);
  taxiLine.rotation.x = -Math.PI / 2;
  taxiLine.position.set(38, 0.31, 0);
  group.add(taxiLine);

  // Terminal + tower + jetways.
  const terminal = new THREE.Mesh(new THREE.BoxGeometry(70, 18, 120), building);
  terminal.position.set(250, 9, 0);
  terminal.castShadow = true;
  group.add(terminal);

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 30, 10), building);
  tower.position.set(250, 15, 130);
  group.add(tower);

  const cab = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 7, 6, 10),
    new THREE.MeshStandardMaterial({
      color: 0x1f4a63,
      roughness: 0.2,
      metalness: 0.7,
      emissive: 0x7fd4ff,
      emissiveIntensity: 0
    })
  );
  cab.position.set(250, 33, 130);
  group.add(cab);

  const gateCount = Math.min(6, Math.max(2, Math.round(airport.gates / 2)));
  for (let i = 0; i < gateCount; i++) {
    const z = (i - (gateCount - 1) / 2) * 42;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(34, 4, 5), building);
    arm.position.set(220, 7, z);
    group.add(arm);
  }

  // Runway edge lights (instanced) + centreline dashes.
  const edgePositions: THREE.Vector3[] = [];
  for (let z = -airport.runwayLength / 2; z <= airport.runwayLength / 2; z += 70) {
    edgePositions.push(new THREE.Vector3(-25, 1, z));
    edgePositions.push(new THREE.Vector3(25, 1, z));
  }
  const edgeGeometry = new THREE.SphereGeometry(0.8, 6, 5);
  const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false });
  const edges = new THREE.InstancedMesh(edgeGeometry, edgeMaterial, edgePositions.length);
  const dummy = new THREE.Object3D();
  edgePositions.forEach((position, index) => {
    dummy.position.copy(position);
    dummy.updateMatrix();
    edges.setMatrixAt(index, dummy.matrix);
  });
  edges.instanceMatrix.needsUpdate = true;
  group.add(edges);

  // Approach lights beyond both thresholds.
  const approachPositions: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    for (let i = 1; i <= 7; i++) {
      approachPositions.push(
        new THREE.Vector3(0, 1, side * (airport.runwayLength / 2 + i * 70))
      );
    }
  }
  const approachGeometry = new THREE.SphereGeometry(0.65, 5, 4);
  const approachMaterial = new THREE.MeshBasicMaterial({ color: 0xf4f7ff, toneMapped: false });
  const approach = new THREE.InstancedMesh(
    approachGeometry,
    approachMaterial,
    approachPositions.length
  );
  approachPositions.forEach((position, index) => {
    dummy.position.copy(position);
    dummy.updateMatrix();
    approach.setMatrixAt(index, dummy.matrix);
  });
  approach.instanceMatrix.needsUpdate = true;
  group.add(approach);

  const dashGeometry = new THREE.PlaneGeometry(1.8, 22);
  const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xf2f2ea });
  const dashCount = Math.floor(airport.runwayLength / 55);
  const dashes = new THREE.InstancedMesh(dashGeometry, dashMaterial, dashCount);
  for (let i = 0; i < dashCount; i++) {
    dummy.position.set(0, 0.32, -airport.runwayLength / 2 + 30 + i * 55);
    dummy.rotation.x = -Math.PI / 2;
    dummy.updateMatrix();
    dashes.setMatrixAt(i, dummy.matrix);
  }
  dashes.instanceMatrix.needsUpdate = true;
  group.add(dashes);

  // Runway designators at both thresholds.
  const primary = Math.round(airport.headingDeg / 10) % 36 || 36;
  const secondary = primary > 18 ? primary - 18 : primary + 18;
  const designators: Array<[number, number]> = [
    [primary, -1],
    [secondary, 1]
  ];
  designators.forEach(([label, side]) => {
    const numberTexture = makeRunwayNumberTexture(String(label).padStart(2, '0'));
    disposables.push(numberTexture);
    const numberMaterial = new THREE.MeshBasicMaterial({
      map: numberTexture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const marker = new THREE.Mesh(new THREE.PlaneGeometry(24, 34), numberMaterial);
    marker.rotation.x = -Math.PI / 2;
    marker.rotation.z = side === 1 ? 0 : Math.PI;
    marker.position.set(0, 0.34, side * (airport.runwayLength / 2 - 95));
    group.add(marker);
  });

  // Windsock beside the apron: a small but recognisable airport detail.
  const poleMaterial = new THREE.MeshStandardMaterial({
    color: 0xcfd6dc,
    roughness: 0.6,
    metalness: 0.2
  });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 9, 6), poleMaterial);
  pole.position.set(470, 4.5, 250);
  group.add(pole);

  const sockMaterial = new THREE.MeshStandardMaterial({
    color: 0xff7a1a,
    roughness: 0.85,
    emissive: 0xff5a00,
    emissiveIntensity: 0.12
  });
  const sock = new THREE.Mesh(new THREE.ConeGeometry(1.5, 5.5, 8, 1, true), sockMaterial);
  sock.rotation.z = -Math.PI / 2;
  sock.position.set(473, 8.7, 250);
  group.add(sock);

  // Large ICAO code floating above the terminal so the airport is identifiable.
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.fillStyle = 'rgba(8, 16, 26, 0.0)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = 'bold 78px Arial';
  context.fillStyle = '#e8f1ff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(airport.code, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false })
  );
  sprite.scale.set(220, 110, 1);
  sprite.position.set(250, 75, 0);
  group.add(sprite);

  // Rotate the group's heading; the light/housing world positions above are
  // already in local runway space, so nothing else is needed.
  void cos;
  void sin;

  registerEditableLight(cab.material as THREE.MeshStandardMaterial, {
    color: 0x7fd4ff,
    nightIntensity: 2.4
  });
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface WorldHandle {
  group: THREE.Group;
  heightAt: (x: number, z: number) => number;
  /** Animate water and clouds. `daylight` is 0 at night, 1 at noon. */
  update: (dt: number, daylight: number) => void;
  dispose: () => void;
}

export function buildWorld(
  scene: THREE.Scene,
  options: {
    premium?: boolean;
    textureStreamer?: TextureStreamer;
    /** Shared streamed materials so remote airports use the same 4K maps. */
    asphaltMaterial?: THREE.Material;
    concreteMaterial?: THREE.Material;
  } = {}
): WorldHandle {
  const premium = options.premium ?? true;
  const group = new THREE.Group();
  group.name = 'proceduralWorld';
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  scene.add(group);

  /* ------------------------------ terrain ------------------------------ */
  const segments = premium ? 200 : 140;
  const terrainGeometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
  terrainGeometry.rotateX(-Math.PI / 2);

  const positions = terrainGeometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();

  const sand = new THREE.Color(0xb7a97d);
  const grass = new THREE.Color(0x4d6a38);
  const dryGrass = new THREE.Color(0x6d7448);
  const forest = new THREE.Color(0x3b5230);
  const rock = new THREE.Color(0x6d675e);
  const snow = new THREE.Color(0xe8eef2);

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const height = terrainHeight(x, z);
    positions.setY(i, height);

    const dx = terrainHeight(x + 12, z) - height;
    const dz = terrainHeight(x, z + 12) - height;
    const slope = Math.hypot(dx, dz) / 12;

    if (height < WATER_LEVEL + 3) {
      color.copy(sand);
    } else if (height < 120) {
      color.copy(grass).lerp(dryGrass, THREE.MathUtils.clamp(height / 140, 0, 1));
    } else if (height < 320) {
      color.copy(dryGrass).lerp(forest, THREE.MathUtils.clamp((height - 120) / 200, 0, 1));
    } else if (height < 560) {
      color.copy(forest).lerp(rock, THREE.MathUtils.clamp((height - 320) / 240, 0, 1));
    } else {
      color.copy(rock).lerp(snow, THREE.MathUtils.clamp((height - 560) / 160, 0, 1));
    }

    if (slope > 0.75 && height > 30) color.lerp(rock, 0.55);
    // The home hub plateau sits only ~0.6 m above the water plane, so the
    // generic lowland rule would paint the whole airport as beach sand and
    // leave a conspicuous pale disc. Blend it back to grassland.
    const homeBlend = 1 - smoothstep(2800, 3900, Math.hypot(x, z));
    if (homeBlend > 0) {
      color.lerp(grass, homeBlend * 0.85);
      color.lerp(dryGrass, homeBlend * 0.22);
    }
    const variation = 0.9 + valueNoise(x * 0.02, z * 0.02) * 0.2;
    color.multiplyScalar(variation);

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeometry.computeVertexNormals();

  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.0
  });
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.receiveShadow = true;
  group.add(terrain);
  disposables.push(terrainGeometry, terrainMaterial);

  // Stream a seamless detail map over the vertex colours. Using the shared
  // streamer gives it the same residency budget and 2K minimum as the airport
  // surfaces, so the ground keeps detail when the camera pulls back.
  if (options.textureStreamer) {
    options.textureStreamer.register({
      id: 'terrain',
      label: 'Detalle Terreno',
      levels: [512, 1024, 2048, 4096],
      minSize: 4096,
      generate: makeTerrainDetailCanvas,
      apply: (texture) => {
        terrainMaterial.map = texture;
        terrainMaterial.needsUpdate = true;
      },
      tileWorldSize: WORLD_SIZE / 30,
      distance: (camera) => Math.max(1, camera.position.y),
      repeat: [30, 30],
      anisotropy: 8
    });
  }

  /* ------------------------------- water ------------------------------- */
  const waterGeometry = new THREE.PlaneGeometry(WORLD_SIZE * 1.4, WORLD_SIZE * 1.4);
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x2b6484,
    roughness: 0.2,
    metalness: 0.3,
    transparent: true,
    opacity: 0.94
  });
  waterMaterial.normalScale.set(1.25, 1.25);
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_LEVEL;
  water.receiveShadow = true;
  group.add(water);
  disposables.push(waterGeometry, waterMaterial);

  let waterNormalTexture: THREE.Texture | null = null;
  const waterOffset = new THREE.Vector2();

  if (options.textureStreamer) {
    options.textureStreamer.register({
      id: 'water',
      label: 'Ondas de Agua',
      levels: [256, 512, 1024],
      minSize: 512,
      colorSpace: THREE.NoColorSpace,
      generate: makeWaterNormalCanvas,
      apply: (texture) => {
        waterNormalTexture = texture;
        texture.offset.copy(waterOffset);
        waterMaterial.normalMap = texture;
        waterMaterial.needsUpdate = true;
      },
      tileWorldSize: (WORLD_SIZE * 1.4) / 256,
      distance: (camera) => Math.max(1, camera.position.y - WATER_LEVEL),
      repeat: [256, 256],
      anisotropy: 8
    });
  }

  /* ------------------------------- clouds ------------------------------ */
  // Billboard cumulus layer. It is intentionally cheap: a handful of large
  // sprites sharing three materials, drifting slowly with the wind.
  const cloudGroup = new THREE.Group();
  cloudGroup.name = 'cloudLayer';
  group.add(cloudGroup);

  const cloudTexture = new THREE.CanvasTexture(makeCloudCanvas(256));
  cloudTexture.colorSpace = THREE.SRGBColorSpace;
  disposables.push(cloudTexture);

  const cloudMaterials: Array<{ material: THREE.SpriteMaterial; baseOpacity: number }> = [];
  [0.62, 0.46, 0.32].forEach((baseOpacity) => {
    const material = new THREE.SpriteMaterial({
      map: cloudTexture,
      transparent: true,
      depthWrite: false,
      opacity: baseOpacity,
      color: 0xffffff,
      fog: true
    });
    cloudMaterials.push({ material, baseOpacity });
    disposables.push(material);
  });

  const cloudRng = mulberry32(0xc10d5);
  const cloudSprites: THREE.Sprite[] = [];
  const cloudCount = premium ? 30 : 14;
  for (let i = 0; i < cloudCount; i++) {
    const angle = cloudRng() * Math.PI * 2;
    const radius = 2800 + Math.sqrt(cloudRng()) * 7800;
    const sprite = new THREE.Sprite(cloudMaterials[i % cloudMaterials.length].material);
    sprite.position.set(
      Math.cos(angle) * radius,
      1500 + cloudRng() * 1300,
      Math.sin(angle) * radius
    );
    const scale = 950 + cloudRng() * 1900;
    sprite.scale.set(scale * 1.8, scale, 1);
    sprite.userData.speed = 7 + cloudRng() * 11;
    cloudSprites.push(sprite);
    cloudGroup.add(sprite);
  }

  /* ------------------------------- roads ------------------------------- */
  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0x2b2f34,
    roughness: 0.93,
    metalness: 0.03
  });
  disposables.push(roadMaterial);

  interface RoadNode {
    id: string;
    x: number;
    z: number;
  }

  // Trunk network nodes: the airport landside access point plus the cities.
  const roadNodes: RoadNode[] = [
    { id: 'HOME', x: 380, z: 230 },
    ...CITIES.map((city) => ({ id: city.name, x: city.x, z: city.z }))
  ];

  // Minimum spanning tree (Prim) over the nodes. This replaces the old star
  // topology where every city and airport had its own road from the terminal,
  // which read as a meaningless spiderweb. Now each city gets one link to the
  // cheapest already-connected neighbour.
  const inTree = new Array<boolean>(roadNodes.length).fill(false);
  inTree[0] = true;
  const trunkEdges: Array<[number, number]> = [];
  for (let connected = 1; connected < roadNodes.length; connected++) {
    let bestFrom = -1;
    let bestTo = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < roadNodes.length; i++) {
      if (!inTree[i]) continue;
      for (let j = 0; j < roadNodes.length; j++) {
        if (inTree[j]) continue;
        const distance = Math.hypot(
          roadNodes[i].x - roadNodes[j].x,
          roadNodes[i].z - roadNodes[j].z
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          bestFrom = i;
          bestTo = j;
        }
      }
    }
    if (bestTo === -1) break;
    inTree[bestTo] = true;
    trunkEdges.push([bestFrom, bestTo]);
  }

  /**
   * Keep trunk roads off the home runway. If the straight leg would cut the
   * runway box, detour around the nearer threshold.
   */
  const routeTrunk = (from: RoadNode, to: RoadNode): THREE.Vector2[] => {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    for (let i = 1; i < 24; i++) {
      const t = i / 24;
      const x = from.x + dx * t;
      const z = from.z + dz * t;
      if (Math.abs(x) < 90 && Math.abs(z) < 1500) {
        const bypassZ = z >= 0 ? 1750 : -1750;
        return [
          new THREE.Vector2(from.x, from.z),
          new THREE.Vector2(from.x * 0.3, bypassZ),
          new THREE.Vector2(to.x * 0.3, bypassZ),
          new THREE.Vector2(to.x, to.z)
        ];
      }
    }
    return [
      new THREE.Vector2(from.x, from.z),
      new THREE.Vector2(to.x, to.z)
    ];
  };

  trunkEdges.forEach(([fromIndex, toIndex], index) => {
    addRoad(group, roadMaterial, routeTrunk(roadNodes[fromIndex], roadNodes[toIndex]), 0x1234 + index * 977, 19);
  });

  // Each remote airport connects to its own city (never back to MEX). The
  // approach is built in the airport's local frame: when the city sits on the
  // far side of the runway, the road rounds the nearest threshold instead of
  // crossing the asphalt.
  REMOTE_AIRPORTS.forEach((airport, index) => {
    const city = CITIES.find((candidate) => candidate.name === airport.city);
    if (!city) return;

    const heading = THREE.MathUtils.degToRad(airport.headingDeg);
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const toWorld = (localX: number, localZ: number) =>
      new THREE.Vector2(
        airport.x + localX * cos + localZ * sin,
        airport.z - localX * sin + localZ * cos
      );

    const relativeX = city.x - airport.x;
    const relativeZ = city.z - airport.z;
    const localCityX = relativeX * cos - relativeZ * sin;
    const localCityZ = relativeX * sin + relativeZ * cos;
    const halfRunway = airport.runwayLength / 2;
    const terminalSide = 500;
    let path: THREE.Vector2[];

    if (localCityX >= 40) {
      // City is already on the terminal side: hug the landside corridor.
      const corridorZ = THREE.MathUtils.clamp(
        localCityZ * 0.6,
        -halfRunway * 0.65,
        halfRunway * 0.65
      );
      path = [
        new THREE.Vector2(city.x, city.z),
        toWorld(terminalSide, corridorZ),
        toWorld(terminalSide, 0)
      ];
    } else {
      // City is across the runway: detour around the nearest runway end.
      const side = localCityZ >= 0 ? 1 : -1;
      const clearZ = side * (halfRunway + 340);
      path = [
        new THREE.Vector2(city.x, city.z),
        toWorld(0, clearZ),
        toWorld(terminalSide, clearZ),
        toWorld(terminalSide, 0)
      ];
    }

    addRoad(group, roadMaterial, path, 0x77aa + index * 613, 15);
  });

  /* ------------------------------ cities ------------------------------- */
  const windowTextures = makeWindowTextures();
  disposables.push(windowTextures.facade, windowTextures.emissive);

  const buildingMaterial = new THREE.MeshStandardMaterial({
    map: windowTextures.facade,
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0.12,
    emissive: 0xffd9a0,
    emissiveMap: windowTextures.emissive,
    emissiveIntensity: 0
  });
  registerEditableLight(buildingMaterial, {
    color: 0xffd9a0,
    nightIntensity: 1.5
  });
  disposables.push(buildingMaterial);

  const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(buildingGeometry);

  const buildingPalette = [0xd6dbe2, 0xb9c2cc, 0xa6b0ba, 0xcfc6b4, 0x9ba7b4, 0xc2cbd4];
  const cityRng = mulberry32(0xbada55);
  const buildingMatrices: THREE.Matrix4[] = [];
  const buildingColors: THREE.Color[] = [];
  const dummy = new THREE.Object3D();

  // Grid layout: streets tile each cell and a raised block fills the gap
  // between them. This reads as a real city from 6 km away instead of a
  // random scatter of boxes. All three layers are instanced (3 draw calls).
  const STREET_STEP = 190;
  const STREET_WIDTH = 26;
  const BLOCK_SIZE = STREET_STEP - STREET_WIDTH;

  const streetMaterial = new THREE.MeshStandardMaterial({
    color: 0x2c3036,
    roughness: 0.9,
    metalness: 0.04
  });
  const blockMaterial = new THREE.MeshStandardMaterial({
    color: 0x9aa1a8,
    roughness: 0.86,
    metalness: 0.05
  });
  const parkMaterial = new THREE.MeshStandardMaterial({
    color: 0x38602f,
    roughness: 0.95,
    metalness: 0
  });
  const cityPlaneGeometry = new THREE.PlaneGeometry(1, 1);
  cityPlaneGeometry.rotateX(-Math.PI / 2);
  disposables.push(streetMaterial, blockMaterial, parkMaterial, cityPlaneGeometry);

  const streetMatrices: THREE.Matrix4[] = [];
  const blockMatrices: THREE.Matrix4[] = [];
  const parkMatrices: THREE.Matrix4[] = [];
  const lotOffsets: Array<[number, number]> = [
    [-0.25, -0.25],
    [0.25, -0.25],
    [-0.25, 0.25],
    [0.25, 0.25]
  ];

  // A large metropolitan belt wrapped around the airport plateau. The runway,
  // taxiways, apron and terminal stay clear; the approach corridors only get
  // low-rise industrial buildings, like the warehouse belts around real
  // airports. `builtCells` lets the tree pass plant greenery in the leftover
  // plazas and parks instead of inside buildings.
  const METRO_RADIUS = 2400;
  const builtCells = new Set<string>();
  const parkCells: Array<{ x: number; z: number; y: number }> = [];
  const cellKey = (x: number, z: number) =>
    `${Math.round(x / STREET_STEP)}:${Math.round(z / STREET_STEP)}`;
  const inAirportCore = (x: number, z: number) =>
    Math.abs(x) < 350 && Math.abs(z) < 1490;
  const inApproachCorridor = (x: number, z: number) =>
    Math.abs(x) < 620 && Math.abs(z) < 4400;

  const addCityGrid = (
    centerX: number,
    centerZ: number,
    radius: number,
    elevation: number,
    options: {
      skip?: (x: number, z: number) => boolean;
      heightLimit?: (x: number, z: number, height: number) => number;
    } = {}
  ) => {
    const reach = radius * 0.95;
    const steps = Math.ceil(reach / STREET_STEP);

    for (let gx = -steps; gx <= steps; gx++) {
      for (let gz = -steps; gz <= steps; gz++) {
        const cellX = centerX + gx * STREET_STEP;
        const cellZ = centerZ + gz * STREET_STEP;
        const distance = Math.hypot(cellX - centerX, cellZ - centerZ);
        if (distance > reach) continue;
        if (options.skip?.(cellX, cellZ)) continue;

        const ground = terrainHeight(cellX, cellZ);
        // Rivers cut through some city pads: skip streets and blocks in water.
        if (ground < elevation - 1.5) continue;

        // Street base covers the full cell; the block sits on top, leaving
        // STREET_WIDTH of asphalt exposed between blocks.
        dummy.position.set(cellX, ground + 0.08, cellZ);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(STREET_STEP, 1, STREET_STEP);
        dummy.updateMatrix();
        streetMatrices.push(dummy.matrix.clone());

        const isPark = cityRng() < 0.14;
        dummy.position.set(cellX, ground + 0.14, cellZ);
        dummy.scale.set(BLOCK_SIZE, 1, BLOCK_SIZE);
        dummy.updateMatrix();
        if (isPark) {
          parkMatrices.push(dummy.matrix.clone());
          parkCells.push({ x: cellX, z: cellZ, y: ground });
          continue;
        }
        blockMatrices.push(dummy.matrix.clone());
        builtCells.add(cellKey(cellX, cellZ));

        const distanceFactor = 1 - distance / reach;
        for (const [lotX, lotZ] of lotOffsets) {
          // Leave plazas, parking lots and plazas between towers.
          if (cityRng() < 0.2) continue;
          const lotSize = BLOCK_SIZE * 0.5;
          const width = lotSize * (0.56 + cityRng() * 0.32);
          const depth = lotSize * (0.56 + cityRng() * 0.32);
          let height =
            9 + cityRng() * 22 + Math.pow(distanceFactor, 2.2) * (42 + cityRng() * 135);
          if (options.heightLimit) height = options.heightLimit(cellX, cellZ, height);

          dummy.position.set(
            cellX + lotX * BLOCK_SIZE,
            ground + height / 2 + 0.14,
            cellZ + lotZ * BLOCK_SIZE
          );
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(width, height, depth);
          dummy.updateMatrix();
          buildingMatrices.push(dummy.matrix.clone());
          const shade = buildingPalette[Math.floor(cityRng() * buildingPalette.length)];
          buildingColors.push(new THREE.Color(shade));
        }
      }
    }
  };

  for (const city of CITIES) {
    addCityGrid(city.x, city.z, city.radius, city.elevation);
  }
  addCityGrid(0, 0, METRO_RADIUS, HOME_AIRPORT.elevation, {
    skip: inAirportCore,
    heightLimit: (x, z, height) => {
      if (!inApproachCorridor(x, z)) return height;
      // Keep the straight-in approach path low, but let the skyline rise as
      // soon as you move laterally away from the extended centreline.
      const lateral = Math.abs(x);
      if (lateral < 420) return Math.min(height, 18);
      const rise = Math.min(1, (lateral - 420) / 200);
      return Math.min(height, 18 + rise * 62);
    }
  });

  const buildings = new THREE.InstancedMesh(
    buildingGeometry,
    buildingMaterial,
    buildingMatrices.length
  );
  buildingMatrices.forEach((matrix, index) => {
    buildings.setMatrixAt(index, matrix);
    buildings.setColorAt(index, buildingColors[index]);
  });
  buildings.instanceMatrix.needsUpdate = true;
  if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  group.add(buildings);

  const addPlaneInstances = (
    matrices: THREE.Matrix4[],
    material: THREE.Material,
    name: string
  ) => {
    if (matrices.length === 0) return;
    const mesh = new THREE.InstancedMesh(cityPlaneGeometry, material, matrices.length);
    mesh.name = name;
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  addPlaneInstances(streetMatrices, streetMaterial, 'cityStreets');
  addPlaneInstances(blockMatrices, blockMaterial, 'cityBlocks');
  addPlaneInstances(parkMatrices, parkMaterial, 'cityParks');

  /* ------------------------------- trees ------------------------------- */
  const treeRng = mulberry32(0x7ee5);
  const treeCount = premium ? 4600 : 2000;
  const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.8, 3.2, 5);
  const canopyGeometry = new THREE.ConeGeometry(3.4, 10, 6);
  const broadleafGeometry = new THREE.IcosahedronGeometry(3.5, 1);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.95 });
  const canopyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const broadleafMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 });
  disposables.push(
    trunkGeometry,
    canopyGeometry,
    broadleafGeometry,
    trunkMaterial,
    canopyMaterial,
    broadleafMaterial
  );

  const trunkMatrices: THREE.Matrix4[] = [];
  const canopyMatrices: THREE.Matrix4[] = [];
  const canopyColors: THREE.Color[] = [];
  const broadleafMatrices: THREE.Matrix4[] = [];
  const broadleafColors: THREE.Color[] = [];
  const treeShades = [0x2e4a28, 0x395c2f, 0x466b37, 0x27401f];
  const broadleafShades = [0x3f6f34, 0x4d7d3a, 0x355e2c, 0x5a8a45];

  const plantTree = (x: number, z: number, baseY: number, scale: number) => {
    dummy.position.set(x, baseY + 1.6 * scale, z);
    dummy.rotation.set(0, treeRng() * Math.PI * 2, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    trunkMatrices.push(dummy.matrix.clone());

    if (treeRng() < 0.42) {
      // Broadleaf: a squashed icosahedron reads as a rounded canopy.
      dummy.position.set(x, baseY + 5.2 * scale, z);
      dummy.rotation.set(0, treeRng() * Math.PI * 2, 0);
      dummy.scale.set(scale * 1.3, scale * 0.95, scale * 1.3);
      dummy.updateMatrix();
      broadleafMatrices.push(dummy.matrix.clone());
      const shade = broadleafShades[Math.floor(treeRng() * broadleafShades.length)];
      broadleafColors.push(new THREE.Color(shade));
      return;
    }

    dummy.position.set(x, baseY + 7.6 * scale, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    canopyMatrices.push(dummy.matrix.clone());
    canopyColors.push(new THREE.Color(treeShades[Math.floor(treeRng() * treeShades.length)]));
  };

  // Every park gets a grove so the green cells read as real lungs of the city
  // instead of flat green squares, both around the airport and in the cities.
  const parkTreeBudget = Math.min(parkCells.length * 16, Math.floor(treeCount * 0.42));
  for (let i = 0; i < parkTreeBudget; i++) {
    const cell = parkCells[Math.floor(treeRng() * parkCells.length)];
    if (!cell) break;
    const x = cell.x + (treeRng() - 0.5) * BLOCK_SIZE * 0.84;
    const z = cell.z + (treeRng() - 0.5) * BLOCK_SIZE * 0.84;
    plantTree(x, z, cell.y, 0.7 + treeRng() * 0.9);
  }

  // Tree-lined boulevards on the main avenues around the airport. They give
  // the grid a green structure instead of an endless sea of asphalt.
  const plantAvenue = (line: number, min: number, max: number) => {
    const step = 38;
    for (let t = min; t <= max; t += step) {
      for (const side of [-11.6, 11.6]) {
        if (treeRng() < 0.35) continue;
        const x = line + side;
        const z = t + (treeRng() - 0.5) * 9;
        const baseY = terrainHeight(x, z);
        if (baseY < WATER_LEVEL + 0.5) continue;
        plantTree(x, z, baseY, 0.55 + treeRng() * 0.35);
      }
    }
  };
  for (let n = -14; n <= 14; n++) {
    const line = (n + 0.5) * STREET_STEP;
    const lateral = Math.abs(line);
    if (lateral >= 350 && lateral <= 1250) {
      plantAvenue(line, -1500, 1500);
    }
  }

  for (let i = 0; i < treeCount * 3 && trunkMatrices.length < treeCount; i++) {
    let x: number;
    let z: number;

    if (treeRng() < 0.52) {
      // Vegetation inside the metropolitan belt. Trees only grow on the free
      // cells: parks, plazas and leftover lots between the generated blocks,
      // never inside a building footprint or on the airport movement area.
      const angle = treeRng() * Math.PI * 2;
      const radius = 340 + Math.pow(treeRng(), 0.7) * (METRO_RADIUS - 340);
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
      if (inAirportCore(x, z)) continue;
      if (builtCells.has(cellKey(x, z))) continue;
      // Keep the runway strip itself clear even where the metro belt starts.
      if (Math.abs(x) < 120 && Math.abs(z) < 1600) continue;
      // Stay inside the park block, not on the asphalt ring around it.
      const offsetX = x - Math.round(x / STREET_STEP) * STREET_STEP;
      const offsetZ = z - Math.round(z / STREET_STEP) * STREET_STEP;
      if (Math.abs(offsetX) > BLOCK_SIZE * 0.44 || Math.abs(offsetZ) > BLOCK_SIZE * 0.44) {
        continue;
      }
    } else {
      x = (treeRng() - 0.5) * WORLD_SIZE * 0.78;
      z = (treeRng() - 0.5) * WORLD_SIZE * 0.78;
      const distanceFromAirport = Math.hypot(x, z);
      if (distanceFromAirport < 2900) continue;

      let insidePad = false;
      for (const city of CITIES) {
        if (Math.hypot(x - city.x, z - city.z) < city.radius * 0.92) {
          insidePad = true;
          break;
        }
      }
      if (insidePad) continue;
    }

    const height = terrainHeight(x, z);
    if (height < WATER_LEVEL + 0.5 || height > 520) continue;
    const slope =
      Math.hypot(
        terrainHeight(x + 10, z) - height,
        terrainHeight(x, z + 10) - height
      ) / 10;
    if (slope > 0.85) continue;

    plantTree(x, z, height, 0.7 + treeRng() * 0.9);
  }

  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trunkMatrices.length);
  trunkMatrices.forEach((matrix, index) => trunks.setMatrixAt(index, matrix));
  trunks.instanceMatrix.needsUpdate = true;
  group.add(trunks);

  const canopies = new THREE.InstancedMesh(
    canopyGeometry,
    canopyMaterial,
    canopyMatrices.length
  );
  canopyMatrices.forEach((matrix, index) => {
    canopies.setMatrixAt(index, matrix);
    canopies.setColorAt(index, canopyColors[index]);
  });
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  group.add(canopies);

  const broadleaves = new THREE.InstancedMesh(
    broadleafGeometry,
    broadleafMaterial,
    broadleafMatrices.length
  );
  broadleafMatrices.forEach((matrix, index) => {
    broadleaves.setMatrixAt(index, matrix);
    broadleaves.setColorAt(index, broadleafColors[index]);
  });
  broadleaves.instanceMatrix.needsUpdate = true;
  if (broadleaves.instanceColor) broadleaves.instanceColor.needsUpdate = true;
  group.add(broadleaves);

  /* ----------------------------- city life ----------------------------- */
  // Cars and pedestrians travel along the street grid that addCityGrid() laid
  // around the airport. Both are single InstancedMeshes whose matrices are
  // refreshed every frame, so the whole metropolis costs two draw calls.
  const lifeRng = mulberry32(0x51ee7);
  const METRO_LIMIT = METRO_RADIUS * 0.92;
  const LANE = 3.1;
  const SIDEWALK = 10.6;

  // Straight road segments. Roads that would cut across the movement area are
  // split into two halves, one on each side of the airport; cars bounce at the
  // segment ends instead of crossing the runway.
  const roadSegments: Array<{ axis: 'x' | 'z'; line: number; min: number; max: number }> = [];
  for (let n = -14; n <= 14; n++) {
    const line = (n + 0.5) * STREET_STEP;
    if (Math.abs(line) > METRO_LIMIT) continue;
    // Horizontal roads (axis x) run along constant z.
    if (Math.abs(line) >= 1490) {
      roadSegments.push({ axis: 'x', line, min: -METRO_LIMIT, max: METRO_LIMIT });
    } else {
      if (METRO_LIMIT > 350) {
        roadSegments.push({ axis: 'x', line, min: -METRO_LIMIT, max: -350 });
        roadSegments.push({ axis: 'x', line, min: 350, max: METRO_LIMIT });
      }
    }
    // Vertical roads (axis z) run along constant x.
    if (Math.abs(line) >= 350) {
      roadSegments.push({ axis: 'z', line, min: -METRO_LIMIT, max: METRO_LIMIT });
    } else {
      roadSegments.push({ axis: 'z', line, min: -METRO_LIMIT, max: -1490 });
      roadSegments.push({ axis: 'z', line, min: 1490, max: METRO_LIMIT });
    }
  }

  interface RoadAgent {
    axis: 'x' | 'z';
    line: number;
    along: number;
    min: number;
    max: number;
    dir: number;
    speed: number;
    lane: number;
    groundY: number;
    sampleAt: number;
    phase: number;
  }

  const spawnAgents = (count: number, speedMin: number, speedMax: number, laneOffset: number) => {
    const list: RoadAgent[] = [];
    for (let i = 0; i < count; i++) {
      const road = roadSegments[Math.floor(lifeRng() * roadSegments.length)];
      const dir = lifeRng() < 0.5 ? 1 : -1;
      const along = road.min + lifeRng() * (road.max - road.min);
      const axis = road.axis;
      const lane = dir * laneOffset;
      const x = axis === 'x' ? along : road.line + lane;
      const z = axis === 'x' ? road.line + lane : along;
      list.push({
        axis,
        line: road.line,
        along,
        min: road.min,
        max: road.max,
        dir,
        speed: speedMin + lifeRng() * (speedMax - speedMin),
        lane,
        groundY: terrainHeight(x, z),
        sampleAt: along,
        phase: lifeRng() * Math.PI * 2
      });
    }
    return list;
  };

  // Vehicles: two boxes merged into one low-poly car, tinted per instance.
  const carBody = new THREE.BoxGeometry(1.8, 0.6, 4.2);
  carBody.translate(0, 0.7, 0);
  const carCabin = new THREE.BoxGeometry(1.6, 0.58, 2);
  carCabin.translate(0, 1.24, -0.1);
  const carGeometry =
    mergeGeometries([carBody.toNonIndexed(), carCabin.toNonIndexed()], false) ??
    new THREE.BoxGeometry(1.8, 1.4, 4.2);
  carBody.dispose();
  carCabin.dispose();
  const carMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0.3,
    emissive: 0xffd9a0,
    emissiveIntensity: 0
  });
  registerEditableLight(carMaterial, { color: 0xffd9a0, nightIntensity: 0.4 });

  // People: body + head merged, gently bobbing while they walk.
  const personBody = new THREE.BoxGeometry(0.42, 1.02, 0.3);
  personBody.translate(0, 0.63, 0);
  const personHead = new THREE.IcosahedronGeometry(0.21, 1);
  personHead.translate(0, 1.38, 0);
  const personGeometry =
    mergeGeometries([personBody.toNonIndexed(), personHead.toNonIndexed()], false) ??
    new THREE.BoxGeometry(0.42, 1.6, 0.3);
  personBody.dispose();
  personHead.dispose();
  const personMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.02,
    emissive: 0xffd9a0,
    emissiveIntensity: 0.04
  });
  registerEditableLight(personMaterial, {
    color: 0xffd9a0,
    nightIntensity: 0.26,
    dayIntensity: 0.04
  });

  disposables.push(carGeometry, carMaterial, personGeometry, personMaterial);

  const carPalette = [
    0xd9dde3, 0x2e3742, 0x8c2f2f, 0x2f5c8c, 0xc7b299, 0x3a6b4f, 0xeeeeee, 0x1c1f24,
    0xd8a921
  ];
  const clothingPalette = [
    0x6f86a6, 0xa26b52, 0x6d8a5e, 0x585a6e, 0xb08c62, 0x5f7796, 0x8f4f4f, 0x3f5f7a
  ];

  const cars = spawnAgents(premium ? 260 : 130, 7, 15, LANE);
  const carMesh = new THREE.InstancedMesh(carGeometry, carMaterial, cars.length);
  carMesh.name = 'cityCars';
  carMesh.frustumCulled = false;
  cars.forEach((_, index) =>
    carMesh.setColorAt(index, new THREE.Color(carPalette[index % carPalette.length]))
  );
  if (carMesh.instanceColor) carMesh.instanceColor.needsUpdate = true;
  group.add(carMesh);

  const people = spawnAgents(premium ? 380 : 190, 0.9, 1.7, SIDEWALK);
  // Walk along the sidewalk edge nearest the block on both sides.
  people.forEach((person, index) => {
    person.lane = (index % 2 === 0 ? 1 : -1) * SIDEWALK;
  });

  // A small crowd on the landside pavement of the terminal, next to the
  // drop-off lane, so the airport itself also feels busy on foot.
  const plazaPeople: RoadAgent[] = [];
  const plazaCount = premium ? 46 : 22;
  for (let i = 0; i < plazaCount; i++) {
    const along = 94 + lifeRng() * 336;
    plazaPeople.push({
      axis: 'z',
      line: 292 + (lifeRng() - 0.5) * 9,
      along,
      min: 94,
      max: 430,
      dir: lifeRng() < 0.5 ? 1 : -1,
      speed: 0.8 + lifeRng() * 0.9,
      lane: 0,
      groundY: HOME_AIRPORT.elevation,
      sampleAt: along,
      phase: lifeRng() * Math.PI * 2
    });
  }

  const personTotal = people.length + plazaPeople.length;
  const personMesh = new THREE.InstancedMesh(personGeometry, personMaterial, personTotal);
  personMesh.name = 'cityPedestrians';
  personMesh.frustumCulled = false;
  for (let index = 0; index < personTotal; index++) {
    personMesh.setColorAt(
      index,
      new THREE.Color(clothingPalette[index % clothingPalette.length])
    );
  }
  if (personMesh.instanceColor) personMesh.instanceColor.needsUpdate = true;
  group.add(personMesh);

  /* --------------------------- street lights --------------------------- */
  // Luminaires along every avenue near the airport. Each one is three
  // instances (post, emissive head, ground light pool), so the whole lighting
  // grid is three draw calls and no real lights are added. The pools are
  // additive discs whose opacity follows the night factor, which fakes the
  // warm illumination on the asphalt without a single PointLight.
  const lampDummy = new THREE.Object3D();
  interface LampSpot {
    x: number;
    z: number;
    y: number;
    poolX: number;
    poolZ: number;
  }
  const lampSpots: LampSpot[] = [];
  const addLamp = (x: number, z: number, poolX: number, poolZ: number) => {
    const y = terrainHeight(x, z);
    if (y < WATER_LEVEL + 0.5) return;
    lampSpots.push({ x, z, y, poolX, poolZ });
  };

  for (const road of roadSegments) {
    if (Math.abs(road.line) > 1900) continue;
    const min = Math.max(road.min, -1900);
    const max = Math.min(road.max, 1900);
    const side = road.line >= 0 ? 1 : -1;
    for (let t = min + 18; t <= max - 8; t += 58) {
      if (road.axis === 'z') {
        addLamp(
          road.line + side * 12.6,
          t,
          road.line + side * 12.6 - side * 5.4,
          t
        );
      } else {
        addLamp(
          t,
          road.line + side * 12.6,
          t,
          road.line + side * 12.6 - side * 5.4
        );
      }
    }
  }
  // Terminal drop-off lane, so the landside is lit as well.
  for (let z = 100; z <= 424; z += 46) {
    addLamp(283, z, 277, z);
  }

  const lampPostGeometry =
    mergeGeometries(
      [
        new THREE.CylinderGeometry(0.11, 0.18, 7.4, 6).translate(0, 3.7, 0).toNonIndexed(),
        new THREE.BoxGeometry(0.5, 0.16, 0.3).translate(0, 7.32, 0).toNonIndexed()
      ],
      false
    ) ?? new THREE.CylinderGeometry(0.14, 0.2, 7.4, 6);
  const lampPostMaterial = new THREE.MeshStandardMaterial({
    color: 0x39434d,
    roughness: 0.55,
    metalness: 0.6
  });
  const lampHeadGeometry = new THREE.BoxGeometry(0.82, 0.14, 0.36);
  lampHeadGeometry.translate(0, 7.55, 0);
  const lampHeadMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8e6da,
    roughness: 0.3,
    metalness: 0.1,
    emissive: 0xffd9a0,
    emissiveIntensity: 0
  });
  registerEditableLight(lampHeadMaterial, { color: 0xffd9a0, nightIntensity: 2.2 });
  const poolGeometry = new THREE.CircleGeometry(7, 12);
  poolGeometry.rotateX(-Math.PI / 2);
  const poolCanvas = document.createElement('canvas');
  poolCanvas.width = 64;
  poolCanvas.height = 64;
  const poolContext = poolCanvas.getContext('2d');
  if (poolContext) {
    const gradient = poolContext.createRadialGradient(32, 32, 2, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,244,214,0.55)');
    gradient.addColorStop(1, 'rgba(255,244,214,0)');
    poolContext.fillStyle = gradient;
    poolContext.fillRect(0, 0, 64, 64);
  }
  const poolTexture = new THREE.CanvasTexture(poolCanvas);
  poolTexture.colorSpace = THREE.SRGBColorSpace;
  const poolMaterial = new THREE.MeshBasicMaterial({
    color: 0xffc46e,
    map: poolTexture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  disposables.push(
    lampPostGeometry,
    lampPostMaterial,
    lampHeadGeometry,
    lampHeadMaterial,
    poolGeometry,
    poolTexture,
    poolMaterial
  );

  const lampPosts = new THREE.InstancedMesh(
    lampPostGeometry,
    lampPostMaterial,
    lampSpots.length
  );
  lampPosts.name = 'streetLampPosts';
  lampPosts.frustumCulled = false;
  const lampHeads = new THREE.InstancedMesh(
    lampHeadGeometry,
    lampHeadMaterial,
    lampSpots.length
  );
  lampHeads.name = 'streetLampHeads';
  lampHeads.frustumCulled = false;
  const lampPools = new THREE.InstancedMesh(
    poolGeometry,
    poolMaterial,
    lampSpots.length
  );
  lampPools.name = 'streetLightPools';
  lampPools.frustumCulled = false;
  lampPools.visible = false;
  lampSpots.forEach((lamp, index) => {
    lampDummy.position.set(lamp.x, lamp.y + 0.05, lamp.z);
    lampDummy.rotation.set(0, 0, 0);
    lampDummy.updateMatrix();
    lampPosts.setMatrixAt(index, lampDummy.matrix);
    lampHeads.setMatrixAt(index, lampDummy.matrix);

    lampDummy.position.set(lamp.poolX, lamp.y + 0.11, lamp.poolZ);
    lampDummy.updateMatrix();
    lampPools.setMatrixAt(index, lampDummy.matrix);
  });
  lampPosts.instanceMatrix.needsUpdate = true;
  lampHeads.instanceMatrix.needsUpdate = true;
  lampPools.instanceMatrix.needsUpdate = true;
  group.add(lampPosts, lampHeads, lampPools);

  /* --------------------------- traffic lights -------------------------- */
  // Signal heads at the intersections of the avenues that the cars use. The
  // three bulbs are instances of one mesh and their colours are refreshed only
  // when the phase changes (about every 3 s).
  const verticalLines = Array.from(
    new Set(roadSegments.filter((road) => road.axis === 'z').map((road) => road.line))
  ).filter((line) => Math.abs(line) <= 1900);
  const horizontalLines = Array.from(
    new Set(roadSegments.filter((road) => road.axis === 'x').map((road) => road.line))
  ).filter((line) => Math.abs(line) <= 1900);

  interface SignalSpot {
    x: number;
    z: number;
    group: number;
  }
  const signalSpots: SignalSpot[] = [];
  for (let vi = 0; vi < verticalLines.length; vi++) {
    for (let hi = 0; hi < horizontalLines.length; hi++) {
      const x = verticalLines[vi];
      const z = horizontalLines[hi];
      if (Math.abs(x) + Math.abs(z) > 3400) continue;
      signalSpots.push({ x, z, group: (vi + hi) % 2 });
    }
  }

  const signalPostGeometry =
    mergeGeometries(
      [
        new THREE.CylinderGeometry(0.11, 0.15, 4.9, 6).translate(0, 2.45, 0).toNonIndexed(),
        new THREE.BoxGeometry(0.46, 1.3, 0.4).translate(0, 4.4, 0).toNonIndexed()
      ],
      false
    ) ?? new THREE.CylinderGeometry(0.14, 0.18, 4.9, 6);
  const signalPostMaterial = new THREE.MeshStandardMaterial({
    color: 0x242a30,
    roughness: 0.55,
    metalness: 0.5
  });
  const signalBulbGeometry = new THREE.BoxGeometry(0.26, 0.26, 0.52);
  const signalBulbMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  disposables.push(
    signalPostGeometry,
    signalPostMaterial,
    signalBulbGeometry,
    signalBulbMaterial
  );

  const signalPosts = new THREE.InstancedMesh(
    signalPostGeometry,
    signalPostMaterial,
    signalSpots.length
  );
  signalPosts.name = 'trafficLightPosts';
  signalPosts.frustumCulled = false;
  const signalBulbs = new THREE.InstancedMesh(
    signalBulbGeometry,
    signalBulbMaterial,
    signalSpots.length * 3
  );
  signalBulbs.name = 'trafficLightBulbs';
  signalBulbs.frustumCulled = false;

  const signalOn = [
    new THREE.Color(0xff3524),
    new THREE.Color(0xffb52e),
    new THREE.Color(0x37ff7a)
  ];
  const signalOff = [
    new THREE.Color(0x2a1310),
    new THREE.Color(0x2a2110),
    new THREE.Color(0x0f2a18)
  ];
  signalSpots.forEach((spot, index) => {
    const baseX = spot.x + 15;
    const baseZ = spot.z + 15;
    const groundY = terrainHeight(baseX, baseZ);
    lampDummy.position.set(baseX, groundY + 0.05, baseZ);
    lampDummy.rotation.set(0, Math.PI / 4, 0);
    lampDummy.updateMatrix();
    signalPosts.setMatrixAt(index, lampDummy.matrix);

    for (let slot = 0; slot < 3; slot++) {
      lampDummy.position.set(baseX, groundY + 4.03 + slot * 0.37, baseZ);
      lampDummy.rotation.set(0, Math.PI / 4, 0);
      lampDummy.updateMatrix();
      signalBulbs.setMatrixAt(index * 3 + slot, lampDummy.matrix);
      signalBulbs.setColorAt(index * 3 + slot, signalOff[slot]);
    }
  });
  signalPosts.instanceMatrix.needsUpdate = true;
  signalBulbs.instanceMatrix.needsUpdate = true;
  if (signalBulbs.instanceColor) signalBulbs.instanceColor.needsUpdate = true;
  group.add(signalPosts, signalBulbs);

  const applySignals = (time: number) => {
    const t = time % 26;
    const greenA = t < 10;
    const amberA = t >= 10 && t < 13;
    const greenB = t >= 13 && t < 23;
    const amberB = t >= 23;
    const stateA = greenA ? 2 : amberA ? 1 : 0;
    const stateB = greenB ? 2 : amberB ? 1 : 0;
    const key = `${stateA}${stateB}`;
    if (key === signalKey) return;
    signalKey = key;
    for (let i = 0; i < signalSpots.length; i++) {
      const state = signalSpots[i].group === 0 ? stateA : stateB;
      const base = i * 3;
      for (let slot = 0; slot < 3; slot++) {
        const on =
          (state === 2 && slot === 2) ||
          (state === 1 && slot === 1) ||
          (state === 0 && slot === 0);
        signalBulbs.setColorAt(base + slot, on ? signalOn[slot] : signalOff[slot]);
      }
    }
    if (signalBulbs.instanceColor) signalBulbs.instanceColor.needsUpdate = true;
  };
  let signalKey = '';
  let lifeClock = 0;
  applySignals(0);

  const lifeDummy = new THREE.Object3D();

  const stepAgents = (
    list: RoadAgent[],
    mesh: THREE.InstancedMesh,
    dt: number,
    bob: number,
    indexOffset = 0
  ) => {
    for (let i = 0; i < list.length; i++) {
      const agent = list[i];
      agent.along += agent.dir * agent.speed * dt;
      if (agent.along > agent.max) {
        agent.along = agent.max;
        agent.dir = -1;
      } else if (agent.along < agent.min) {
        agent.along = agent.min;
        agent.dir = 1;
      }
      const x = agent.axis === 'x' ? agent.along : agent.line + agent.lane;
      const z = agent.axis === 'x' ? agent.line + agent.lane : agent.along;
      if (Math.abs(agent.along - agent.sampleAt) > 9) {
        agent.sampleAt = agent.along;
        agent.groundY = terrainHeight(x, z);
      }
      const yaw =
        agent.axis === 'x'
          ? agent.dir > 0
            ? Math.PI / 2
            : -Math.PI / 2
          : agent.dir > 0
            ? 0
            : Math.PI;
      lifeDummy.position.set(
        x,
        agent.groundY + 0.03 + (bob > 0 ? Math.abs(Math.sin(agent.phase)) * bob : 0),
        z
      );
      lifeDummy.rotation.set(0, yaw, 0);
      lifeDummy.updateMatrix();
      mesh.setMatrixAt(indexOffset + i, lifeDummy.matrix);
    }
  };

  const updateCityLife = (dt: number, daylight: number) => {
    lifeClock += dt;
    applySignals(lifeClock);

    const night = 1 - THREE.MathUtils.clamp(daylight, 0, 1);
    const showPools = night > 0.06;
    if (lampPools.visible !== showPools) lampPools.visible = showPools;
    poolMaterial.opacity = 0.34 * night * night;

    for (let i = 0; i < people.length; i++) {
      people[i].phase += dt * (4.5 + people[i].speed * 1.6);
    }
    for (let i = 0; i < plazaPeople.length; i++) {
      plazaPeople[i].phase += dt * (4.5 + plazaPeople[i].speed * 1.6);
    }
    stepAgents(cars, carMesh, dt, 0);
    stepAgents(people, personMesh, dt, 0.06);
    stepAgents(plazaPeople, personMesh, dt, 0.05, people.length);
    carMesh.instanceMatrix.needsUpdate = true;
    personMesh.instanceMatrix.needsUpdate = true;
  };
  updateCityLife(0, 1);

  /* -------------------------- remote airports -------------------------- */
  // Reuse the streamed 4K asphalt/concrete maps when available so every
  // runway in the world shares the same high-res surface and VRAM budget.
  const ownsAsphalt = !options.asphaltMaterial;
  const ownsConcrete = !options.concreteMaterial;
  const runwayAsphalt =
    options.asphaltMaterial ??
    new THREE.MeshStandardMaterial({
      color: 0x34383d,
      roughness: 0.9,
      metalness: 0.05
    });
  const airportConcrete =
    options.concreteMaterial ??
    new THREE.MeshStandardMaterial({
      color: 0x9aa0a6,
      roughness: 0.82,
      metalness: 0.05
    });
  const airportBuilding = new THREE.MeshStandardMaterial({
    color: 0xd4dae1,
    roughness: 0.6,
    metalness: 0.2,
    emissive: 0xffe0b0,
    emissiveIntensity: 0
  });
  registerEditableLight(airportBuilding, { color: 0xffe0b0, nightIntensity: 1.2 });
  if (ownsAsphalt) disposables.push(runwayAsphalt);
  if (ownsConcrete) disposables.push(airportConcrete);
  disposables.push(airportBuilding);

  REMOTE_AIRPORTS.forEach((airport) => {
    buildRemoteAirport(
      group,
      airport,
      runwayAsphalt,
      airportConcrete,
      airportBuilding,
      disposables
    );
  });

  /* ------------------------------- API -------------------------------- */
  // Clouds fade to a cold blue at night and drift with the wind. Water UVs
  // scroll slowly so the normal map animates without per-frame geometry work.
  const dayCloud = new THREE.Color(0xffffff);
  const nightCloud = new THREE.Color(0x1a2433);

  const update = (dt: number, daylight: number) => {
    updateCityLife(dt, daylight);

    if (waterNormalTexture) {
      waterOffset.x = (waterOffset.x + dt * 0.013) % 1;
      waterOffset.y = (waterOffset.y + dt * 0.008) % 1;
      waterNormalTexture.offset.copy(waterOffset);
    }

    for (const sprite of cloudSprites) {
      sprite.position.x += (sprite.userData.speed as number) * dt;
      if (sprite.position.x > 11000) sprite.position.x = -11000;
    }

    const clamped = THREE.MathUtils.clamp(daylight, 0, 1);
    for (const entry of cloudMaterials) {
      entry.material.color.copy(nightCloud).lerp(dayCloud, clamped);
      entry.material.opacity = entry.baseOpacity * (0.3 + 0.7 * clamped);
    }
  };

  return {
    group,
    heightAt: terrainHeight,
    update,
    dispose: () => {
      scene.remove(group);
      group.traverse((child) => {
        const renderable = child as THREE.Mesh & THREE.Sprite;
        if (renderable.geometry) renderable.geometry.dispose();
        const material = renderable.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
      disposables.forEach((item) => item.dispose());
    }
  };
}
