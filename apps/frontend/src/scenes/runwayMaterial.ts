import * as THREE from 'three';
import {
  makeRunwayCanvas,
  makeRunwayRoughnessCanvas,
  makeRunwayNormalCanvas
} from './airportTextures';

/**
 * Dedicated material for the procedural runway (Fase 2).
 *
 * The runway gets its own non-tiled texture — colour, roughness and normal
 * maps drawn to scale — instead of sharing the generic tiled asphalt with
 * the taxiways. `setWet` switches the wet look (Fase 4 weather will drive
 * it; until then it is a manual toggle from the SISTEMA panel): the
 * roughness multiplier drops so water sheens, the env reflection rises and
 * the asphalt darkens, as wet tarmac does.
 */
export interface RunwayMaterial {
  material: THREE.MeshStandardMaterial;
  setWet: (wet: boolean) => void;
  isWet: () => boolean;
}

export function createRunwayMaterial(premium: boolean): RunwayMaterial {
  const width = premium ? 1024 : 512;
  const height = premium ? 8192 : 4096;

  const map = new THREE.CanvasTexture(makeRunwayCanvas(width, height));
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 16;

  const roughnessMap = new THREE.CanvasTexture(makeRunwayRoughnessCanvas(width, height));
  roughnessMap.anisotropy = 8;

  const normalMap = new THREE.CanvasTexture(makeRunwayNormalCanvas(width, height));
  normalMap.anisotropy = 8;

  const material = new THREE.MeshStandardMaterial({
    map,
    roughnessMap,
    normalMap,
    roughness: 1.0,
    metalness: 0.05,
    normalScale: new THREE.Vector2(0.6, 0.6),
    envMapIntensity: 0.4
  });

  let wet = false;
  const setWet = (value: boolean): void => {
    wet = value;
    material.roughness = wet ? 0.35 : 1.0;
    material.envMapIntensity = wet ? 1.6 : 0.4;
    material.color.set(wet ? 0x8f979e : 0xffffff);
    material.needsUpdate = true;
  };

  return { material, setWet, isWet: () => wet };
}
