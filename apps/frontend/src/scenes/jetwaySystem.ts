import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeJetwayTunnelCanvas } from './airportTextures';

/**
 * Detailed passenger boarding bridges (jetways).
 *
 * The old scenery used one long box per gate that crossed the fuselage. This
 * system builds a proper articulated bridge:
 *
 *   terminal rotunda -> three telescoping tunnel sections -> drive bogie
 *   -> flexible bellows -> cab that presses against the aircraft door.
 *
 * Every bridge is a small hierarchy (8 draw calls) anchored on the terminal
 * facade, so a whole row of gates costs ~64 draw calls instead of a few
 * hundred loose meshes. The tunnel swings and telescopes from the rotunda, so
 * it can be stowed against the terminal or docked to any aircraft parked on
 * the stand — the player or the AI traffic.
 */

/** Height of the simulated L1 door above the aircraft origin (ground). */
export const JETWAY_DOOR_HEIGHT = 4.8;

/**
 * Door anchor in the aircraft local frame: 12 m forward, 3.6 m to the left.
 * None of the GLB airframes ship door nodes, so every aircraft uses the same
 * simulated door position.
 */
const DOOR_LOCAL = new THREE.Vector3(3.6, JETWAY_DOOR_HEIGHT, 12);

/** Height of the tunnel centreline above the ground. */
const TUNNEL_Y = 5.6;
/** Height of the cab centre above the ground. */
const CAB_Y = 5.05;
const CAB_DEPTH = 4.8;
const STOWED_REACH = 13;
const MAX_REACH = 44;
/** Seconds the bridge needs to swing fully in or out (~2.5 s). */
const DOCK_SECONDS = 2.5;

export interface JetwayAircraftTarget {
  position: THREE.Vector3;
  yaw: number;
}

export interface JetwayStatus {
  gateId: number;
  docked: boolean;
  /** 0 = fully stowed, 1 = pressed against the door. */
  extension: number;
}

interface Jetway {
  gateId: number;
  anchor: THREE.Vector3;
  root: THREE.Group;
  segments: THREE.Mesh[];
  cab: THREE.Group;
  tip: THREE.Vector3;
  stowed: THREE.Vector3;
  desired: THREE.Vector3;
  docked: boolean;
  extension: number;
}

/** Box geometry translated so it spans x 0..length (local +X is the tunnel). */
function tunnelGeometry(length: number, height: number, width: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.BoxGeometry(length, height, width);
  body.translate(length / 2, 0, 0);
  parts.push(body);

  // Roof spine and drip rail.
  const spine = new THREE.BoxGeometry(length, 0.16, 0.6);
  spine.translate(length / 2, height / 2 + 0.08, 0);
  parts.push(spine);
  const rail = new THREE.BoxGeometry(length, 0.12, width + 0.5);
  rail.translate(length / 2, height / 2 + 0.02, 0);
  parts.push(rail);

  // Kick plates along both sides.
  const kick = new THREE.BoxGeometry(length, 0.45, 0.12);
  for (const side of [-1, 1]) {
    const plate = kick.clone();
    plate.translate(length / 2, -height / 2 + 0.2, (side * width) / 2 + 0.06);
    parts.push(plate);
  }
  kick.dispose();

  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error('jetwaySystem: could not merge tunnel geometry');
  return merged;
}

function cabShellGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const shell = new THREE.BoxGeometry(CAB_DEPTH, 3.4, 4.5);
  parts.push(shell);

  const roof = new THREE.BoxGeometry(CAB_DEPTH + 0.5, 0.24, 4.8);
  roof.translate(0, 1.82, 0);
  parts.push(roof);

  // Slanted front lip that carries the bellows.
  const lip = new THREE.BoxGeometry(0.5, 3.5, 4.7);
  lip.translate(CAB_DEPTH / 2 - 0.1, 0.05, 0);
  parts.push(lip);

  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error('jetwaySystem: could not merge cab geometry');
  return merged;
}

function bellowsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.BoxGeometry(0.16, 3.15, 4.2 - i * 0.08);
    ring.translate(CAB_DEPTH / 2 + 0.15 + i * 0.16, 0, 0);
    parts.push(ring);
  }
  // Rubber bumper that touches the fuselage.
  const bumper = new THREE.BoxGeometry(0.18, 2.9, 3.8);
  bumper.translate(CAB_DEPTH / 2 + 0.62, -0.05, 0);
  parts.push(bumper);

  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error('jetwaySystem: could not merge bellows geometry');
  return merged;
}

