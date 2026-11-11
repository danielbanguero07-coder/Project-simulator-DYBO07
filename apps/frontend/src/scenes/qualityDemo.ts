import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TextureStreamer, type TextureQualityCap } from './textureStreaming';
import { WorldManager } from './worldManager';
import { TrafficManager, type PathNode } from './trafficManager';
import { buildAirportGroundNetwork, validateGroundNetwork, AIRPORT_LAYOUT } from './groundNetwork';
import { createRunwayLights, createTaxiwayLights, createJetwayLights, createHoldLights } from './airportLights';
import { createHomeAirportSigns } from './airportSigns';
import { updateLighting, animateLights, setPapiGroup, registerEditableLight } from './lightController';
import { ScheduleManager } from './scheduleManager';
import { TimeManager } from './timeSystem';
import {
  makeAsphaltCanvas,
  makeConcreteCanvas,
  makeWindowCanvas,
  makeJetwayCanvas
} from './airportTextures';
import { buildWorld } from './worldGenerator';
import { RouteTraffic } from './airRoutes';
import { SharedAirport } from './runwayControl';
import { ALL_AIRPORTS, HOME_AIRPORT, ROUTES } from './airports';

export type QualityTier = 2 | 3;

export interface DemoStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  gpu?: string;
  integratedGpu?: boolean;
  renderScale?: number;
  stream?: any;
}

export interface QualityDemoHandle {
  dispose: () => void;
  setTextureQuality: (cap: TextureQualityCap) => void;
  updateAircraft: (pos: THREE.Vector3, rot: THREE.Euler, gear: boolean) => void;
  setCameraTarget: (target: THREE.Vector3) => void;
  /** Terrain height in metres, including the flattened airport pads. */
  heightAt: (x: number, z: number) => number;
  /** Fly the free camera to an airport of the world catalogue. */
  focusAirport: (x: number, z: number, elevation: number) => void;
  setCameraMode: (mode: 'AIRCRAFT_FOLLOW' | 'FREE_ORBIT' | 'COCKPIT_VIEW' | 'PARKING_VIEW') => void;
  getCameraMode: () => string;
  setTime: (hour: number) => void;
  getTime: () => number;
  getPhase: () => string;
}

type CameraMode = 'AIRCRAFT_FOLLOW' | 'FREE_ORBIT' | 'COCKPIT_VIEW' | 'PARKING_VIEW';

