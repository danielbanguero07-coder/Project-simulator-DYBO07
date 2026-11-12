import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  createProceduralAircraft,
  getFleetSpec,
  pickFleetType,
  pickLivery,
  type FleetSpec
} from './fleet';
import { pickRoute, getAirport, HOME_AIRPORT, type AirportDefinition } from './airports';
import type { SharedAirport } from './runwayControl';
import type { RunwayLock } from './runwaySequencer';
import { buildAirNetwork, validateAirNetwork, type AirNetwork, type AirNode } from './airNetwork';

/**
 * Air-route traffic.
 *
 * Aircraft fly between the airports in `airports.ts` on a full, coherent
 * cycle instead of bouncing back and forth in the air:
 *
 *   takeoff / climb -> cruise (flat) -> descent -> landing rollout
 *   -> taxi to a stand -> parked (turnaround: unload / load, services)
 *   -> taxi out -> takeoff on the return leg
 *
 * That is the whole point of this file: a plane never reverses direction
 * in mid-air. It only changes heading after it has landed, parked and
 * waited at the destination, and every heading change is smoothed
 * (limited turn rate) instead of an instant 180-degree snap.
 *
 * The flight path itself is a real route through the nodes of
 * `airNetwork.ts`: runway -> departure fix -> en-route waypoint ->
 * arrival fix -> final -> destination runway. The heading always points
 * at the next node instead of a Bezier tangent, altitude follows the
 * node altitudes at a limited climb/descent rate, and if the runway is
 * busy on final the aircraft diverts to the holding node and rejoins
 * the arrival route when it is free.
 *
 * Everything uses the same "nose points +Z, yaw rotates it" convention as
 * the rest of the simulation.
 */

type AirPhase = 'airborne' | 'holding' | 'landing' | 'taxiIn' | 'parked' | 'taxiOut' | 'lineup';

interface AirAgent {
  object: THREE.Group;
  route: { origin: string; destination: string; distanceKm: number; cargo: boolean };
  origin: AirportDefinition;
  destination: AirportDefinition;
  distance: number;
  /** Progress along the leg, 0 (origin) .. 1 (destination). */
  t: number;
  /** Current speed in metres per second. */
  speed: number;
  /** Per-aircraft cruise factor, so two flights on the same leg separate. */
  speedFactor: number;
  /** Current altitude (metres), moved towards the next node at a limited rate. */
  altitude: number;
  /** Node route for the current leg, from airNetwork.ts. */
  navRoute: AirNode[];
  /** Index inside navRoute of the node the aircraft is flying towards. */
  navIndex: number;
  /** Used to place the red/green wingtip lights. */
  wingspan: number;
  length: number;
  placeholder?: THREE.Object3D;
  /** Which part of the cycle this aircraft is in. */
  phase: AirPhase;
  /** Time spent in the current phase, in seconds. */
  phaseTime: number;
  /** Smoothed heading (radians) and pitch, never snapped. */
  yaw: number;
  pitch: number;
  /** How long this aircraft waits parked before the return leg. */
  parkedDuration: number;
  /** Stand index, used to pick a different parking spot per aircraft. */
  index: number;
  taxiFrom: THREE.Vector3;
  taxiTo: THREE.Vector3;
  /** Intermediate taxi point: the runway exit onto Alpha (arrivals only). */
  taxiMid: THREE.Vector3;
  /** What the runway is held for, if this aircraft holds it. */
  runwayFor: 'takeoff' | 'landing' | null;
  /** Gate reserved at MEX, if any (1-8). */
  gateId: number | null;
  /** Stand this aircraft will park at on the current leg. */
  stand: THREE.Vector3;
  /** Holding orbit centre and angle while waiting for the runway. */
  holdingCenter: THREE.Vector3;
  holdingAngle: number;
  /** Stack level assigned at the holding fix (0..3): altitude + radius. */
  holdingLevel: number;
}

export interface RouteTrafficOptions {
  premium?: boolean;
  count?: number;
  /** Shared runway/gate controller (one per game, see runwayControl.ts). */
  shared?: SharedAirport;
  /** Fair FIFO queue for the runway (falls back to the raw lock). */
  runway?: RunwayLock;
}

const SPEC_POOL = ['A320', 'B737', 'A321', 'A350', 'B787', 'A380'];

/** Gate stands at the home hub, matching groundNetwork.ts (x = 130). */
const HOME_GATE_STANDS: { id: number; z: number }[] = [
  { id: 1, z: -180 },
  { id: 2, z: -100 },
  { id: 3, z: -20 },
  { id: 4, z: 60 },
  { id: 5, z: 150 },
  { id: 6, z: 240 },
  { id: 7, z: 330 },
  { id: 8, z: 420 },
  { id: 12, z: -500 },
  { id: 13, z: -420 }
];
const HOME_GATE_IDS = HOME_GATE_STANDS.map((stand) => stand.id);

