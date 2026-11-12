import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Flight, FlightStatus } from './flight';
import { HOME_AIRPORT } from './airports';
import type { SharedAirport } from './runwayControl';
import type { RunwayLock } from './runwaySequencer';
import {
  getFleetSpec,
  pickLivery,
  createProceduralAircraft,
  animatePropellers,
  type FleetSpec
} from './fleet';

/**
 * Ground traffic network.
 *
 * The airport is described as a directed graph. Every node declares which kind
 * of agent is allowed to use it (`aircraft` or `vehicle`) so the AI can never
 * route a fuel truck down a runway or an aircraft through a service road.
 * `TrafficManager` uses BFS over that graph to build routes, so the network is
 * validated just by existing: any disconnected node is simply unreachable.
 */

export type NodeType =
  | 'runway'
  | 'taxiway'
  | 'apron'
  | 'holding'
  | 'gate'
  | 'service'
  | 'depot';

export type AgentKind = 'aircraft' | 'vehicle';

export interface PathNode {
  position: THREE.Vector3;
  connections: number[];
  type?: NodeType;
  gateId?: number;
  allowed: AgentKind[];
  label?: string;
  /** Cruise speed limit on the segment that starts at this node (m/s). */
  maxSpeed?: number;
}

export interface FlightWithState extends Flight {
  currentStateDuration?: number;
}

export interface TrafficManagerStats {
  nodes: number;
  aircraft: number;
  vehicles: number;
  flights: number;
  gatesFree: number;
}

/** Passenger stands at MEX, including the two remote stands 12-13. */
const PASSENGER_GATE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 12, 13];
const CARGO_GATE_IDS = [9, 10, 11];
const WIDE_BODY_GATE_IDS = [1, 4];

function isPassengerGate(gateId: number): boolean {
  return PASSENGER_GATE_IDS.includes(gateId);
}

/* ------------------------------------------------------------------ */
/* Procedural ground / air models                                      */
/* ------------------------------------------------------------------ */

/**
 * Clones a loaded GLB, orients it nose-to-+Z, puts the wheels on Y=0 and
 * applies a livery tint. Each clone gets its own materials so liveries do not
 * bleed between aircraft.
 */
function prepareGlbAircraft(source: THREE.Object3D, spec: FleetSpec, livery: number): THREE.Group {
  const model = source.clone(true);
  const liveryColor = new THREE.Color(livery);

  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const cloned = materials.map((material) => {
      const m = material.clone() as THREE.MeshStandardMaterial;
      if (m.color) {
        // Strong blend towards the airline colour instead of replacing the
        // texture: the GLB textures are light grey/white, and a 0.35 blend
        // left the aircraft looking blank white.
        m.color.lerp(liveryColor, m.map ? 0.65 : 0.8);
        // Texture-aware night visibility: the albedo map also drives a weak
        // emissive, so liveries and windows do not disappear after sunset.
        if (m.map) {
          m.emissiveMap = m.map;
          if (m.emissive) m.emissive.copy(m.color).multiplyScalar(0.85);
          m.emissiveIntensity = 0.26;
          m.needsUpdate = true;
        } else if (m.emissive) {
          m.emissive.copy(m.color).multiplyScalar(0.3);
        }
      }
      m.envMapIntensity = 1.1;
      return m;
    });
    mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
  });

  // The GLB is authored nose-along-+X (the node's own rotation handles the
  // original export orientation). Rotate it so the nose points +Z, which is
  // the forward axis used by the yaw/route code.
  model.rotation.set(0, -Math.PI / 2, 0);
  model.scale.setScalar(spec.glbScale);
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  const wrapper = new THREE.Group();
  wrapper.userData.sharedGeometry = true;
  wrapper.add(model);
  return wrapper;
}

/* ------------------------------------------------------------------ */
/* Traffic manager                                                     */
/* ------------------------------------------------------------------ */

type VehicleKind = 'fuel' | 'baggage' | 'catering' | 'bus' | 'tug' | 'followme';

const VEHICLE_DARK = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.85, metalness: 0.1 });

function addWheel(
  group: THREE.Group,
  x: number,
  z: number,
  radius = 0.45,
  width = 0.36,
  material: THREE.Material = VEHICLE_DARK
) {
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 14), material);
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(x, radius, z);
  wheel.castShadow = true;
  group.add(wheel);
  return wheel;
}

function addAxle(group: THREE.Group, x: number, z: number, radius = 0.45, material: THREE.Material = VEHICLE_DARK) {
  addWheel(group, -x, z, radius, 0.36, material);
  addWheel(group, x, z, radius, 0.36, material);
}

/** Amber/red rotating beacon: emissive sphere that pulses in the update loop. */
function addBeacon(group: THREE.Group, x: number, y: number, z: number, color = 0xff8c1a) {
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.4,
    roughness: 0.35
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  const beacons = (group.userData.beacons as THREE.Mesh[] | undefined) ?? [];
  beacons.push(mesh);
  group.userData.beacons = beacons;
}

function addLamps(group: THREE.Group, width: number, frontZ: number, rearZ: number) {
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xfff0c0, emissiveIntensity: 1.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x8c1414, emissive: 0xd11a1a, emissiveIntensity: 1.1 });
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.1), headMat);
    head.position.set(side * width * 0.32, 1.15, frontZ);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.08), tailMat);
    tail.position.set(side * width * 0.34, 1.2, rearZ);
    group.add(tail);
  }
}

function addGlassBand(group: THREE.Group, width: number, height: number, length: number, y: number, z = 0) {
  const glass = new THREE.MeshStandardMaterial({ color: 0x14232f, roughness: 0.12, metalness: 0.6 });
  const band = new THREE.Mesh(new THREE.BoxGeometry(width + 0.03, height, length), glass);
  band.position.set(0, y, z);
  group.add(band);
}

/**
 * Detailed procedural service vehicles. Each one is built around the real
 * silhouette of its class (tanker barrel, scissor-lift catering body, ULD
 * trailers, pushback tug ballast, follow-me car) and carries a pulsing beacon.
 */
