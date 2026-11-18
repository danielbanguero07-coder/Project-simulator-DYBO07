import {
  ALL_AIRPORTS,
  HOME_AIRPORT,
  type AirportDefinition
} from './airports';
import { geoToLocal, localToGeo, mslToLocalY, type GeoOrigin3D } from './geo';
import { REAL_RUNWAY_CENTER } from './realGroundNetwork';
import { buildAirNetwork, validateAirNetwork, type AirNetwork } from './airNetwork';

/**
 * The real-world origin of the local scene frame, as the tiles see it:
 * the MEX reference point, at its real elevation (2230 m MSL). Local
 * Y = 0 is the MEX ground (ReorientationPlugin recentres the tiles
 * there), so every real-mode altitude must be converted through
 * mslToLocalY against this origin.
 */
export const HOME_ORIGIN_3D: GeoOrigin3D = {
  lat: HOME_AIRPORT.lat,
  lon: HOME_AIRPORT.lon,
  mslM: HOME_AIRPORT.elevationRealM
};

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
 *   - Elevation: the LOCAL ground Y from mslToLocalY (MEX 0 m, GDL
 *     about -17,269 m), NOT the MSL elevation. The scene's Y = 0 is the
 *     MEX ground (tiles recentred at MEX height 2230 m), so MSL heights
 *     used directly as Y put the plane 2.2 km above the ground at MEX
 *     and ~19 km above it at GDL: the 2026-11-18 "never touches the
 *     ground" bug (states changed, the plane never landed). Every
 *     altitude the traffic code reads from a view (node heights, stands,
 *     landing, takeoff) is a local Y, so a landing touches down 2 m
 *     above the visible ground at both ends.
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
 *     OurAirports, not their runway centres, and the flat geoToLocal
 *     projection drifts ~6.5 km from the true position over 459 km
 *     (GDL): the plane lands on the ground near the airport, not on
 *     its real runway centre. The altitude, however, is exact (see
 *     mslToLocalY above).
 *   - GDL has no real ground network yet: after landing there the aircraft
 *     parks at an approximate stand beside the runway (see airRoutes.ts)
 *     and departs again. Real GDL gates come in the rest of Fase 1.
 *   - The tile load region follows the camera (v0.4.5), so tiles stream
 *     in around GDL as the camera arrives, but there is no built runway
 *     or terminal there. The flight itself is real: routing, altitudes
 *     and elevations are real, and the navigation map and the tower
 *     status line show it.
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
    // Local ground Y (see the header): MEX 0 m, GDL about -17,269 m.
    elevation: mslToLocalY(
      airport.lat,
      airport.lon,
      airport.elevationRealM,
      HOME_ORIGIN_3D
    ),
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
  const views = airports.map(realAirportView);
  const network = buildAirNetwork(views);
  // En-route waypoint altitudes: the builder sets WPT y =
  // max(endpoint elevations) + cruise, which is right when `elevation`
  // is MSL, but the views now carry LOCAL ground Y. Recompute each
  // waypoint's y from its intended MSL cruise altitude at its own
  // lat/lon, so the plane cruises ~700 m above the real terrain
  // instead of ~7 km above it.
  const viewsByCode = new Map(views.map((v) => [v.code, v]));
  const mslByCode = new Map(airports.map((a) => [a.code, a.elevationRealM]));
  for (const node of network.nodes.values()) {
    if (node.type !== 'enroute') continue;
    const [, fromCode, toCode] = node.id.split('-');
    const from = viewsByCode.get(fromCode);
    const to = viewsByCode.get(toCode);
    if (!from || !to) continue;
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    const cruise = Math.min(700, Math.max(350, distance * 0.07));
    const cruiseMsl =
      Math.max(mslByCode.get(fromCode) ?? 0, mslByCode.get(toCode) ?? 0) + cruise;
    const geo = localToGeo(node.position.x, node.position.z, {
      lat: HOME_AIRPORT.lat,
      lon: HOME_AIRPORT.lon
    });
    node.position.y = mslToLocalY(geo.lat, geo.lon, cruiseMsl, HOME_ORIGIN_3D);
  }
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