/**
 * Departure queue spots beside the runway threshold, on taxiway Alpha
 * (x = 84, inside the 36 m of Alpha asphalt). They are 55 m apart and all
 * outside the 46 m runway: before this, route traffic waited at ±22.5 m from
 * the centreline, i.e. on the runway itself.
 */
const QUEUE_X = 84;
const QUEUE_Z_FIRST = 1030;
const QUEUE_Z_SPACING = 55;
const QUEUE_SLOTS = 5;

function standForGate(gateId: number, elevation: number): THREE.Vector3 {
  const stand = HOME_GATE_STANDS.find((candidate) => candidate.id === gateId) ?? HOME_GATE_STANDS[0];
  return new THREE.Vector3(130, elevation, stand.z);
}

/** Parking stand for an airport: a fixed offset from the airport centre. */
function standPosition(airport: AirportDefinition, index: number): THREE.Vector3 {
  if (airport.code === HOME_AIRPORT.code) {
    return standForGate(HOME_GATE_IDS[index % HOME_GATE_IDS.length], airport.elevation);
  }
  return new THREE.Vector3(
    airport.x + 130,
    airport.elevation,
    airport.z + ((index * 97) % 400) - 200
  );
}

/** Runway heading (degrees, clockwise from +Z) -> yaw (radians). */
function headingToYaw(headingDeg: number): number {
  return (headingDeg * Math.PI) / 180;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerpAngle(a: number, b: number, t: number): number {
  let delta = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * THREE.MathUtils.clamp(t, 0, 1);
}

/** Soft round dot used by the route-traffic navigation lights. */
function makeNavLightTexture(size = 32): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D context unavailable');
  const center = size / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.85)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export class RouteTraffic {
  private agents: AirAgent[] = [];
  private glbCache = new Map<string, Promise<THREE.Object3D>>();
  private scene: THREE.Scene;
  private premium: boolean;
  private disposed = false;
  private navGeometry: THREE.BufferGeometry;
  private navMaterial: THREE.PointsMaterial;
  private navPoints: THREE.Points;
  private navPositions: Float32Array;
  private shared?: SharedAirport;
  private runwaySequencer?: RunwayLock;
  /** Azimuth route graph built from airports.ts (see airNetwork.ts). */
  private network: AirNetwork;

  constructor(scene: THREE.Scene, options: RouteTrafficOptions = {}) {
    this.scene = scene;
    this.shared = options.shared;
    this.runwaySequencer = options.runway;
    this.premium = options.premium ?? true;
    this.network = buildAirNetwork();
    const report = validateAirNetwork(this.network);
    if (report.ok) {
      console.info(
        `[air-network] OK · ${report.nodeCount} nodes, ${report.edgeCount} links`
      );
    } else {
      console.error('[air-network] invalid network', report.errors);
    }
    const count = options.count ?? (this.premium ? 10 : 6);
    for (let i = 0; i < count; i++) {
      this.spawn(i % 2 === 0, i);
    }

    // One draw call for every navigation light in the sky: red left wingtip,
    // green right wingtip and a white tail beacon per aircraft.
    const count3 = this.agents.length * 3;
    this.navPositions = new Float32Array(count3 * 3);
    const colors = new Float32Array(count3 * 3);
    for (let i = 0; i < this.agents.length; i++) {
      const palette = [0xff2a2a, 0x2aff5a, 0xf2f6ff];
      for (let k = 0; k < 3; k++) {
        colors[(i * 3 + k) * 3] = ((palette[k] >> 16) & 255) / 255;
        colors[(i * 3 + k) * 3 + 1] = ((palette[k] >> 8) & 255) / 255;
        colors[(i * 3 + k) * 3 + 2] = (palette[k] & 255) / 255;
      }
    }
    this.navGeometry = new THREE.BufferGeometry();
    this.navGeometry.setAttribute('position', new THREE.BufferAttribute(this.navPositions, 3));
    this.navGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.navMaterial = new THREE.PointsMaterial({
      size: 3.5,
      map: makeNavLightTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false
    });
    this.navPoints = new THREE.Points(this.navGeometry, this.navMaterial);
    this.navPoints.name = 'routeNavLights';
    this.navPoints.frustumCulled = false;
    scene.add(this.navPoints);
  }

  /** Number of aircraft currently in the traffic system (air + parked). */
  get count(): number {
    return this.agents.length;
  }

  /** Shared runway: the fair sequencer when available, else the raw lock. */
  private runwayLock(): RunwayLock | undefined {
    return this.runwaySequencer ?? this.shared?.runway;
  }

  /** Live snapshot for the debug console. */
  snapshot() {
    return this.agents.map((agent) => ({
      flight: `${agent.origin.code}-${agent.destination.code}`,
      phase: agent.phase,
      t: Number(agent.t.toFixed(3)),
      speed: Math.round(agent.speed),
      altitude: Math.round(agent.object.position.y),
      x: Math.round(agent.object.position.x),
      z: Math.round(agent.object.position.z),
      visible: agent.object.visible
    }));
  }

  private spawn(preferHomeRoute: boolean, index = 0) {
    const type = SPEC_POOL[Math.floor(Math.random() * SPEC_POOL.length)];
    const spec = getFleetSpec(type);
    const cargo = Math.random() < 0.2;

    let route = pickRoute(cargo, preferHomeRoute ? HOME_AIRPORT.code : undefined);
    if (preferHomeRoute && route.origin !== HOME_AIRPORT.code) {
      route = pickRoute(cargo, HOME_AIRPORT.code);
    }
    const origin = getAirport(route.origin) ?? HOME_AIRPORT;
    const destination = getAirport(route.destination) ?? HOME_AIRPORT;

    const distance = Math.max(
      1,
      Math.hypot(destination.x - origin.x, destination.z - origin.z)
    );
    const navRoute = this.network.findFlightRoute(origin.code, destination.code) ?? [];

    const livery = pickLivery(spec);
    const object = this.buildModel(spec, livery);
    object.rotation.order = 'YXZ';

    // Not every aircraft starts in the air: one in three starts parked at
    // its origin, part-way through its turnaround, so the sky is not a
    // constant stream of planes all buzzing the same legs at once.
    const startsParked = index % 3 === 2;
    // Longer turnaround (45-70 s) also eases the runway: with 10 aircraft
    // on a single runway, a short turnaround would have a landing or a
    // takeoff every few seconds, more than one runway can handle.
    const parkedDuration = 45 + Math.random() * 25;

    const agent: AirAgent = {
      object,
      route,
      origin,
      destination,
      distance,
      t: startsParked ? 0 : 0.3 + ((index * 0.173) % 0.4),
      speed: startsParked ? 0 : 110,
      speedFactor: 0.94 + ((index * 37) % 11) / 100,
      altitude: startsParked ? origin.elevation + 2 : origin.elevation + 2,
      navRoute,
      navIndex: 1,
      wingspan: spec.wingspan,
      length: spec.length,
      placeholder: object.userData.placeholder as THREE.Object3D | undefined,
      phase: startsParked ? 'parked' : 'airborne',
      phaseTime: startsParked ? Math.random() * parkedDuration : 0,
      yaw: startsParked ? Math.PI / 2 : headingToYaw(origin.headingDeg),
      pitch: 0,
      parkedDuration,
      index,
      taxiFrom: new THREE.Vector3(),
      taxiTo: new THREE.Vector3(),
      taxiMid: new THREE.Vector3(),
      runwayFor: null,
      gateId:
        startsParked && origin.code === HOME_AIRPORT.code
          ? HOME_GATE_IDS[index % HOME_GATE_IDS.length]
          : null,
      stand: standPosition(destination, index),
      holdingCenter: new THREE.Vector3(),
      holdingAngle: 0,
      holdingLevel: 0
    };

    this.scene.add(object);
    this.agents.push(agent);
    if (startsParked) {
      // Reserve a real MEX gate if the shared controller exists, so a
      // TrafficManager aircraft cannot be assigned the same stand.
      let stand = standPosition(origin, index);
      if (origin.code === HOME_AIRPORT.code && this.shared) {
        for (let k = 0; k < HOME_GATE_IDS.length; k++) {
          const gateId = HOME_GATE_IDS[(index + k) % HOME_GATE_IDS.length];
          if (this.shared.requestGate(gateId, `route-${index}`)) {
            agent.gateId = gateId;
            stand = standForGate(gateId, origin.elevation);
            break;
          }
        }
      }
      agent.stand = stand;
      object.position.copy(stand);
      object.position.y = origin.elevation + 2;
      object.rotation.set(0, agent.yaw, 0, 'YXZ');
    } else {
      this.placeOnRoute(agent, agent.t);
    }
  }

  /* ---------------------------- model loading --------------------------- */

  private loadModel(path: string): Promise<THREE.Object3D> {
    const cached = this.glbCache.get(path);
    if (cached) return cached;

    const promise = new Promise<THREE.Object3D>((resolve, reject) => {
      new GLTFLoader().load(path, (gltf) => resolve(gltf.scene), undefined, reject);
    });
    this.glbCache.set(path, promise);
    promise.catch(() => this.glbCache.delete(path));
    return promise;
  }

  /**
   * The GLBs are authored nose-along-+X. Rotate them so the nose points +Z,
   * scale to the catalogue size, tint with the livery and sit them on Y=0.
   */
  private prepareModel(source: THREE.Object3D, spec: FleetSpec, livery: number): THREE.Group {
    const model = source.clone(true);
    const liveryColor = new THREE.Color(livery);

    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const cloned = materials.map((material) => {
        const m = material.clone() as THREE.MeshStandardMaterial;
        // Strong tint: the GLB textures are light grey/white, and a 0.28
        // blend left them looking blank white. 0.65 keeps the texture
        // detail but makes the airline colour actually visible.
        if (m.color) m.color.lerp(liveryColor, m.map ? 0.65 : 0.8);
        // At night, feed the livery-tinted albedo back as a weak emissive
        // map: the texture (windows, panels, titles) stays visible instead
        // of the whole aircraft clipping to a black silhouette.
        if (m.map) {
          m.emissiveMap = m.map;
          if (m.emissive) m.emissive.copy(m.color).multiplyScalar(0.85);
          m.emissiveIntensity = 0.26;
          m.needsUpdate = true;
        } else if (m.emissive) {
          m.emissive.copy(m.color).multiplyScalar(0.3);
        }
        m.envMapIntensity = 1.1;
        return m;
      });
      mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
    });

    model.rotation.set(0, -Math.PI / 2, 0);
    model.scale.setScalar(spec.glbScale);
    model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;

    const wrapper = new THREE.Group();
    wrapper.add(model);
    return wrapper;
  }

  private buildModel(spec: FleetSpec, livery: number): THREE.Group {
    const holder = new THREE.Group();

    // Cheap stand-in so the plane exists immediately while the GLB loads.
    const placeholder = createProceduralAircraft(spec, livery);
    placeholder.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
    holder.add(placeholder);
    holder.userData.placeholder = placeholder;

    if (spec.modelPath) {
      this.loadModel(spec.modelPath)
        .then((source) => {
          if (this.disposed) return;
          const detailed = this.prepareModel(source, spec, livery);
          holder.remove(placeholder);
          holder.userData.placeholder = undefined;
          this.disposeObject(placeholder);
          holder.add(detailed);
        })
        .catch(() => {
          // Keep the procedural placeholder; flying traffic must never break.
        });
    }

    return holder;
  }

  /* --------------------------- route following -------------------------- */

  /** Put the aircraft at a fractional position along its node route. */
  private placeOnRoute(agent: AirAgent, t: number) {
    const route = agent.navRoute;
    if (route.length < 2) return;
    const clamped = THREE.MathUtils.clamp(t, 0, 0.85);
    const f = clamped * (route.length - 1);
    const i = Math.min(route.length - 2, Math.floor(f));
    const frac = f - i;
    const from = route[i].position;
    const to = route[i + 1].position;
    agent.object.position.lerpVectors(from, to, frac);
    agent.navIndex = i + 1;
    agent.altitude = agent.object.position.y;
    agent.speed = route[i + 1].speed;
    const dir = to.clone().sub(from);
    agent.yaw = Math.atan2(dir.x, dir.z);
    agent.t = clamped;
    agent.object.rotation.set(0, agent.yaw, 0, 'YXZ');
  }

  /**
   * Fly one frame towards a route node. Returns true when the node is
   * reached, so the caller can advance to the next one.
   */
  private flyToNode(agent: AirAgent, node: AirNode, dt: number): boolean {
    const target = node.position;
    const delta = target.clone().sub(agent.object.position);
    delta.y = 0;
    const distance = delta.length();

    // Accelerate or slow down towards the speed of the next node, with a
    // small per-aircraft factor so two flights on the same leg do not fly
    // in a perfectly locked formation forever.
    const targetSpeed = node.speed * agent.speedFactor;
    agent.speed += THREE.MathUtils.clamp(targetSpeed - agent.speed, -6 * dt, 5 * dt);

    const step = Math.max(0.5, agent.speed) * dt;
    if (distance > 0.001) {
      const dir = delta.normalize();
      agent.object.position.addScaledVector(dir, Math.min(step, distance));
      // The nose always points at the node, so it can never fly sideways.
      agent.yaw = lerpAngle(agent.yaw, Math.atan2(dir.x, dir.z), Math.min(1, dt * 2));
    }

    // Altitude moves towards the node altitude at 12 m/s up / 14 m/s down,
    // so the aircraft never climbs or drops like a helicopter.
    const prevAltitude = agent.altitude;
    agent.altitude += THREE.MathUtils.clamp(target.y - agent.altitude, -14 * dt, 12 * dt);
    const verticalSpeed = dt > 0 ? (agent.altitude - prevAltitude) / dt : 0;
    const targetPitch = THREE.MathUtils.clamp(
      Math.atan2(verticalSpeed, Math.max(1, agent.speed)),
      -0.15,
      0.15
    );
    agent.pitch = THREE.MathUtils.lerp(agent.pitch, targetPitch, Math.min(1, dt * 2));

    agent.object.position.y = agent.altitude;
    agent.object.rotation.set(agent.pitch, agent.yaw, 0, 'YXZ');
    // Never hide the airframe: hiding/revealing was what made aircraft appear
    // out of nowhere near the airports.
    agent.object.visible = true;

    return distance <= step + 1;
  }

  /** Divert to the holding fix of the destination and orbit there. */
  private beginHolding(agent: AirAgent) {
    const hold = this.network.get(`HOLD-${agent.destination.code}`);
    agent.phase = 'holding';
    agent.phaseTime = 0;
    agent.runwayFor = null;

    // Pick the lowest stack level free at this destination, so two
    // aircraft waiting for the same runway never orbit the same circle
    // at the same altitude.
    const used = new Set<number>();
    for (const other of this.agents) {
      if (other === agent || other.phase !== 'holding') continue;
      if (other.destination.code !== agent.destination.code) continue;
      used.add(other.holdingLevel);
    }
    let level = 0;
    while (level < 3 && used.has(level)) level++;
    agent.holdingLevel = level;

    if (hold) {
      agent.holdingCenter.copy(hold.position);
      agent.navRoute = [hold];
      agent.navIndex = 0;
    } else {
      agent.holdingCenter.set(
        agent.destination.x,
        agent.destination.elevation + 400,
        agent.destination.z
      );
    }
    agent.holdingAngle = Math.atan2(
      agent.object.position.x - agent.holdingCenter.x,
      agent.object.position.z - agent.holdingCenter.z
    );
  }

  /** Touchdown: hand the aircraft over to the rollout phase. */
  private beginLanding(agent: AirAgent) {
    agent.phase = 'landing';
    agent.phaseTime = 0;
    agent.speed = 65;
    agent.altitude = agent.destination.elevation + 2;
    agent.t = 1;
    agent.object.position.set(
      agent.destination.x,
      agent.altitude,
      agent.destination.z
    );
    agent.object.rotation.set(0, agent.yaw, 0, 'YXZ');
  }

  /**
   * Start the return leg. Only called after the aircraft has landed,
   * taxied to a stand and waited out its turnaround — never in mid-air.
   */
  private startReturnLeg(agent: AirAgent) {
    // Leaving the stand frees its MEX gate for another aircraft.
    if (this.shared && agent.gateId !== null) {
      this.shared.releaseGate(`route-${agent.index}`);
      agent.gateId = null;
    }
    const previousOrigin = agent.origin;
    agent.origin = agent.destination;
    agent.destination = previousOrigin;
    agent.route = {
      ...agent.route,
      origin: agent.origin.code,
      destination: agent.destination.code
    };
    agent.distance = Math.max(
      1,
      Math.hypot(
        agent.destination.x - agent.origin.x,
        agent.destination.z - agent.origin.z
      )
    );
    agent.t = 0;
    agent.speed = 0;
    agent.altitude = agent.origin.elevation + 2;
    agent.runwayFor = null;
    agent.stand = standPosition(agent.destination, agent.index);
    agent.navRoute =
      this.network.findFlightRoute(agent.origin.code, agent.destination.code) ?? [];
    agent.navIndex = 1;
    agent.parkedDuration = 30 + Math.random() * 20;
    // Taxi out to a queue spot beside the runway, not to the exact same
    // point as every other aircraft. At MEX the spots sit on Alpha, outside
    // the runway; a slot already claimed by another taxiing departure is
    // skipped so two aircraft never share a stand-in point.
    const yaw = headingToYaw(agent.origin.headingDeg);
    if (agent.origin.code === HOME_AIRPORT.code) {
      const used = new Set<number>();
      for (const other of this.agents) {
        if (other === agent || other.origin.code !== HOME_AIRPORT.code) continue;
        if (other.phase !== 'taxiOut') continue;
        used.add(Math.round((QUEUE_Z_FIRST - other.taxiTo.z) / QUEUE_Z_SPACING));
      }
      let slot = 0;
      while (slot < QUEUE_SLOTS - 1 && used.has(slot)) slot++;
      agent.taxiFrom.copy(agent.object.position);
      agent.taxiTo.set(
        QUEUE_X,
        agent.origin.elevation + 2,
        QUEUE_Z_FIRST - slot * QUEUE_Z_SPACING
      );
    } else {
      const perpX = Math.cos(yaw);
      const perpZ = -Math.sin(yaw);
      const slot = (agent.index % 4) - 1.5;
      agent.taxiFrom.copy(agent.object.position);
      agent.taxiTo.set(
        agent.origin.x + perpX * slot * 45,
        agent.origin.elevation + 2,
        agent.origin.z + perpZ * slot * 45
      );
    }
    agent.phase = 'taxiOut';
    agent.phaseTime = 0;
  }

  /** Update the single Points cloud that draws all navigation lights. */
  private updateNavLights() {
    const position = this.navPositions;
    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];
      const p = agent.object.position;
      const yaw = agent.object.rotation.y;
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);
      const forwardX = Math.sin(yaw);
      const forwardZ = Math.cos(yaw);
      const halfSpan = agent.wingspan * 0.5;
      const base = i * 9;

      // Left wingtip (red).
      position[base] = p.x - rightX * halfSpan;
      position[base + 1] = p.y + 2.2;
      position[base + 2] = p.z - rightZ * halfSpan;
      // Right wingtip (green).
      position[base + 3] = p.x + rightX * halfSpan;
      position[base + 4] = p.y + 2.2;
      position[base + 5] = p.z + rightZ * halfSpan;
      // Tail beacon (white).
      position[base + 6] = p.x - forwardX * agent.length * 0.35;
      position[base + 7] = p.y + 4.5;
      position[base + 8] = p.z - forwardZ * agent.length * 0.35;
    }
    (this.navGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number) {
    for (const agent of this.agents) {
      agent.phaseTime += dt;

      switch (agent.phase) {
        case 'airborne': {
          // The takeoff lock is released once the aircraft has flown past
          // its departure fix (navIndex >= 2). The landing lock is released
          // after rollout. Both windows are kept short on purpose: the
          // runway is the bottleneck, and holding it for the whole
          // climb/descent would queue every other aircraft for minutes.
          if (agent.runwayFor === 'takeoff' && agent.navIndex >= 2 && this.runwayLock()) {
            this.runwayLock()!.release(`route-${agent.index}`);
            agent.runwayFor = null;
          }

          const target = agent.navRoute[agent.navIndex];
          if (!target) {
            // Defensive: a leg without a route still has to terminate.
            this.beginLanding(agent);
            break;
          }

          // The shared controller models MEX's single runway. Remote
          // airports have their own runway, so only MEX arrivals queue on
          // it: otherwise a departure from CUN would block a landing at
          // MEX even though the two runways are thousands of km apart.
          if (
            (target.type === 'final' || target.type === 'runway') &&
            agent.runwayFor !== 'landing' &&
            this.runwayLock() &&
            agent.destination.code === HOME_AIRPORT.code
          ) {
            if (!this.runwayLock()!.request(`route-${agent.index}`, 'arrival')) {
              this.beginHolding(agent);
              break;
            }
            agent.runwayFor = 'landing';
          }

          if (this.flyToNode(agent, target, dt)) {
            if (target.type === 'runway' && target.airportCode === agent.destination.code) {
              this.beginLanding(agent);
              break;
            }
            agent.navIndex = Math.min(agent.navIndex + 1, agent.navRoute.length - 1);
          }
          agent.t =
            agent.navRoute.length > 1 ? agent.navIndex / (agent.navRoute.length - 1) : 0;
          break;
        }

        case 'holding': {
          // Fly to the holding fix first, then orbit it while the runway
          // is busy. The holding fix is a real node in the air network, so
          // the aircraft can rejoin the arrival route from it (HOLD -> ARR
          // -> FINAL -> RUNWAY) as soon as the runway is granted.
          // Holding stack: up to four levels and four orbit radii, so
          // aircraft waiting for the same runway never share the same
          // circle or the same altitude (a real stack is vertically
          // separated too). The level is assigned when entering the hold.
          const stack = THREE.MathUtils.clamp(agent.holdingLevel, 0, 3);
          const orbitRadius = 360 + stack * 100;
          const stackAltitude = agent.holdingCenter.y + stack * 110;
          const offset = agent.object.position.clone().sub(agent.holdingCenter);
          offset.y = 0;
          const distance = offset.length();
          const speed = Math.max(60, agent.speed);

          if (distance > orbitRadius + 150) {
            // Head towards the holding fix, adjusting the orbit angle so
            // the entry is tangential instead of straight through it.
            const dir = offset.normalize();
            const step = Math.min(speed * dt, distance - orbitRadius);
            agent.object.position.addScaledVector(dir, -step);
            agent.yaw = lerpAngle(
              agent.yaw,
              Math.atan2(-dir.x, -dir.z),
              Math.min(1, dt * 1.5)
            );
            agent.holdingAngle = Math.atan2(
              agent.object.position.x - agent.holdingCenter.x,
              agent.object.position.z - agent.holdingCenter.z
            );
          } else {
            agent.holdingAngle += (speed / orbitRadius) * dt;
            const targetX =
              agent.holdingCenter.x + Math.sin(agent.holdingAngle) * orbitRadius;
            const targetZ =
              agent.holdingCenter.z + Math.cos(agent.holdingAngle) * orbitRadius;
            // Ease onto the circle instead of teleporting onto it at the
            // moment the aircraft enters the holding area.
            const blend = Math.min(1, dt * 2.5);
            agent.object.position.x += (targetX - agent.object.position.x) * blend;
            agent.object.position.z += (targetZ - agent.object.position.z) * blend;
            const tangentYaw = Math.atan2(
              Math.cos(agent.holdingAngle),
              -Math.sin(agent.holdingAngle)
            );
            agent.yaw = lerpAngle(agent.yaw, tangentYaw, Math.min(1, dt * 1.5));
          }

          // Climb/descend towards this aircraft's stack altitude at a
          // limited rate.
          agent.altitude += THREE.MathUtils.clamp(
            stackAltitude - agent.altitude,
            -14 * dt,
            12 * dt
          );
          agent.object.position.y = agent.altitude;
          agent.speed += THREE.MathUtils.clamp(90 - agent.speed, -6 * dt, 5 * dt);
          agent.pitch = THREE.MathUtils.lerp(agent.pitch, 0, Math.min(1, dt * 2));
          agent.object.rotation.set(agent.pitch, agent.yaw, 0, 'YXZ');
          agent.object.visible = true;

          // Retry every frame: the first holding aircraft to get the
          // runway rejoins the approach, the rest keep orbiting.
          if (
            this.runwayLock() &&
            agent.runwayFor !== 'landing' &&
            this.runwayLock()!.request(`route-${agent.index}`, 'arrival')
          ) {
            const holdId = `HOLD-${agent.destination.code}`;
            const route =
              this.network.findRoute(holdId, `RUNWAY-${agent.destination.code}`) ?? [];
            if (route.length >= 2) {
              agent.runwayFor = 'landing';
              agent.navRoute = route;
              agent.navIndex = 1;
              agent.phase = 'airborne';
              agent.phaseTime = 0;
              agent.t = 0;
            } else {
              // Should never happen with a validated network, but a locked
              // runway without a route would deadlock the airport.
              this.runwayLock()!.release(`route-${agent.index}`);
            }
          }
          break;
        }

        case 'landing': {
          // Rollout along the destination runway heading, slowing down.
          const runwayYaw = headingToYaw(agent.destination.headingDeg);
          agent.yaw = lerpAngle(agent.yaw, runwayYaw, Math.min(1, dt * 2));
          agent.pitch = THREE.MathUtils.lerp(agent.pitch, 0, Math.min(1, dt * 2));
          agent.speed = Math.max(0, agent.speed - 12 * dt);
          agent.object.position.x += Math.sin(agent.yaw) * agent.speed * dt;
          agent.object.position.z += Math.cos(agent.yaw) * agent.speed * dt;
          agent.object.position.y = agent.destination.elevation + 2;
          agent.object.rotation.set(agent.pitch, agent.yaw, 0, 'YXZ');
          if (agent.phaseTime > 6 || agent.speed <= 0) {
            // Clear of the runway: release it, then taxi to a stand.
            // At MEX, reserve a real gate so no other aircraft (ground
            // or air traffic) parks on top of this one.
            if (this.runwayLock() && agent.runwayFor === 'landing') {
              this.runwayLock()!.release(`route-${agent.index}`);
              agent.runwayFor = null;
            }
            let stand = standPosition(agent.destination, agent.index);
            if (agent.destination.code === HOME_AIRPORT.code && this.shared) {
              for (let k = 0; k < HOME_GATE_IDS.length; k++) {
                const gateId = HOME_GATE_IDS[(agent.index + k) % HOME_GATE_IDS.length];
                if (this.shared.requestGate(gateId, `route-${agent.index}`)) {
                  agent.gateId = gateId;
                  stand = standForGate(gateId, agent.destination.elevation);
                  break;
                }
              }
            }
            agent.stand = stand;
            agent.taxiFrom.copy(agent.object.position);
            agent.taxiTo.copy(stand);
            // At MEX the arrival leaves the runway onto Alpha first, then
            // taxis to its stand: the old straight line drove the aircraft
            // up the centreline while the runway had already been released.
            if (agent.destination.code === HOME_AIRPORT.code) {
              agent.taxiMid.set(
                72,
                agent.destination.elevation + 2,
                THREE.MathUtils.clamp(agent.object.position.z, -1080, 1080)
              );
            } else {
              agent.taxiMid.copy(agent.object.position);
            }
            agent.phase = 'taxiIn';
            agent.phaseTime = 0;
          }
          break;
        }

        case 'taxiIn': {
          const k = smoothstep(0, 9, agent.phaseTime);
          // Two-leg taxi: runway -> Alpha exit -> stand.
          if (k < 0.5) {
            agent.object.position.lerpVectors(agent.taxiFrom, agent.taxiMid, k * 2);
          } else {
            agent.object.position.lerpVectors(agent.taxiMid, agent.taxiTo, (k - 0.5) * 2);
          }
          agent.object.position.y = agent.destination.elevation + 2;
          agent.yaw = lerpAngle(agent.yaw, Math.PI / 2, Math.min(1, dt * 1.5));
          agent.pitch = 0;
          agent.object.rotation.set(0, agent.yaw, 0, 'YXZ');
          if (agent.phaseTime >= 9) {
            agent.phase = 'parked';
            agent.phaseTime = 0;
          }
          break;
        }

        case 'parked': {
          // Turnaround: the aircraft waits at the stand (unload / load).
          // It does not move, it does not turn, it does not take off early.
          // Note: do not touch position.y here — a parked aircraft that
          // spawned at its origin sits at the origin elevation, not the
          // destination elevation.
          agent.object.rotation.set(0, agent.yaw, 0, 'YXZ');
          if (agent.phaseTime >= agent.parkedDuration) {
            this.startReturnLeg(agent);
          }
          break;
        }

        case 'taxiOut': {
          const k = smoothstep(0, 9, agent.phaseTime);
          agent.object.position.lerpVectors(agent.taxiFrom, agent.taxiTo, k);
          agent.object.position.y = agent.origin.elevation + 2;
          agent.yaw = lerpAngle(
            agent.yaw,
            headingToYaw(agent.origin.headingDeg),
            Math.min(1, dt * 1.5)
          );
          agent.pitch = 0;
          agent.object.rotation.set(0, agent.yaw, 0, 'YXZ');
          if (agent.phaseTime >= 9) {
            // MEX departures also need the shared runway; remote airports
            // have their own runway and do not queue on the MEX one.
            if (agent.origin.code === HOME_AIRPORT.code && this.runwayLock()) {
              if (
                agent.runwayFor !== 'takeoff' &&
                !this.runwayLock()!.request(`route-${agent.index}`, 'departure')
              ) {
                // Keep waiting on the queue spot, outside the runway.
                agent.phaseTime = 9;
                break;
              }
              agent.runwayFor = 'takeoff';
              // Cleared: roll from the queue spot onto the threshold
              // centreline, then start the takeoff run.
              agent.taxiFrom.copy(agent.object.position);
              agent.taxiTo.set(
                agent.origin.x,
                agent.origin.elevation + 2,
                agent.origin.z + 1150
              );
              agent.phase = 'lineup';
              agent.phaseTime = 0;
              break;
            }
            agent.phase = 'airborne';
            agent.phaseTime = 0;
            agent.t = 0;
            agent.speed = 35;
            // Start the leg on the departure runway: the first thing the
            // aircraft flies to is the departure fix. Do not snap the
            // position, so the queue spot is respected (no teleport).
            agent.navRoute =
              this.network.findFlightRoute(agent.origin.code, agent.destination.code) ??
              agent.navRoute;
            agent.navIndex = 1;
            const startNode = agent.navRoute[0];
            agent.altitude = startNode
              ? startNode.position.y
              : agent.origin.elevation + 2;
            agent.object.position.y = agent.altitude;
          }
          break;
        }

        case 'lineup': {
          // Line up and wait on the threshold, then roll down the runway.
          // The roll takes 6 s and the aircraft then holds for 3 s.
          const k = smoothstep(0, 6, Math.min(agent.phaseTime, 6));
          agent.object.position.lerpVectors(agent.taxiFrom, agent.taxiTo, k);
          agent.object.position.y = agent.origin.elevation + 2;
          agent.yaw = lerpAngle(
            agent.yaw,
            headingToYaw(agent.origin.headingDeg),
            Math.min(1, dt * 1.5)
          );
          agent.pitch = 0;
          agent.object.rotation.set(0, agent.yaw, 0, 'YXZ');
          if (agent.phaseTime >= 9) {
            agent.phase = 'airborne';
            agent.phaseTime = 0;
            agent.t = 0;
            agent.speed = 35;
            agent.navRoute =
              this.network.findFlightRoute(agent.origin.code, agent.destination.code) ??
              agent.navRoute;
            agent.navIndex = 1;
            const startNode = agent.navRoute[0];
            agent.altitude = startNode
              ? startNode.position.y
              : agent.origin.elevation + 2;
            agent.object.position.y = agent.altitude;
          }
          break;
        }
      }
    }
    this.updateNavLights();
  }

  /* ------------------------------- cleanup ------------------------------ */

  private disposeObject(object: THREE.Object3D) {
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
  }

  dispose() {
    this.disposed = true;
    this.scene.remove(this.navPoints);
    this.navGeometry.dispose();
    (this.navMaterial.map as THREE.Texture | null)?.dispose();
    this.navMaterial.dispose();
    for (const agent of this.agents) {
      if (this.shared) {
        this.runwayLock()?.release(`route-${agent.index}`);
        this.shared.releaseGate(`route-${agent.index}`);
      }
      this.scene.remove(agent.object);
      this.disposeObject(agent.object);
    }
    this.agents = [];
  }
}
