/**
 * Resolution-independent procedural textures for the airport demo.
 *
 * Every generator receives the target resolution and draws the same
 * "world" pattern with detail that scales with the texel count. That means
 * the 1K version and the 4K version are visually the same material, but the
 * 4K one carries genuine high-frequency detail (aggregate, cracks, blades,
 * window frames) instead of being an upscale.
 */

export type CanvasTextureGenerator = (size: number) => HTMLCanvasElement;

function makeContext(size: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D context unavailable');
  return context;
}

/** Rectangular canvas context (the runway texture is 46 x 2600 m, not square). */
function makeRectContext(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D context unavailable');
  return context;
}

/** Small, fast, deterministic PRNG so a level can be regenerated identically. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeGrassCanvas(size: number): HTMLCanvasElement {
  const context = makeContext(size);
  const random = mulberry32(0x9e3779b9);

  context.fillStyle = '#3f5a35';
  context.fillRect(0, 0, size, size);

  // Large tonal variation, independent of resolution.
  for (let i = 0; i < 110; i++) {
    const x = random() * size;
    const y = random() * size;
    const radius = size * (0.015 + random() * 0.07);
    const green = 55 + Math.floor(random() * 45);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${Math.floor(green * 0.6)}, ${green}, ${Math.floor(green * 0.48)}, 0.22)`);
    gradient.addColorStop(1, `rgba(${Math.floor(green * 0.6)}, ${green}, ${Math.floor(green * 0.48)}, 0)`);
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Blades: density per world area, so the 4K version is genuinely denser.
  const blades = Math.floor((size * size) / 900);
  const bladeWidth = Math.max(1, size / 2048);
  for (let i = 0; i < blades; i++) {
    const green = 40 + Math.floor(random() * 70);
    context.fillStyle = `rgba(${Math.floor(green * 0.55)}, ${green}, ${Math.floor(green * 0.45)}, ${0.2 + random() * 0.45})`;
    const height = Math.max(1, (size / 1024) * (1.5 + random() * 5));
    context.fillRect(random() * size, random() * size, bladeWidth, height);
  }

  return context.canvas;
}

export function makeAsphaltCanvas(size: number): HTMLCanvasElement {
  const context = makeContext(size);
  const random = mulberry32(0x51ed270b);

  context.fillStyle = '#2b2f36';
  context.fillRect(0, 0, size, size);

  // Faded repair patches / tonal blotches.
  for (let i = 0; i < 70; i++) {
    const x = random() * size;
    const y = random() * size;
    const radius = size * (0.01 + random() * 0.075);
    const tone = 38 + Math.floor(random() * 22);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${tone}, ${tone + 3}, ${tone + 7}, 0.3)`);
    gradient.addColorStop(1, `rgba(${tone}, ${tone + 3}, ${tone + 7}, 0)`);
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Tyre wear: long, soft dark bands.
  for (let i = 0; i < 9; i++) {
    const y = random() * size;
    const thickness = size * (0.01 + random() * 0.03);
    const gradient = context.createLinearGradient(0, y - thickness, 0, y + thickness);
    gradient.addColorStop(0, 'rgba(18, 20, 23, 0)');
    gradient.addColorStop(0.5, `rgba(18, 20, 23, ${0.12 + random() * 0.15})`);
    gradient.addColorStop(1, 'rgba(18, 20, 23, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, y - thickness, size, thickness * 2);
  }

  // Aggregate: count scales with pixel area.
  const grains = Math.floor((size * size) / 650);
  for (let i = 0; i < grains; i++) {
    const tone = 34 + Math.floor(random() * 58);
    const grain = Math.max(1, (size / 2048) * (0.6 + random() * 2.4));
    context.fillStyle = `rgba(${tone}, ${tone + 3}, ${tone + 6}, ${0.25 + random() * 0.4})`;
    context.fillRect(random() * size, random() * size, grain, grain);
  }

  // Cracks.
  const cracks = Math.floor(size / 48);
  for (let i = 0; i < cracks; i++) {
    let x = random() * size;
    let y = random() * size;
    context.strokeStyle = `rgba(63, 68, 74, ${0.18 + random() * 0.3})`;
    context.lineWidth = Math.max(0.6, size / 1600);
    context.beginPath();
    context.moveTo(x, y);
    const steps = 3 + Math.floor(random() * 6);
    for (let step = 0; step < steps; step++) {
      x += (random() - 0.5) * size * 0.035;
      y += (random() - 0.5) * size * 0.035;
      context.lineTo(x, y);
    }
    context.stroke();
  }

  // Rubber marks near the threshold.
  context.fillStyle = 'rgba(12, 13, 15, 0.28)';
  for (let i = 0; i < 6; i++) {
    const y = size * (0.35 + random() * 0.3);
    context.fillRect(size * (0.2 + random() * 0.55), y, size * 0.16, Math.max(1, size / 900));
  }

  return context.canvas;
}

export function makeConcreteCanvas(size: number): HTMLCanvasElement {
  const context = makeContext(size);
  const random = mulberry32(0x1f83d9ab);

  context.fillStyle = '#8d939c';
  context.fillRect(0, 0, size, size);

  // Broad stains.
  for (let i = 0; i < 80; i++) {
    const x = random() * size;
    const y = random() * size;
    const radius = size * (0.01 + random() * 0.065);
    const tone = 118 + Math.floor(random() * 52);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${tone}, ${tone + 2}, ${tone + 6}, 0.18)`);
    gradient.addColorStop(1, `rgba(${tone}, ${tone + 2}, ${tone + 6}, 0)`);
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Aggregate.
  const grains = Math.floor((size * size) / 750);
  for (let i = 0; i < grains; i++) {
    const tone = 104 + Math.floor(random() * 84);
    const grain = Math.max(1, (size / 2048) * (0.6 + random() * 2.2));
    context.fillStyle = `rgba(${tone}, ${tone + 2}, ${tone + 5}, ${0.22 + random() * 0.38})`;
    context.fillRect(random() * size, random() * size, grain, grain);
  }

  // Expansion joints (slabs).
  const divisions = 6;
  context.strokeStyle = 'rgba(55, 60, 68, 0.62)';
  context.lineWidth = Math.max(1.2, size / 420);
  for (let i = 0; i <= divisions; i++) {
    const offset = (i / divisions) * size;
    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset, size);
    context.stroke();
    context.beginPath();
    context.moveTo(0, offset);
    context.lineTo(size, offset);
    context.stroke();
  }

  // Hairline cracks and joint chipping.
  const cracks = Math.floor(size / 60);
  for (let i = 0; i < cracks; i++) {
    let x = random() * size;
    let y = random() * size;
    context.strokeStyle = `rgba(58, 62, 69, ${0.14 + random() * 0.24})`;
    context.lineWidth = Math.max(0.6, size / 1500);
    context.beginPath();
    context.moveTo(x, y);
    const steps = 2 + Math.floor(random() * 5);
    for (let step = 0; step < steps; step++) {
      x += (random() - 0.5) * size * 0.03;
      y += (random() - 0.5) * size * 0.03;
      context.lineTo(x, y);
    }
    context.stroke();
  }

  return context.canvas;
}

export function makeWindowCanvas(size: number, litRatio: number): HTMLCanvasElement {
  const context = makeContext(size);
  const random = mulberry32(0x243f6a88 | Math.floor(litRatio * 1000));

  context.fillStyle = '#0a111b';
  context.fillRect(0, 0, size, size);

  const columns = 48;
  const rows = 8;
  const margin = size * 0.02;
  const cellWidth = (size - margin * 2) / columns;
  const cellHeight = (size - margin * 2) / rows;
  const frame = Math.max(1, cellWidth * 0.09);
  const mullion = Math.max(1, cellWidth * 0.035);

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = margin + column * cellWidth;
      const y = margin + row * cellHeight;

      // Frame / façade around each glazed bay.
      context.fillStyle = '#2b3540';
      context.fillRect(x + frame * 0.35, y + frame * 0.35, cellWidth - frame * 0.7, cellHeight - frame * 0.7);

      const glassX = x + frame;
      const glassY = y + frame;
      const glassWidth = cellWidth - frame * 2;
      const glassHeight = cellHeight - frame * 2;

      const lit = random() < litRatio;
      const gradient = context.createLinearGradient(glassX, glassY, glassX, glassY + glassHeight);
      if (lit) {
        const warm = random() < 0.35;
        gradient.addColorStop(0, warm ? '#e8f4ff' : '#ffe0a8');
        gradient.addColorStop(0.55, warm ? '#b9d7ef' : '#ffc46b');
        gradient.addColorStop(1, warm ? '#7d9cb8' : '#c98f3d');
      } else {
        gradient.addColorStop(0, '#16222f');
        gradient.addColorStop(0.6, '#0d1722');
        gradient.addColorStop(1, '#080f17');
      }
      context.fillStyle = gradient;
      context.fillRect(glassX, glassY, glassWidth, glassHeight);

      // Vertical mullion and a subtle top highlight.
      context.fillStyle = 'rgba(12, 18, 25, 0.85)';
      context.fillRect(glassX + glassWidth / 2 - mullion / 2, glassY, mullion, glassHeight);
      context.fillStyle = 'rgba(220, 235, 250, 0.16)';
      context.fillRect(glassX, glassY, glassWidth, Math.max(1, glassHeight * 0.06));
    }
  }

  return context.canvas;
}

export function makeTaxiLineCanvas(size: number): HTMLCanvasElement {
  const context = makeContext(size);
  context.fillStyle = '#2b2f36';
  context.fillRect(0, 0, size, size);
  context.fillStyle = '#f2c94c';
  context.fillRect(size * 0.4, 0, size * 0.2, size);
  return context.canvas;
}

export function makePapiCanvas(size: number): HTMLCanvasElement {
  const context = makeContext(size);
  context.fillStyle = '#ff3b3b';
  context.fillRect(0, 0, size, size / 2);
  context.fillStyle = '#ffffff';
  context.fillRect(0, size / 2, size, size / 2);
  return context.canvas;
}

export function makeStrobeCanvas(size: number): HTMLCanvasElement {
  const context = makeContext(size);
  const grad = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(200,220,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = grad;
  context.fillRect(0, 0, size, size);
  return context.canvas;
}

export function makeCateringCartCanvas(size: number): HTMLCanvasElement {
  const context = makeContext(size);
  context.fillStyle = '#e2e8f0';
  context.fillRect(0, 0, size, size);
  context.fillStyle = '#0f172a';
  context.font = `bold ${Math.floor(size * 0.25)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('CATERING', size / 2, size / 2);
  return context.canvas;
}

export function makeBagCartCanvas(size: number): HTMLCanvasElement {
  const context = makeContext(size);
  context.fillStyle = '#cbd5e1';
  context.fillRect(0, 0, size, size);
  context.fillStyle = '#334155';
  context.fillRect(0, 0, size, size * 0.2);
  return context.canvas;
}

export function makeJetwayCanvas(size: number): HTMLCanvasElement {
  const context = makeContext(size);
  context.fillStyle = '#94a3b8';
  context.fillRect(0, 0, size, size);
  context.fillStyle = '#475569';
  for (let i = 0; i < size; i += size / 8) {
    context.fillRect(0, i, size, 2);
  }
  return context.canvas;
}

/**
 * Side skin of an articulated jetway tunnel: corrugated panels, a dark ribbon
 * window at passenger height and a yellow hazard stripe along the skirt. The
 * texture is repeated along the tunnel, so the panel joints read as ribs.
 */
