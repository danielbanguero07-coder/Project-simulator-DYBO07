import * as THREE from 'three';

/**
 * Airport lighting builders.
 *
 * Runway layout (matches `qualityDemo.ts` / `groundNetwork.ts`):
 *   - runway centreline .... x = 0, z = -1150 .. +1150
 *   - landing direction .... +Z -> -Z (aircraft crosses the +1150 threshold)
 *   - PAPI ................. left of the +1150 end, abeam the touchdown zone
 *
 * The heavy parts (edge and threshold lights, taxiway dashes) are drawn with
 * `InstancedMesh` so the whole runway costs a handful of draw calls instead of
 * ~400 individual meshes.
 */

export const LIGHT_COLORS = {
  edge: 0xffd27a,
  edgeFar: 0xfff2c2,
  thresholdGreen: 0x2bff6a,
  thresholdRed: 0xff2f2f,
  taxiwayBlue: 0x4a90e2,
  taxiwayEdge: 0x2f6fb0,
  jetway: 0xffe484,
  papiWhite: 0xf7f7f2,
  papiRed: 0xff2222
};

/** Runway edge / threshold spacing (metres). */
const EDGE_SPACING = 30;

/** Instanced point-light look: unlit, tone-mapping-free spheres. */
function lampMaterial(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    toneMapped: false,
    transparent: opacity < 1,
    opacity
  });
}

/**
 * Builds one row of instanced lamps and returns the mesh.
 * `positions` are world-space coordinates.
 */
function buildLampRow(
  positions: THREE.Vector3[],
  color: number,
  radius = 0.55
): THREE.InstancedMesh {
  const geometry = new THREE.SphereGeometry(radius, 8, 6);
  const material = lampMaterial(color);
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, positions.length));
  const dummy = new THREE.Object3D();
  positions.forEach((p, i) => {
    dummy.position.copy(p);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.count = positions.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

export interface PapiUserData {
  isPapi: true;
  /** Glide-path boundaries, in degrees, one per lamp unit. */
  unitAngles: number[];
  /** World position of the PAPI unit row (centre). */
  papiX: number;
  papiZ: number;
}

/**
 * Four-unit PAPI. Units sit in a row across the runway axis; each unit is
 * white above its own angle and red below it, which yields the classic
 * 2-white/2-red on a 3° glide path, 4-red below and 4-white above.
 */
function createPapiGroup(x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const spacing = 2.4;
  const unitAngles = [2.5, 2.83, 3.17, 3.5];

  // Dark housing so the lamps read as a single installation.
  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(spacing * 4 + 1.2, 0.55, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x1b2127, roughness: 0.85, metalness: 0.3 })
  );
  housing.position.y = 0.28;
  group.add(housing);

  for (let i = 0; i < 4; i++) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 10, 8),
      lampMaterial(LIGHT_COLORS.papiWhite)
    );
    lamp.position.set((i - 1.5) * spacing, 0.72, 0);
    lamp.userData.isPapiLight = true;
    group.add(lamp);
  }

  const data: PapiUserData = {
    isPapi: true,
    unitAngles,
    papiX: x,
    papiZ: z
  };
  group.userData = { ...group.userData, ...data };
  return group;
}

export interface RunwayLightOptions {
  /** World Z of the south (far) threshold. */
  thresholdZ?: number;
  /** Runway length in metres. */
  length?: number;
  /** Runway half-width used to place edge lights. */
  halfWidth?: number;
}

export interface RunwayLights {
  group: THREE.Group;
  papi: THREE.Group;
}

/**
 * Runway edge, threshold and PAPI lights.
 * Threshold lights are green at the landing threshold (+Z) and red at the far
 * end, and the PAPI sits 300 m past the landing threshold on the left side.
 */
