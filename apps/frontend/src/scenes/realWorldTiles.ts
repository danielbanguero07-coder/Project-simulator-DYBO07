import * as THREE from 'three';
import { TilesRenderer, type TilesRendererEventMap } from '3d-tiles-renderer';
import {
  CesiumIonAuthPlugin,
  GLTFExtensionsPlugin,
  LoadRegionPlugin,
  ReorientationPlugin,
  SphereRegion,
  TileCompressionPlugin
} from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { HOME_AIRPORT } from './airports';
import { geoToLocal, localToGeo } from './geo';

/**
 * Real-world visual layer for the prototype "MEX real" mode.
 *
 * IMPORTANT UNITS: in this mode 1 three.js unit = 1 real metre. This is NOT
 * the compressed procedural world used by the default game, where the 16 km
 * scene represents a much larger area. Nothing here feeds physics, traffic,
 * schedules or airport positions: the tiles are visual only.
 *
 * TODO (future phase): replace the procedural `heightAt` terrain sampling with
 * real terrain heights from these tiles so aircraft can land on the real MEX.
 */

const PRIMARY_ASSET_ID = '2275207'; // Google Photorealistic 3D Tiles
const FALLBACK_ASSET_ID = '1'; // Cesium World Terrain
const LOAD_RADIUS_M = 10_000; // Only stream tiles around MEX on a GTX 1650.
const ERROR_TARGET = 32; // Conservative screen-space error (pixels).
const REGION_ERROR_TARGET_M = 25; // Metric detail cap inside the 10 km mask.
const LOAD_TIMEOUT_MS = 45_000;
/**
 * How far the camera must move from the load region's centre before the
 * region follows it. The 10 km sphere stays put for small moves and jumps
 * in 2 km steps, so tiles are not re-evaluated every frame.
 */
const RECENTER_MIN_MOVE_M = 2_000;
const DRACO_DECODER_PATH = '/draco/';

type RootListener = (
  event: TilesRendererEventMap['load-root-tileset'] & { type: 'load-root-tileset' }
) => void;
type LoadErrorListener = (
  event: TilesRendererEventMap['load-error'] & { type: 'load-error' }
) => void;

export type RealWorldStatus = 'loading' | 'ready' | 'error' | 'unavailable';

export interface RealWorldState {
  status: RealWorldStatus;
  /** Human-readable reason for the current status. Never contains the token. */
  reason: string;
  /** Cesium ion asset currently in use, when known. */
  assetId: string | null;
  /** Tiles currently visible (not just cached). */
  visibleTiles: number;
  /** Rough GPU memory estimate for the tile group, in bytes. */
  approximateBytes: number;
}

export interface RealWorldTilesOptions {
  onStatusChange?: (state: RealWorldState) => void;
}

/** MEX geodetic origin, shared with the project's `geoToLocal` helpers. */
const MEX_ORIGIN = { lat: HOME_AIRPORT.lat, lon: HOME_AIRPORT.lon };
const MEX_LAT_RAD = THREE.MathUtils.degToRad(HOME_AIRPORT.lat);
const MEX_LON_RAD = THREE.MathUtils.degToRad(HOME_AIRPORT.lon);
const MEX_ELEVATION_M = HOME_AIRPORT.elevationRealM;

/**
 * Explicit metric offset of the MEX origin in the real-world frame. With MEX
 * as the origin this is (0, 0), but keeping the `geoToLocal` call documents the
 * convention and lets a future sub-origin move the group without touching the
 * tile data.
 */
const MEX_LOCAL_OFFSET = geoToLocal(MEX_ORIGIN.lat, MEX_ORIGIN.lon, MEX_ORIGIN, 1);

/** Read the token only from the Vite env. Never hardcode or log it. */
function readIonToken(): string | null {
  const value = import.meta.env.VITE_CESIUM_ION_TOKEN;
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return token.length > 0 ? token : null;
}

/** Strip credentials from error messages before they reach the console. */
function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/([?&](?:access_token|token|key)=)[^&\s]+/gi, '$1***');
}

