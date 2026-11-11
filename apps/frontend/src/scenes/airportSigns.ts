import * as THREE from 'three';
import { AIRPORT_LAYOUT } from './groundNetwork';

/**
 * Taxiway signage for the home airport.
 *
 * Three FAA-style panels, all with canvas textures so they stay sharp at any
 * distance and cost one material each:
 *   - location   (yellow / black)  ... "A", "B"
 *   - direction  (yellow / black)  ... "A1 ->", "A2 ->"
 *   - mandatory  (red / white)     ... runway holding position "36L-18R"
 *
 * Panels are plain emissive-textured planes on a thin post: no real lights,
 * so the night budget stays the same.
 */

export type SignKind = 'location' | 'direction' | 'mandatory';

export interface SignDefinition {
  text: string;
  kind: SignKind;
  x: number;
  z: number;
  /** Facing direction in radians: 0 looks towards +Z, PI/2 towards +X. */
  yaw: number;
}

function makeSignTexture(text: string, kind: SignKind): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for taxiway sign');

  const mandatory = kind === 'mandatory';
  ctx.fillStyle = mandatory ? '#c8202b' : '#f2c400';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = mandatory ? '#ffffff' : '#101010';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

  const label = kind === 'direction' ? `${text} \u2192` : text;
  let size = 112;
  ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`;
  while (ctx.measureText(label).width > canvas.width - 60 && size > 42) {
    size -= 4;
    ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`;
  }
  ctx.fillStyle = mandatory ? '#ffffff' : '#101010';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Builds the sign panels and posts from a list of definitions. */
export function createTaxiwaySigns(signs: SignDefinition[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'taxiwaySigns';

  const postGeometry = new THREE.BoxGeometry(0.16, 2.8, 0.16);
  const postMaterial = new THREE.MeshStandardMaterial({
    color: 0x6c747c,
    roughness: 0.7,
    metalness: 0.3
  });

  for (const sign of signs) {
    const mandatory = sign.kind === 'mandatory';
    const width = mandatory ? 3.4 : sign.kind === 'direction' ? 2.9 : 2.2;
    const height = mandatory ? 1.1 : 0.95;

    const texture = makeSignTexture(sign.text, sign.kind);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshStandardMaterial({
        map: texture,
        emissive: 0xffffff,
        emissiveMap: texture,
        emissiveIntensity: 0.3,
        roughness: 0.55,
        metalness: 0.1,
        side: THREE.DoubleSide
      })
    );
    panel.position.set(sign.x, 2.75, sign.z);
    panel.rotation.y = sign.yaw;
    group.add(panel);

    const post = new THREE.Mesh(postGeometry, postMaterial);
    post.position.set(sign.x, 1.4, sign.z);
    group.add(post);
  }

  return group;
}

/**
 * Sign layout for the home hub, derived from AIRPORT_LAYOUT so it follows any
 * future change to the taxiway geometry.
 */
export function createHomeAirportSigns(): THREE.Group {
  const { taxiwayX, taxilaneX, crossTaxilaneZ, runwayExitZ, runwayExitDrop } =
    AIRPORT_LAYOUT;
  const signs: SignDefinition[] = [];

  // Alpha location signs beside each apron entrance, clear of the pavement.
  crossTaxilaneZ.forEach((z) => {
    signs.push({ text: 'A', kind: 'location', x: taxiwayX - 26, z: z - 24, yaw: -Math.PI / 2 });
  });

  // Direction signs for the high-speed exits, on the grass west of Alpha and
  // just past the merge point.
  runwayExitZ.forEach((z, i) => {
    signs.push({
      text: `A${i + 1}`,
      kind: 'direction',
      x: taxiwayX - 24,
      z: z - runwayExitDrop - 14,
      yaw: -Math.PI / 2
    });
  });

  // Bravo location signs on the apron side of each cross taxilane.
  crossTaxilaneZ.forEach((z) => {
    signs.push({
      text: 'B',
      kind: 'location',
      x: taxilaneX + 8,
      z: z + 24,
      yaw: Math.PI / 2
    });
  });

  // Runway holding position signs (red) in the grass strip between the runway
  // and Alpha, beside each exit's holding point.
  runwayExitZ.forEach((z) => {
    signs.push({
      text: '36L-18R',
      kind: 'mandatory',
      x: 30,
      z: z - 75,
      yaw: -Math.PI / 2
    });
  });

  // Runway holding position signs at both end connectors.
  for (const s of [1, -1]) {
    signs.push({
      text: 'HOLD SHORT',
      kind: 'mandatory',
      x: 40,
      z: 1090 * s,
      yaw: -Math.PI / 2
    });
  }

  return createTaxiwaySigns(signs);
}