export function createServiceTruck(kind: VehicleKind): THREE.Group {
  const group = new THREE.Group();
  const bodyColor =
    kind === 'fuel' ? 0xf2b900 :
    kind === 'baggage' ? 0xd7dce2 :
    kind === 'catering' ? 0xe9edf2 :
    kind === 'bus' ? 0x1f6fb2 :
    kind === 'followme' ? 0xf2c400 : 0xf2b900;
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.5, metalness: 0.2 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xb8bfc6, roughness: 0.35, metalness: 0.7 });

  if (kind === 'baggage') {
    // Tug with a driver hoop and two container trailers.
    const tug = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.1, 3), bodyMat);
    tug.position.set(0, 1.05, 1.6);
    tug.castShadow = true;
    group.add(tug);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 6, 14, Math.PI), VEHICLE_DARK);
    hoop.rotation.y = Math.PI / 2;
    hoop.rotation.z = Math.PI / 2;
    hoop.position.set(0, 1.7, 0.6);
    group.add(hoop);
    addBeacon(group, 0, 2.5, 0.6);
    addAxle(group, 1.0, 0.8, 0.4);
    addAxle(group, 1.0, 2.4, 0.4);
    addLamps(group, 2.1, 3.1, 0.1);

    const containerMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.55, metalness: 0.45 });
    const ribMat = new THREE.MeshStandardMaterial({ color: 0x7c868f, roughness: 0.7, metalness: 0.3 });
    for (let t = 0; t < 2; t++) {
      const z = 4.9 + t * 3.6;
      const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.22, 3), VEHICLE_DARK);
      bed.position.set(0, 0.75, z);
      group.add(bed);
      const container = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.75, 2.85), containerMat);
      container.position.set(0, 1.7, z);
      container.castShadow = true;
      group.add(container);
      for (const rx of [-0.72, 0, 0.72]) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.05), ribMat);
        rib.position.set(rx, 1.7, z + 1.44);
        group.add(rib);
      }
      addAxle(group, 1.0, z - 0.95, 0.34);
      addAxle(group, 1.0, z + 0.95, 0.34);
    }
    return group;
  }

  if (kind === 'followme') {
    // Low chase car with a roof light bar.
    const length = 4.4;
    const width = 1.9;
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, 0.55, length), bodyMat);
    body.position.y = 0.85;
    body.castShadow = true;
    group.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, 0.62, length * 0.5), bodyMat);
    cabin.position.set(0, 1.35, -0.15);
    group.add(cabin);
    addGlassBand(group, width * 0.86, 0.42, length * 0.46, 1.38, -0.15);
    // Checkered rear panel.
    const checker = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.7 });
    for (let i = 0; i < 8; i++) {
      const tile = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.03), checker);
      tile.position.set(-0.84 + i * 0.24, 0.75, -length / 2 - 0.02);
      group.add(tile);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: 0xffb300, emissive: 0xff8c00, emissiveIntensity: 1.6 }));
    bar.position.set(0, 1.72, -0.1);
    group.add(bar);
    addBeacon(group, -0.4, 1.72, -0.1, 0xff3b1f);
    addBeacon(group, 0.4, 1.72, -0.1, 0xff8c1a);
    addAxle(group, 0.98, 1.35, 0.34);
    addAxle(group, 0.98, -1.35, 0.34);
    addLamps(group, width, length / 2, -length / 2);
    return group;
  }

  if (kind === 'tug') {
    // Pushback tug: wide, low and heavy.
    const length = 5;
    const width = 2.8;
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(width, 0.6, length), VEHICLE_DARK);
    chassis.position.y = 0.65;
    group.add(chassis);
    const ballast = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, 1.5, 1.8), bodyMat);
    ballast.position.set(0, 1.4, -1.1);
    ballast.castShadow = true;
    group.add(ballast);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(width * 0.66, 1.2, 1.6), bodyMat);
    cab.position.set(0, 1.6, 1.0);
    group.add(cab);
    addGlassBand(group, width * 0.6, 0.55, 1.55, 1.72, 1.0);
    addBeacon(group, 0, 2.35, 0.4);
    addAxle(group, 1.28, 1.4, 0.52);
    addAxle(group, 1.28, -1.3, 0.52);
    addLamps(group, width, length / 2, -length / 2);
    return group;
  }

  const length = kind === 'bus' ? 11 : kind === 'fuel' ? 9 : 7.6;
  const width = kind === 'bus' ? 2.7 : 2.5;

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(width, 0.55, length), VEHICLE_DARK);
  chassis.position.y = 0.7;
  group.add(chassis);
  addLamps(group, width, length / 2 + 0.01, -length / 2 - 0.01);

  if (kind === 'fuel') {
    // Day cab + barrel + hose reel + ladder.
    const cab = new THREE.Mesh(new THREE.BoxGeometry(width, 1.85, 2.1), bodyMat);
    cab.position.set(0, 1.95, length / 2 - 1.05);
    cab.castShadow = true;
    group.add(cab);
    addGlassBand(group, width * 0.86, 0.8, 0.06, 2.25, length / 2 + 0.005);
    addGlassBand(group, width * 0.9, 0.65, 1.6, 2.2, length / 2 - 1.05);

    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 5.2, 20),
      new THREE.MeshStandardMaterial({ color: 0xdfe3e7, roughness: 0.3, metalness: 0.65 })
    );
    tank.rotation.x = Math.PI / 2;
    tank.position.set(0, 2.15, -1);
    tank.castShadow = true;
    group.add(tank);
    for (const z of [-2.8, 0.8]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.17, 1.17, 0.14, 20), trimMat);
      band.rotation.x = Math.PI / 2;
      band.position.set(0, 2.15, z);
      group.add(band);
    }
    const hazard = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.04, 0.45, 2.6),
      new THREE.MeshStandardMaterial({ color: 0xd93025, roughness: 0.55 })
    );
    hazard.position.set(0, 2.15, -0.2);
    group.add(hazard);
    // Hose reel at the rear.
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.4, 14), trimMat);
    reel.rotation.z = Math.PI / 2;
    reel.position.set(0, 1.5, -length / 2 + 0.45);
    group.add(reel);
    // Ladder up the left side of the barrel.
    for (let i = 0; i < 4; i++) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), trimMat);
      rung.position.set(-width / 2 - 0.2, 1.5 + i * 0.32, -1);
      group.add(rung);
    }
    addBeacon(group, 0, 3.0, length / 2 - 1.05);
    addAxle(group, width / 2 - 0.2, length / 2 - 1.1, 0.52);
    addAxle(group, width / 2 - 0.2, -1.6, 0.52);
    addAxle(group, width / 2 - 0.2, -2.6, 0.52);
    return group;
  }

  if (kind === 'catering') {
    // Box body with a scissor lift platform at the rear.
    const cab = new THREE.Mesh(new THREE.BoxGeometry(width, 2.05, 2), bodyMat);
    cab.position.set(0, 2.05, length / 2 - 1);
    cab.castShadow = true;
    group.add(cab);
    addGlassBand(group, width * 0.86, 0.75, 0.06, 2.35, length / 2 + 0.005);
    addGlassBand(group, width * 0.9, 0.7, 1.5, 2.3, length / 2 - 1);
    const box = new THREE.Mesh(new THREE.BoxGeometry(width, 2.5, length - 3), bodyMat);
    box.position.set(0, 2.55, -0.9);
    box.castShadow = true;
    group.add(box);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.03, 0.4, length - 3.1),
      new THREE.MeshStandardMaterial({ color: 0x1f6fb2, roughness: 0.5 })
    );
    stripe.position.set(0, 3.1, -0.9);
    group.add(stripe);
    const platform = new THREE.Mesh(new THREE.BoxGeometry(width - 0.3, 0.22, 2.4), trimMat);
    platform.position.set(0, 4.2, -length / 2 + 1.2);
    group.add(platform);
    for (const side of [-1, 1]) {
      const scissor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), trimMat);
      scissor.position.set(side * (width / 2 - 0.5), 3.05, -length / 2 + 1.2);
      scissor.rotation.x = 0.35;
      group.add(scissor);
    }
    addBeacon(group, 0, 3.95, length / 2 - 1);
    addAxle(group, width / 2 - 0.2, length / 2 - 1.1, 0.5);
    addAxle(group, width / 2 - 0.2, -1.8, 0.5);
    return group;
  }

  // Airport apron bus.
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, 2.5, length - 0.5), bodyMat);
  body.position.set(0, 2.0, 0);
  body.castShadow = true;
  group.add(body);
  addGlassBand(group, width + 0.03, 1.05, length - 2.2, 2.45);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x12354f, roughness: 0.3, metalness: 0.5 });
  for (const z of [length * 0.28, -length * 0.28]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 1.9, 0.06), doorMat);
    door.position.set(0, 1.9, z);
    group.add(door);
  }
  addBeacon(group, 0, 3.35, length / 2 - 1.4);
  addAxle(group, width / 2 - 0.2, length / 2 - 1.6, 0.5);
  addAxle(group, width / 2 - 0.2, -length / 2 + 1.4, 0.5);
  return group;
}

