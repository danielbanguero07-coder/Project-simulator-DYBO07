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

/**
 * Air-route traffic.
 *
 * Aircraft fly between the airports in `airports.ts`. They follow straight
 * segments (the world is small enough that great-circle curvature is
 * irrelevant), climb after departure and descend into the destination, and
 * pick a new route once they reach the other end.
 *
 * Everything uses the same "nose points +Z, yaw rotates it" convention as the
 * rest of the simulation.
 */

interface AirAgent {
  object: THREE.Group;
  route: { origin: string; destination: string; distanceKm: number; cargo: boolean };
  origin: AirportDefinition;
  destination: AirportDefinition;
  distance: number;
  /** Progress along the leg, 0 (origin) .. 1 (destination). */
  t: number;
  /** Cruise speed in metres per second. */
  speed: number;
  cruiseAltitude: number;
  /** Used to place the red/green wingtip lights. */
  wingspan: number;
  length: number;
  placeholder?: THREE.Object3D;
}

export interface RouteTrafficOptions {
  premium?: boolean;
  count?: number;
}

const SPEC_POOL = ['A320', 'B737', 'A321', 'A350', 'B787', 'A380'];

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

  constructor(scene: THREE.Scene, options: RouteTrafficOptions = {}) {
    this.scene = scene;
    this.premium = options.premium ?? true;
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

  /** Number of aircraft currently in the air (handy for the HUD/tests). */
  get count(): number {
    return this.agents.length;
  }

  /** Live snapshot for the debug console. */
  snapshot() {
    return this.agents.map((agent) => ({
      flight: `${agent.origin.code}-${agent.destination.code}`,
      t: Number(agent.t.toFixed(3)),
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
    const cruiseAltitude = Math.min(3400, Math.max(1100, distance * 0.26));

    const livery = pickLivery(spec);
    const object = this.buildModel(spec, livery);
    object.rotation.order = 'YXZ';

    // Distribute the fleet along its legs instead of dropping several planes
    // at low altitude over the departure airport. 0.30..0.70 keeps the initial
    // traffic at cruise, far from the player and from each other.
    const initialT = 0.3 + ((index * 0.173) % 0.4);

    const agent: AirAgent = {
      object,
      route,
      origin,
      destination,
      distance,
      t: initialT,
      speed: 165 + Math.random() * 95,
      cruiseAltitude,
      wingspan: spec.wingspan,
      length: spec.length,
      placeholder: object.userData.placeholder as THREE.Object3D | undefined
    };

    this.scene.add(object);
    this.agents.push(agent);
    this.applyTransform(agent, 0, true);
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
        if (m.color) m.color.lerp(liveryColor, m.map ? 0.28 : 0.75);
        // A faint self-lit component keeps airliners from turning into pure
        // black bird-like silhouettes at night.
        if (m.emissive) m.emissive.copy(m.color).multiplyScalar(0.12);
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

  /* ------------------------------- motion ------------------------------- */

  private altitudeAt(agent: AirAgent, t: number): number {
    const clamped = THREE.MathUtils.clamp(t, 0, 1);
    const arc = Math.sin(Math.PI * clamped);
    // Ground-to-cruise profile: flat at the runway, steep in the middle. The
    // aircraft is always visible, so it takes off instead of popping into the
    // sky at altitude.
    return (
      agent.origin.elevation +
      (agent.destination.elevation - agent.origin.elevation) * clamped +
      2 +
      agent.cruiseAltitude * Math.pow(arc, 1.6)
    );
  }

  private applyTransform(agent: AirAgent, dt: number, immediate = false) {
    const { origin, destination } = agent;
    const t = agent.t;

    const x = origin.x + (destination.x - origin.x) * t;
    const z = origin.z + (destination.z - origin.z) * t;
    const altitude = this.altitudeAt(agent, t);

    const eps = 0.002;
    const altAhead = this.altitudeAt(agent, THREE.MathUtils.clamp(t + eps, 0, 1));
    const verticalSpeed = (altAhead - altitude) / (eps * agent.distance);
    const pitch = THREE.MathUtils.clamp(-Math.atan(verticalSpeed), -0.35, 0.35);

    const dirX = destination.x - origin.x;
    const dirZ = destination.z - origin.z;
    const yaw = Math.atan2(dirX, dirZ);

    agent.object.position.set(x, altitude, z);
    agent.object.rotation.set(pitch, yaw, 0, 'YXZ');
    // Never hide the airframe: hiding/revealing was what made aircraft appear
    // out of nowhere near the airports.
    agent.object.visible = true;
    void dt;
    void immediate;
  }

  private nextRoute(agent: AirAgent) {
    // Fly the same leg back instead of teleporting to MEX. The aircraft is at
    // the destination threshold when this runs, so t=0 keeps it in place and
    // it climbs out on the return trip.
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
    agent.cruiseAltitude = Math.min(3400, Math.max(1100, agent.distance * 0.26));
    agent.t = 0;
    agent.speed = 165 + Math.random() * 95;
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
      const step = (agent.speed / agent.distance) * dt;
      agent.t += step;

      if (agent.t >= 1) {
        // Reached the destination: turn around and fly the return leg.
        agent.t = 0;
        this.nextRoute(agent);
      }

      this.applyTransform(agent, dt);
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
      this.scene.remove(agent.object);
      this.disposeObject(agent.object);
    }
    this.agents = [];
  }
}