/** Pure helper: does the load region need to follow the camera this far? */
export function shouldRecenterRegion(
  centerX: number,
  centerZ: number,
  x: number,
  z: number,
  minMoveM = RECENTER_MIN_MOVE_M
): boolean {
  const dx = x - centerX;
  const dz = z - centerZ;
  return dx * dx + dz * dz >= minMoveM * minMoveM;
}
function estimateBytes(root: THREE.Object3D): number {
  const geometries = new Set<THREE.BufferGeometry>();
  const textures = new Set<THREE.Texture>();
  let bytes = 0;

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const geometry = mesh.geometry;
    if (geometry && !geometries.has(geometry)) {
      geometries.add(geometry);
      for (const attribute of Object.values(geometry.attributes)) {
        const array = (attribute as unknown as { array?: { byteLength?: number } }).array;
        bytes += array?.byteLength ?? 0;
      }
      const index = geometry.index?.array as unknown as { byteLength?: number } | undefined;
      bytes += index?.byteLength ?? 0;
    }

    const material = mesh.material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    for (const entry of materials) {
      for (const value of Object.values(entry)) {
        const texture = value as THREE.Texture | undefined;
        if (!texture?.isTexture || textures.has(texture)) continue;
        textures.add(texture);
        const image = texture.image as { width?: number; height?: number } | undefined;
        if (image?.width && image?.height) {
          bytes += image.width * image.height * 4;
        }
      }
    }
  });

  return bytes;
}

export class RealWorldTiles {
  private readonly scene: THREE.Scene;
  private readonly options: RealWorldTilesOptions;

  private tiles: TilesRenderer | null = null;
  private dracoLoader: DRACOLoader | null = null;
  private region: SphereRegion | null = null;
  /** Local (x, z) the load region's sphere is currently centred on. */
  private readonly regionCenterLocal = new THREE.Vector2(0, 0);
  private rootListener: RootListener | null = null;
  private errorListener: LoadErrorListener | null = null;
  private loadTimeout: number | null = null;

  private lastCamera: THREE.Camera | null = null;
  private lastRenderer: THREE.WebGLRenderer | null = null;
  private readonly lastSize = new THREE.Vector2(-1, -1);
  private readonly tmpSize = new THREE.Vector2();

  private status: RealWorldStatus = 'unavailable';
  private reason = 'El modo mundo real no está activo.';
  private assetId: string | null = null;
  private fallbackTried = false;
  private generation = 0;
  private disposed = false;
  private attributionEl: HTMLDivElement | null = null;
  private loggedReady = false;
  private lastStatLog = 0;

  constructor(scene: THREE.Scene, options: RealWorldTilesOptions = {}) {
    this.scene = scene;
    this.options = options;
  }

  getState(): RealWorldState {
    return {
      status: this.status,
      reason: this.reason,
      assetId: this.assetId,
      visibleTiles: this.tiles?.visibleTiles.size ?? 0,
      approximateBytes: this.tiles ? estimateBytes(this.tiles.group) : 0
    };
  }

  /**
   * Activates the real-world layer. Returns the initial state: if the token is
   * missing this is `unavailable` and the procedural world must stay visible.
   */
  enable(): RealWorldState {
    this.disposed = false;

    if (this.tiles) return this.getState();

    const token = readIonToken();
    if (!token) {
      console.warn(
        '[real-world] Falta VITE_CESIUM_ION_TOKEN en apps/frontend/.env.local. ' +
          'El modo mundo real queda no disponible y se mantiene el mundo procedural.'
      );
      this.hideAttribution();
      this.setStatus(
        'unavailable',
        'Falta VITE_CESIUM_ION_TOKEN en apps/frontend/.env.local.'
      );
      return this.getState();
    }

    this.fallbackTried = false;
    this.showAttribution();
    this.setStatus('loading', 'Conectando con Cesium ion…');
    this.startAsset(PRIMARY_ASSET_ID, token, false);
    return this.getState();
  }