/** Pulses beacon lamps and keeps headlights alive. Called every frame. */
export function animateVehicleLights(object: THREE.Object3D, time: number) {
  const beacons = object.userData.beacons as THREE.Mesh[] | undefined;
  if (!beacons) return;
  for (let i = 0; i < beacons.length; i++) {
    const mesh = beacons[i];
    const material = mesh.material as THREE.MeshStandardMaterial;
    const pulse = Math.sin(time * 5 + i * 1.7);
    material.emissiveIntensity = 0.15 + Math.max(0, pulse) * 1.8;
    mesh.visible = pulse > -0.55;
  }
}
type AircraftState = 'approach' | 'rollout' | 'taxiIn' | 'parked' | 'boarding' | 'pushback' | 'taxiOut' | 'holding' | 'lineup' | 'takeoff' | 'done';

/**
 * Minimum nose-to-tail distance in metres between two aircraft taxiing in
 * the same direction. Aircraft ignore anything further away, so a queue
 * forms single-file instead of stacking every waiting aircraft on one node.
 */
const MIN_AIRCRAFT_GAP = 50;

/** Seconds an aircraft waits on the centreline before starting its roll. */
const LINEUP_HOLD_SECONDS = 3;

/** Read-only snapshot of an aircraft occupying a stand (for jetways/HUD). */
export interface StandOccupancy {
  flightNumber: string;
  gateId: number;
  aircraftType: string;
  position: THREE.Vector3;
  yaw: number;
  state: AircraftState;
}

interface ServiceVehicleAgent {
  object: THREE.Object3D;
  kind: VehicleKind;
  route: number[];
  routeIndex: number;
  speed: number;
  yaw: number;
  state: 'outbound' | 'dwell' | 'return';
  dwell: number;
  home: number;
  target: number;
  gateId?: number;
  flightNumber?: string;
  area: number;
  patrol?: boolean;
  /** Seconds this vehicle has been blocked by another one in front of it. */
  blockedTimer: number;
}

interface AircraftAgent {
  flight: FlightWithState;
  object: THREE.Object3D;
  route: number[];
  routeIndex: number;
  speed: number;
  yaw: number;
  state: AircraftState;
  timer: number;
  gateId: number;
  gateNode: number;
  reverse: boolean;
  takeoffSpeed: number;
  altitude: number;
  /** True while this aircraft holds the shared runway. */
  runwayHeld: boolean;
  /** Seconds spent waiting for the aircraft ahead to move out of the way. */
  blockedTimer: number;
  /** Seconds spent stopped on the centreline (line up and wait). */
  lineupTimer: number;
}

function lerpAngle(a: number, b: number, t: number): number {
  let delta = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * THREE.MathUtils.clamp(t, 0, 1);
}

function disposeObject(obj: THREE.Object3D) {
  const sharedGeometry = obj.userData.sharedGeometry === true;
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    // GLB clones share geometry with the cached source, so only dispose it
    // for procedurally built objects (which create their own buffers).
    if (mesh.geometry && !sharedGeometry) mesh.geometry.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}

export class TrafficManager {
  private nodes: PathNode[] = [];
  private vehicles: ServiceVehicleAgent[] = [];
  private aircraft: AircraftAgent[] = [];
  private gateOccupancy = new Map<number, string>();
  /** One load per GLB path, shared by every aircraft of that type. */
  private glbCache = new Map<string, Promise<THREE.Object3D>>();
  /** Accumulated sim time used to pulse vehicle beacons. */
  private elapsed = 0;

  constructor(
    private scene: THREE.Scene,
    private shared?: SharedAirport,
    /** Fair FIFO queue for the shared runway (falls back to the raw lock). */
    private runwaySequencer?: RunwayLock
  ) {}

  /** Shared runway: the fair sequencer when available, else the raw lock. */
  private runwayLock(): RunwayLock | undefined {
    return this.runwaySequencer ?? this.shared?.runway;
  }

  /* --------------------------- aircraft models --------------------------- */