export function makeJetwayTunnelCanvas(size: number): HTMLCanvasElement {
  const context = makeContext(size);
  const metal = context.createLinearGradient(0, 0, 0, size);
  metal.addColorStop(0, '#d3dbe4');
  metal.addColorStop(0.5, '#b7c2ce');
  metal.addColorStop(1, '#97a3b0');
  context.fillStyle = metal;
  context.fillRect(0, 0, size, size);

  // Corrugation.
  context.fillStyle = 'rgba(70, 82, 96, 0.16)';
  for (let x = 0; x < size; x += size / 32) {
    context.fillRect(x, 0, 2, size);
  }

  // Panel joints.
  context.fillStyle = 'rgba(52, 62, 74, 0.55)';
  for (let x = 0; x < size; x += size / 4) {
    context.fillRect(x, 0, 3, size);
  }

  // Ribbon window.
  const winTop = size * 0.3;
  const winBottom = size * 0.48;
  context.fillStyle = '#22303d';
  context.fillRect(0, winTop, size, winBottom - winTop);
  context.fillStyle = 'rgba(150, 205, 235, 0.22)';
  context.fillRect(0, winTop + (winBottom - winTop) * 0.18, size, (winBottom - winTop) * 0.3);
  context.fillStyle = 'rgba(12, 18, 24, 0.9)';
  for (let x = 0; x < size; x += size / 8) {
    context.fillRect(x, winTop, 4, winBottom - winTop);
  }

  // Skirt and hazard stripe.
  context.fillStyle = '#7d8895';
  context.fillRect(0, size * 0.82, size, size * 0.18);
  context.fillStyle = '#e0b21f';
  context.fillRect(0, size * 0.86, size, size * 0.06);
  context.fillStyle = '#2b333d';
  for (let x = 0; x < size; x += size / 16) {
    context.fillRect(x, size * 0.86, size / 32, size * 0.06);
  }

  return context.canvas;
}