  /** Deactivates the layer and releases every GPU resource. */
  disable(): void {
    this.disposeTiles();
    this.hideAttribution();
    this.setStatus('unavailable', 'Modo mundo real desactivado.');
  }

  /** Final teardown, called when the whole demo is disposed. */
  dispose(): void {
    this.disposed = true;
    this.disposeTiles();
    this.hideAttribution();
    this.attributionEl?.remove();
    this.attributionEl = null;
    this.lastCamera = null;
    this.lastRenderer = null;
  }

  /**
   * Drives tile selection/streaming. Safe to call every frame; it no-ops while
   * the mode is loading, unavailable or in error.
   */
  update(camera: THREE.Camera, renderer: THREE.WebGLRenderer): void {
    const tiles = this.tiles;
    if (!tiles || this.disposed) return;

    if (this.lastCamera !== camera) {
      if (this.lastCamera) tiles.deleteCamera(this.lastCamera);
      tiles.setCamera(camera);
      this.lastCamera = camera;
      this.lastSize.set(-1, -1);
    }
    this.lastRenderer = renderer;

    renderer.getSize(this.tmpSize);
    if (!this.lastSize.equals(this.tmpSize)) {
      tiles.setResolutionFromRenderer(camera, renderer);
      this.lastSize.copy(this.tmpSize);
    }

    tiles.update();
    this.followCamera(camera);
    this.logProgress(tiles);
  }

  /**
   * The load region is a 10 km sphere that used to sit fixed on MEX: flying
   * further than that left the aircraft over the coarsest root tiles, which
   * never refine (the mask suppresses everything outside the sphere). The
   * region now follows the camera in 2 km steps, so detailed tiles stream
   * wherever the player flies. The plugin re-evaluates `region.sphere` on
   * every tile check (SphereRegion.intersectsTile reads it live), so moving
   * the sphere is enough — the tileset is not rebuilt.
   */
  private followCamera(camera: THREE.Camera): void {
    const tiles = this.tiles;
    const region = this.region;
    if (!tiles || !region || this.disposed) return;
    const cx = camera.position.x;
    const cz = camera.position.z;
    if (!shouldRecenterRegion(this.regionCenterLocal.x, this.regionCenterLocal.y, cx, cz)) return;

    const geo = localToGeo(cx, cz, MEX_ORIGIN, 1);
    tiles.ellipsoid.getCartographicToPosition(
      THREE.MathUtils.degToRad(geo.lat),
      THREE.MathUtils.degToRad(geo.lon),
      MEX_ELEVATION_M,
      region.sphere.center
    );
    this.regionCenterLocal.set(cx, cz);
    console.info(
      `[real-world] Región de carga recentrada a (${Math.round(cx)}, ${Math.round(cz)}) m desde MEX.`
    );
  }