export function createQualityDemo(
  container: HTMLElement,
  tier: QualityTier,
  onStats?: (stats: DemoStats) => void
): QualityDemoHandle {
  const premium = tier === 3;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fb7d8);

  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 1, 26000);
  camera.position.set(140, 40, -900);

  const renderer = new THREE.WebGLRenderer({
    antialias: premium,
    powerPreference: 'high-performance',
    // The world spans 16 km with a 26 km far plane while the flat airport pad
    // sits only 0.6 m above the water plane. A linear depth buffer cannot
    // resolve that at high zoom and the two surfaces z-fight (blue stripes).
    // Logarithmic depth keeps the precision stable across the whole range.
    logarithmicDepthBuffer: true
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, premium ? 2 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = premium ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  // Optional HDR bloom for the night lights. Kept off on lower tiers.
  let composer: EffectComposer | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  if (premium) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.28,
      0.55,
      0.82
    );
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, -1080);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 12;
  controls.maxDistance = 22000;
  controls.update();

  const textureStreamer = new TextureStreamer({
    // ~4 GB of VRAM available: let the hero surfaces reach 4K and keep a 2K
    // floor so zooming out never collapses them back to a 256 px base.
    budgetBytes: (premium ? 3072 : 1280) * 1024 * 1024,
    maxConcurrent: premium ? 4 : 3
  });

  const timeManager = new TimeManager();
  // One shared runway/gate controller for both traffic systems: without
  // it, RouteTraffic and TrafficManager used the same runway and gates
  // independently, and several aircraft ended up on runway 36L at once.
  const sharedAirport = new SharedAirport();
  const trafficManager = new TrafficManager(scene, sharedAirport);
  const scheduleManager = new ScheduleManager(timeManager, trafficManager);
  const worldManager = new WorldManager(scene);

  // ===== LIGHTING =====
  const ambientLight = new THREE.AmbientLight(0xbcd3ea, 0.45);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xa9c9ff, 0x35301f, 0.45);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sunLight.position.set(300, 600, 200);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -600;
  sunLight.shadow.camera.right = 600;
  sunLight.shadow.camera.top = 600;
  sunLight.shadow.camera.bottom = -600;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 3000;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);

  // Night fill. When the sun is below the horizon there is no light source
  // aimed at the aircraft, so the liveries clamped to black and looked like
  // they had no textures at all. A cool, shadowless "moon" keeps the
  // airframes readable without breaking the night mood.
  const moonLight = new THREE.DirectionalLight(0x9db8e8, 0);
  moonLight.position.set(-6200, 5400, -9200);
  scene.add(moonLight);

  const airportLights: THREE.PointLight[] = [];
  const beaconLights: THREE.PointLight[] = [];

  // ===== SKY / FOG =====
  // A self-contained gradient dome is cheaper and far more predictable than
  // the atmospheric scattering shader, which can clip to white near noon.
  const skyTop = new THREE.Color(0x2f6fb0);
  const skyHorizon = new THREE.Color(0xcfe4f2);
  const skyBottom = new THREE.Color(0x7d8b98);
  const skyGeo = new THREE.SphereGeometry(15000, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: skyTop.clone() },
      horizonColor: { value: skyHorizon.clone() },
      bottomColor: { value: skyBottom.clone() }
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      void main() {
        float h = normalize(vDir).y;
        vec3 color;
        if (h >= 0.0) {
          color = mix(horizonColor, topColor, pow(h, 0.55));
        } else {
          color = mix(horizonColor, bottomColor, pow(-h, 0.5));
        }
        gl_FragColor = vec4(color, 1.0);
      }
    `
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.frustumCulled = false;
  skyDome.renderOrder = -1;
  scene.add(skyDome);

  // Aerial perspective. The old 0.00011 density saturated past ~12 km and
  // turned the zoomed-out map into flat haze; this keeps the ground readable
  // across the whole 22 km orbit range while still softening the horizon.
  const fog = new THREE.FogExp2(0x9fb9cf, 0.000045);
  scene.fog = fog;

  // ===== NIGHT SKY: STARS + MOON =====
  const starCount = premium ? 2200 : 800;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    // Even distribution over the upper hemisphere of a large sphere.
    const theta = Math.random() * Math.PI * 2;
    const y = Math.random() * 0.92 + 0.04;
    const r = Math.sqrt(1 - y * y);
    const radius = 13000;
    starPositions[i * 3] = Math.cos(theta) * r * radius;
    starPositions[i * 3 + 1] = y * radius;
    starPositions[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: 0xf4f7ff,
    size: premium ? 5.5 : 7,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.frustumCulled = false;
  scene.add(stars);

  const moonCanvas = document.createElement('canvas');
  moonCanvas.width = moonCanvas.height = 256;
  const moonCtx = moonCanvas.getContext('2d')!;
  const moonGlow = moonCtx.createRadialGradient(128, 128, 18, 128, 128, 128);
  moonGlow.addColorStop(0, 'rgba(255,255,245,1)');
  moonGlow.addColorStop(0.18, 'rgba(255,252,232,0.95)');
  moonGlow.addColorStop(0.45, 'rgba(210,224,255,0.22)');
  moonGlow.addColorStop(1, 'rgba(160,190,255,0)');
  moonCtx.fillStyle = moonGlow;
  moonCtx.fillRect(0, 0, 256, 256);
  const moonTexture = new THREE.CanvasTexture(moonCanvas);
  moonTexture.colorSpace = THREE.SRGBColorSpace;
  const moonMaterial = new THREE.SpriteMaterial({
    map: moonTexture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false
  });
  const moon = new THREE.Sprite(moonMaterial);
  moon.scale.set(1100, 1100, 1);
  moon.position.set(-6200, 5400, -9200);
  scene.add(moon);

  const dayColor = new THREE.Color(0xbcd9f2);
  const duskColor = new THREE.Color(0xe8a06a);
  const nightColor = new THREE.Color(0x070d1c);
  const dayTop = new THREE.Color(0x2f6fb0);
  const duskTop = new THREE.Color(0x354a78);
  const nightTop = new THREE.Color(0x02050d);
  const dayHorizon = new THREE.Color(0xd2e7f5);
  const nightHorizon = new THREE.Color(0x0b1424);
  const fogColor = new THREE.Color();
  const sunPos = new THREE.Vector3();

  const updateEnvironment = (hour: number) => {
  const elev = Math.sin(((hour - 6) / 12) * Math.PI);
  const daylight = THREE.MathUtils.clamp(elev, 0, 1);
  const twilight = THREE.MathUtils.clamp(1 - Math.abs(elev) * 6, 0, 1);
  const night = 1 - daylight;

  const phi = Math.PI / 2 - Math.asin(THREE.MathUtils.clamp(elev, -1, 1));
  sunPos.setFromSphericalCoords(1, phi, Math.PI * 0.32);
  sunLight.position.copy(sunPos).multiplyScalar(1800);

  fogColor.copy(nightColor).lerp(dayColor, daylight);
  fogColor.lerp(duskColor, twilight * 0.5);
  fog.color.copy(fogColor);
  scene.background = fogColor.clone();

  (skyMat.uniforms.topColor.value as THREE.Color)
    .copy(nightTop).lerp(dayTop, daylight).lerp(duskTop, twilight * 0.45);
  (skyMat.uniforms.horizonColor.value as THREE.Color)
    .copy(nightHorizon).lerp(dayHorizon, daylight).lerp(duskColor, twilight * 0.6);

  sunLight.intensity = 0.05 + daylight * 2.9;
  sunLight.color.setHSL(0.09, 0.35 * twilight, 0.5 + daylight * 0.5);
  // Night floor of ambient + moon: enough to read aircraft liveries and
  // runway markings from the air, still clearly darker than dusk.
  moonLight.intensity = night * 0.6;
  ambientLight.intensity = 0.15 + daylight * 0.43;
  ambientLight.color.setHSL(0.58, 0.35, 0.35 + daylight * 0.55);
  hemiLight.intensity = 0.13 + daylight * 0.47;

  // Sistema de iluminación dinámica.
  updateLighting(hour);

  for (const light of airportLights) light.intensity = 20 + night * 260;
  for (const light of beaconLights) light.intensity = 4 + night * 22;

  // Night sky + exposure: the moon and stars fade in after sunset and the
  // exposure lifts slightly so the apron lights read without washing out.
  renderer.toneMappingExposure = 0.92 + night * 0.42;
  if (bloomPass) bloomPass.strength = 0.16 + night * 0.42;
  starMaterial.opacity = Math.pow(night, 1.6) * 0.95;
  moonMaterial.opacity = THREE.MathUtils.clamp((night - 0.2) / 0.65, 0, 1) * 0.9;

  return daylight;
};

  // ===== STREAMED MATERIALS =====
  const asphaltMat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.05 });
  textureStreamer.register({
    id: 'asphalt',
    label: 'Asfalto Pista',
    levels: [512, 1024, 2048, 4096],
    minSize: 4096,
    generate: makeAsphaltCanvas,
    apply: (t) => { asphaltMat.map = t; asphaltMat.needsUpdate = true; },
    tileWorldSize: 20,
    distance: (c) => Math.abs(c.position.x),
    repeat: [3, 130],
    anisotropy: 16
  });

  const concreteMat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.05 });
  textureStreamer.register({
    id: 'concrete',
    label: 'Hormigón Plataforma',
    levels: [512, 1024, 2048, 4096],
    minSize: 4096,
    generate: makeConcreteCanvas,
    apply: (t) => { concreteMat.map = t; concreteMat.needsUpdate = true; },
    tileWorldSize: 25,
    distance: (c) => c.position.distanceTo(new THREE.Vector3(185, 0, 225)),
    repeat: [16, 52],
    anisotropy: 8
  });

  // ===== PROCEDURAL WORLD: TERRAIN, MOUNTAINS, RIVERS, ROADS, CITIES =====
  // Replaces the old flat grass plane. The home airport sits on a flattened
  // plateau at Y=0, so the runway/apron geometry above still lines up.
  const world = buildWorld(scene, {
    premium,
    textureStreamer,
    asphaltMaterial: asphaltMat,
    concreteMaterial: concreteMat
  });

  // ===== AIRPORT GEOMETRY =====
  // Runway 36L / 18R
  const runway = new THREE.Mesh(new THREE.PlaneGeometry(46, 2600), asphaltMat);
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(0, 0.06, 0);
  runway.receiveShadow = true;
  scene.add(runway);

  // Parallel taxiway Alpha: wide asphalt strip beside the runway, from
  // threshold to threshold.
  const alphaTaxiway = new THREE.Mesh(new THREE.PlaneGeometry(36, 2200), asphaltMat);
  alphaTaxiway.rotation.x = -Math.PI / 2;
  alphaTaxiway.position.set(AIRPORT_LAYOUT.taxiwayX, 0.062, 0);
  alphaTaxiway.receiveShadow = true;
  scene.add(alphaTaxiway);

  // Four long high-speed exits joining the runway edge to Alpha at 22 degrees.
  const exitRun = 52;
  const exitDrop = AIRPORT_LAYOUT.runwayExitDrop;
  const exitLength = Math.hypot(exitRun, exitDrop);
  AIRPORT_LAYOUT.runwayExitZ.forEach((z) => {
    const exit = new THREE.Mesh(new THREE.BoxGeometry(exitLength, 0.02, 34), asphaltMat);
    exit.position.set(20 + exitRun / 2, 0.066, z - exitDrop / 2);
    exit.rotation.y = Math.atan2(exitDrop, exitRun);
    exit.receiveShadow = true;
    scene.add(exit);
  });

  // Runway-end taxiway connectors: wide asphalt bands joining each runway
  // end to the Alpha threshold, so aircraft turn around on pavement instead
  // of grass (the ground graph already links these two nodes).
  for (const s of [1, -1]) {
    const start = new THREE.Vector2(0, 1150 * s);
    const end = new THREE.Vector2(72, 1100 * s);
    const connectorLength = start.distanceTo(end) + 12;
    const connector = new THREE.Mesh(
      new THREE.BoxGeometry(connectorLength, 0.02, 34),
      asphaltMat
    );
    connector.position.set((start.x + end.x) / 2, 0.064, (start.y + end.y) / 2);
    connector.rotation.y = -Math.atan2(end.y - start.y, end.x - start.x);
    connector.receiveShadow = true;
    scene.add(connector);
  }

  // Apron (concrete): starts at the east edge of Alpha and reaches the new
  // south remote stands. The extended north end covers the cargo ramp.
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(247, 1325), concreteMat);
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(213.5, 0.04, 102.5);
  apron.receiveShadow = true;
  scene.add(apron);

  // Cross taxilanes: wide asphalt entrance lanes from Alpha into the apron.
  AIRPORT_LAYOUT.crossTaxilaneZ.forEach((z) => {
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(80, 34), asphaltMat);
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(85, 0.07, z);
    lane.receiveShadow = true;
    scene.add(lane);
  });

  // Cargo ramp marking: a darker concrete band separates it from the
  // passenger apron visually.
  const cargoRamp = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 300),
    new THREE.MeshStandardMaterial({ color: 0x8f949a, roughness: 0.95, metalness: 0.03 })
  );
  cargoRamp.rotation.x = -Math.PI / 2;
  cargoRamp.position.set(210, 0.045, 640);
  cargoRamp.receiveShadow = true;
  scene.add(cargoRamp);

  // Runway centreline + threshold markings
  const paintMat = new THREE.MeshStandardMaterial({ color: 0xf2f2ea, roughness: 0.55 });
  for (let i = 0; i < 44; i++) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 22), paintMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.09, -1150 + i * 54);
    scene.add(dash);
  }
  for (let i = 0; i < 8; i++) {
    const x = -18 + i * 5.1;
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 26), paintMat);
    bar.rotation.x = -Math.PI / 2;
    bar.position.set(x, 0.09, -1235);
    scene.add(bar);
    const bar2 = bar.clone();
    bar2.position.z = 1235;
    scene.add(bar2);
  }

  // Aiming point: the big pair of bars 400 m from each threshold, distinct
  // from the touchdown-zone bars (300 m).
  for (const end of [750, -750]) {
    for (const sx of [-1, 1]) {
      const aiming = new THREE.Mesh(new THREE.PlaneGeometry(12, 50), paintMat);
      aiming.rotation.x = -Math.PI / 2;
      aiming.position.set(sx * 14, 0.09, end);
      scene.add(aiming);
    }
  }

  // Striped shoulders (blast pads) beside each runway end.
  const shoulderGeometry = new THREE.PlaneGeometry(2.2, 140);
  const shoulderPaint = new THREE.InstancedMesh(shoulderGeometry, paintMat, 16);
  const shoulderDummy = new THREE.Object3D();
  let shoulderIndex = 0;
  for (const end of [1220, -1220]) {
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        shoulderDummy.position.set(sx * (26 + i * 5), 0.088, end);
        shoulderDummy.rotation.set(-Math.PI / 2, 0, 0);
        shoulderDummy.updateMatrix();
        shoulderPaint.setMatrixAt(shoulderIndex++, shoulderDummy.matrix);
      }
    }
  }
  shoulderPaint.instanceMatrix.needsUpdate = true;
  scene.add(shoulderPaint);

  // ===== TAXIWAY PAINT =====
  // Yellow centreline dashes along Alpha, Bravo, the cross taxilanes and
  // the runway exits; plus hold-short bars at every runway entrance.
  const taxiPaint = new THREE.MeshStandardMaterial({ color: 0xe8bc26, roughness: 0.6 });
  const taxiDashGeometry = new THREE.BoxGeometry(0.7, 0.02, 10);
  const dashTransforms: { x: number; z: number; rot: number }[] = [];
  for (let z = -1100; z <= 1100; z += 22) {
    dashTransforms.push({ x: AIRPORT_LAYOUT.taxiwayX, z, rot: 0 });
  }
  for (let z = -560; z <= 780; z += 22) {
    dashTransforms.push({ x: AIRPORT_LAYOUT.taxilaneX, z, rot: 0 });
  }
  AIRPORT_LAYOUT.crossTaxilaneZ.forEach((z) => {
    for (let x = 45; x <= 125; x += 14) dashTransforms.push({ x, z, rot: Math.PI / 2 });
  });
  AIRPORT_LAYOUT.runwayExitZ.forEach((z) => {
    const rot = Math.atan2(exitRun, -exitDrop);
    for (let t = 0.12; t <= 0.92; t += 0.16) {
      dashTransforms.push({ x: 20 + exitRun * t, z: z - exitDrop * t, rot });
    }
  });

  const taxiDashes = new THREE.InstancedMesh(taxiDashGeometry, taxiPaint, dashTransforms.length);
  const paintDummy = new THREE.Object3D();
  dashTransforms.forEach((t, i) => {
    paintDummy.position.set(t.x, 0.1, t.z);
    paintDummy.rotation.set(0, t.rot, 0);
    paintDummy.updateMatrix();
    taxiDashes.setMatrixAt(i, paintDummy.matrix);
  });
  taxiDashes.instanceMatrix.needsUpdate = true;
  scene.add(taxiDashes);

  // Hold-short bars at the taxiway side of every runway entrance. They are
  // rotated so they cross the wide high-speed exit perpendicularly.
  const holdBarGeometry = new THREE.BoxGeometry(1.1, 0.02, 32);
  const holdBarAngle = Math.atan2(exitDrop, exitRun);
  const holdLightPositions: THREE.Vector3[] = [];
  AIRPORT_LAYOUT.runwayExitZ.forEach((z) => {
    [0.18, 0.28].forEach((t) => {
      const bar = new THREE.Mesh(holdBarGeometry, taxiPaint);
      const barX = 20 + exitRun * t;
      const barZ = z - exitDrop * t;
      bar.position.set(barX, 0.1, barZ);
      bar.rotation.y = holdBarAngle;
      scene.add(bar);
      holdLightPositions.push(new THREE.Vector3(barX, 0.9, barZ));
    });
  });

  // Runway holding position where each end connector meets the runway: a
  // double yellow bar across the connector, with red holding lights.
  const connectorBarGeometry = new THREE.BoxGeometry(1.1, 0.02, 34);
  for (const s of [1, -1]) {
    const start = new THREE.Vector2(0, 1150 * s);
    const end = new THREE.Vector2(72, 1100 * s);
    const dir = new THREE.Vector2(end.x - start.x, end.y - start.y).normalize();
    const perp = new THREE.Vector2(50 * s, 72).normalize();
    const barAngle = Math.atan2(perp.x, perp.y);
    [0.34, 0.37].forEach((t) => {
      const barX = start.x + dir.x * t * 87.66;
      const barZ = start.y + dir.y * t * 87.66;
      const bar = new THREE.Mesh(connectorBarGeometry, taxiPaint);
      bar.position.set(barX, 0.1, barZ);
      bar.rotation.y = barAngle;
      scene.add(bar);
      holdLightPositions.push(new THREE.Vector3(barX, 0.9, barZ));
    });
  }

  // Runway lighting (edge + thresholds + PAPI) is built by `airportLights.ts`
  // below, after the rest of the airport geometry.

  // ===== TERMINAL =====
  const windowCanvas = makeWindowCanvas(1024, 0.3);
  const windowTex = new THREE.CanvasTexture(windowCanvas);
  windowTex.colorSpace = THREE.SRGBColorSpace;
  windowTex.wrapS = windowTex.wrapT = THREE.RepeatWrapping;
  windowTex.repeat.set(16, 2);

  // Terminal material con emissive para iluminación nocturna: el mapa de
  // ventanas actúa también como emissiveMap, así solo las ventanas encendidas
  // brillan y la fachada permanece oscura.
  const terminalMat = new THREE.MeshStandardMaterial({
    map: windowTex,
    color: 0xd7dde4,
    roughness: 0.35,
    metalness: 0.25,
    emissive: 0xffd9a0,
    emissiveMap: windowTex,
    emissiveIntensity: 0
  });
  registerEditableLight(terminalMat, { color: 0xffd9a0, nightIntensity: 1.35 });

  const terminal = new THREE.Mesh(new THREE.BoxGeometry(80, 22, 640), terminalMat);
  terminal.position.set(215, 11, 115);
  terminal.castShadow = true;
  terminal.receiveShadow = true;
  scene.add(terminal);

  // Terminal roof with slight overhang
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(94, 2, 656),
    new THREE.MeshStandardMaterial({
      color: 0xb7c0c9,
      roughness: 0.6,
      emissive: 0x3a4752,
      emissiveIntensity: 0
    })
  );
  roof.position.set(215, 23, 115);
  roof.castShadow = true;
  scene.add(roof);

  // Control tower con emissive en ventanas y paneles.
  const towerBase = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 8, 34, 16),
    new THREE.MeshStandardMaterial({
      color: 0xe3e8ee,
      roughness: 0.6,
      emissive: 0x0a2636,
      emissiveIntensity: 0
    })
  );
  towerBase.position.set(268, 17, 52);
  towerBase.castShadow = true;
  scene.add(towerBase);

  const towerCab = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 8, 7, 12),
    new THREE.MeshStandardMaterial({
      color: 0x1f4a63,
      roughness: 0.15,
      metalness: 0.7,
      emissive: 0x02050d,
      emissiveIntensity: 0
    })
  );
  towerCab.position.set(268, 37, 52);
  towerCab.castShadow = true;
  scene.add(towerCab);

  // Hangar materials.
  const hangarMat = new THREE.MeshStandardMaterial({
    color: 0x9aa6ae,
    roughness: 0.7,
    metalness: 0.2,
    emissive: 0x000000,
    emissiveIntensity: 0
  });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.8 });

  // Hangars behind the terminal
  for (let i = 0; i < 3; i++) {
    const hangar = new THREE.Mesh(new THREE.BoxGeometry(95, 26, 70), hangarMat);
    hangar.position.set(330, 13, -200 + i * 90);
    hangar.castShadow = true;
    hangar.receiveShadow = true;
    scene.add(hangar);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(70, 20), doorMat);
    door.rotation.y = -Math.PI / 2;
    door.position.set(282.5, 10.5, -200 + i * 90);
    scene.add(door);
  }

  // Cargo hangars on the northern cargo ramp.
  const cargoHangarMat = new THREE.MeshStandardMaterial({
    color: 0x8b959e,
    roughness: 0.78,
    metalness: 0.18,
    emissive: 0x000000,
    emissiveIntensity: 0
  });
  registerEditableLight(cargoHangarMat, { color: 0xffe0b0, nightIntensity: 1.0 });
  AIRPORT_LAYOUT.cargoZ.forEach((z) => {
    const cargoHangar = new THREE.Mesh(new THREE.BoxGeometry(84, 24, 62), cargoHangarMat);
    cargoHangar.position.set(300, 12, z);
    cargoHangar.castShadow = true;
    cargoHangar.receiveShadow = true;
    scene.add(cargoHangar);

    const door = new THREE.Mesh(new THREE.PlaneGeometry(58, 18), doorMat);
    door.rotation.y = -Math.PI / 2;
    door.position.set(257.9, 9.5, z);
    scene.add(door);

    // Cargo-ramp floodlight
    const cargoLight = new THREE.PointLight(0xfff0c8, 60, 180, 2);
    cargoLight.position.set(220, 20, z);
    scene.add(cargoLight);
    airportLights.push(cargoLight);
  });

  // Registro de materiales con emissive para iluminación dinámica.
  registerEditableLight(roof.material as THREE.MeshStandardMaterial, {
    color: 0xbcd7ff,
    nightIntensity: 0.9
  });
  registerEditableLight(towerBase.material as THREE.MeshStandardMaterial, {
    color: 0xdcecff,
    nightIntensity: 0.55
  });
  registerEditableLight(towerCab.material as THREE.MeshStandardMaterial, {
    color: 0x7fd4ff,
    nightIntensity: 2.2
  });
  registerEditableLight(hangarMat, {
    color: 0xffd9a0,
    nightIntensity: 1.1
  });

  // Jetways at the four gates
  const jetwayCanvas = makeJetwayCanvas(1024);
  const jetwayTex = new THREE.CanvasTexture(jetwayCanvas);
  jetwayTex.colorSpace = THREE.SRGBColorSpace;
  jetwayTex.wrapS = jetwayTex.wrapT = THREE.RepeatWrapping;
  jetwayTex.repeat.set(4, 1);
  const jetwayMat = new THREE.MeshStandardMaterial({ map: jetwayTex, roughness: 0.6, metalness: 0.25 });

  const gateZ = AIRPORT_LAYOUT.gateZ;
  gateZ.forEach((z) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(34, 4.4, 5), jetwayMat);
    arm.position.set(155, 7, z);
    arm.castShadow = true;
    scene.add(arm);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(6, 3.6, 6), jetwayMat);
    cabin.position.set(170, 7, z);
    cabin.castShadow = true;
    scene.add(cabin);

    const support = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 7, 8),
      new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.6, roughness: 0.5 })
    );
    support.position.set(148, 3.5, z);
    scene.add(support);

    // Gate beacon
    const beacon = new THREE.PointLight(0x33aaff, 10, 80, 2);
    beacon.position.set(140, 9, z);
    scene.add(beacon);
    beaconLights.push(beacon);
  });

  // Floodlight masts on the apron
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x555c63, metalness: 0.6, roughness: 0.5 });
  const floodPositions = [
    [40, -460], [40, -200], [40, 100], [40, 420], [40, 700],
    [250, -460], [250, -200], [250, 100], [250, 420], [250, 700]
  ];
  floodPositions.forEach(([x, z]) => {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 26, 8), mastMat);
    mast.position.set(x, 13, z);
    mast.castShadow = true;
    scene.add(mast);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(6, 1.5, 3),
      new THREE.MeshStandardMaterial({ color: 0x222831, emissive: 0xfff0c0, emissiveIntensity: 1.8 })
    );
    head.position.set(x, 26, z);
    scene.add(head);

    const light = new THREE.PointLight(0xfff2cc, 120, 340, 2);
    light.position.set(x, 26, z);
    scene.add(light);
    airportLights.push(light);
  });

  // ===== LANDSIDE: ACCESS ROAD + PARKING =====
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.95, metalness: 0.02 });
  const accessRoad = new THREE.Mesh(new THREE.PlaneGeometry(18, 1100), roadMat);
  accessRoad.rotation.x = -Math.PI / 2;
  accessRoad.position.set(360, 0.05, 230);
  accessRoad.receiveShadow = true;
  scene.add(accessRoad);

  const parkingLot = new THREE.Mesh(new THREE.PlaneGeometry(160, 300), roadMat);
  parkingLot.rotation.x = -Math.PI / 2;
  parkingLot.position.set(460, 0.05, 120);
  parkingLot.receiveShadow = true;
  scene.add(parkingLot);

  // Parking stall lines (instanced).
  const stallColumns = 13;
  const stallRows = 14;
  const stallGeometry = new THREE.BoxGeometry(0.22, 0.02, 5.5);
  const stallMaterial = new THREE.MeshBasicMaterial({ color: 0xcfd6dc });
  const stalls = new THREE.InstancedMesh(stallGeometry, stallMaterial, stallColumns * stallRows);
  const stallDummy = new THREE.Object3D();
  let stallIndex = 0;
  for (let col = 0; col < stallColumns; col++) {
    for (let row = 0; row < stallRows; row++) {
      stallDummy.position.set(388 + col * 11.5, 0.07, -12 + row * 19.5);
      stallDummy.updateMatrix();
      stalls.setMatrixAt(stallIndex++, stallDummy.matrix);
    }
  }
  stalls.instanceMatrix.needsUpdate = true;
  scene.add(stalls);

  // A few parked cars, instanced with per-instance colour.
  const carGeometry = new THREE.BoxGeometry(1.9, 1.5, 4.4);
  const carMaterial = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.55 });
  const carCount = 60;
  const cars = new THREE.InstancedMesh(carGeometry, carMaterial, carCount);
  const carDummy = new THREE.Object3D();
  const carPalette = [0xd9dde2, 0x1f2933, 0x8b1e1e, 0x1e3f7a, 0x6b7280, 0xb08d57];
  for (let i = 0; i < carCount; i++) {
    const col = i % stallColumns;
    const row = Math.floor(i / stallColumns);
    carDummy.position.set(388 + col * 11.5, 0.85, -12 + row * 19.5);
    carDummy.rotation.y = Math.PI / 2;
    carDummy.updateMatrix();
    cars.setMatrixAt(i, carDummy.matrix);
    cars.setColorAt(i, new THREE.Color(carPalette[i % carPalette.length]));
  }
  cars.instanceMatrix.needsUpdate = true;
  if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
  scene.add(cars);

  // ===== A320 GLB =====
  let aircraft: THREE.Object3D | null = null;
  const loadA320 = () => {
    const loader = new GLTFLoader();
    loader.load(
      '/models/A320_nologo.glb',
      (gltf) => {
        const model = gltf.scene;
        model.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((material) => {
              const m = material as THREE.MeshStandardMaterial;
              if (!m) return;
              // Keep the model's own textures; only sanitise colours that are
              // pure black placeholders.
              if (m.color && m.color.getHex() === 0x000000 && !m.map) {
                m.color.set(0xf2f4f7);
              }
              // Self-lit texture: at night the aircraft must stay readable
              // (livery, windows, panel lines) instead of turning into a
              // black silhouette lit by nothing. The emissive map is the
              // albedo texture at low intensity, so it does not glow by day.
              if (m.map) {
                m.emissiveMap = m.map;
                if (m.emissive) m.emissive.set(0xffffff);
                m.emissiveIntensity = 0.18;
                m.needsUpdate = true;
              }
              m.envMapIntensity = 1.1;
            });
          }
        });
        // The GLB is modelled nose-along-+X, while the flight physics moves
        // along +Z. Rotate and re-centre so the visual nose matches the
        // simulated heading and the wheels sit on Y=0.
        model.rotation.y = -Math.PI / 2;
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= box.min.y;

        const wrapper = new THREE.Group();
        wrapper.add(model);
        aircraft = wrapper;
        scene.add(wrapper);
        // Re-apply the last known transform if physics already reported one.
        if (lastAircraftState) {
          wrapper.position.copy(lastAircraftState.pos);
          wrapper.rotation.copy(lastAircraftState.rot);
        }
      },
      undefined,
      (err) => {
        console.error('A320 load error', err);
        createFallbackAircraft();
      }
    );
  };

  let lastAircraftState: { pos: THREE.Vector3; rot: THREE.Euler } | null = null;

  const createFallbackAircraft = () => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(2.4, 16, 6, 16),
      new THREE.MeshStandardMaterial({ color: 0xf3f5f8, roughness: 0.35, metalness: 0.1 })
    );
    body.rotation.x = Math.PI / 2;
    group.add(body);
    const wings = new THREE.Mesh(
      new THREE.BoxGeometry(24, 0.5, 5),
      new THREE.MeshStandardMaterial({ color: 0x00a1de, roughness: 0.4 })
    );
    group.add(wings);
    aircraft = group;
    scene.add(group);
    if (lastAircraftState) {
      group.position.copy(lastAircraftState.pos);
      group.rotation.copy(lastAircraftState.rot);
    }
  };

  loadA320();

  // ===== GROUND TRAFFIC NETWORK =====
  // Full aircraft + vehicle graph (see groundNetwork.ts for the layout).
  const network = buildAirportGroundNetwork(trafficManager);

  // Service roads (vehicles only) so the AI paths are visible in the scene.
  const serviceRoadMat = new THREE.MeshStandardMaterial({
    color: 0x3a3f45,
    roughness: 0.95,
    metalness: 0.02
  });
  const serviceLane = new THREE.Mesh(new THREE.PlaneGeometry(9, 1440), serviceRoadMat);
  serviceLane.rotation.x = -Math.PI / 2;
  serviceLane.position.set(160, 0.05, 160);
  serviceLane.receiveShadow = true;
  scene.add(serviceLane);

  const fuelRoad = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), serviceRoadMat);
  fuelRoad.rotation.x = -Math.PI / 2;
  fuelRoad.position.set(175, 0.05, 850);
  fuelRoad.receiveShadow = true;
  scene.add(fuelRoad);

  const depotRoad = new THREE.Mesh(new THREE.PlaneGeometry(8, 50), serviceRoadMat);
  depotRoad.rotation.x = -Math.PI / 2;
  depotRoad.position.set(160, 0.05, -215);
  depotRoad.receiveShadow = true;
  scene.add(depotRoad);

  // Gate lead-in lines (yellow)
  const standPaint = new THREE.MeshStandardMaterial({ color: 0xe0b21c, roughness: 0.6 });
  network.gates.forEach((gate) => {
    const stand = trafficManager.getNode(gate.gateNode);
    if (!stand) return;
    const fromX = AIRPORT_LAYOUT.taxilaneX;
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(stand.position.x - fromX + 2, 0.8),
      standPaint
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set((fromX + stand.position.x) / 2, 0.1, stand.position.z);
    scene.add(line);
  });

  // Fuel farm: two storage tanks + bund wall, at the north end of the
  // service lane so the parallel taxiway stays clear.
  const tankMat = new THREE.MeshStandardMaterial({ color: 0xd9dee4, roughness: 0.35, metalness: 0.65 });
  for (const [x, z] of [[176, 850], [204, 850]]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 8, 24), tankMat);
    tank.position.set(x, 4, z);
    tank.castShadow = true;
    tank.receiveShadow = true;
    scene.add(tank);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.2, 0.6, 24), tankMat);
    cap.position.set(x, 8.2, z);
    scene.add(cap);
  }
  const bund = new THREE.Mesh(
    new THREE.BoxGeometry(46, 1.4, 24),
    new THREE.MeshStandardMaterial({ color: 0x8c9299, roughness: 0.9 })
  );
  bund.position.set(190, 0.7, 850);
  scene.add(bund);

  // Baggage / catering depot building
  const depotBuilding = new THREE.Mesh(
    new THREE.BoxGeometry(30, 9, 26),
    new THREE.MeshStandardMaterial({ color: 0xa9b1b8, roughness: 0.75, metalness: 0.15 })
  );
  depotBuilding.position.set(186, 4.5, -232);
  depotBuilding.castShadow = true;
  depotBuilding.receiveShadow = true;
  scene.add(depotBuilding);
  const depotDoor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 6),
    new THREE.MeshStandardMaterial({ color: 0x3b4249, roughness: 0.8 })
  );
  depotDoor.rotation.y = -Math.PI / 2;
  depotDoor.position.set(170.9, 3, -232);
  scene.add(depotDoor);

  // ===== RUNWAY, TAXIWAY & PAPI LIGHTS =====
  const runwayLighting = createRunwayLights({ thresholdZ: -1150, length: 2300 });
  setPapiGroup(runwayLighting.papi);
  scene.add(runwayLighting.group);

  const allStandZ = [
    ...AIRPORT_LAYOUT.remoteGateZ,
    ...AIRPORT_LAYOUT.gateZ,
    ...AIRPORT_LAYOUT.cargoZ
  ];
  const taxiwayLights = createTaxiwayLights(allStandZ, {
    alphaX: AIRPORT_LAYOUT.taxiwayX,
    alphaWidth: 36,
    taxilaneX: AIRPORT_LAYOUT.taxilaneX,
    crossZ: AIRPORT_LAYOUT.crossTaxilaneZ,
    exitZ: AIRPORT_LAYOUT.runwayExitZ,
    exitDrop: AIRPORT_LAYOUT.runwayExitDrop
  });
  scene.add(taxiwayLights);

  const jetwayLights = createJetwayLights(AIRPORT_LAYOUT.gateZ);
  scene.add(jetwayLights);

  scene.add(createHoldLights(holdLightPositions));

  // Taxiway signage: location, direction and runway holding panels.
  scene.add(createHomeAirportSigns());

  scheduleManager.initSchedule();
  trafficManager.seedAmbientTraffic(8);

  // Aircraft flying between the home hub and the remote airports.
  const routeTraffic = new RouteTraffic(scene, { premium, count: premium ? 10 : 6, shared: sharedAirport });

  const networkReport = validateGroundNetwork(trafficManager, network);
  if (networkReport.ok) {
    console.info(
      `[ground-network] OK · ${networkReport.aircraftNodes} aircraft nodes, ` +
      `${networkReport.vehicleNodes} vehicle nodes, ${networkReport.links} edges`
    );
  } else {
    console.error('[ground-network] invalid network', networkReport.errors);
  }

  // Dev helper: inspect the live traffic graph from the browser console.
  (window as unknown as {
    __sim?: {
      trafficManager: TrafficManager;
      network: ReturnType<typeof buildAirportGroundNetwork>;
      papi: THREE.Group;
      routeTraffic: RouteTraffic;
      world: ReturnType<typeof buildWorld>;
      airports: typeof ALL_AIRPORTS;
      homeAirport: typeof HOME_AIRPORT;
      routes: typeof ROUTES;
      getPlayerAircraft: () => THREE.Object3D | null;
      camera: THREE.PerspectiveCamera;
      controls: OrbitControls;
      textureStreamer: TextureStreamer;
      renderer: THREE.WebGLRenderer;
      THREE: typeof THREE;
      setCameraMode?: (mode: CameraMode) => void;
      focusAirport?: (x: number, z: number, elevation: number) => void;
      setTime?: (hour: number) => void;
      getTime?: () => number;
    };
  }).__sim = {
    trafficManager,
    network,
    papi: runwayLighting.papi,
    routeTraffic,
    world,
    airports: ALL_AIRPORTS,
    homeAirport: HOME_AIRPORT,
    routes: ROUTES,
    getPlayerAircraft: () => aircraft,
    camera,
    controls,
    textureStreamer,
    renderer,
    THREE,
    setTime: (hour: number) => timeManager.setHour(hour),
    getTime: () => timeManager.getHour()
  };

  // ===== CAMERA =====
  let cameraMode: CameraMode = 'AIRCRAFT_FOLLOW';
  const followOffset = new THREE.Vector3(0, 14, -46);
  const followLook = new THREE.Vector3(0, 3, 18);
  const parkingPosition = new THREE.Vector3(180, 120, -780);
  const parkingTarget = new THREE.Vector3(0, 0, -1080);

  const applyCameraMode = (mode: CameraMode) => {
    cameraMode = mode;
    if (mode === 'PARKING_VIEW') {
      camera.position.copy(parkingPosition);
      controls.target.copy(parkingTarget);
      controls.enabled = false;
    } else if (mode === 'FREE_ORBIT') {
      controls.enabled = true;
    }
  };

  const yawQuat = new THREE.Quaternion();
  const tmpVec = new THREE.Vector3();
  const tmpEuler = new THREE.Euler();

  const focusAirport = (x: number, z: number, elevation: number) => {
    applyCameraMode('FREE_ORBIT');
    controls.target.set(x, elevation, z);
    camera.position.set(x + 1200, elevation + 750, z + 1200);
    controls.update();
  };

  // Expose the camera helpers on __sim too: useful for inspecting cities,
  // remote airports and roads without flying there manually.
  const simGlobal = (window as unknown as {
    __sim?: {
      setCameraMode?: (mode: CameraMode) => void;
      focusAirport?: (x: number, z: number, elevation: number) => void;
    };
  }).__sim;
  if (simGlobal) {
    simGlobal.setCameraMode = applyCameraMode;
    simGlobal.focusAirport = focusAirport;
  }

  const updateCamera = (dt: number) => {
    if (!aircraft) {
      controls.enabled = cameraMode !== 'PARKING_VIEW';
      if (cameraMode === 'PARKING_VIEW') {
        camera.position.copy(parkingPosition);
        camera.lookAt(parkingTarget);
      }
      return;
    }

    if (cameraMode === 'FREE_ORBIT') {
      controls.enabled = true;
      return;
    }

    if (cameraMode === 'PARKING_VIEW') {
      controls.enabled = false;
      camera.position.copy(parkingPosition);
      camera.lookAt(parkingTarget);
      return;
    }

    controls.enabled = false;

    // Follow / cockpit use yaw only so the camera never rolls with the plane.
    tmpEuler.set(0, aircraft.rotation.y, 0, 'YXZ');
    yawQuat.setFromEuler(tmpEuler);

    if (cameraMode === 'AIRCRAFT_FOLLOW') {
      tmpVec.copy(followOffset).applyQuaternion(yawQuat).add(aircraft.position);
      const k = 1 - Math.exp(-4 * dt);
      camera.position.lerp(tmpVec, k);
      tmpVec.copy(followLook).applyQuaternion(yawQuat).add(aircraft.position);
      controls.target.lerp(tmpVec, k);
      camera.lookAt(controls.target);
    } else {
      // Cockpit view keeps the full attitude for a believable feel.
     	tmpEuler.set(aircraft.rotation.x, aircraft.rotation.y, aircraft.rotation.z, 'YXZ');
      yawQuat.setFromEuler(tmpEuler);
      tmpVec.set(0, 3.0, 25).applyQuaternion(yawQuat).add(aircraft.position);
      camera.position.copy(tmpVec);
      tmpVec.set(0, 2.0, 85).applyQuaternion(yawQuat).add(aircraft.position);
      camera.lookAt(tmpVec);
    }
  };

  // ===== RESIZE =====
  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer?.setSize(w, h);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  // ===== LOOP =====
  let statsAccumulator = { frames: 0, time: 0 };
  const clock = new THREE.Clock();
  let disposed = false;

  function animate() {
    if (disposed) return;
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);

    timeManager.update();
    const daylight = updateEnvironment(timeManager.getHour());
    world.update(dt, daylight);

    // Animar efectos de luces (PAPI guiado por la posición del avión)
    animateLights(dt, aircraft?.position);

    trafficManager.update(dt, camera.position);
    scheduleManager.update(dt);
    routeTraffic.update(dt);
    worldManager.update(camera.position);
    textureStreamer.update(camera, container.clientHeight);

    updateCamera(dt);
    // OrbitControls.update() repositions the camera even when disabled, so only
    // let it run in free-orbit mode or it will fight the scripted cameras.
    if (controls.enabled) controls.update();

    statsAccumulator.frames++;
    statsAccumulator.time += dt;
    if (statsAccumulator.time >= 1) {
      if (onStats) {
        onStats({
          fps: Math.round(statsAccumulator.frames / statsAccumulator.time),
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          stream: textureStreamer.getStats()
        });
      }
      statsAccumulator = { frames: 0, time: 0 };
    }

    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  animate();

  const disposeObject = (obj: THREE.Object3D) => {
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  };

  return {
    dispose: () => {
      disposed = true;
      resizeObserver.disconnect();
      if (aircraft) disposeObject(aircraft);
      composer?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      routeTraffic.dispose();
      world.dispose();
      worldManager.dispose();
      textureStreamer.dispose();
    },
    setTextureQuality: (cap) => textureStreamer.setQualityCap(cap),
    updateAircraft: (pos, rot, gear) => {
      lastAircraftState = { pos: pos.clone(), rot: rot.clone() };
      if (aircraft) {
        aircraft.position.copy(pos);
        aircraft.rotation.copy(rot);
      }
      if (gear && aircraft) {
        // The GLB ships with the gear extended; nothing to do here.
      }
    },
    setCameraTarget: (target) => controls.target.copy(target),
    heightAt: (x, z) => world.heightAt(x, z),
    focusAirport,
    setCameraMode: (mode) => applyCameraMode(mode),
    getCameraMode: () => cameraMode,
    setTime: (h) => timeManager.setHour(h),
    getTime: () => timeManager.getHour(),
    getPhase: () => timeManager.getCurrentPhase()
  };
}
