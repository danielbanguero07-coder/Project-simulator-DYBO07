import { mulberry32 } from './airportTextures';
import { REAL_RUNWAY_CENTER, REAL_RUNWAY_DIR } from './realGroundNetwork';
import type { MapProjection } from './mapMarkers';

/**
 * Stylised satellite background for the navigation maps.
 *
 * This is drawn by the game, not a photo: real satellite imagery of the
 * fictional procedural world does not exist, and in real mode the photos
 * are already the 3D Google tiles. The look is the same either way — dark
 * terrain with vegetation patches, a street grid around the city, and the
 * MEX pavement (runway, taxiway, apron) — so the minimap and the full map
 * read as satellite views in both modes.
 *
 * Everything is placed in world coordinates and seeded per grid cell, so
 * the picture is stable when the view moves instead of reshuffling.
 */
export interface SatelliteView {
  projection: MapProjection;
  realMode: boolean;
}

const PAVEMENT = '#8d9297';

function fillWorldRect(
  context: CanvasRenderingContext2D,
  projection: MapProjection,
  x: number,
  z: number,
  w: number,
  h: number,
  minPx = 1.5
): void {
  const topLeft = projection.toPx(x, z);
  const pw = w * projection.pxPerMetre;
  const ph = h * projection.pxPerMetre;
  const cw = Math.max(pw, minPx);
  const ch = Math.max(ph, minPx);
  context.fillRect(topLeft.x - (cw - pw) / 2, topLeft.y - (ch - ph) / 2, cw, ch);
}

function drawTerrainPatches(
  context: CanvasRenderingContext2D,
  projection: MapProjection
): void {
  const { width, height, pxPerMetre } = projection;
  const topLeft = projection.toWorld(0, 0);
  const bottomRight = projection.toWorld(width, height);
  const cell = 2000;
  const palette = ['#2a3324', '#2e3626', '#26301f', '#33302a', '#2b2f22', '#1f2a1d'];
  for (let gx = Math.floor(topLeft.x / cell); gx <= Math.floor(bottomRight.x / cell); gx++) {
    for (let gz = Math.floor(topLeft.z / cell); gz <= Math.floor(bottomRight.z / cell); gz++) {
      const random = mulberry32(((gx * 73856093) ^ (gz * 19349663)) >>> 0);
      for (let i = 0; i < 2; i++) {
        const cx = (gx + random()) * cell;
        const cz = (gz + random()) * cell;
        const r = (600 + random() * 1200) * pxPerMetre;
        if (r < 1) continue;
        const p = projection.toPx(cx, cz);
        const tone = palette[Math.floor(random() * palette.length)];
        const gradient = context.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gradient.addColorStop(0, tone);
        gradient.addColorStop(1, 'rgba(35,43,30,0)');
        context.fillStyle = gradient;
        context.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      }
    }
  }
}

/** Street grid of the city around the MEX reference point (0,0 in both modes). */
function drawCityGrid(
  context: CanvasRenderingContext2D,
  projection: MapProjection
): void {
  const { width, height, pxPerMetre } = projection;
  const topLeft = projection.toWorld(0, 0);
  const bottomRight = projection.toWorld(width, height);
  const min = -6000;
  const max = 6000;
  if (bottomRight.x < min || topLeft.x > max || bottomRight.z < min || topLeft.z > max) return;
  const step = 250;
  context.strokeStyle = 'rgba(200,190,170,0.16)';
  context.lineWidth = 1;
  context.beginPath();
  for (let x = Math.max(min, Math.floor(topLeft.x / step) * step); x <= Math.min(max, bottomRight.x); x += step) {
    const a = projection.toPx(x, Math.max(min, topLeft.z));
    const b = projection.toPx(x, Math.min(max, bottomRight.z));
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
  }
  for (let z = Math.max(min, Math.floor(topLeft.z / step) * step); z <= Math.min(max, bottomRight.z); z += step) {
    const a = projection.toPx(Math.max(min, topLeft.x), z);
    const b = projection.toPx(Math.min(max, bottomRight.x), z);
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
  }
  context.stroke();
  // Avenues every 1 km, slightly brighter.
  context.strokeStyle = 'rgba(200,190,170,0.26)';
  context.lineWidth = 2;
  context.beginPath();
  for (let x = Math.max(min, Math.floor(topLeft.x / 1000) * 1000); x <= Math.min(max, bottomRight.x); x += 1000) {
    const a = projection.toPx(x, Math.max(min, topLeft.z));
    const b = projection.toPx(x, Math.min(max, bottomRight.z));
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
  }
  for (let z = Math.max(min, Math.floor(topLeft.z / 1000) * 1000); z <= Math.min(max, bottomRight.z); z += 1000) {
    const a = projection.toPx(Math.max(min, topLeft.x), z);
    const b = projection.toPx(Math.min(max, bottomRight.x), z);
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
  }
  context.stroke();
}

/** MEX pavement (runway, Alpha, apron), skipped when too small to see. */
function drawAirportPavement(
  context: CanvasRenderingContext2D,
  projection: MapProjection,
  realMode: boolean
): void {
  const { pxPerMetre } = projection;
  const runwayLengthM = realMode ? 3952 : 2300;
  if (runwayLengthM * pxPerMetre < 8) return;
  context.fillStyle = PAVEMENT;
  if (!realMode) {
    // Procedural airport: north-south runway, Alpha, apron (same geometry
    // as qualityDemo.ts).
    fillWorldRect(context, projection, -23, -1150, 46, 2300);
    fillWorldRect(context, projection, 54, -1100, 36, 2200);
    fillWorldRect(context, projection, 90, -560, 247, 1325);
    return;
  }
  // Real airport: diagonal 05L/23R through the real runway centre. In the
  // rotated frame local +x follows the runway and local -y is the terminal
  // side (perp = (dir.z, -dir.x)).
  const c = projection.toPx(REAL_RUNWAY_CENTER.x, REAL_RUNWAY_CENTER.z);
  const angle = Math.atan2(REAL_RUNWAY_DIR.z, REAL_RUNWAY_DIR.x);
  const s = pxPerMetre;
  context.save();
  context.translate(c.x, c.y);
  context.rotate(angle);
  context.fillRect((-3952 / 2) * s, -Math.max(45 * s, 1.5) / 2, 3952 * s, Math.max(45 * s, 1.5));
  context.fillRect((-2200 / 2) * s, (-70 - 18) * s, 2200 * s, Math.max(36 * s, 1));
  context.fillRect(-560 * s, -250 * s, 1420 * s, Math.max(140 * s, 1));
  context.restore();
}

export function drawSatelliteBackground(
  context: CanvasRenderingContext2D,
  view: SatelliteView
): void {
  const { projection, realMode } = view;
  const { width, height } = projection;
  context.fillStyle = '#232b1e';
  context.fillRect(0, 0, width, height);
  drawTerrainPatches(context, projection);
  drawCityGrid(context, projection);
  drawAirportPavement(context, projection, realMode);
}