/**
 * Procedural runway textures (Fase 2).
 *
 * The runway is 46 x 2600 m, so unlike the tiled asphalt it gets one
 * dedicated non-repeating texture drawn to scale. All drawing happens in a
 * metre coordinate system: the context is scaled so x spans 0..46 (west to
 * east) and y spans 0..2600 (north threshold 18R to south threshold 36L),
 * which is also how the plane's UVs map (canvas top = north end). Fonts,
 * line widths and rectangles are therefore all expressed in metres, and the
 * same layout code paints the colour map and the roughness map.
 *
 * Resolution note: at 1024x8192 the texture carries ~22 px/m across but
 * only ~3 px/m along the runway, so sub-metre asphalt grain is drawn
 * coarser than on the tiled asphalt — the markings, tyre marks and
 * roughness variation are what the eye reads from the air anyway.
 */

/** Real procedural runway: 46 m wide, 2600 m long (36L/18R). */
export const RUNWAY_LENGTH_M = 2600;
export const RUNWAY_WIDTH_M = 46;

interface RunwayMarkingPalette {
  /** Painted markings: worn white in colour, mid-grey in roughness. */
  paint: string;
  /** Rubber deposits in the touchdown zones. */
  rubber: string;
}

/**
 * Paints the full ICAO-style layout for one runway: edge stripes, centreline
 * dashes, threshold bars, touchdown-zone pairs, aiming point, the "36L" /
 * "18R" designators and the rubber deposits. The context must already be
 * scaled to metres (see makeRunwayCanvas). The designators read from their
 * approach side: "36L" upright for the south approach, "18R" rotated 180
 * degrees for the north approach.
 */