  private loadGlb(path: string): Promise<THREE.Object3D> {
    const cached = this.glbCache.get(path);
    if (cached) return cached;

    const promise = new Promise<THREE.Object3D>((resolve, reject) => {
      new GLTFLoader().load(path, (gltf) => resolve(gltf.scene), undefined, reject);
    });
    this.glbCache.set(path, promise);
    // A missing model must never break the traffic: fall back to the
    // procedural airframe and allow a later retry.
    promise.catch((error) => {
      console.warn(`[Traffic] Could not load ${path}, using procedural airframe.`, error);
      this.glbCache.delete(path);
    });
    return promise;
  }

  /**
   * Returns the aircraft object immediately (procedural placeholder) and hot
   * swaps in the detailed GLB once it has finished loading, keeping position,
   * heading and scale untouched.
   */
  private buildAircraftObject(spec: FleetSpec, livery: number): THREE.Group {
    const container = new THREE.Group();
    const placeholder = createProceduralAircraft(spec, livery);
    container.add(placeholder);
    container.userData.propellers = placeholder.userData.propellers;

    if (spec.modelPath) {
      this.loadGlb(spec.modelPath)
        .then((source) => {
          if (!container.parent) return; // aircraft already removed
          const detailed = prepareGlbAircraft(source, spec, livery);
          container.remove(placeholder);
          disposeObject(placeholder);
          container.add(detailed);
          // The shared GLB does not expose propellers; keep it simple.
          container.userData.propellers = [];
        })
        .catch(() => {
          /* keep the placeholder */
        });
    }

    return container;
  }

  /* ------------------------- graph construction ------------------------- */

  addNode(
    position: THREE.Vector3,
    connections: number[] = [],
    type?: NodeType,
    gateId?: number,
    options: { allowed?: AgentKind[]; label?: string; maxSpeed?: number } = {}
  ): number {
    const allowed =
      options.allowed ??
      (type === 'service' || type === 'depot' ? ['vehicle'] : ['aircraft']);
    this.nodes.push({
      position: position.clone(),
      connections: [...connections],
      type,
      gateId,
      allowed,
      label: options.label,
      maxSpeed: options.maxSpeed
    });
    return this.nodes.length - 1;
  }

  /** Bidirectional edge, skipping duplicates. */
  link(a: number, b: number) {
    if (a === b) return;
    if (!this.nodes[a] || !this.nodes[b]) return;
    if (!this.nodes[a].connections.includes(b)) this.nodes[a].connections.push(b);
    if (!this.nodes[b].connections.includes(a)) this.nodes[b].connections.push(a);
  }

  getNodeCount(): number {
    return this.nodes.length;
  }

  getNode(i: number): PathNode | undefined {
    return this.nodes[i];
  }

  /** Breadth-first search restricted to nodes the agent is allowed to use. */
  findPath(start: number, goal: number, kind: AgentKind): number[] | null {
    if (start === goal) return [start];
    if (!this.nodes[start] || !this.nodes[goal]) return null;
    const prev = new Map<number, number>();
    const visited = new Set<number>([start]);
    const queue: number[] = [start];

    while (queue.length > 0) {
      const current = queue.shift() as number;
      if (current === goal) break;
      for (const next of this.nodes[current].connections) {
        const node = this.nodes[next];
        if (!node || visited.has(next)) continue;
        if (!node.allowed.includes(kind)) continue;
        // Do not let ground vehicles drive over the runway/apron just because
        // an edge was authored by mistake.
        if (kind === 'vehicle' && (node.type === 'runway' || node.type === 'taxiway' || node.type === 'gate')) {
          continue;
        }
        visited.add(next);
        prev.set(next, current);
        queue.push(next);
      }
    }

    if (!visited.has(goal)) return null;
    const path: number[] = [goal];
    let cursor = goal;
    while (cursor !== start) {
      const parent = prev.get(cursor);
      if (parent === undefined) return null;
      path.push(parent);
      cursor = parent;
    }
    return path.reverse();
  }

  /* ----------------------------- spawning ------------------------------ */

  addVehicle(model: THREE.Object3D, startNodeIndex: number) {
    model.position.copy(this.nodes[startNodeIndex].position);
    this.scene.add(model);
    this.vehicles.push({
      object: model,
      kind: 'tug',
      route: [startNodeIndex],
      routeIndex: 0,
      speed: 8,
      yaw: 0,
      state: 'dwell',
      dwell: 999,
      home: startNodeIndex,
      target: startNodeIndex,
      area: 0,
      blockedTimer: 0
    });
  }

  private spawnVehicle(kind: VehicleKind, home: number, target: number, gateId?: number, flightNumber?: string): ServiceVehicleAgent | null {
    const route = this.findPath(home, target, 'vehicle');
    if (!route) return null;
    const object = createServiceTruck(kind);
    object.position.copy(this.nodes[home].position);
    this.scene.add(object);
    const agent: ServiceVehicleAgent = {
      object,
      kind,
      route,
      routeIndex: 1,
      speed: kind === 'bus' ? 14 : 11,
      yaw: 0,
      state: 'outbound',
      dwell: 0,
      home,
      target,
      gateId,
      flightNumber,
      area: 0,
      blockedTimer: 0
    };
    this.vehicles.push(agent);
    return agent;
  }

