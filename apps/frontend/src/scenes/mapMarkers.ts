import { ALL_AIRPORTS, HOME_AIRPORT, type AirportDefinition } from './airports';
import { realAirportView } from './realAirNetwork';

/**
 * Shared data for the navigation system (minimap + full map).
 *
 * One aircraft marker, whether it comes from the en-route traffic
 * (RouteTraffic) or the ground/air traffic around the airport
 * (TrafficManager). Positions are world metres in the active mode's
 * coordinate system: compressed procedural coordinates, or real metres
 * from the MEX origin in real mode.
 */
export interface MapAircraft {
  id: string;
  label: string;
  kind: 'route' | 'traffic';
  x: number;
  z: number;
  altitude: number;
  /** True compass heading, 0 = north. */
  headingDeg: number;
  /** Speed in m/s. */
  speed: number;
  /** Raw phase/state string ('airborne', 'parked', 'taxiOut', ...). */
  phase: string;
  destination?: string;
  visible: boolean;
  /** RouteTraffic extras, kept for the tower/status readouts. */
  flight?: string;
  t?: number;
}

/**
 * True compass heading from a scene yaw (radians). The scene's forward is
 * (sin yaw, 0, cos yaw) with +Z south, so heading = 180 - yaw. Same
 * correction as FlightHUD and NavigationMap.
 */
export function trueHeadingFromYaw(yawRad: number): number {
  return (((180 - (yawRad * 180) / Math.PI) % 360) + 360) % 360;
}

/**
 * Airports with display positions for the current world mode. In real mode
 * the positions come from the real views (geoToLocal, MEX at the real runway
 * centre) and the elevation is the scene ground level (0): the real tiles
 * are recentred to Y=0, so passing elevationRealM to focusAirport would
 * park the camera 2 km up.
 */
export function getMapAirports(realMode: boolean): AirportDefinition[] {
  if (!realMode) return ALL_AIRPORTS;
  return ALL_AIRPORTS.map((airport) => ({ ...realAirportView(airport), elevation: 0 }));
}

export function getHomeAirport(realMode: boolean): AirportDefinition {
  return getMapAirports(realMode).find((a) => a.code === HOME_AIRPORT.code) ?? HOME_AIRPORT;
}

/** North-up world-to-map projection (+x east, +z south = down on the map). */
export interface MapProjection {
  width: number;
  height: number;
  pxPerMetre: number;
  centerX: number;
  centerZ: number;
  toPx: (x: number, z: number) => { x: number; y: number };
  toWorld: (px: number, py: number) => { x: number; z: number };
  inView: (x: number, z: number) => boolean;
}

export function createProjection(
  width: number,
  height: number,
  centerX: number,
  centerZ: number,
  pxPerMetre: number
): MapProjection {
  const toPx = (x: number, z: number) => ({
    x: width / 2 + (x - centerX) * pxPerMetre,
    y: height / 2 + (z - centerZ) * pxPerMetre
  });
  const toWorld = (px: number, py: number) => ({
    x: centerX + (px - width / 2) / pxPerMetre,
    z: centerZ + (py - height / 2) / pxPerMetre
  });
  const inView = (x: number, z: number) => {
    const p = toPx(x, z);
    return p.x >= -10 && p.x <= width + 10 && p.y >= -10 && p.y <= height + 10;
  };
  return { width, height, pxPerMetre, centerX, centerZ, toPx, toWorld, inView };
}

/** Fit-all projection: every given point in view, with padding. */
export function fitProjection(
  width: number,
  height: number,
  points: { x: number; z: number }[],
  padding = 0.12
): MapProjection {
  if (points.length === 0) return createProjection(width, height, 0, 0, width / 14400);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const spanX = Math.max(maxX - minX, 2000);
  const spanZ = Math.max(maxZ - minZ, 2000);
  const pxPerMetre = Math.min(width / (spanX * (1 + padding)), height / (spanZ * (1 + padding)));
  return createProjection(width, height, (minX + maxX) / 2, (minZ + maxZ) / 2, pxPerMetre);
}

/** Merge the two traffic sources into one marker list, dropping hidden aircraft. */
export function mergeTrafficMarkers(route: MapAircraft[], traffic: MapAircraft[]): MapAircraft[] {
  return [...route, ...traffic].filter((m) => m.visible);
}

/** Spanish phase labels for the map info bar. */
export const MAP_PHASE_LABELS: Record<string, string> = {
  airborne: 'EN VUELO',
  holding: 'EN ESPERA',
  landing: 'ATERRIZANDO',
  taxiIn: 'RODANDO',
  parked: 'EN PUERTA',
  taxiOut: 'RODANDO',
  lineup: 'EN PISTA',
  approach: 'APROXIMANDO',
  rollout: 'RODANDO',
  boarding: 'EMBARCANDO',
  pushback: 'PUSHBACK',
  takeoff: 'DESPEGANDO',
  done: 'TERMINADO'
};

export function mapPhaseLabel(phase: string): string {
  return MAP_PHASE_LABELS[phase] ?? phase.toUpperCase();
}