function drawRunwayMarkings(context: CanvasRenderingContext2D, palette: RunwayMarkingPalette): void {
  const W = RUNWAY_WIDTH_M;
  const L = RUNWAY_LENGTH_M;
  const cx = W / 2;

  context.fillStyle = palette.paint;

  // Edge stripes: continuous, 0.9 m wide, just inside each edge.
  context.fillRect(0.9, 0, 0.9, L);
  context.fillRect(W - 1.8, 0, 0.9, L);

  // Centreline dashes: 30 m dash, 20 m gap, 0.9 m wide, clear of the
  // threshold bars at both ends.
  for (let v = 150; v + 30 <= L - 150; v += 50) {
    context.fillRect(cx - 0.45, v, 0.9, 30);
  }

  // Threshold bars ("piano keys"): 8 stripes, 1.75 m wide and 30 m long,
  // starting 6 m past each threshold.
  for (let i = 0; i < 8; i++) {
    const u = 3 + 0.875 + i * 5.46;
    context.fillRect(u, 6, 1.75, 30);
    context.fillRect(u, L - 36, 1.75, 30);
  }

  // Touchdown-zone pairs at 150 m intervals from each threshold. The 300 m
  // pair is the aiming point and is drawn bigger.
  for (const fromEnd of [150, 300, 450, 600, 750, 900]) {
    const aiming = fromEnd === 300;
    const barWidth = aiming ? 6 : 3;
    const barLength = aiming ? 30 : 22.5;
    for (const v of [fromEnd, L - fromEnd]) {
      context.fillRect(cx - 6.75 - barWidth / 2, v - barLength / 2, barWidth, barLength);
      context.fillRect(cx + 6.75 - barWidth / 2, v - barLength / 2, barWidth, barLength);
    }
  }

  // Runway designators, 9 m digits, centred 100 m past each threshold.
  // "36L" sits at the south end and reads upright for the south approach
  // (digit tops toward the north, i.e. the canvas top); "18R" sits at the
  // north end and is rotated 180 degrees for the north approach.
  context.font = 'bold 9px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('36L', cx, L - 100);
  context.save();
  context.translate(cx, 100);
  context.rotate(Math.PI);
  context.fillText('18R', 0, 0);
  context.restore();

  // Rubber deposits: heavy dark streaks on the main-gear tracks in the
  // touchdown zones (150-500 m past each threshold), drawn over the paint
  // so they mute it, as on a real runway.
  const random = mulberry32(0x36c0ffee);
  context.fillStyle = palette.rubber;
  for (const zoneStart of [150, L - 500]) {
    for (const side of [-3.5, 3.5]) {
      for (let i = 0; i < 12; i++) {
        const v = zoneStart + random() * 350;
        const length = 30 + random() * 90;
        context.globalAlpha = 0.15 + random() * 0.3;
        context.fillRect(cx + side - 1.25 + (random() - 0.5) * 0.8, v, 2.5, length);
      }
    }
  }
  context.globalAlpha = 1;
}