  /** Departure aircraft appears at its gate; arrivals roll out and taxi in. */
  addFlight(flight: Flight): boolean {
    // Wide-bodies need the two stands with enough clearance; freighters go to
    // the dedicated cargo ramp (gates 9-11).
    const spec = getFleetSpec(flight.aircraftType);
    const allowedGates =
      spec.category === 'cargo'
        ? CARGO_GATE_IDS
        : spec.category === 'wide'
          ? WIDE_BODY_GATE_IDS
          : PASSENGER_GATE_IDS;
    const gate = this.pickFreeGate(allowedGates);
    if (gate === undefined) return false;

    // Arrival or departure is decided by the flight itself, never by a
    // coin flip: a MEX -> CUN flight cannot suddenly appear as an arrival
    // at MEX, and a flight to MEX cannot start parked at a MEX gate.
    const isArrival = flight.destination === HOME_AIRPORT.code;

    // An arrival needs the runway now: if another aircraft is using it,
    // do not spawn at all — the schedule retries in a few seconds, and
    // the aircraft appears on a clear final instead of on top of traffic.
    if (isArrival && this.runwayLock() && !this.runwayLock()!.request(`tm-${flight.flightNumber}`, 'arrival')) {
      return false;
    }
    const gateNodeIndex = gate.nodeIndex;
    const gateId = gate.gateId;
    const livery = pickLivery(spec);
    const object = this.buildAircraftObject(spec, livery);

    const flightWithState = flight as FlightWithState;
    flightWithState.gate = gateId;
    flightWithState.currentStateDuration = 0;

    const agent: AircraftAgent = {
      flight: flightWithState,
      object,
      route: [],
      routeIndex: 0,
      speed: 25,
      yaw: Math.PI / 2,
      state: 'parked',
      timer: 0,
      gateId,
      gateNode: gateNodeIndex,
      reverse: false,
      takeoffSpeed: 0,
      altitude: 0,
      runwayHeld: isArrival && this.shared !== undefined,
      blockedTimer: 0,
      lineupTimer: 0
    };

    if (isArrival) {
      // Approach from the south, in the air: 180 m high, 2.6 km out,
      // heading north (-Z) towards the runway. It lands at the threshold
      // (z = +1150) and rolls out — it never pops into existence on the
      // runway, already rolling, as it did before.
      object.position.set(0, 180, 2600);
      agent.state = 'approach';
      agent.route = [];
      agent.routeIndex = 0;
      agent.yaw = Math.PI;
      agent.speed = 75;
      agent.altitude = 180;
      flight.status = FlightStatus.Landing;
    } else {
      object.position.copy(this.nodes[gateNodeIndex].position);
      agent.yaw = Math.PI / 2; // nose pointing east, towards terminal (+Z forward)
      flight.status = FlightStatus.Boarding;
    }

    this.scene.add(object);
    object.rotation.y = agent.yaw;
    this.aircraft.push(agent);
    this.gateOccupancy.set(gateId, flight.flightNumber);
    if (this.shared && isPassengerGate(gateId)) {
      this.shared.requestGate(gateId, `tm-${flight.flightNumber}`);
    }
    // Departures start parked at the gate, so they need their ground
    // services now. Arrivals get theirs when they finish taxiing in
    // (spawnGateServices in the taxiIn case) — calling it here for them
    // would dispatch the trucks twice.
    if (!isArrival) this.spawnGateServices(agent);
    console.info(
      `[Traffic] ${flight.flightNumber} ${isArrival ? 'arrival' : 'departure'} assigned to gate ${gateId}`
    );
    return true;
  }

  /* ------------------------------- update ------------------------------ */

  update(dt: number, _aircraftPosition: THREE.Vector3) {
    this.elapsed += dt;
    this.updateAircraft(dt);
    this.updateVehicles(dt);
  }

  private updateAircraft(dt: number) {
    for (let i = this.aircraft.length - 1; i >= 0; i--) {
      const agent = this.aircraft[i];
      agent.timer += dt;
      agent.flight.currentStateDuration = agent.timer;
      animatePropellers(agent.object, dt);

      switch (agent.state) {
        case 'approach': {
          // Final approach: descend from 180 m to the runway, heading
          // north (-Z) at ~75 m/s. Touchdown is at the threshold z = +1150.
          agent.altitude = Math.max(0, agent.altitude - 10 * dt);
          agent.object.position.z -= agent.speed * dt;
          agent.object.position.x = 0;
          agent.object.position.y = agent.altitude;
          agent.object.rotation.set(0.04, agent.yaw, 0);
          if (agent.object.position.z <= 1150 && agent.altitude <= 0) {
            const runwayEntry = this.runwayEntryNode();
            if (runwayEntry === undefined) {
              this.removeAircraft(agent, i);
              break;
            }
            const taxiPath = this.findPath(runwayEntry, agent.gateNode, 'aircraft');
            if (!taxiPath) {
              this.removeAircraft(agent, i);
              break;
            }
            agent.object.position.set(0, 0, 1150);
            agent.object.rotation.set(0, agent.yaw, 0);
            agent.state = 'rollout';
            agent.route = taxiPath;
            agent.routeIndex = 0;
            agent.timer = 0;
            agent.speed = 45;
            agent.flight.status = FlightStatus.Taxiing;
          }
          break;
        }

        case 'rollout':
          if (this.advanceAlongRoute(agent, dt, true)) {
            // Clear of the runway (at the exit): release it for the next
            // landing or departure.
            if (agent.runwayHeld && this.runwayLock()) {
              this.runwayLock()!.release(`tm-${agent.flight.flightNumber}`);
              agent.runwayHeld = false;
            }
            agent.state = 'taxiIn';
            agent.timer = 0;
            agent.speed = 22;
            agent.flight.status = FlightStatus.Taxiing;
          }
          break;

        case 'taxiIn':
          if (this.shouldYield(agent, dt)) break;
          if (this.advanceAlongRoute(agent, dt, true)) {
            agent.state = 'parked';
            agent.timer = 0;
            agent.flight.status = FlightStatus.Parked;
            this.spawnGateServices(agent);
            console.info(`[Traffic] ${agent.flight.flightNumber} parked at gate ${agent.gateId}, services dispatched`);
          }
          break;

        case 'parked':
          // Turnaround at the gate: 25 s unloading / services, then
          // boarding. The aircraft used to leave after only 14 s, before
          // the fuel and baggage trucks had even arrived.
          if (agent.timer > 25) {
            agent.state = 'boarding';
            agent.timer = 0;
            agent.flight.status = FlightStatus.Boarding;
          }
          break;

        case 'boarding':
          // 35 s loading passengers and cargo, with the service vehicles
          // still at the stand. Total gate time is now ~60 s, not 26 s.
          if (agent.timer > 35) {
            // One aircraft at a time on the apron lane. Two departures
            // leaving adjacent stands used to meet head-on at the shared
            // Bravo merge and crawl past each other; the second one now
            // waits at the stand until the first has reached Alpha.
            if (this.isApronBusy(agent)) break;
            this.finishGateServices(agent);
            const lead = this.findNode(n => n.type === 'apron' && n.gateId === agent.gateId);
            if (lead !== undefined) {
              agent.route = [agent.gateNode, lead];
              agent.routeIndex = 1;
              agent.state = 'pushback';
              agent.timer = 0;
              agent.reverse = true;
              agent.speed = 5;
              agent.flight.status = FlightStatus.Taxiing;
            } else {
              this.removeAircraft(agent, i);
            }
          }
          break;

        case 'pushback':
          if (this.advanceAlongRoute(agent, dt, false)) {
            agent.reverse = false;
            const start = agent.routeIndex >= agent.route.length ? agent.route[agent.route.length - 1] : agent.route[agent.routeIndex];
            // Taxi out to the hold-short point beside the threshold: the
            // runway is only entered once the shared controller grants it.
            const hold = this.departureHoldNode();
            if (hold === undefined) {
              this.removeAircraft(agent, i);
              break;
            }
            const path = this.findPath(start, hold, 'aircraft');
            if (!path) {
              this.removeAircraft(agent, i);
              break;
            }
            agent.route = path;
            agent.routeIndex = 1;
            agent.state = 'taxiOut';
            agent.timer = 0;
            agent.speed = 26;
            agent.flight.status = FlightStatus.Taxiing;
          }
          break;

        case 'taxiOut':
          if (this.shouldYield(agent, dt)) break;
          if (this.advanceAlongRoute(agent, dt, true)) {
            // Reached the hold-short point. From here the aircraft either
            // lines up (runway free) or waits in the queue off the asphalt.
            agent.speed = 0;
            if (this.canEnterRunway(agent)) {
              this.beginLineup(agent);
            } else {
              agent.state = 'holding';
              agent.timer = 0;
            }
          }
          break;

        case 'holding':
          // Waiting at the hold-short point, off the runway. Retry every
          // frame: the runway is released as soon as the other aircraft
          // clears it, so this wait is normally a few seconds.
          if (this.canEnterRunway(agent)) this.beginLineup(agent);
          break;

        case 'lineup': {
          // Roll from the hold-short point onto the centreline, then stop
          // briefly (line up and wait) before applying takeoff thrust.
          if (!this.advanceAlongRoute(agent, dt, true)) {
            agent.lineupTimer = 0;
            break;
          }
          agent.speed = 0;
          agent.lineupTimer += dt;
          if (agent.lineupTimer < LINEUP_HOLD_SECONDS) break;

          agent.yaw = Math.PI; // runway heading (towards -Z)
          agent.object.rotation.set(0, agent.yaw, 0);
          agent.state = 'takeoff';
          agent.timer = 0;
          agent.takeoffSpeed = 30;
          agent.flight.status = FlightStatus.Takeoff;
          console.info(`[Traffic] ${agent.flight.flightNumber} lined up and rolling on RWY18`);
          break;
        }

        case 'takeoff': {
          agent.takeoffSpeed = Math.min(88, agent.takeoffSpeed + 6 * dt);
          agent.object.position.z -= agent.takeoffSpeed * dt;
          if (agent.takeoffSpeed > 72) {
            agent.altitude += (agent.takeoffSpeed - 72) * 1.6 * dt;
            agent.object.position.y = agent.altitude;
            agent.object.rotation.x = THREE.MathUtils.lerp(agent.object.rotation.x, -0.16, dt * 1.5);
          }
          // Clear of the runway once airborne and climbing: release it.
          if (agent.runwayHeld && agent.altitude > 300 && this.runwayLock()) {
            this.runwayLock()!.release(`tm-${agent.flight.flightNumber}`);
            agent.runwayHeld = false;
          }
          // Fly away from the airport before disappearing: the old limit
          // (z < -1700, altitude > 900) made departures vanish right over
          // the airfield, in full view of the player.
          if (agent.object.position.z < -4500 || agent.altitude > 1500) {
            this.removeAircraft(agent, i);
          }
          break;
        }

        default:
          break;
      }
    }
  }

