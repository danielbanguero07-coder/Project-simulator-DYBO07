import * as THREE from 'three';
import { AIRPORT_LAYOUT } from './groundNetwork';

/**
 * Apron markings for the home airport.
 *
 * Everything here is flat paint on the concrete, so it is authored as planes
 * at slightly different heights to avoid z-fighting:
 *   - stand numbers 1..13 painted beside each nose-in position
 *   - a white stop bar across each stand lead-in line
 *   - the white apron perimeter and stand boundary lines
 *
 * Repeated paint uses `InstancedMesh` so the whole apron costs a handful of
 * draw calls. The numbers need one small canvas each because every position
 * shows a different digit.
 */

const PAINT_WHITE = 0xf2f2ea;

function makeStandNumberTexture(value: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for stand number');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f2f2ea';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const label = String(value);
  let size = 190;
  ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`;
  while (ctx.measureText(label).width > 216 && size > 60) {
    size -= 6;
    ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`;
  }
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 8);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Number plane oriented so pilots taxiing east read it upright. */
function makeNumberPlane(value: number, x: number, z: number): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({
    map: makeStandNumberTexture(value),
    transparent: true,
    roughness: 0.55,
    metalness: 0
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), material);
  plane.rotation.order = 'YXZ';
  plane.rotation.set(-Math.PI / 2, -Math.PI / 2, 0);
  plane.position.set(x, 0.108, z);
  return plane;
}

interface PaintRect {
  x: number;
  z: number;
  width: number;
  depth: number;
}

/** One instanced row of flat paint rectangles lying on the XZ plane. */
function makePaintRow(rects: PaintRect[], color: number, height: number): THREE.InstancedMesh {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0
  });
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, rects.length));
  const dummy = new THREE.Object3D();
  rects.forEach((rect, i) => {
    dummy.position.set(rect.x, height, rect.z);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.scale.set(rect.width, rect.depth, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.count = rects.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** Builds every apron marking as one group. */
export function createApronMarkings(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'apronMarkings';

  const { gateZ, remoteGateZ, cargoZ, gateX, taxilaneX, crossTaxilaneZ } = AIRPORT_LAYOUT;

  /* ------------------------------ stands 1-13 ----------------------------- */
  const stands = [
    ...gateZ.map((z, i) => ({ id: i + 1, z })),
    ...remoteGateZ.map((z, i) => ({ id: 12 + i, z })),
    ...cargoZ.map((z, i) => ({ id: 9 + i, z }))
  ];

  const stopBars: PaintRect[] = [];
  for (const stand of stands) {
    // Stand number, offset south of the lead-in line so it stays clear of the
    // fuselage and wing.
    group.add(makeNumberPlane(stand.id, gateX + 10, stand.z - 20));
    // Stop bar across the lead-in line, at the nose-wheel stop point.
    stopBars.push({ x: gateX + 8, z: stand.z, width: 1, depth: 5 });
  }
  group.add(makePaintRow(stopBars, PAINT_WHITE, 0.105));

  /* --------------------------- stand separators --------------------------- */
  const sortedZ = [...stands.map((s) => s.z)].sort((a, b) => a - b);
  const separators: PaintRect[] = [];
  for (let i = 0; i < sortedZ.length - 1; i++) {
    separators.push({
      x: taxilaneX + 25,
      z: (sortedZ[i] + sortedZ[i + 1]) / 2,
      width: 50,
      depth: 0.5
    });
  }
  group.add(makePaintRow(separators, PAINT_WHITE, 0.103));

  /* ------------------------- apron perimeter lines ------------------------ */
  // South, north and east edges of the concrete apron. The west edge is left
  // open because Alpha and the cross taxilanes join there.
  const apronWest = 90;
  const apronEast = 337;
  const apronSouth = -560;
  const apronNorth = 765;
  const edge = 0.8;

  const perimeter: PaintRect[] = [
    {
      x: (apronWest + apronEast) / 2,
      z: apronSouth,
      width: apronEast - apronWest,
      depth: edge
    },
    {
      x: (apronWest + apronEast) / 2,
      z: apronNorth,
      width: apronEast - apronWest,
      depth: edge
    },
    {
      x: apronEast,
      z: (apronNorth + apronSouth) / 2,
      width: edge,
      depth: apronNorth - apronSouth
    }
  ];

  // West edge, broken at every cross taxilane so the asphalt still reads as
  // part of the taxiway network.
  const sortedCross = [...crossTaxilaneZ].sort((a, b) => a - b);
  let cursor = apronSouth;
  for (const z of sortedCross) {
    const start = z - 19;
    if (start > cursor) {
      perimeter.push({
        x: apronWest,
        z: (cursor + start) / 2,
        width: edge,
        depth: start - cursor
      });
    }
    cursor = z + 19;
  }
  if (cursor < apronNorth) {
    perimeter.push({
      x: apronWest,
      z: (cursor + apronNorth) / 2,
      width: edge,
      depth: apronNorth - cursor
    });
  }
  group.add(makePaintRow(perimeter, PAINT_WHITE, 0.102));

  // Dashed white edge along the apron side of Bravo, so the taxilane reads as
  // a lane inside the concrete rather than an invisible line.
  const bravoEdge: PaintRect[] = [];
  const bravoX = taxilaneX + 10;
  for (let z = apronSouth + 10; z < apronNorth - 10; z += 26) {
    if (crossTaxilaneZ.some((cz) => Math.abs(cz - z) < 22)) continue;
    bravoEdge.push({ x: bravoX, z, width: 0.5, depth: 10 });
  }
  group.add(makePaintRow(bravoEdge, PAINT_WHITE, 0.102));

  return group;
}

export default { createApronMarkings };
