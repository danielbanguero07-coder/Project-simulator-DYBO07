/**
 * Headless checks for the Fase 2 procedural runway textures.
 *
 * Run from apps/frontend with:  npx -y tsx scripts/verify-runway-textures.ts
 *
 * The canvas generators run against a RECORDING 2d context (no real
 * rasterisation): every fillRect/fillText call is logged with its style and
 * its metre-space dimensions, so the script can assert the layout is drawn
 * to scale — centreline dashes, threshold bars, touchdown pairs, aiming
 * point, the "36L"/"18R" designators, edge stripes and tyre deposits —
 * without opening a browser. It also checks the roughness/normal maps, the
 * wet toggle on the runway material, and the centreline lights.
 */

import * as THREE from 'three';
import {
  makeRunwayCanvas,
  makeRunwayRoughnessCanvas,
  makeRunwayNormalCanvas,
  RUNWAY_LENGTH_M,
  RUNWAY_WIDTH_M
} from '../src/scenes/airportTextures';
import { createRunwayMaterial } from '../src/scenes/runwayMaterial';
import { createRunwayLights } from '../src/scenes/airportLights';

interface Call {
  kind: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  fillStyle?: unknown;
  alpha?: number;
}

class RecordingContext {
  calls: Call[] = [];
  fillStyle: string | object = '#000000';
  strokeStyle = '#000000';
  lineWidth = 1;
  font = '';
  textAlign = 'center';
  textBaseline = 'alphabetic';
  globalAlpha = 1;
  canvas: FakeCanvas;

  constructor(canvas: FakeCanvas) {
    this.canvas = canvas;
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.calls.push({ kind: 'fillRect', x, y, w, h, fillStyle: this.fillStyle, alpha: this.globalAlpha });
  }

