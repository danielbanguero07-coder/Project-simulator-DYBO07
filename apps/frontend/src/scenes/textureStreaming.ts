import * as THREE from 'three';

/**
 * Progressive texture streamer (GTA-style residency management).
 *
 * - Every surface starts with a tiny base texture that is generated
 *   synchronously, so the scene never shows a missing/black map.
 * - Higher resolutions are generated/loaded asynchronously, one mip step at
 *   a time, and only when the surface covers enough screen pixels to justify
 *   them (distance + FOV + viewport height + metres covered by one tile).
 * - A hard VRAM budget is enforced. If an upgrade does not fit, the farthest
 *   over-resident surfaces are downgraded first and their texture is disposed.
 * - Quality caps (1K / 2K / 4K) let the user (or an adaptive quality system)
 *   clamp the stream without rebuilding the scene.
 *
 * This is the same model used by open-world games: a residency budget plus a
 * per-object desired mip level derived from screen-space texel density.
 */

export type TextureQualityCap = 'auto' | 1024 | 2048 | 4096;

export interface StreamAssetDescriptor {
  id: string;
  label: string;
  /** Ascending texture sizes, in texels. The first entry is the always-resident base. */
  levels: number[];
  /**
   * Minimum residency, in texels. In auto mode the streamer never drops below
   * the first level at or above this size. This keeps hero surfaces sharp when
   * the camera zooms out instead of collapsing them to the tiny base mip.
   */
  minSize?: number;
  generate: (size: number) => HTMLCanvasElement;
  /** Push the new texture into one or more material slots. */
  apply: (texture: THREE.Texture) => void;
  /** Metres covered by one repetition of the texture. Used for texel density. */
  tileWorldSize: number;
  /** Distance from the camera to the visible surface, in metres. */
  distance: (camera: THREE.PerspectiveCamera) => number;
  repeat?: [number, number];
  anisotropy?: number;
  colorSpace?: THREE.ColorSpace;
}

export interface StreamedAssetInfo {
  id: string;
  label: string;
  currentSize: number;
  desiredSize: number;
  loading: boolean;
}

export interface TextureStreamStats {
  residentBytes: number;
  budgetBytes: number;
  residentTextures: number;
  pending: number;
  loaded: number;
  evicted: number;
  cap: TextureQualityCap;
  assets: StreamedAssetInfo[];
  lastLoadMs: number;
  lastLoadSize: number;
}

interface InternalAsset {
  desc: StreamAssetDescriptor;
  currentIndex: number;
  desiredIndex: number;
  texture: THREE.Texture | null;
  baseCanvas: HTMLCanvasElement;
  loading: boolean;
  token: number;
  distance: number;
  lastUsed: number;
}

export interface TextureStreamerOptions {
  /** Hard budget for streamed texture residency. */
  budgetBytes?: number;
  /** Parallel upgrades. Keep this low on integrated GPUs. */
  maxConcurrent?: number;
  /** Artificial I/O yield before generating/uploading a level. */
  yieldMs?: number;
}

/** RGBA8 + full mip chain. */
function estimateBytes(size: number): number {
  return Math.round(size * size * 4 * (4 / 3));
}

function makeTexture(
  descriptor: StreamAssetDescriptor,
  canvas: HTMLCanvasElement,
  size: number,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = descriptor.colorSpace ?? THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  const [repeatX, repeatY] = descriptor.repeat ?? [1, 1];
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = descriptor.anisotropy ?? 8;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  // Keep the resolution around for stats.
  texture.userData.size = size;
  return texture;
}

function downscale(source: CanvasImageSource & { width: number; height: number }, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D context unavailable');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, size, size);
  return canvas;
}

export class TextureStreamer {
  private readonly assets: InternalAsset[] = [];
  private readonly budgetBytes: number;
  private readonly maxConcurrent: number;
  private readonly yieldMs: number;
  private cap: TextureQualityCap = 'auto';
  private activeLoads = 0;
  private loaded = 0;
  private evicted = 0;
  private lastLoadMs = 0;
  private lastLoadSize = 0;
  private alive = true;

