/**
 * Headless checks for the navigation system (minimap + full map).
 *
 * Run from apps/frontend with:  npx -y tsx scripts/verify-navigation-map.ts
 *
 * The satellite background runs against a RECORDING 2d context (no real
 * rasterisation): every fillRect/stroke/rotate call is logged, so the script
 * can assert the terrain, the street grid and the runway are drawn, in both
 * world modes. The marker plumbing (headings, projections, merge) is pure
 * and checked directly. The React components themselves are covered by
 * typecheck + build and by the visual test on Dani's PC.
 */

import {
  createProjection,
  fitProjection,
  getMapAirports,
  mapPhaseLabel,
  mergeTrafficMarkers,
  trueHeadingFromYaw,
  type MapAircraft
} from '../src/scenes/mapMarkers';
import { drawSatelliteBackground } from '../src/scenes/mapBackground';
import { REAL_RUNWAY_CENTER, REAL_RUNWAY_DIR } from '../src/scenes/realGroundNetwork';
import { geoToLocal } from '../src/scenes/geo';

interface Call {
  kind: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  angle?: number;
  fillStyle?: unknown;
}

class RecordingContext {
  calls: Call[] = [];
  fillStyle: string | object = '#000000';
  strokeStyle = '#000000';
  lineWidth = 1;
  canvas: FakeCanvas;

  constructor(canvas: FakeCanvas) {
    this.canvas = canvas;
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.calls.push({ kind: 'fillRect', x, y, w, h, fillStyle: this.fillStyle });
  }

  beginPath(): void {
    this.calls.push({ kind: 'beginPath' });
  }

  moveTo(x: number, y: number): void {
    this.calls.push({ kind: 'moveTo', x, y });
  }

  lineTo(x: number, y: number): void {
    this.calls.push({ kind: 'lineTo', x, y });
  }

  stroke(): void {
    this.calls.push({ kind: 'stroke' });
  }

  save(): void {
    this.calls.push({ kind: 'save' });
  }

  restore(): void {
    this.calls.push({ kind: 'restore' });
  }

  translate(x: number, y: number): void {
    this.calls.push({ kind: 'translate', x, y });
  }

  rotate(angle: number): void {
    this.calls.push({ kind: 'rotate', angle });
  }

  createRadialGradient(): { addColorStop: () => void } {
    this.calls.push({ kind: 'createRadialGradient' });
    return { addColorStop: () => undefined };
  }

  createLinearGradient(): { addColorStop: () => void } {
    return { addColorStop: () => undefined };
  }
}

class FakeCanvas {
  width = 0;
  height = 0;
  ctx: RecordingContext;

  constructor() {
    this.ctx = new RecordingContext(this);
  }

  getContext(_type: string): RecordingContext {
    return this.ctx;
  }
}

(globalThis as unknown as { document: unknown }).document = {
  createElement: (tag: string) => {
    if (tag !== 'canvas') throw new Error(`unsupported element ${tag}`);
    return new FakeCanvas();
  }
};

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const approx = (a: number, b: number, tol = 0.01): boolean => Math.abs(a - b) <= tol;

// ---- Headings ---------------------------------------------------------------
check('scene yaw 120.6 deg is true 59.4 deg', approx(trueHeadingFromYaw((120.6 * Math.PI) / 180), 59.4, 0.5));
check('scene yaw 0 is true 180 deg', approx(trueHeadingFromYaw(0), 180));
check('scene yaw PI is true 0 deg', approx(trueHeadingFromYaw(Math.PI), 0));

// ---- Airport positions --------------------------------------------------------
const procAirports = getMapAirports(false);
check('procedural MEX is at the origin', procAirports.find((a) => a.code === 'MEX')?.x === 0);
const realAirports = getMapAirports(true);
const realMex = realAirports.find((a) => a.code === 'MEX')!;
check(
  'real MEX is at the real runway centre',
  Math.abs(realMex.x - REAL_RUNWAY_CENTER.x) < 2 && Math.abs(realMex.z - REAL_RUNWAY_CENTER.z) < 2,
  `(${realMex.x.toFixed(0)}, ${realMex.z.toFixed(0)})`
);
const realGdl = realAirports.find((a) => a.code === 'GDL')!;
// realAirportView anchors on HOME_AIRPORT.lat/lon, not on the geo.ts
// default origin (MEX_ORIGIN), so the check uses the same origin.
const gdlExpected = geoToLocal(20.523342, -103.310108, { lat: 19.435822, lon: -99.07033 });
check(
  'real GDL is the airport reference point',
  Math.abs(realGdl.x - gdlExpected.x) < 2 && Math.abs(realGdl.z - gdlExpected.z) < 2,
  `(${realGdl.x.toFixed(0)}, ${realGdl.z.toFixed(0)})`
);
check('real airports use scene ground level (0) for the camera', realAirports.every((a) => a.elevation === 0));