  fillText(text: string, x: number, y: number): void {
    this.calls.push({ kind: 'fillText', text, x, y, fillStyle: this.fillStyle });
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

  save(): void {}
  restore(): void {}
  translate(_x: number, _y: number): void {}
  rotate(_angle: number): void {}
  scale(_sx: number, _sy: number): void {}

  createRadialGradient(): { addColorStop: () => void } {
    return { addColorStop: () => undefined };
  }

  createLinearGradient(): { addColorStop: () => void } {
    return { addColorStop: () => undefined };
  }

  createPattern(): object {
    return {};
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

const canvases: FakeCanvas[] = [];
(globalThis as unknown as { document: unknown }).document = {
  createElement: (tag: string) => {
    if (tag !== 'canvas') throw new Error(`unsupported element ${tag}`);
    const canvas = new FakeCanvas();
    canvases.push(canvas);
    return canvas;
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

// ---- Colour map -----------------------------------------------------------
const colorCanvas = makeRunwayCanvas(512, 4096);
const colorCalls = (colorCanvas as unknown as FakeCanvas).ctx.calls;
const paint = 'rgba(235,238,240,0.92)';
const rubber = 'rgba(12,13,15,1)';
const paintRects = colorCalls.filter((c) => c.kind === 'fillRect' && c.fillStyle === paint);
const rubberRects = colorCalls.filter((c) => c.kind === 'fillRect' && c.fillStyle === rubber);
const texts = colorCalls.filter((c) => c.kind === 'fillText').map((c) => c.text);

check('runway is 46 x 2600 m', RUNWAY_WIDTH_M === 46 && RUNWAY_LENGTH_M === 2600, `${RUNWAY_WIDTH_M} x ${RUNWAY_LENGTH_M}`);
check(
  '46 centreline dashes (30 m dash, 20 m gap)',
  paintRects.filter((c) => approx(c.w ?? 0, 0.9) && approx(c.h ?? 0, 30) && approx(c.x ?? 0, 22.55)).length === 46,
  `${paintRects.filter((c) => approx(c.w ?? 0, 0.9) && approx(c.h ?? 0, 30) && approx(c.x ?? 0, 22.55)).length}`
);
check(
  '16 threshold bars (8 per end)',
  paintRects.filter((c) => approx(c.w ?? 0, 1.75) && approx(c.h ?? 0, 30)).length === 16,
  `${paintRects.filter((c) => approx(c.w ?? 0, 1.75) && approx(c.h ?? 0, 30)).length}`
);
check(
  '20 touchdown-zone bars (5 pairs x 2 ends x 2 bars)',
  paintRects.filter((c) => approx(c.w ?? 0, 3) && approx(c.h ?? 0, 22.5)).length === 20,
  `${paintRects.filter((c) => approx(c.w ?? 0, 3) && approx(c.h ?? 0, 22.5)).length}`
);
check(
  '4 aiming-point bars (300 m pair, bigger)',
  paintRects.filter((c) => approx(c.w ?? 0, 6) && approx(c.h ?? 0, 30)).length === 4,
  `${paintRects.filter((c) => approx(c.w ?? 0, 6) && approx(c.h ?? 0, 30)).length}`
);
check(
  '2 edge stripes, full length',
  paintRects.filter((c) => approx(c.w ?? 0, 0.9) && approx(c.h ?? 0, 2600)).length === 2,
  `${paintRects.filter((c) => approx(c.w ?? 0, 0.9) && approx(c.h ?? 0, 2600)).length}`
);
check('designator "36L" is painted', texts.includes('36L'), texts.join(','));
check('designator "18R" is painted', texts.includes('18R'), texts.join(','));
check(
  '48 rubber streaks in the touchdown zones',
  rubberRects.filter((c) => approx(c.w ?? 0, 2.5)).length === 48,
  `${rubberRects.filter((c) => approx(c.w ?? 0, 2.5)).length}`
);

// ---- Roughness map --------------------------------------------------------
const roughCanvas = makeRunwayRoughnessCanvas(512, 4096);
const roughCalls = (roughCanvas as unknown as FakeCanvas).ctx.calls;
const roughPaint = roughCalls.filter((c) => c.kind === 'fillRect' && c.fillStyle === 'rgb(153,153,153)');
const roughRubber = roughCalls.filter((c) => c.kind === 'fillRect' && c.fillStyle === 'rgb(115,115,115)');
check(
  'roughness map paints the same markings in grey',
  roughPaint.filter((c) => approx(c.w ?? 0, 0.9) && approx(c.h ?? 0, 30)).length === 46,
  `${roughPaint.filter((c) => approx(c.w ?? 0, 0.9) && approx(c.h ?? 0, 30)).length} dashes`
);
check(
  'roughness map marks the rubber deposits smoother',
  roughRubber.filter((c) => approx(c.w ?? 0, 2.5)).length === 48,
  `${roughRubber.filter((c) => approx(c.w ?? 0, 2.5)).length}`
);

// ---- Normal map -----------------------------------------------------------
const normalCanvas = makeRunwayNormalCanvas(512, 4096);
const normalCalls = (normalCanvas as unknown as FakeCanvas).ctx.calls;
check(
  'normal map is a flat (128,128,255) base with grain',
  normalCalls.some(
    (c) => c.kind === 'fillRect' && c.fillStyle === 'rgb(128,128,255)' && approx(c.w ?? 0, 512) && approx(c.h ?? 0, 4096)
  )
);

// ---- Material + wet toggle --------------------------------------------------
const { material, setWet } = createRunwayMaterial(false);
check('runway material has a colour map', material.map !== null);
check('runway material has a roughness map', material.roughnessMap !== null);
check('runway material has a normal map', material.normalMap !== null);
setWet(true);
check('wet: roughness drops to 0.35', approx(material.roughness, 0.35), `${material.roughness}`);
check('wet: env reflection rises to 1.6', approx(material.envMapIntensity, 1.6), `${material.envMapIntensity}`);
check('wet: asphalt darkens', material.color.getHex() === 0x8f979e, `#${material.color.getHexString()}`);
setWet(false);
check('dry: roughness back to 1.0', approx(material.roughness, 1.0), `${material.roughness}`);
check('dry: env reflection back to 0.4', approx(material.envMapIntensity, 0.4), `${material.envMapIntensity}`);

// ---- Centreline lights ------------------------------------------------------
const { group } = createRunwayLights();
const lampRows = group.children.filter(
  (child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh
);
const counts = lampRows.map((mesh) => mesh.count).sort((a, b) => a - b);
check('5 instanced lamp rows (edge, 2 threshold, 2 centreline)', lampRows.length === 5, `${lampRows.length}`);
check(
  'lamp counts: 2x9 threshold, 72 white + 78 red centreline, 154 edge',
  counts.length === 5 &&
    counts[0] === 9 &&
    counts[1] === 9 &&
    Math.abs(counts[2] - 72) <= 2 &&
    Math.abs(counts[3] - 78) <= 2 &&
    counts[4] === 154,
  counts.join(',')
);

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
