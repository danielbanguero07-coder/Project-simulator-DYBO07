import * as THREE from 'three';

/**
 * Fleet catalogue.
 *
 * Every aircraft type used by the AI traffic is described here. The renderer
 * uses a real GLB when one is available and falls back to a category-accurate
 * procedural airframe otherwise, so the traffic never stops working while new
 * models are being added to `public/models`.
 */

export type AircraftCategory = 'narrow' | 'wide' | 'cargo' | 'regional';

export interface FleetSpec {
  type: string;
  label: string;
  category: AircraftCategory;
  /** Path to a GLB in `public/`. Optional: procedural fallback if missing. */
  modelPath?: string;
  /** Uniform scale applied to the shared GLB when it is reused. */
  glbScale: number;
  /** Metres. Used by the procedural fallback and for bay sizing. */
  length: number;
  wingspan: number;
  height: number;
  engines: 2 | 3 | 4;
  propellers: boolean;
  /** Airline-style liveries (fuselage colours). */
  liveries: number[];
  cargo?: boolean;
}

export const FLEET: Record<string, FleetSpec> = {
  A320: {
    type: 'A320',
    label: 'Airbus A320',
    category: 'narrow',
    modelPath: '/models/A320_nologo.glb',
    glbScale: 1,
    length: 37.6,
    wingspan: 35.8,
    height: 11.8,
    engines: 2,
    propellers: false,
    liveries: [0x1f5fa8, 0xe9edf2, 0xb01e2e, 0x1d7a4a]
  },
  A321: {
    type: 'A321',
    label: 'Airbus A321',
    category: 'narrow',
    modelPath: '/models/B737_nologo.glb',
    glbScale: 1.05,
    length: 44.5,
    wingspan: 35.8,
    height: 11.8,
    engines: 2,
    propellers: false,
    liveries: [0xe9edf2, 0x1f5fa8, 0xd8a01f]
  },
  B737: {
    type: 'B737',
    label: 'Boeing 737-800',
    category: 'narrow',
    modelPath: '/models/B737_nologo.glb',
    glbScale: 1,
    length: 39.5,
    wingspan: 35.8,
    height: 12.5,
    engines: 2,
    propellers: false,
    liveries: [0xe9edf2, 0x235f9e, 0x0b6b3a, 0xa61b2a]
  },
  A350: {
    type: 'A350',
    label: 'Airbus A350-900',
    category: 'wide',
    modelPath: '/models/A350_nologo.glb',
    glbScale: 1,
    length: 66.8,
    wingspan: 64.75,
    height: 17.1,
    engines: 2,
    propellers: false,
    liveries: [0xe9edf2, 0x1f3f6e, 0x8c1c2b, 0x1d6b5a]
  },
  A380: {
    type: 'A380',
    label: 'Airbus A380-800',
    category: 'wide',
    modelPath: '/models/A380_nologo.glb',
    glbScale: 0.413,
    length: 72.7,
    wingspan: 79.75,
    height: 24.1,
    engines: 4,
    propellers: false,
    liveries: [0xe9edf2, 0x1f3f6e, 0x8c1c2b, 0x2f6f3e]
  },
  B787: {
    type: 'B787',
    label: 'Boeing 787-9',
    category: 'wide',
    modelPath: '/models/B787_nologo.glb',
    glbScale: 1,
    length: 62.8,
    wingspan: 60.1,
    height: 17,
    engines: 2,
    propellers: false,
    liveries: [0xe9edf2, 0x1f5fa8, 0xb01e2e, 0x2b2f36]
  },
  B777: {
    type: 'B777',
    label: 'Boeing 777-300ER',
    category: 'wide',
    modelPath: '/models/B787_nologo.glb',
    glbScale: 1.1,
    length: 73.9,
    wingspan: 64.8,
    height: 18.5,
    engines: 2,
    propellers: false,
    liveries: [0xe9edf2, 0x234f8c, 0x9c1f2e, 0x2b2f36]
  },
  B747: {
    type: 'B747',
    label: 'Boeing 747-8F',
    category: 'cargo',
    modelPath: '/models/A380_nologo.glb',
    glbScale: 0.4,
    length: 76.3,
    wingspan: 68.4,
    height: 19.4,
    engines: 4,
    propellers: false,
    cargo: true,
    liveries: [0xe9edf2, 0xd8a01f, 0x8a1c2b]
  },
  MD11: {
    type: 'MD11',
    label: 'McDonnell Douglas MD-11F',
    category: 'cargo',
    modelPath: '/models/A350_nologo.glb',
    glbScale: 0.85,
    length: 61.6,
    wingspan: 51.7,
    height: 17.7,
    engines: 3,
    propellers: false,
    cargo: true,
    liveries: [0xe9edf2, 0xd8a01f, 0x3c4a5a]
  },
  ATR72: {
    type: 'ATR72',
    label: 'ATR 72-600',
    category: 'regional',
    glbScale: 1,
    length: 27.2,
    wingspan: 27.05,
    height: 7.65,
    engines: 2,
    propellers: true,
    liveries: [0xe9edf2, 0x2f6fb0, 0xb01e2e, 0x2b7a4b]
  }
};