/** Asphalt base for the colour map: blotches, aggregate and cracks, in metres. */
function drawRunwayAsphaltBase(context: CanvasRenderingContext2D): void {
  const random = mulberry32(0x51ed270b);
  const W = RUNWAY_WIDTH_M;
  const L = RUNWAY_LENGTH_M;

  context.fillStyle = '#2b2f36';
  context.fillRect(0, 0, W, L);

  for (let i = 0; i < 120; i++) {
    const x = random() * W;
    const y = random() * L;
    const radius = 2 + random() * 16;
    const tone = 38 + Math.floor(random() * 22);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${tone}, ${tone + 3}, ${tone + 7}, 0.3)`);
    gradient.addColorStop(1, `rgba(${tone}, ${tone + 3}, ${tone + 7}, 0)`);
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  for (let i = 0; i < 6000; i++) {
    const tone = 34 + Math.floor(random() * 58);
    const grain = 0.3 + random() * 0.9;
    context.fillStyle = `rgba(${tone}, ${tone + 3}, ${tone + 6}, ${0.25 + random() * 0.4})`;
    context.fillRect(random() * W, random() * L, grain, grain);
  }

  for (let i = 0; i < 30; i++) {
    let x = random() * W;
    let y = random() * L;
    context.strokeStyle = `rgba(63, 68, 74, ${0.18 + random() * 0.3})`;
    context.lineWidth = 0.08;
    context.beginPath();
    context.moveTo(x, y);
    const steps = 3 + Math.floor(random() * 6);
    for (let step = 0; step < steps; step++) {
      x += (random() - 0.5) * 4;
      y += (random() - 0.5) * 4;
      context.lineTo(x, y);
    }
    context.stroke();
  }
}

/** Grey base for the roughness map: asphalt ~235, with tonal variation. */
function drawRunwayRoughnessBase(context: CanvasRenderingContext2D): void {
  const random = mulberry32(0x51ed270b);
  const W = RUNWAY_WIDTH_M;
  const L = RUNWAY_LENGTH_M;

  context.fillStyle = 'rgb(235,235,235)';
  context.fillRect(0, 0, W, L);

  for (let i = 0; i < 120; i++) {
    const x = random() * W;
    const y = random() * L;
    const radius = 2 + random() * 16;
    const tone = 220 + Math.floor(random() * 30);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${tone}, ${tone}, ${tone}, 0.35)`);
    gradient.addColorStop(1, `rgba(${tone}, ${tone}, ${tone}, 0)`);
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

/** Full colour map of the runway, drawn to scale in metres. */
export function makeRunwayCanvas(width: number, height: number): HTMLCanvasElement {
  const context = makeRectContext(width, height);
  context.scale(width / RUNWAY_WIDTH_M, height / RUNWAY_LENGTH_M);
  drawRunwayAsphaltBase(context);
  drawRunwayMarkings(context, {
    paint: 'rgba(235,238,240,0.92)',
    rubber: 'rgba(12,13,15,1)'
  });
  return context.canvas;
}

/**
 * Roughness map with the same layout: asphalt ~0.92, painted markings ~0.6
 * (smoother, slight sheen), rubber deposits ~0.45. Values are 0-255 greys
 * multiplied by the material roughness at render time.
 */
export function makeRunwayRoughnessCanvas(width: number, height: number): HTMLCanvasElement {
  const context = makeRectContext(width, height);
  context.scale(width / RUNWAY_WIDTH_M, height / RUNWAY_LENGTH_M);
  drawRunwayRoughnessBase(context);
  drawRunwayMarkings(context, {
    paint: 'rgb(153,153,153)',
    rubber: 'rgb(115,115,115)'
  });
  return context.canvas;
}

/** Subtle grain normal map: flat (128,128,255) with low-amplitude noise. */
export function makeRunwayNormalCanvas(width: number, height: number): HTMLCanvasElement {
  const context = makeRectContext(width, height);
  const random = mulberry32(0x2a1d2b6b);
  context.fillStyle = 'rgb(128,128,255)';
  context.fillRect(0, 0, width, height);
  context.scale(width / RUNWAY_WIDTH_M, height / RUNWAY_LENGTH_M);
  for (let i = 0; i < 4000; i++) {
    const r = 128 + Math.floor((random() - 0.5) * 24);
    const g = 128 + Math.floor((random() - 0.5) * 24);
    const size = 0.2 + random() * 0.6;
    context.fillStyle = `rgba(${r},${g},255,0.5)`;
    context.fillRect(random() * RUNWAY_WIDTH_M, random() * RUNWAY_LENGTH_M, size, size);
  }
  return context.canvas;
}