  constructor(options: TextureStreamerOptions = {}) {
    this.budgetBytes = options.budgetBytes ?? 512 * 1024 * 1024;
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 2);
    this.yieldMs = options.yieldMs ?? 90;
  }

  register(descriptor: StreamAssetDescriptor): void {
    if (!this.alive) return;
    if (descriptor.levels.length === 0) throw new Error(`Texture ${descriptor.id} has no levels`);

    const baseCanvas = descriptor.generate(descriptor.levels[0]);
    const texture = makeTexture(descriptor, baseCanvas, descriptor.levels[0]);
    descriptor.apply(texture);

    this.assets.push({
      desc: descriptor,
      currentIndex: 0,
      desiredIndex: 0,
      texture,
      baseCanvas,
      loading: false,
      token: 0,
      distance: 0,
      lastUsed: performance.now(),
    });
  }

  setQualityCap(cap: TextureQualityCap): void {
    this.cap = cap;
  }

  getQualityCap(): TextureQualityCap {
    return this.cap;
  }

  private assetBytes(asset: InternalAsset): number {
    return estimateBytes(asset.desc.levels[asset.currentIndex]);
  }

  private residentBytes(): number {
    return this.assets.reduce((total, asset) => total + this.assetBytes(asset), 0);
  }

  private maxAllowedIndex(levels: number[]): number {
    let index = levels.length - 1;
    if (this.cap !== 'auto') {
      while (index > 0 && levels[index] > this.cap) index--;
    }
    return index;
  }

  /** First level index whose size reaches `minSize`, clamped to `allowedMax`. */
  private minAllowedIndex(levels: number[], minSize: number, allowedMax: number): number {
    if (minSize <= 0) return 0;
    const index = levels.findIndex((size) => size >= minSize);
    if (index === -1) return allowedMax;
    return Math.min(index, allowedMax);
  }

  /**
   * Call once per frame (or every few frames). Computes desired mip levels,
   * schedules upgrades within the VRAM budget and starts async generation.
   */
  update(camera: THREE.PerspectiveCamera, viewportHeight: number, now = performance.now()): void {
    if (!this.alive) return;
    const height = Math.max(1, viewportHeight);
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

    for (const asset of this.assets) {
      const levels = asset.desc.levels;
      const allowedMax = this.maxAllowedIndex(levels);
      const distance = Math.max(1, asset.desc.distance(camera));
      asset.distance = distance;

      if (this.cap !== 'auto') {
        // A fixed cap means "lock this resolution", not just a ceiling.
        // Auto is the only mode that adapts to screen-space texel density.
        const cap = this.cap;
        const forced = levels.findIndex((size) => size >= cap);
        asset.desiredIndex = forced === -1 ? allowedMax : Math.min(forced, allowedMax);
        continue;
      }

      // Pixels per metre at that distance, then pixels covered by one tile.
      const pixelsPerMetre = height / (2 * tanHalfFov * distance);
      const tilePixels = asset.desc.tileWorldSize * pixelsPerMetre;
      // Small hysteresis: ask for a texture only when the tile would be
      // slightly under-sampled, otherwise near thresholds would thrash.
      // 2.0 targets ~2 texels per screen pixel: a premium, slightly
      // supersampled look instead of the previous blurry 1.15.
      const needed = tilePixels * 2.0;

      let desired = 0;
      while (desired < allowedMax && levels[desired] < needed) desired++;
      // Hero surfaces keep a high-resolution floor even when zoomed out.
      const minIndex = this.minAllowedIndex(levels, asset.desc.minSize ?? 0, allowedMax);
      asset.desiredIndex = Math.max(desired, minIndex);
    }

    // Downgrade surfaces that are now over-resident (too far away or capped).
    for (const asset of this.assets) {
      if (!asset.loading && asset.currentIndex > asset.desiredIndex) {
        this.setLevel(asset, asset.desiredIndex, now);
      }
    }

    // Upgrade nearest / most under-resolved surfaces first.
    const candidates = this.assets
      .filter((asset) => !asset.loading && asset.desiredIndex > asset.currentIndex)
      .sort((a, b) => {
        const priorityA = (a.desiredIndex - a.currentIndex) * 4 + 1 / (a.distance + 8);
        const priorityB = (b.desiredIndex - b.currentIndex) * 4 + 1 / (b.distance + 8);
        return priorityB - priorityA;
      });

    for (const asset of candidates) {
      if (this.activeLoads >= this.maxConcurrent) break;

      // Advance one mip step at a time: 512 -> 1K -> 2K -> 4K.
      const targetIndex = Math.min(asset.desiredIndex, asset.currentIndex + 1);
      const targetSize = asset.desc.levels[targetIndex];
      const projected =
        this.residentBytes() - this.assetBytes(asset) + estimateBytes(targetSize);

      if (projected > this.budgetBytes) {
        const freed = this.evictFor(projected - this.budgetBytes, asset, now);
        const retry =
          this.residentBytes() - this.assetBytes(asset) + estimateBytes(targetSize);
        if (!freed || retry > this.budgetBytes) continue;
      }

      this.startLoad(asset, targetIndex, now);
    }
  }

  private startLoad(asset: InternalAsset, index: number, now: number): void {
    const token = ++asset.token;
    asset.loading = true;
    asset.lastUsed = now;
    this.activeLoads++;

    const size = asset.desc.levels[index];
    const run = async () => {
      // Yield to the render loop before doing the expensive canvas work.
      await new Promise<void>((resolve) => setTimeout(resolve, this.yieldMs));
      if (!this.alive || token !== asset.token) {
        this.finishLoad(asset);
        return;
      }

      const started = performance.now();
      const canvas = asset.desc.generate(size);
      const elapsed = performance.now() - started;

      if (!this.alive || token !== asset.token) {
        this.finishLoad(asset);
        return;
      }

      const texture = makeTexture(asset.desc, canvas, size);
      const previous = asset.texture;
      asset.texture = texture;
      asset.currentIndex = index;
      asset.desc.apply(texture);
      previous?.dispose();

      this.lastLoadMs = Math.round(elapsed);
      this.lastLoadSize = size;
      this.loaded++;
      console.info(`[texture-stream] ${asset.desc.id} ${size}px generated in ${Math.round(elapsed)}ms`);
      this.finishLoad(asset);
    };

    void run();
  }

  private finishLoad(asset: InternalAsset): void {
    asset.loading = false;
    this.activeLoads = Math.max(0, this.activeLoads - 1);
  }

  /** Drop resident levels of low-priority surfaces until `overBytes` is freed. */
  private evictFor(overBytes: number, requester: InternalAsset, now: number): boolean {
    let freed = 0;
    const victims = this.assets
      .filter((asset) => asset !== requester && !asset.loading && asset.currentIndex > 0)
      .sort((a, b) => {
        // Over-resident surfaces go first, then the farthest ones.
        const overA = a.currentIndex - a.desiredIndex;
        const overB = b.currentIndex - b.desiredIndex;
        if (overA !== overB) return overB - overA;
        return b.distance - a.distance;
      });

    for (const victim of victims) {
      if (freed >= overBytes) break;
      const before = this.assetBytes(victim);
      // Never drop below the base level or the asset's quality floor.
      const floor = this.minAllowedIndex(
        victim.desc.levels,
        victim.desc.minSize ?? 0,
        victim.desc.levels.length - 1
      );
      const nextIndex = Math.max(floor, victim.currentIndex - 1);
      if (nextIndex === victim.currentIndex) continue;
      this.setLevel(victim, nextIndex, now);
      freed += before - this.assetBytes(victim);
    }

    return freed >= overBytes;
  }

  /** Synchronously switch to another level by resampling the current canvas. */
  private setLevel(asset: InternalAsset, index: number, now: number): void {
    if (index === asset.currentIndex) return;
    const size = asset.desc.levels[index];
    const downgrade = index < asset.currentIndex;
    let canvas: HTMLCanvasElement;

    if (index === 0) {
      canvas = asset.baseCanvas;
    } else {
      const image = asset.texture?.image as
        | (CanvasImageSource & { width?: number; height?: number })
        | undefined;
      canvas =
        image?.width && image?.height
          ? downscale(image as CanvasImageSource & { width: number; height: number }, size)
          : asset.desc.generate(size);
    }

    const texture = makeTexture(asset.desc, canvas, size);
    const previous = asset.texture;
    asset.texture = texture;
    asset.currentIndex = index;
    asset.lastUsed = now;
    asset.desc.apply(texture);
    previous?.dispose();
    if (downgrade) this.evicted++;
  }

  getStats(): TextureStreamStats {
    return {
      residentBytes: this.residentBytes(),
      budgetBytes: this.budgetBytes,
      residentTextures: this.assets.length,
      pending: this.activeLoads,
      loaded: this.loaded,
      evicted: this.evicted,
      cap: this.cap,
      lastLoadMs: this.lastLoadMs,
      lastLoadSize: this.lastLoadSize,
      assets: this.assets.map((asset) => ({
        id: asset.desc.id,
        label: asset.desc.label,
        currentSize: asset.desc.levels[asset.currentIndex],
        desiredSize: asset.desc.levels[asset.desiredIndex],
        loading: asset.loading,
      })),
    };
  }

  dispose(): void {
    this.alive = false;
    for (const asset of this.assets) {
      asset.token++;
      asset.texture?.dispose();
      asset.texture = null;
    }
    this.assets.length = 0;
  }
}
