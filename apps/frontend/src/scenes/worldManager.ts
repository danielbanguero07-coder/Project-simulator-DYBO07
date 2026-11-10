import * as THREE from 'three';

export interface WorldAssetDescriptor {
  id: string;
  load: () => Promise<THREE.Object3D>;
  position: THREE.Vector3;
  rotation?: THREE.Euler;
  scale?: THREE.Vector3;
  lodDistances: number[]; // Distances at which to switch LODs or evict
  category?: 'building' | 'vehicle' | 'structure' | 'foggy';
}

interface ManagedAsset {
  desc: WorldAssetDescriptor;
  instance: THREE.Object3D | null;
  loading: boolean;
  distance: number;
  lastUsed: number;
}

export interface WorldManagerStats {
  residentCount: number;
  loadingCount: number;
  budgetRemaining: number;
}

export class WorldManager {
  private assets: ManagedAsset[] = [];
  private scene: THREE.Scene;
  private budgetObjects: number;
  private streamingDistance: number;
  private activeLoads = 0;

  constructor(scene: THREE.Scene, options: { budgetObjects?: number; streamingDistance?: number } = {}) {
    this.scene = scene;
    this.budgetObjects = options.budgetObjects ?? 100;
    this.streamingDistance = options.streamingDistance ?? 2000;
  }

  register(descriptor: WorldAssetDescriptor) {
    this.assets.push({
      desc: descriptor,
      instance: null,
      loading: false,
      distance: Infinity,
      lastUsed: performance.now(),
    });
  }

  update(cameraPosition: THREE.Vector3) {
    const now = performance.now();

    for (const asset of this.assets) {
      asset.distance = cameraPosition.distanceTo(asset.desc.position);

      const shouldBeVisible = asset.distance < this.streamingDistance;

      if (shouldBeVisible && !asset.instance && !asset.loading && this.activeLoads < this.budgetObjects) {
        this.loadAsset(asset);
      } else if (!shouldBeVisible && asset.instance) {
        this.unloadAsset(asset);
      }

      if (asset.instance) {
        asset.lastUsed = now;
      }
    }

    // Enforce object budget if necessary
    const resident = this.assets.filter(a => !!a.instance);
    if (resident.length > this.budgetObjects) {
      resident.sort((a, b) => b.distance - a.distance);
      const toUnload = resident.slice(0, resident.length - this.budgetObjects);
      for (const a of toUnload) {
        this.unloadAsset(a);
      }
    }
  }

  private async loadAsset(asset: ManagedAsset) {
    asset.loading = true;
    this.activeLoads++;
    try {
      const obj = await asset.desc.load();
      obj.position.copy(asset.desc.position);
      if (asset.desc.rotation) obj.rotation.copy(asset.desc.rotation);
      if (asset.desc.scale) obj.scale.copy(asset.desc.scale);
      
      // Set cast/receive shadow based on category
      if (asset.desc.category !== 'foggy') {
        obj.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });
      }
      
      asset.instance = obj;
      this.scene.add(obj);
    } catch (e) {
      console.error(`Failed to load asset ${asset.desc.id}`, e);
    } finally {
      asset.loading = false;
      this.activeLoads--;
    }
  }

  private unloadAsset(asset: ManagedAsset) {
    if (asset.instance) {
      this.scene.remove(asset.instance);
      // Recursively dispose geometries and materials
      asset.instance.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          if (Array.isArray(node.material)) {
            node.material.forEach(m => m.dispose());
          } else {
            node.material.dispose();
          }
        }
      });
      asset.instance = null;
    }
  }

  getStats(): WorldManagerStats {
    return {
      residentCount: this.assets.filter(a => !!a.instance).length,
      loadingCount: this.assets.filter(a => a.loading).length,
      budgetRemaining: Math.max(0, this.budgetObjects - this.assets.filter(a => !!a.instance).length),
    };
  }

  dispose() {
    // Unload all assets
    for (const asset of this.assets) {
      this.unloadAsset(asset);
    }
    this.assets = [];
  }

  // Preload assets within a radius (predictive streaming)
  preloadRegion(center: THREE.Vector3, radius: number) {
    for (const asset of this.assets) {
      const distance = center.distanceTo(asset.desc.position);
      if (distance < radius && !asset.instance && !asset.loading) {
        this.loadAsset(asset);
      }
    }
  }
}