const FLEET_KEYS = Object.keys(FLEET);

export function getFleetSpec(type?: string): FleetSpec {
  if (type && FLEET[type]) return FLEET[type];
  return FLEET.A320;
}

export function pickFleetType(category?: AircraftCategory): string {
  const keys = category
    ? FLEET_KEYS.filter((k) => FLEET[k].category === category)
    : FLEET_KEYS;
  return keys[Math.floor(Math.random() * keys.length)];
}

export function pickLivery(spec: FleetSpec): number {
  // Never pick the near-white livery (0xe9edf2) for AI traffic: the GLB
  // textures are already light grey/white, so a white livery + a weak
  // tint made the whole fleet look like blank white planes, especially
  // at night. Coloured liveries (blue / red / green / yellow) stay
  // readable from the apron and in the air.
  const coloured = spec.liveries.filter((c) => c !== 0xe9edf2);
  const pool = coloured.length > 0 ? coloured : spec.liveries;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Procedural airframe used when no GLB is available. Shapes follow the real
 * proportions of each category (regional high-wing turboprop, wide-body,
 * four-engine freighter...), so the traffic is still readable on screen.
 */
export function createProceduralAircraft(spec: FleetSpec, livery: number): THREE.Group {
  const group = new THREE.Group();
  // A weak self-lit component keeps the procedural fallback readable at
  // night, matching the GLB treatment (textures/liveries stay visible).
  const bodyMat = new THREE.MeshStandardMaterial({
    color: livery,
    roughness: 0.38,
    metalness: 0.22,
    emissive: livery,
    emissiveIntensity: 0.16
  });
  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xe6ebf0,
    roughness: 0.5,
    metalness: 0.1,
    emissive: 0xffffff,
    emissiveIntensity: 0.09
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x24282d,
    roughness: 0.65,
    emissive: 0x3a4048,
    emissiveIntensity: 0.18
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x16232e,
    roughness: 0.15,
    metalness: 0.45,
    emissive: 0x1b2c3a,
    emissiveIntensity: 0.4
  });

  const radius = spec.category === 'wide' ? 3.1 : spec.category === 'cargo' ? 3.3 : spec.category === 'regional' ? 1.5 : 2.1;
  const length = spec.length;
  const tube = length * 0.7;
  const groundY = radius + 1.5;

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, tube, 20), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.y = groundY;
  group.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(radius, length * 0.17, 20), bodyMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, groundY, tube / 2 + length * 0.085);
  group.add(nose);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(radius, length * 0.15, 20), bodyMat);
  tail.rotation.x = -Math.PI / 2;
  tail.position.set(0, groundY, -tube / 2 - length * 0.075);
  group.add(tail);

  // Cockpit glazing
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.55, 12, 8), glassMat);
  cockpit.scale.set(1, 0.7, 1.3);
  cockpit.position.set(0, groundY + radius * 0.35, length * 0.32);
  group.add(cockpit);

  // Cabin windows (two dark strips)
  if (!spec.cargo) {
    for (const x of [-radius * 0.98, radius * 0.98]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, tube * 0.78), darkMat);
      strip.position.set(x, groundY + radius * 0.28, 0);
      group.add(strip);
    }
  }

  // Wings
  const wingChord = spec.wingspan * 0.16;
  const wingY = spec.category === 'regional' ? groundY + radius * 0.85 : groundY - radius * 0.45;
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(spec.wingspan / 2, 0.55, wingChord), whiteMat);
    wing.position.set(side * spec.wingspan / 4, wingY, -length * 0.02);
    wing.rotation.z = side * -0.04;
    wing.castShadow = true;
    group.add(wing);

    const winglet = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 1.6), bodyMat);
    winglet.position.set(side * (spec.wingspan / 2 - 0.15), wingY + 1.0, -length * 0.02);
    winglet.rotation.z = side * -0.15;
    group.add(winglet);
  }

  // Horizontal stabiliser + fin
  const hStab = new THREE.Mesh(new THREE.BoxGeometry(spec.wingspan * 0.36, 0.45, 3.4), whiteMat);
  hStab.position.set(0, groundY + 0.3, -tube / 2 - length * 0.02);
  group.add(hStab);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.55, radius * 3.4, length * 0.16), bodyMat);
  fin.position.set(0, groundY + radius * 1.9, -tube / 2 - length * 0.05);
  fin.rotation.x = -0.16;
  group.add(fin);

  // Engines (2 or 4). Regional aircraft get propellers.
  const enginePositions: Array<[number, number]> = [];
  if (spec.engines === 4) {
    for (const side of [-1, 1]) {
      enginePositions.push([side * spec.wingspan * 0.18, 0.35]);
      enginePositions.push([side * spec.wingspan * 0.36, 0.32]);
    }
  } else if (spec.engines === 3) {
    enginePositions.push([0, 0.0]);
    enginePositions.push([-spec.wingspan * 0.28, 0.32]);
    enginePositions.push([spec.wingspan * 0.28, 0.32]);
  } else {
    enginePositions.push([-spec.wingspan * 0.28, 0.32]);
    enginePositions.push([spec.wingspan * 0.28, 0.32]);
  }

  const propellers: THREE.Object3D[] = [];
  for (const [x, zFactor] of enginePositions) {
    const engine = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.55, radius * 0.5, length * 0.11, 12),
      spec.propellers ? bodyMat : darkMat
    );
    engine.rotation.x = Math.PI / 2;
    engine.position.set(x, wingY - 0.55, -length * zFactor);
    group.add(engine);

    if (spec.propellers) {
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.4, 8), darkMat);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(x, wingY - 0.55, -length * zFactor + length * 0.06);
      group.add(hub);
      for (let b = 0; b < 3; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.1, 0.06), darkMat);
        blade.position.set(x, wingY - 0.55, -length * zFactor + length * 0.06);
        blade.rotation.z = (b / 3) * Math.PI * 2;
        group.add(blade);
        propellers.push(blade);
      }
    }
  }

  // Landing gear
  const legGeo = new THREE.CylinderGeometry(0.14, 0.14, groundY - 0.6, 6);
  const legPositions: Array<[number, number]> = [
    [0, length * 0.34],
    [-spec.wingspan * 0.12, -length * 0.06],
    [spec.wingspan * 0.12, -length * 0.06]
  ];
  for (const [x, z] of legPositions) {
    const leg = new THREE.Mesh(legGeo, darkMat);
    leg.position.set(x, (groundY - 0.6) / 2, z);
    group.add(leg);
  }

  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  group.userData.propellers = propellers;
  return group;
}

/** Rotates turboprop blades; call once per frame with the aircraft group. */
export function animatePropellers(object: THREE.Object3D, dt: number) {
  const propellers = object.userData.propellers as THREE.Object3D[] | undefined;
  if (!propellers || propellers.length === 0) return;
  for (const blade of propellers) blade.rotation.z += dt * 30;
}
