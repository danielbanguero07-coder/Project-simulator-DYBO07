import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { StandOccupancy } from './trafficManager';

/**
 * Passenger boarding activity at the eight terminal stands.
 *
 * The traffic manager only models the aircraft: the doors open, a timer runs
 * and the aircraft leaves. This system puts people on the apron — a single
 * InstancedMesh of walking silhouettes plus a single InstancedMesh of baggage
 * carts, so a whole row of gates boarding at once still costs two draw calls
 * and no lights at all.
 *
 * Silhouettes walk from the terminal facade to the jetway rotunda; carts
 * shuttle between the service lane and the aircraft. Both only appear while
 * the aircraft at that gate is in the `boarding` state, and their motion is
 * driven by the same 0..1 progress the HUD counter shows.
 */

export interface BoardingStatus {
  gateId: number;
  flightNumber: string;
  passengers: number;
  boarded: number;
  /** 0 at the first passenger, 1 at the last. */
  progress: number;
  /** True while passengers are actually walking to the aircraft. */
  active: boolean;
}

const PASSENGERS_PER_GATE = 8;
/** How many times a single silhouette walks the walkway while boarding. */
const WALK_CYCLES = 3;
/** Metres the walkway covers along the terminal facade. */
const WALK_LENGTH = 12.5;

interface Walker {
  gateId: number;
  /** 0..1 offset inside the walk cycle. */
  offset: number;
  /** Sideways offset so the queue is a crowd, not a single-file line. */
  side: number;
  /** Height variation, so the crowd does not look cloned. */
  scale: number;
}

const CLOTHING = [0x2b3a4d, 0x59403c, 0x3f4b3a, 0x2f2f38, 0x6b5a45, 0x414a5c];

interface Cart {
  gateId: number;
}

/** Small standing figure: torso + head, ~1.35 m tall. */
function passengerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.CylinderGeometry(0.17, 0.24, 0.95, 6);
  body.translate(0, 0.85, 0);
  parts.push(body);

  const head = new THREE.SphereGeometry(0.15, 6, 5);
  head.translate(0, 1.45, 0);
  parts.push(head);

  // Shoulders so the silhouette reads as a person from a distance.
  const shoulders = new THREE.BoxGeometry(0.42, 0.16, 0.24);
  shoulders.translate(0, 1.26, 0);
  parts.push(shoulders);

  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error('boardingSystem: could not merge passenger geometry');
  return merged;
}

/** Baggage cart: open tray, four wheels and a tow bar. */
function cartGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tray = new THREE.BoxGeometry(1.9, 0.55, 1.05);
  tray.translate(0, 0.62, 0);
  parts.push(tray);

  const floor = new THREE.BoxGeometry(2.0, 0.12, 1.15);
  floor.translate(0, 0.3, 0);
  parts.push(floor);

  const wheel = new THREE.CylinderGeometry(0.22, 0.22, 0.14, 10);
  wheel.rotateX(Math.PI / 2);
  for (const x of [-0.65, 0.65]) {
    for (const z of [-0.52, 0.52]) {
      const w = wheel.clone();
      w.translate(x, 0.24, z);
      parts.push(w);
    }
  }
  wheel.dispose();

  const bar = new THREE.BoxGeometry(1.1, 0.1, 0.1);
  bar.translate(-1.5, 0.62, 0);
  parts.push(bar);

  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error('boardingSystem: could not merge cart geometry');
  return merged;
}

export class BoardingSystem {
  private readonly walkers: Walker[] = [];
  private readonly carts: Cart[] = [];
  private readonly passengerMesh: THREE.InstancedMesh;
  private readonly cartMesh: THREE.InstancedMesh;
  private readonly group = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly gateZ: number[];
  private readonly dummy = new THREE.Object3D();
  private elapsed = 0;
  private statuses: BoardingStatus[] = [];