// ---- Projections ---------------------------------------------------------------
const proj = createProjection(200, 200, 0, 0, 200 / 14400);
const pxPoint = proj.toPx(1234, -567);
const roundTripped = proj.toWorld(pxPoint.x, pxPoint.y);
check(
  'projection round-trips world <-> px',
  approx(roundTripped.x, 1234, 0.01) && approx(roundTripped.z, -567, 0.01),
  `${roundTripped.x.toFixed(2)}, ${roundTripped.z.toFixed(2)}`
);
const fit = fitProjection(880, 560, realAirports);
check(
  'fit-all projection keeps every real airport in view',
  realAirports.every((a) => fit.inView(a.x, a.z))
);

// ---- Satellite background: procedural minimap -----------------------------------
function backgroundCalls(width: number, height: number, realMode: boolean): Call[] {
  const canvas = new FakeCanvas();
  canvas.width = width;
  canvas.height = height;
  const projection = createProjection(width, height, 0, 0, width / (realMode ? 20000 : 14400));
  drawSatelliteBackground(
    canvas.getContext('2d') as unknown as CanvasRenderingContext2D,
    { projection, realMode }
  );
  return canvas.ctx.calls;
}

const procCalls = backgroundCalls(200, 200, false);
check(
  'procedural background paints the dark terrain base',
  procCalls.some(
    (c) => c.kind === 'fillRect' && c.fillStyle === '#232b1e' && approx(c.w ?? 0, 200) && approx(c.h ?? 0, 200)
  )
);
check(
  'procedural background draws terrain patches',
  procCalls.filter((c) => c.kind === 'createRadialGradient').length >= 10,
  `${procCalls.filter((c) => c.kind === 'createRadialGradient').length}`
);
check('procedural background draws the street grid', procCalls.filter((c) => c.kind === 'stroke').length >= 2);
const procRunway = procCalls.filter(
  (c) => c.kind === 'fillRect' && c.fillStyle === '#8d9297' && approx(c.h ?? 0, (2300 * 200) / 14400, 0.5)
);
check('procedural background draws the north-south runway', procRunway.length === 1, `${procRunway.length}`);

const realCalls = backgroundCalls(200, 200, true);
const realAngle = Math.atan2(REAL_RUNWAY_DIR.z, REAL_RUNWAY_DIR.x);
check(
  'real background rotates the runway to 05L/23R',
  realCalls.some((c) => c.kind === 'rotate' && approx(c.angle ?? 0, realAngle, 0.01)),
  `expected ${realAngle.toFixed(3)}`
);

// ---- Marker merge ---------------------------------------------------------------
const route: MapAircraft[] = [
  {
    id: 'route-0', label: 'MEX-GDL', kind: 'route', x: 0, z: 0, altitude: 2930,
    headingDeg: 300, speed: 120, phase: 'airborne', visible: true
  }
];
const traffic: MapAircraft[] = [
  {
    id: 'tm-AX101', label: 'AX101', kind: 'traffic', x: 100, z: 100, altitude: 0,
    headingDeg: 0, speed: 0, phase: 'parked', visible: true
  },
  {
    id: 'tm-AX102', label: 'AX102', kind: 'traffic', x: 200, z: 200, altitude: 0,
    headingDeg: 0, speed: 0, phase: 'parked', visible: false
  }
];
const merged = mergeTrafficMarkers(route, traffic);
check('merge keeps route + traffic markers', merged.length === 2, `${merged.length}`);
check('merge drops hidden aircraft', merged.every((m) => m.visible));
check('merge keeps unique ids', new Set(merged.map((m) => m.id)).size === merged.length);

// ---- Phase labels ---------------------------------------------------------------
check('airborne reads EN VUELO', mapPhaseLabel('airborne') === 'EN VUELO');
check('parked reads EN PUERTA', mapPhaseLabel('parked') === 'EN PUERTA');
check('unknown phase falls back to uppercase', mapPhaseLabel('cruising') === 'CRUISING');

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
