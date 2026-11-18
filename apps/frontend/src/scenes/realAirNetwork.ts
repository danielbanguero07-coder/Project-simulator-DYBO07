import {
  ALL_AIRPORTS,
  HOME_AIRPORT,
  type AirportDefinition
} from './airports';
import { geoToLocal } from './geo';
import { REAL_RUNWAY_CENTER } from './realGroundNetwork';
import { buildAirNetwork, validateAirNetwork, type AirNetwork } from './airNetwork';

/**
 * Real-world air network used by `?world=real` (Fase 1, first cut).
 *
 * Same node system as `airNetwork.ts` (RUNWAY / DEP / WPT / ARR / FINAL /
 * HOLD per airport, Dijkstra routing), but built on real-world views of
 * the airports instead of the compressed procedural coordinates:
 *
 *   - Position: `geoToLocal(lat, lon)` on the MEX-centred frame, so
 *     MEX-GDL is 459 km apart, not 5.6 km. For MEX the centre is the
 *     real 05L/23R runway centre (REAL_RUNWAY_CENTER), NOT the airport
 *     reference point (0, 0): the real runway centre is ~440 m west of it
 *     (see realGroundNetwork.ts).
 *   - Elevation: `elevationRealM` (MEX 2230 m, GDL 1529 m), so a landing
 *     touches down at the destination's real elevation, not at Y = 0.
 *   - Heading: the scene yaw that points along the real runway. The
 *     codebase uses +Z south, so a TRUE compass heading h points along
 *     (sin h, -cos h) in (x, z), which the codebase writes as yaw 180 - h.
 *     MEX: true 59.4° -> yaw 120.6°, direction (0.861, -0.509), the same
 *     axis as REAL_RUNWAY_DIR. Do NOT use runwayDir() with the true
 *     heading (that would mirror the runway north-south, the mistake
 *     refuted by the 2026-11-18 visual test, image-92).
 *
 * Approximations in this cut, to be refined by later phases:
 *   - Non-MEX airport centres are the airport reference points from
 *     OurAirports, not their runway centres: a real runway centre can sit
 *     a few hundred metres from its reference point (as MEX does). The
 *     plane still lands on the runway axis, at the right elevation.
 *   - GDL has no real ground network yet: after landing there the aircraft
 *     parks at an approximate stand beside the runway (see airRoutes.ts)
 *     and departs again. Real GDL gates come in the rest of Fase 1.
 *   - The Google tiles only cover ~10 km around MEX, so the GDL end of a
 *     flight happens over unloaded terrain (no ground visible there). The
 *     flight itself is real: routing, altitudes and elevations are real,
 *     and the navigation map and the tower status line show it.
 */

/** True compass heading (degrees, clockwise from north) -> scene yaw
 *  (degrees, clockwise from +Z, with +Z south). */
export function trueHeadingToSceneYaw(trueHeadingDeg: number): number {
  return (180 - trueHeadingDeg + 360) % 360;
}

/**
 * Real-world view of an airport, in the same `AirportDefinition` shape
 * the traffic code already reads (x, z, elevation, headingDeg), so the
 * air network, the route follower and the landing code work unchanged.
 */
export function realAirportView(airport: AirportDefinition): AirportDefinition {
  const runway = airport.runways[0];
  const local = geoToLocal(airport.lat, airport.lon, {
    lat: HOME_AIRPORT.lat,
    lon: HOME_AIRPORT.lon
  });
  const isHome = airport.code === HOME_AIRPORT.code;
  return {
    ...airport,
    // MEX: the runway centre, not the airport reference point.
    x: isHome ? REAL_RUNWAY_CENTER.x : local.x,
    z: isHome ? REAL_RUNWAY_CENTER.z : local.z,
    elevation: airport.elevationRealM,
    headingDeg: runway
      ? trueHeadingToSceneYaw(runway.headingDeg)
      : airport.headingDeg,
    runwayLength: runway ? runway.lengthM : airport.runwayLength
  };
}

/** Build the real air network for every airport in the catalogue. */
export function buildRealAirNetwork(
  airports: AirportDefinition[] = ALL_AIRPORTS
): AirNetwork {
  const network = buildAirNetwork(airports.map(realAirportView));
  const report = validateAirNetwork(network);
  if (report.ok) {
    console.info(
      `[air-network] real OK · ${report.nodeCount} nodes, ${report.edgeCount} links`
    );
  } else {
    console.error('[air-network] real invalid network', report.errors);
  }
  return network;
}