  private startAsset(assetId: string, token: string, isFallback: boolean): void {
    this.disposeTiles();

    this.assetId = assetId;
    this.loggedReady = false;
    this.lastStatLog = 0;

    const generation = ++this.generation;
    const tiles = new TilesRenderer();
    tiles.errorTarget = ERROR_TARGET;
    tiles.group.name = 'realWorldTiles';

    // Keep the model upright and centred on MEX. Reactor plugin centers the
    // point at `height` on the origin with X west / Z north; azimuth PI turns
    // that into the project's X east / Z south convention.
    const reorient = new ReorientationPlugin({
      lat: MEX_LAT_RAD,
      lon: MEX_LON_RAD,
      height: MEX_ELEVATION_M,
      azimuth: Math.PI
    });

    // Limit streaming to a sphere around MEX in the tiles' ECEF frame. The
    // mask suppresses every tile outside the 10 km radius.
    //
    // LoadRegionPlugin replaces the renderer's screen-space error with the
    // region's own metric target (`geometricError - region.target +
    // renderer.errorTarget`), so this knob is what actually caps detail inside
    // the mask. 25 m keeps MEX readable at 2 km altitude without streaming
    // every photogrammetry LOD level on a GTX 1650. `tiles.errorTarget` stays
    // as the conservative default for tiles/plugins outside the region logic.
    const regionCenter = new THREE.Vector3();
    tiles.ellipsoid.getCartographicToPosition(
      MEX_LAT_RAD,
      MEX_LON_RAD,
      MEX_ELEVATION_M,
      regionCenter
    );
    const region = new SphereRegion({
      sphere: new THREE.Sphere(regionCenter, LOAD_RADIUS_M),
      mask: true,
      errorTarget: REGION_ERROR_TARGET_M
    });
    const loadRegion = new LoadRegionPlugin();
    loadRegion.addRegion(region);
    this.region = region;
    this.regionCenterLocal.set(0, 0);

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    this.dracoLoader = dracoLoader;

    tiles.registerPlugin(
      new CesiumIonAuthPlugin({
        apiToken: token,
        assetId,
        autoRefreshToken: true,
        // We set our own conservative ERROR_TARGET instead of the suggested 20.
        useRecommendedSettings: false
      })
    );
    tiles.registerPlugin(
      new TileCompressionPlugin({
        // Keep mipmaps: at 2 km altitude they prevent strong shimmering.
        disableMipmaps: false
      })
    );
    tiles.registerPlugin(
      new GLTFExtensionsPlugin({
        dracoLoader
      })
    );
    tiles.registerPlugin(reorient);
    tiles.registerPlugin(loadRegion);

    const onRoot: RootListener = () => {
      if (this.disposed || generation !== this.generation) return;
      if (this.loadTimeout !== null) {
        window.clearTimeout(this.loadTimeout);
        this.loadTimeout = null;
      }

      // GoogleCloudAuthPlugin is not allowed to raise errorTarget, but keep
      // this explicit so a future library upgrade cannot silently undo it.
      tiles.errorTarget = ERROR_TARGET;

      // The reorientation plugin already placed MEX at (0, 0, 0). Applying
      // the documented metric offset also keeps the group anchored to the
      // project's geoToLocal frame. It is additive because group.position
      // holds the ECEF-to-local translation, not the geographic origin.
      tiles.group.position.x += MEX_LOCAL_OFFSET.x;
      tiles.group.position.z += MEX_LOCAL_OFFSET.z;
      tiles.group.updateMatrixWorld();

      this.setStatus(
        'ready',
        isFallback
          ? 'Cesium World Terrain (respaldo de Cesium ion).'
          : 'Google Photorealistic 3D Tiles (Cesium ion).'
      );
    };

    const onError: LoadErrorListener = (event) => {
      if (this.disposed || generation !== this.generation) return;
      // Sub-tile failures are not fatal; only a root failure triggers fallback.
      if (event.tile !== null) return;
      this.handleAssetFailure(assetId, event.error);
    };

    tiles.addEventListener('load-root-tileset', onRoot);
    tiles.addEventListener('load-error', onError);
    // Remove any shadow flags from streamed meshes. Photogrammetry is baked
    // with its own lighting and must not cast or receive the procedural sun.
    tiles.addEventListener('load-model', (event) => {
      event.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = false;
          mesh.receiveShadow = false;
        }
      });
    });

    this.rootListener = onRoot;
    this.errorListener = onError;
    this.tiles = tiles;
    this.scene.add(tiles.group);

    if (this.lastCamera && this.lastRenderer) {
      tiles.setCamera(this.lastCamera);
      tiles.setResolutionFromRenderer(this.lastCamera, this.lastRenderer);
      this.lastSize.set(-1, -1);
    }

    this.loadTimeout = window.setTimeout(() => {
      if (this.disposed || generation !== this.generation) return;
      this.handleAssetFailure(assetId, new Error('Cesium ion no respondió a tiempo.'));
    }, LOAD_TIMEOUT_MS);
  }

  private handleAssetFailure(assetId: string, error: unknown): void {
    if (this.disposed) return;
    if (this.loadTimeout !== null) {
      window.clearTimeout(this.loadTimeout);
      this.loadTimeout = null;
    }

    const message = safeErrorMessage(error);
    if (assetId === PRIMARY_ASSET_ID && !this.fallbackTried) {
      this.fallbackTried = true;
      console.warn(
        `[real-world] El asset ${PRIMARY_ASSET_ID} (Google) no cargó: ${message}. ` +
          `Probando Cesium World Terrain (asset ${FALLBACK_ASSET_ID}) como respaldo…`
      );
      const token = readIonToken();
      if (token) {
        this.startAsset(FALLBACK_ASSET_ID, token, true);
        return;
      }
    }

    console.error(
      `[real-world] No se pudo cargar el mundo real: ${message}. ` +
        'Se vuelve al mundo procedural.'
    );
    this.disposeTiles();
    this.hideAttribution();
    this.setStatus('error', message);
  }

  private disposeTiles(): void {
    if (this.loadTimeout !== null) {
      window.clearTimeout(this.loadTimeout);
      this.loadTimeout = null;
    }

    const tiles = this.tiles;
    if (tiles) {
      if (this.rootListener) tiles.removeEventListener('load-root-tileset', this.rootListener);
      if (this.errorListener) tiles.removeEventListener('load-error', this.errorListener);
      tiles.dispose();
      // `dispose()` releases GPUs resources but leaves the container attached.
      tiles.group.removeFromParent();
    }

    this.rootListener = null;
    this.errorListener = null;
    this.tiles = null;
    this.region = null;
    this.regionCenterLocal.set(0, 0);
    this.dracoLoader?.dispose();
    this.dracoLoader = null;
    this.lastSize.set(-1, -1);
    this.generation++;
  }

  private logProgress(tiles: TilesRenderer): void {
    if (this.status !== 'ready') return;

    const now = performance.now();
    const visible = tiles.visibleTiles.size;
    if (visible === 0) return;

    if (!this.loggedReady) {
      this.loggedReady = true;
      this.lastStatLog = now;
      const megabytes = estimateBytes(tiles.group) / (1024 * 1024);
      console.info(
        `[real-world] Mundo real listo (asset ${this.assetId}): ` +
          `${visible} tiles visibles, ${megabytes.toFixed(1)} MB aprox., ` +
          `errorTarget ${tiles.errorTarget}, radio ${LOAD_RADIUS_M / 1000} km.`
      );
      return;
    }

    // Periodic tuning line so the tile count can be watched while orbiting.
    if (now - this.lastStatLog > 15_000) {
      this.lastStatLog = now;
      const megabytes = estimateBytes(tiles.group) / (1024 * 1024);
      console.info(
        `[real-world] tiles visibles: ${visible}, ` +
          `activos: ${tiles.activeTiles.size}, memoria aprox.: ${megabytes.toFixed(1)} MB.`
      );
    }
  }

  private setStatus(status: RealWorldStatus, reason: string): void {
    this.status = status;
    this.reason = reason;
    this.options.onStatusChange?.(this.getState());
  }

  private showAttribution(): void {
    if (!this.attributionEl) {
      const element = document.createElement('div');
      element.textContent = '© Google · © Cesium ion';
      element.title = 'Datos: Google Photorealistic 3D Tiles · Cesium ion';
      element.setAttribute('role', 'note');
      Object.assign(element.style, {
        position: 'fixed',
        right: '12px',
        bottom: '12px',
        zIndex: '60',
        padding: '4px 8px',
        borderRadius: '6px',
        border: '1px solid rgba(255,255,255,0.16)',
        background: 'rgba(2,6,23,0.74)',
        color: '#e2e8f0',
        font: '11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
        pointerEvents: 'none',
        backdropFilter: 'blur(6px)'
      });
      document.body.appendChild(element);
      this.attributionEl = element;
    }
    this.attributionEl.style.display = 'block';
  }

  private hideAttribution(): void {
    if (this.attributionEl) this.attributionEl.style.display = 'none';
  }
}