  constructor(scene: THREE.Scene, gateZ: number[]) {
    this.gateZ = [...gateZ];
    this.group.name = 'boardingActivity';
    scene.add(this.group);

    const passengerGeo = passengerGeometry();
    const cartGeo = cartGeometry();
    this.geometries.push(passengerGeo, cartGeo);

    const passengerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.05,
      // A faint self-lit component keeps the silhouettes readable at night
      // without adding a single light to the scene.
      emissive: 0x18212b,
      emissiveIntensity: 0.55
    });
    const cartMat = new THREE.MeshStandardMaterial({
      color: 0xe4ebf1,
      roughness: 0.6,
      metalness: 0.2
    });
    this.materials.push(passengerMat, cartMat);

    gateZ.forEach((_, index) => {
      const gateId = index + 1;
      for (let i = 0; i < PASSENGERS_PER_GATE; i++) {
        this.walkers.push({
          gateId,
          offset: i / PASSENGERS_PER_GATE,
          side: ((i % 3) - 1) * 0.7,
          scale: 0.9 + ((i * 7 + index * 3) % 5) * 0.05
        });
      }
      this.carts.push({ gateId });
    });

    this.passengerMesh = new THREE.InstancedMesh(
      passengerGeo,
      passengerMat,
      this.walkers.length
    );
    this.passengerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const tint = new THREE.Color();
    this.walkers.forEach((walker, i) => {
      tint.setHex(CLOTHING[(i + walker.gateId) % CLOTHING.length]);
      this.passengerMesh.setColorAt(i, tint);
    });
    if (this.passengerMesh.instanceColor) {
      this.passengerMesh.instanceColor.needsUpdate = true;
    }
    this.passengerMesh.castShadow = true;
    this.passengerMesh.frustumCulled = false;
    this.passengerMesh.name = 'boardingPassengers';
    this.group.add(this.passengerMesh);

    this.cartMesh = new THREE.InstancedMesh(cartGeo, cartMat, this.carts.length);
    this.cartMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cartMesh.castShadow = true;
    this.cartMesh.frustumCulled = false;
    this.cartMesh.name = 'boardingCarts';
    this.group.add(this.cartMesh);
  }

  /**
   * Advances the passenger activity. `occupancies` is the traffic manager's
   * per-stand snapshot; only gates in `boarding` get walkers and carts.
   */
  update(dt: number, occupancies: StandOccupancy[]): void {
    this.elapsed += dt;
    const byGate = new Map<number, StandOccupancy>();
    for (const occupancy of occupancies) byGate.set(occupancy.gateId, occupancy);

    this.statuses = [];

    // --- passengers -----------------------------------------------------
    for (let i = 0; i < this.walkers.length; i++) {
      const walker = this.walkers[i];
      const occupancy = byGate.get(walker.gateId);
      const active = occupancy?.state === 'boarding';
      if (!active) {
        this.hide(this.passengerMesh, i);
        continue;
      }

      const progress = occupancy.boarded / Math.max(1, occupancy.passengers);
      // t runs 0..1 along the walkway; loop it while the queue is boarding.
      const raw = progress * WALK_CYCLES + walker.offset;
      const t = raw - Math.floor(raw);
      const gateIndex = walker.gateId - 1;
      const z0 = this.gateZ[gateIndex];
      // The walkway runs along the terminal facade from a door cluster to
      // the jetway rotunda (x ~ 177, z offset 16 m).
      const start = new THREE.Vector3(179.4, 0.2, z0 + 15.5 + walker.side);
      const end = new THREE.Vector3(177.2, 0.2, z0 + 3.6 + walker.side * 0.2);
      this.dummy.position.lerpVectors(start, end, t);
      this.dummy.position.y += Math.abs(Math.sin(this.elapsed * 4.2 + walker.offset * 6.28)) * 0.06;
      this.dummy.rotation.set(0, Math.atan2(end.x - start.x, end.z - start.z), 0);
      this.dummy.scale.setScalar(walker.scale);
      this.dummy.updateMatrix();
      this.passengerMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.passengerMesh.instanceMatrix.needsUpdate = true;

    // --- baggage carts ---------------------------------------------------
    for (let i = 0; i < this.carts.length; i++) {
      const cart = this.carts[i];
      const occupancy = byGate.get(cart.gateId);
      const active = occupancy?.state === 'boarding';
      if (!active) {
        this.hide(this.cartMesh, i);
        continue;
      }

      const progress = occupancy.boarded / Math.max(1, occupancy.passengers);
      const z0 = this.gateZ[cart.gateId - 1];
      // Shuttle between the service lane and the aircraft, ping-ponging so
      // the cart is always moving while the gate is loading.
      const phase = (progress * 2.4 + cart.gateId * 0.13) % 1;
      const t = phase < 0.5 ? phase * 2 : 1 - (phase - 0.5) * 2;
      const start = new THREE.Vector3(163, 0.1, z0 + 6.5);
      const end = new THREE.Vector3(147, 0.1, z0 + 6.5);
      this.dummy.position.lerpVectors(start, end, t);
      this.dummy.rotation.set(0, phase < 0.5 ? Math.PI / 2 : -Math.PI / 2, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.cartMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.cartMesh.instanceMatrix.needsUpdate = true;

    // --- HUD snapshot ----------------------------------------------------
    for (let gate = 1; gate <= this.gateZ.length; gate++) {
      const occupancy = byGate.get(gate);
      if (!occupancy) continue;
      const active = occupancy.state === 'boarding';
      this.statuses.push({
        gateId: gate,
        flightNumber: occupancy.flightNumber,
        passengers: occupancy.passengers,
        boarded: occupancy.boarded,
        progress: occupancy.boarded / Math.max(1, occupancy.passengers),
        active
      });
    }
  }

  /** Current per-gate boarding progress, for the HUD and the debug console. */
  getStatuses(): BoardingStatus[] {
    return this.statuses.map((status) => ({ ...status }));
  }

  private hide(mesh: THREE.InstancedMesh, index: number): void {
    this.dummy.position.set(0, -50, 0);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(0.0001);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
  }
}