/** Drive bogie: four wheels on two axles plus the lifting legs. */
function bogieGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const wheel = new THREE.CylinderGeometry(0.52, 0.52, 0.36, 12);
  wheel.rotateX(Math.PI / 2);
  for (const x of [-1.55, 1.35]) {
    for (const z of [-1.35, 1.35]) {
      const w = wheel.clone();
      w.translate(x, CAB_Y - 4.55, z);
      parts.push(w);
    }
  }
  wheel.dispose();

  for (const x of [-1.55, 1.35]) {
    const axle = new THREE.BoxGeometry(0.26, 0.26, 2.9);
    axle.translate(x, CAB_Y - 4.55, 0);
    parts.push(axle);
    for (const z of [-1.35, 1.35]) {
      const leg = new THREE.BoxGeometry(0.24, 3.4, 0.24);
      leg.translate(x, CAB_Y - 2.9, z);
      parts.push(leg);
    }
  }

  // Cross beam under the cab.
  const beam = new THREE.BoxGeometry(3.6, 0.26, 2.9);
  beam.translate(0, CAB_Y - 1.25, 0);
  parts.push(beam);

  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error('jetwaySystem: could not merge bogie geometry');
  return merged;
}

function beaconGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, z] of [
    [1.4, -1.9],
    [1.4, 1.9]
  ]) {
    const lamp = new THREE.BoxGeometry(0.38, 0.22, 0.3);
    lamp.translate(x, 2.0, z);
    parts.push(lamp);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error('jetwaySystem: could not merge beacon geometry');
  return merged;
}

function baseAssemblyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const pad = new THREE.CylinderGeometry(3.1, 3.3, 0.3, 20);
  pad.translate(0, 0.15, 0);
  parts.push(pad);

  const column = new THREE.CylinderGeometry(0.72, 0.95, 4.6, 12);
  column.translate(0, 2.6, 0);
  parts.push(column);

  const rotunda = new THREE.CylinderGeometry(2.5, 2.5, 3.6, 20);
  rotunda.translate(0, TUNNEL_Y, 0);
  parts.push(rotunda);

  const collar = new THREE.CylinderGeometry(2.75, 2.75, 0.35, 20);
  collar.translate(0, TUNNEL_Y - 1.85, 0);
  parts.push(collar);

  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error('jetwaySystem: could not merge base geometry');
  return merged;
}

export class JetwaySystem {
  private jetways: Jetway[] = [];
  private group = new THREE.Group();
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private beaconMaterial: THREE.MeshStandardMaterial;
  private gateZ: number[];
  private elapsed = 0;

  constructor(scene: THREE.Scene, gateZ: number[]) {
    this.group.name = 'jetways';
    scene.add(this.group);
    this.gateZ = [...gateZ];

    const canvas = makeJetwayTunnelCanvas(512);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 1);
    texture.anisotropy = 4;