  /** Spawns a few vehicles that keep patrolling the service roads. */
  seedAmbientTraffic(count = 5) {
    const vehicleNodes: number[] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i].type === 'service') vehicleNodes.push(i);
    }
    if (vehicleNodes.length < 2) return;

    const kinds: VehicleKind[] = ['bus', 'baggage', 'fuel', 'catering', 'tug', 'followme'];
    for (let i = 0; i < count; i++) {
      const home = vehicleNodes[(i * 5) % vehicleNodes.length];
      const target = vehicleNodes[(i * 7 + 3) % vehicleNodes.length];
      if (home === target) continue;
      const agent = this.spawnVehicle(kinds[i % kinds.length], home, target);
      if (agent) agent.patrol = true;
    }
  }

  private pickPatrolTarget(from: number): number {
    const candidates: number[] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      if (i !== from && this.nodes[i].type === 'service') candidates.push(i);
    }
    if (candidates.length === 0) return from;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private isVehicleBlocked(v: ServiceVehicleAgent, dir: THREE.Vector3): boolean {
    for (const other of this.vehicles) {
      if (other === v) continue;
      const toOther = other.object.position.clone().sub(v.object.position);
      toOther.y = 0;
      if (toOther.lengthSq() > 100) continue;
      if (toOther.lengthSq() < 0.01) return true;
      if (toOther.normalize().dot(dir) > 0.4) return true;
    }
    return false;
  }

  private updateVehicles(dt: number) {
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      animateVehicleLights(v.object, this.elapsed);

      if (v.state === 'dwell') {
        v.dwell -= dt;
        if (v.dwell <= 0) {
          const destination = v.patrol ? this.pickPatrolTarget(v.home) : v.home;
          const back = this.findPath(v.target, destination, 'vehicle');
          if (back) {
            v.route = back;
            v.routeIndex = 1;
            v.state = 'return';
            v.target = destination;
          } else if (!v.patrol) {
            this.removeVehicle(v, i);
          }
        }
        continue;
      }

      // Small separation rule so trucks queue instead of driving through
      // each other on the service lane. But a block is only a yield, not
      // a permanent stop: two trucks facing each other used to deadlock
      // forever, both waiting for the other to move. After 2.5 s blocked,
      // this one creeps forward anyway.
      if (v.routeIndex < v.route.length) {
        const targetPos = this.nodes[v.route[v.routeIndex]].position;
        const dir = targetPos.clone().sub(v.object.position);
        dir.y = 0;
        if (dir.lengthSq() > 0.01 && this.isVehicleBlocked(v, dir.normalize())) {
          v.blockedTimer += dt;
          if (v.blockedTimer < 2.5) continue;
          v.blockedTimer = 0;
        } else {
          v.blockedTimer = 0;
        }
      }

      if (this.advanceVehicle(v, dt)) {
        if (v.state === 'outbound') {
          v.state = 'dwell';
          // Gate-service trucks stay at the stand for the whole
          // turnaround; finishGateServices removes them when the aircraft
          // leaves. Only patrol trucks dwell a few seconds and go back.
          v.dwell = v.flightNumber ? 999 : 5 + Math.random() * 6;
        } else {
          if (v.patrol) {
            const nextTarget = this.pickPatrolTarget(v.home);
            const route = this.findPath(v.target, nextTarget, 'vehicle');
            if (route) {
              v.route = route;
              v.routeIndex = 1;
              v.target = nextTarget;
              v.state = 'outbound';
            } else {
              v.state = 'dwell';
              v.dwell = 2;
            }
          } else {
            this.removeVehicle(v, i);
          }
        }
      }
    }
  }

  /* --------------------------- route following -------------------------- */

  private advanceAlongRoute(agent: AircraftAgent, dt: number, rotate: boolean): boolean {
    if (agent.route.length === 0) return true;
    let remaining = agent.speed * dt;

    while (remaining > 0) {
      if (agent.routeIndex >= agent.route.length) return true;
      const target = this.nodes[agent.route[agent.routeIndex]].position;
      const delta = target.clone().sub(agent.object.position);
      delta.y = 0;
      const distance = delta.length();
      if (distance < 0.001) {
        agent.routeIndex++;
        continue;
      }
      const step = Math.min(remaining, distance);
      delta.normalize();
      agent.object.position.addScaledVector(delta, step);
      remaining -= step;

      const desiredYaw = Math.atan2(delta.x, delta.z) + (agent.reverse ? Math.PI : 0);
      if (rotate) agent.yaw = lerpAngle(agent.yaw, desiredYaw, dt * 5);

      if (step >= distance - 0.001) agent.routeIndex++;
    }

    agent.object.rotation.set(0, agent.yaw, 0);
    return agent.routeIndex >= agent.route.length;
  }

  private advanceVehicle(v: ServiceVehicleAgent, dt: number): boolean {
    let remaining = v.speed * dt;
    while (remaining > 0) {
      if (v.routeIndex >= v.route.length) return true;
      const target = this.nodes[v.route[v.routeIndex]].position;
      const delta = target.clone().sub(v.object.position);
      delta.y = 0;
      const distance = delta.length();
      if (distance < 0.001) {
        v.routeIndex++;
        continue;
      }
      const step = Math.min(remaining, distance);
      delta.normalize();
      v.object.position.addScaledVector(delta, step);
      remaining -= step;
      const desiredYaw = Math.atan2(delta.x, delta.z);
      v.yaw = lerpAngle(v.yaw, desiredYaw, dt * 6);
      if (step >= distance - 0.001) v.routeIndex++;
    }
    v.object.rotation.set(0, v.yaw, 0);
    return v.routeIndex >= v.route.length;
  }

  /* ---------------------------- ground services ------------------------- */

  private spawnGateServices(agent: AircraftAgent) {
    const fuelDepot = this.findNode(n => n.type === 'depot' && n.label === 'fuel');
    const baggageDepot = this.findNode(n => n.type === 'depot' && n.label === 'baggage');
    const spots = this.nodes
      .map((n, idx) => ({ n, idx }))
      .filter(({ n }) => n.type === 'service' && n.gateId === agent.gateId);

    if (fuelDepot !== undefined && spots.length > 0) {
      this.spawnVehicle('fuel', fuelDepot, spots[0].idx, agent.gateId, agent.flight.flightNumber);
    }
    if (baggageDepot !== undefined && spots.length > 1) {
      this.spawnVehicle('baggage', baggageDepot, spots[1].idx, agent.gateId, agent.flight.flightNumber);
    }
    // Catering and the crew/passenger bus use the same two spots (one
    // truck per side of the aircraft), so the gate visibly has four
    // vehicles working it, not just two that left after a few seconds.
    if (baggageDepot !== undefined && spots.length > 0) {
      this.spawnVehicle('catering', baggageDepot, spots[0].idx, agent.gateId, agent.flight.flightNumber);
    }
    if (fuelDepot !== undefined && spots.length > 1) {
      this.spawnVehicle('bus', fuelDepot, spots[1].idx, agent.gateId, agent.flight.flightNumber);
    }
  }

  private finishGateServices(agent: AircraftAgent) {
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      if (v.flightNumber === agent.flight.flightNumber) this.removeVehicle(v, i);
    }
  }

  /* ------------------------------ helpers ------------------------------ */

  /** Hold-short point where departures queue, outside the runway asphalt. */
  private departureHoldNode(): number | undefined {
    return this.findNode((n) => n.label === 'HOLD-DEP');
  }

  /** Runway node at the departure threshold (north end, z > 1000). */
  private runwayEntryNode(): number | undefined {
    return this.findNode((n) => n.type === 'runway' && n.position.z > 1000);
  }

  /** Asks the shared controller for the runway, once per aircraft. */
  private canEnterRunway(agent: AircraftAgent): boolean {
    const lock = this.runwayLock();
    if (!lock || agent.runwayHeld) return true;
    if (!lock.request(`tm-${agent.flight.flightNumber}`, 'departure')) return false;
    agent.runwayHeld = true;
    return true;
  }

  /** Routes the aircraft from the hold-short point onto the centreline. */
  private beginLineup(agent: AircraftAgent) {
    const hold = this.departureHoldNode();
    const entry = this.runwayEntryNode();
    const path =
      hold !== undefined && entry !== undefined
        ? this.findPath(hold, entry, 'aircraft')
        : null;
    if (path && path.length > 1) {
      agent.route = path;
      agent.routeIndex = 1;
    } else {
      agent.route = [];
      agent.routeIndex = 0;
    }
    agent.state = 'lineup';
    agent.timer = 0;
    agent.lineupTimer = 0;
    agent.speed = 12;
    agent.flight.status = FlightStatus.Taxiing;
  }

  /**
   * Returns the aircraft directly ahead in this one's lane, within
   * MIN_AIRCRAFT_GAP, or null.
   */
  private findAircraftBlocker(agent: AircraftAgent): AircraftAgent | null {
    if (agent.routeIndex >= agent.route.length) return null;
    const target = this.nodes[agent.route[agent.routeIndex]].position;
    const dir = target.clone().sub(agent.object.position);
    dir.y = 0;
    if (dir.lengthSq() < 0.01) return null;
    dir.normalize();
    const gapSq = MIN_AIRCRAFT_GAP * MIN_AIRCRAFT_GAP;
    const lateralLimitSq = 18 * 18;
    for (const other of this.aircraft) {
      if (other === agent) continue;
      // Only moving traffic blocks a taxi: aircraft parked or boarding at a
      // stand are 46 m to the side of Alpha and must not freeze the lane.
      if (
        other.state !== 'taxiOut' &&
        other.state !== 'taxiIn' &&
        other.state !== 'lineup' &&
        other.state !== 'rollout' &&
        other.state !== 'holding'
      ) {
        continue;
      }
      const away = other.object.position.clone().sub(agent.object.position);
      away.y = 0;
      const distanceSq = away.lengthSq();
      if (distanceSq < 0.01) return other;
      if (distanceSq > gapSq) continue;
      // Only an aircraft ahead in the same lane matters. Parallel lanes
      // (Alpha x = 72 and Bravo x = 95) are 23 m apart, so the lateral
      // component distinguishes a follower from a neighbour.
      const forward = away.dot(dir);
      if (forward <= 0) continue;
      if (distanceSq - forward * forward > lateralLimitSq) continue;
      return other;
    }
    return null;
  }

  /** True when two aircraft face each other (head-on taxi conflict). */
  private isOncoming(agent: AircraftAgent, other: AircraftAgent): boolean {
    const dot =
      Math.sin(agent.yaw) * Math.sin(other.yaw) +
      Math.cos(agent.yaw) * Math.cos(other.yaw);
    return dot < -0.35;
  }

  /**
   * True while another departure is pushing back or still on the apron
   * taxilane (east of Alpha). Serialises pushback so two aircraft from
   * adjacent stands never meet head-on at the shared Bravo merge.
   */
  private isApronBusy(agent: AircraftAgent): boolean {
    for (const other of this.aircraft) {
      if (other === agent) continue;
      if (other.state === 'pushback') return true;
      if (other.state === 'taxiOut' && other.object.position.x > 72.5) return true;
    }
    return false;
  }

  /**
   * Separation yield for taxiing aircraft. A same-direction queue holds
   * until the leader moves (no creep: 35 m wingspans overlapped when they
   * inched forward). A head-on conflict is different: after 3 s the
   * aircraft eases past instead of deadlocking both lanes.
   */
  private shouldYield(agent: AircraftAgent, dt: number): boolean {
    const blocker = this.findAircraftBlocker(agent);
    if (!blocker) {
      agent.blockedTimer = 0;
      return false;
    }
    agent.blockedTimer += dt;
    if (this.isOncoming(agent, blocker) && agent.blockedTimer > 3) {
      agent.blockedTimer = 0;
      return false;
    }
    return true;
  }

  private findNode(predicate: (node: PathNode) => boolean): number | undefined {
    for (let i = 0; i < this.nodes.length; i++) {
      if (predicate(this.nodes[i])) return i;
    }
    return undefined;
  }

  private pickFreeGate(allowedGateIds?: number[]): { gateId: number; nodeIndex: number } | undefined {
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      if (node.type !== 'gate' || node.gateId === undefined) continue;
      if (allowedGateIds && !allowedGateIds.includes(node.gateId)) continue;
      if (this.gateOccupancy.has(node.gateId)) continue;
      // Also free in the shared controller: a RouteTraffic aircraft may
      // already be parked at this gate even though this manager did not
      // assign it.
      if (this.shared && isPassengerGate(node.gateId) && !this.shared.isGateFree(node.gateId)) continue;
      return { gateId: node.gateId, nodeIndex: i };
    }
    return undefined;
  }

  private removeAircraft(agent: AircraftAgent, index: number) {
    this.scene.remove(agent.object);
    disposeObject(agent.object);
    this.gateOccupancy.delete(agent.gateId);
    if (this.shared || this.runwaySequencer) {
      if (agent.runwayHeld && this.runwayLock()) {
        this.runwayLock()!.release(`tm-${agent.flight.flightNumber}`);
        agent.runwayHeld = false;
      }
      this.shared?.releaseGate(`tm-${agent.flight.flightNumber}`);
    }
    this.finishGateServices(agent);
    this.aircraft.splice(index, 1);
  }

  private removeVehicle(v: ServiceVehicleAgent, index: number) {
    this.scene.remove(v.object);
    disposeObject(v.object);
    this.vehicles.splice(index, 1);
  }

  /* ------------------------------ queries ------------------------------ */

  getActiveFlights(): FlightWithState[] {
    return this.aircraft.map((a) => a.flight);
  }

  /**
   * Aircraft currently occupying a stand, with the exact world pose. Only the
   * gate phases are reported: an aircraft is "at the stand" once it has
   * finished taxiing in and until pushback starts.
   */
  getStandOccupancies(): StandOccupancy[] {
    const result: StandOccupancy[] = [];
    for (const agent of this.aircraft) {
      if (agent.state !== 'parked' && agent.state !== 'boarding') continue;
      result.push({
        flightNumber: agent.flight.flightNumber,
        gateId: agent.gateId,
        aircraftType: agent.flight.aircraftType,
        position: agent.object.position.clone(),
        yaw: agent.object.rotation.y,
        state: agent.state
      });
    }
    return result;
  }

  getStats(): TrafficManagerStats {
    const totalGates = this.nodes.filter((node) => node.type === 'gate').length;
    return {
      nodes: this.nodes.length,
      aircraft: this.aircraft.length,
      vehicles: this.vehicles.length,
      flights: this.aircraft.length,
      gatesFree: Math.max(0, totalGates - this.gateOccupancy.size)
    };
  }

  /** Debug helper: draw the graph so missing links are obvious. */
  createDebugLines(colorAircraft = 0x00ff88, colorVehicle = 0xffaa00): THREE.Group {
    const group = new THREE.Group();
    const aircraftMat = new THREE.LineBasicMaterial({ color: colorAircraft });
    const vehicleMat = new THREE.LineBasicMaterial({ color: colorVehicle });
    for (let a = 0; a < this.nodes.length; a++) {
      const node = this.nodes[a];
      for (const b of node.connections) {
        if (b < a) continue;
        const other = this.nodes[b];
        const geo = new THREE.BufferGeometry().setFromPoints([node.position.clone().setY(1.2), other.position.clone().setY(1.2)]);
        const isVehicle = node.allowed.includes('vehicle') && other.allowed.includes('vehicle');
        group.add(new THREE.Line(geo, isVehicle ? vehicleMat : aircraftMat));
      }
    }
    return group;
  }
}
