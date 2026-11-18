import type { AirportGeo } from './airports';

/**
 * Pure geospatial helpers for the real-world airport metadata.
 *
 * The procedural scene still renders a compressed XZ plane, so these helpers
 * are intentionally independent from the scene graph: they only translate
 * between latitude/longitude and the project's local metric plane.
 *
 * `scale = 1` produces real-world metres. The current 16 km procedural world
 * is heavily compressed, so future phases that map the real world onto the
 * existing scene will use an approximate `scale` of 0.01 (1 scene unit = 100 m)
 * or an equivalent per-airport transform. Nothing in the running scene calls
 * these functions yet.
 */

const EARTH_RADIUS_KM = 6371;
const METRES_PER_DEG_LAT = 110540;
const METRES_PER_DEG_LON_EQUATOR = 111320;
const DEG_TO_RAD = Math.PI / 180;

/** Default local-plane origin: Mexico City (MEX / MMMX). */
const MEX_ORIGIN: GeoOrigin = { lat: 19.4363, lon: -99.0721 };

export interface GeoOrigin {
  lat: number;
  lon: number;
}

export interface LocalPoint {
  x: number;
  z: number;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

/** Great-circle distance in kilometres (haversine, R = 6371 km). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const dPhi = (lat2 - lat1) * DEG_TO_RAD;
  const dLambda = (lon2 - lon1) * DEG_TO_RAD;

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Initial great-circle bearing from point 1 to point 2, in degrees 0-360. */
export function initialBearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const dLambda = (lon2 - lon1) * DEG_TO_RAD;

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);

  return (Math.atan2(y, x) / DEG_TO_RAD + 360) % 360;
}

/**
 * Convert real lat/lon to the project's local metric plane.
 *
 * Equirectangular approximation around `origin`:
 *   x = (lon - lon0) * cos(lat0) * 111320 * scale
 *   z = -(lat - lat0) * 110540 * scale
 *
 * The minus sign on Z keeps the project convention that +Z points south.
 * `scale = 1` returns real metres; a compressed world can pass `scale = 0.01`.
 */
export function geoToLocal(
  lat: number,
  lon: number,
  origin: GeoOrigin = MEX_ORIGIN,
  scale = 1
): LocalPoint {
  const x =
    (lon - origin.lon) * Math.cos(origin.lat * DEG_TO_RAD) * METRES_PER_DEG_LON_EQUATOR * scale;
  const z = -(lat - origin.lat) * METRES_PER_DEG_LAT * scale;
  return { x, z };
}

/** Inverse of {@link geoToLocal}. */
export function localToGeo(
  x: number,
  z: number,
  origin: GeoOrigin = MEX_ORIGIN,
  scale = 1
): GeoPoint {
  const lat = origin.lat - z / (METRES_PER_DEG_LAT * scale);
  const lon =
    origin.lon + x / (Math.cos(origin.lat * DEG_TO_RAD) * METRES_PER_DEG_LON_EQUATOR * scale);
  return { lat, lon };
}

/** Return human-readable problems found in an airport's real-world data. */
export function validateAirportGeo(airport: AirportGeo): string[] {
  const errors: string[] = [];
  const label = airport.icao || '(unknown ICAO)';

  if (!Number.isFinite(airport.lat) || airport.lat < -90 || airport.lat > 90) {
    errors.push(`${label}: latitude ${airport.lat} is outside -90..90`);
  }
  if (!Number.isFinite(airport.lon) || airport.lon < -180 || airport.lon > 180) {
    errors.push(`${label}: longitude ${airport.lon} is outside -180..180`);
  }
  if (!/^[A-Z]{4}$/.test(airport.icao)) {
    errors.push(`${label}: ICAO code must be exactly four uppercase letters`);
  }
  if (airport.runways.length === 0) {
    errors.push(`${label}: at least one runway is required`);
  }
  for (const runway of airport.runways) {
    if (!Number.isFinite(runway.lengthM) || runway.lengthM <= 0) {
      errors.push(`${label}: runway ${runway.designator} has invalid length ${runway.lengthM} m`);
    }
  }

  return errors;
}