export function createRunwayLights(options: RunwayLightOptions = {}): RunwayLights {
  const thresholdZ = options.thresholdZ ?? -1150;
  const length = options.length ?? 2300;
  const halfWidth = options.halfWidth ?? 25;

  const group = new THREE.Group();
  group.name = 'runwayLights';

  const southZ = thresholdZ;
  const northZ = thresholdZ + length;

  // ---- Edge lights (both sides, instanced) --------------------------------
  const edgePositions: THREE.Vector3[] = [];
  const steps = Math.floor(length / EDGE_SPACING);
  for (let i = 0; i <= steps; i++) {
    const z = southZ + i * EDGE_SPACING;
    edgePositions.push(new THREE.Vector3(-halfWidth, 0.65, z));
    edgePositions.push(new THREE.Vector3(halfWidth, 0.65, z));
  }
  group.add(buildLampRow(edgePositions, LIGHT_COLORS.edge, 0.5));

  // ---- Threshold bars (instanced): green at +Z, red at -Z ---------------
  const thresholdPositions: THREE.Vector3[] = [];
  for (let i = 0; i < 9; i++) {
    const x = -halfWidth + 1 + i * ((halfWidth * 2 - 2) / 8);
    thresholdPositions.push(new THREE.Vector3(x, 0.8, northZ));
  }
  group.add(buildLampRow(thresholdPositions, LIGHT_COLORS.thresholdGreen, 0.75));

  const farThresholdPositions = thresholdPositions.map(
    (p) => new THREE.Vector3(p.x, p.y, southZ)
  );
  group.add(buildLampRow(farThresholdPositions, LIGHT_COLORS.thresholdRed, 0.75));

  // ---- PAPI ---------------------------------------------------------------
  // 300 m beyond the landing threshold, on the left side of the approach.
  const papiZ = northZ - 300;
  const papiX = -(halfWidth + 9);
  const papi = createPapiGroup(papiX, papiZ);
  group.add(papi);

  return { group, papi };
}

/** Taxiway centrelines + holding-position crosses. */
export function createTaxiwayLights(startGateZ: number[], laneWidth = 20): THREE.Group {
  const group = new THREE.Group();
  group.name = 'taxiwayLights';

  // Blue centreline dashes along Alpha (x = 45), from the south exit to the
  // north holding point.
  const dashPositions: THREE.Vector3[] = [];
  for (let z = -600; z <= 1100; z += 8) {
    dashPositions.push(new THREE.Vector3(45, 0.07, z));
  }
  const dashGeometry = new THREE.BoxGeometry(0.28, 0.08, 4.2);
  const dashMaterial = lampMaterial(LIGHT_COLORS.taxiwayBlue);
  const dashes = new THREE.InstancedMesh(dashGeometry, dashMaterial, dashPositions.length);
  const dummy = new THREE.Object3D();
  dashPositions.forEach((p, i) => {
    dummy.position.copy(p);
    dummy.updateMatrix();
    dashes.setMatrixAt(i, dummy.matrix);
  });
  dashes.instanceMatrix.needsUpdate = true;
  dashes.frustumCulled = false;
  group.add(dashes);

  // Blue edge lights around each stand lead-in.
  const standPositions: THREE.Vector3[] = [];
  for (const gz of startGateZ) {
    for (let dx = -laneWidth / 2 + 3; dx < laneWidth / 2 - 3; dx += 6) {
      standPositions.push(new THREE.Vector3(95 + dx, 0.08, gz));
    }
  }
  group.add(buildLampRow(standPositions, LIGHT_COLORS.taxiwayEdge, 0.28));

  return group;
}

/** Warm LED rings painted on the apron at each stand. */
export function createJetwayLights(gateZ: number[] = [-180, -100, -20, 60]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'jetwayLights';

  const positions: THREE.Vector3[] = gateZ.map((z) => new THREE.Vector3(126, 0.06, z));
  const geometry = new THREE.RingGeometry(0.55, 0.75, 20);
  const material = lampMaterial(LIGHT_COLORS.jetway);
  const rings = new THREE.InstancedMesh(geometry, material, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach((p, i) => {
    dummy.position.copy(p);
    dummy.rotation.x = -Math.PI / 2;
    dummy.updateMatrix();
    rings.setMatrixAt(i, dummy.matrix);
  });
  rings.instanceMatrix.needsUpdate = true;
  rings.frustumCulled = false;
  group.add(rings);

  return group;
}

export default { createRunwayLights, createTaxiwayLights, createJetwayLights };