    const shellMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      color: 0xdde4eb,
      roughness: 0.55,
      metalness: 0.35
    });
    const cabMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      color: 0xc8d1db,
      roughness: 0.5,
      metalness: 0.4
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f3842,
      roughness: 0.65,
      metalness: 0.5
    });
    this.beaconMaterial = new THREE.MeshStandardMaterial({
      color: 0x39280f,
      emissive: 0xffa62b,
      emissiveIntensity: 1.6,
      roughness: 0.4
    });
    this.materials.push(shellMaterial, cabMaterial, darkMaterial, this.beaconMaterial);

    const sectionGeometries = [
      tunnelGeometry(1, 3.2, 3.6),
      tunnelGeometry(1, 3.0, 3.3),
      tunnelGeometry(1, 2.8, 3.0)
    ];
    const shellGeometry = cabShellGeometry();
    const bellows = bellowsGeometry();
    const bogie = bogieGeometry();
    const beacons = beaconGeometry();
    const base = baseAssemblyGeometry();
    this.geometries.push(...sectionGeometries, shellGeometry, bellows, bogie, beacons, base);

    gateZ.forEach((z, index) => {
      const gateId = index + 1;
      const anchor = new THREE.Vector3(176.5, 0, z);
      const root = new THREE.Group();
      root.position.copy(anchor);
      root.name = `jetway-${gateId}`;

      const baseMesh = new THREE.Mesh(base, darkMaterial);
      baseMesh.castShadow = true;
      baseMesh.receiveShadow = true;
      root.add(baseMesh);

      const segments = sectionGeometries.map((geometry) => {
        const mesh = new THREE.Mesh(geometry, shellMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.y = TUNNEL_Y;
        root.add(mesh);
        return mesh;
      });

      const cab = new THREE.Group();
      cab.position.y = CAB_Y;

      const shell = new THREE.Mesh(shellGeometry, cabMaterial);
      shell.castShadow = true;
      shell.receiveShadow = true;
      cab.add(shell);

      const seal = new THREE.Mesh(bellows, darkMaterial);
      seal.castShadow = true;
      cab.add(seal);

      const wheels = new THREE.Mesh(bogie, darkMaterial);
      wheels.castShadow = true;
      cab.add(wheels);

      const lamps = new THREE.Mesh(beacons, this.beaconMaterial);
      cab.add(lamps);

      root.add(cab);
      this.group.add(root);

      const stowed = anchor.clone().add(new THREE.Vector3(-STOWED_REACH, 0, 0));
      this.jetways.push({
        gateId,
        anchor,
        root,
        segments,
        cab,
        tip: stowed.clone(),
        stowed,
        desired: stowed.clone(),
        docked: false,
        extension: 0
      });
    });
  }

  /** World-space door point of an aircraft, following its heading. */
  static doorPosition(position: THREE.Vector3, yaw: number, out = new THREE.Vector3()): THREE.Vector3 {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    out.set(
      position.x + DOOR_LOCAL.x * cos + DOOR_LOCAL.z * sin,
      position.y + DOOR_LOCAL.y,
      position.z - DOOR_LOCAL.x * sin + DOOR_LOCAL.z * cos
    );
    return out;
  }

  /**
   * Picks the passenger gate (1..8) a player aircraft is parked on: within
   * 26 m of the stand centre and roughly aligned with the stand heading.
   */
  static playerGate(position: THREE.Vector3, yaw: number, gateZ: number[]): number | null {
    let bestGate: number | null = null;
    let bestDistance = 26;
    for (let i = 0; i < gateZ.length; i++) {
      const distance = Math.hypot(position.x - 130, position.z - gateZ[i]);
      if (distance > bestDistance) continue;
      // Stands point the nose towards the terminal (+X), yaw = +PI/2.
      const alignment = Math.abs(Math.sin(yaw) - 1);
      if (alignment > 0.45) continue;
      bestDistance = distance;
      bestGate = i + 1;
    }
    return bestGate;
  }

  /**
   * Docks the bridges to the aircraft currently parked or boarding at a
   * passenger stand, and stows the rest.
   *
   * @param aiAircraft aircraft reported by the traffic manager
   * @param player     the aircraft flown by the user, if any
   */
  update(dt: number, aiAircraft: JetwayAircraftTarget[], player: JetwayAircraftTarget | null): void {
    this.elapsed += dt;

    const targets = new Map<number, THREE.Vector3>();
    for (const aircraft of aiAircraft) {
      const gate = JetwaySystem.playerGate(aircraft.position, aircraft.yaw, this.gateZ);
      if (gate === null) continue;
      targets.set(gate, JetwaySystem.doorPosition(aircraft.position, aircraft.yaw));
    }
    if (player) {
      const gate = JetwaySystem.playerGate(player.position, player.yaw, this.gateZ);
      if (gate !== null && !targets.has(gate)) {
        targets.set(gate, JetwaySystem.doorPosition(player.position, player.yaw));
      }
    }

    const smoothing = 1 - Math.exp(-4.5 * dt);
    for (const jetway of this.jetways) {
      const door = targets.get(jetway.gateId);
      const desired = door ?? jetway.stowed;
      jetway.desired.set(desired.x, 0, desired.z);

      // Only the horizontal tip matters: the cab keeps a constant sill
      // height, so the bogie never floats above the concrete.
      jetway.tip.lerp(jetway.desired, smoothing);
      jetway.tip.y = 0;

      const dx = jetway.tip.x - jetway.anchor.x;
      const dz = jetway.tip.z - jetway.anchor.z;
      const distance = THREE.MathUtils.clamp(Math.hypot(dx, dz), 6, MAX_REACH);
      const yaw = Math.atan2(-dz, dx);
      jetway.root.rotation.y = yaw;

      const cabCenter = Math.max(6.4, distance - CAB_DEPTH / 2 + 0.9);
      const tunnelEnd = Math.max(4.6, cabCenter - CAB_DEPTH / 2 + 1.7);

      const spans: Array<[number, number]> = [
        [0.02, 0.5],
        [0.28, 0.8],
        [0.58, 1]
      ];
      jetway.segments.forEach((segment, index) => {
        const [start, end] = spans[index];
        const from = tunnelEnd * start;
        const length = Math.max(0.6, tunnelEnd * (end - start));
        segment.position.x = from;
        segment.scale.x = length;
      });

      jetway.cab.position.x = cabCenter;

      jetway.extension = THREE.MathUtils.clamp(
        (distance - STOWED_REACH) / (34 - STOWED_REACH),
        0,
        1
      );
      jetway.docked = door !== undefined && jetway.tip.distanceTo(jetway.desired) < 0.4;
    }

    const pulse = 0.65 + Math.max(0, Math.sin(this.elapsed * 3.4)) * 1.9;
    this.beaconMaterial.emissiveIntensity = pulse;
  }

  /** Z centres of the passenger stands, in gate-id order. */
  getStatuses(): JetwayStatus[] {
    return this.jetways.map((jetway) => ({
      gateId: jetway.gateId,
      docked: jetway.docked,
      extension: Math.round(jetway.extension * 100) / 100
    }));
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.jetways = [];
  }
}
