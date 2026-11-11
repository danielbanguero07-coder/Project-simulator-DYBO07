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
