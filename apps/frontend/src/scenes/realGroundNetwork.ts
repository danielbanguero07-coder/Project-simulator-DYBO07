import * as THREE from 'three';
import { TrafficManager } from './trafficManager';
import { HOME_AIRPORT } from './airports';
import { geoToLocal } from './geo';
import type { GroundNetwork } from './groundNetwork';

/**
 * Real-world (MEX) ground network used by `?world=real`.
 *
 * Same shape as `groundNetwork.ts` (runway, parallel taxiway, apron, gates)
 * but expressed in real metres on the MEX-centred frame (1 unit = 1 metre).
 * The procedural network in `groundNetwork.ts` is untouched and remains the
 * default.
 *
 * TODO: real heightAt terrain sampling and takeoff/landing on real terrain
 * heights arrive in the next phase; this phase keeps procedural heightAt.
 *
 * Runway anchor: the axis and centre come from the real displaced
 * thresholds of 05L/23R (see REAL_RUNWAY_CENTER below), so the network
 * sits on the runway as rendered in the Google tiles. The gate line is
 * still approximate: the apron is taken ~130 m perpendicular to the runway
 * (runwayPerp direction), gates spaced ~80 m along the runway direction,
 * matching the procedural gateZ spacing. Terminal location is approximate
 * (no verified OSM coordinate was available at implementation time) and is
 * pending visual tuning against the Google tiles.
 *
 * The vehicle side mirrors groundNetwork.ts: a service lane behind the
 * stands (perp offset 160 m), two service spots per gate, and the fuel and
 * baggage depots linked to that lane, so TrafficManager can dispatch gate
 * services and patrol vehicles on this network exactly like on the
 * procedural one. The departure hold is labelled HOLD-DEP, the label
 * TrafficManager looks up for departures.
 */
export const REAL_AIRPORT_LAYOUT = {
  runwayLengthM: 3952,
  taxiwayOffsetM: 70,
  apronOffsetM: 130,
  serviceLaneOffsetM: 160,
  gateSpacingAlongM: 80
};

/**
 * Anchor of the real 05L/23R runway in scene coordinates, derived from the
 * displaced thresholds published by SkyVector for MMMX:
 *   05L: N19°25.78' W99°5.20'   (displaced threshold 1476 ft ≈ 450 m)
 *   23R: N19°26.60' W99°3.74'   (displaced threshold 1660 ft ≈ 506 m)
 * The midpoint of the two thresholds is the runway centre; the axis
 * through them is the runway direction. Origin is HOME_AIRPORT lat/lon,
 * the same origin ReorientationPlugin centres the Google tiles on.
 *
 * No axis flip is applied: geoToLocal maps the thresholds to the axis
 * (0.861, -0.509), whose true compass bearing is 59.4°, and that is the
 * runway as rendered in the tiles. An earlier version flipped Z (assuming
 * the tiles were mirrored north-south); the visual test 2026-11-18
 * refuted it — with the flip the player spawned at (-1751, -702), 1.2 km
 * from the real runway, floating over city rooftops (image-92). The
 * correct spawn is (-1751, +702), the south-west end.
 */
const THRESHOLD_05L = { lat: 19 + 25.78 / 60, lon: -(99 + 5.2 / 60) };
const THRESHOLD_23R = { lat: 19 + 26.6 / 60, lon: -(99 + 3.74 / 60) };
const TILE_ORIGIN = { lat: HOME_AIRPORT.lat, lon: HOME_AIRPORT.lon };
const _t05 = geoToLocal(THRESHOLD_05L.lat, THRESHOLD_05L.lon, TILE_ORIGIN);
const _t23 = geoToLocal(THRESHOLD_23R.lat, THRESHOLD_23R.lon, TILE_ORIGIN);
export const REAL_RUNWAY_CENTER = new THREE.Vector3(
  (_t05.x + _t23.x) / 2,
  0,
  (_t05.z + _t23.z) / 2
);
export const REAL_RUNWAY_DIR = new THREE.Vector3(
  _t23.x - _t05.x,
  0,
  _t23.z - _t05.z
).normalize();
/** 05L displaced threshold (SkyVector: 1476 ft ≈ 450 m). The player spawns here, on asphalt. */
export const REAL_RUNWAY_DISPLACED_M = 450;

export function buildRealAirportGroundNetwork(tm: TrafficManager): GroundNetwork {
  // Direction and centre come from the real 05L/23R thresholds (see
  // REAL_RUNWAY_CENTER / REAL_RUNWAY_DIR above), NOT from
  // HOME_AIRPORT.headingDeg (180°, the procedural runway orientation) and
  // NOT from the airport reference point (0, 0): the real runway centre is
  // ~440 m west of it. The length still comes from the runway metadata.
  const realRunway =
    HOME_AIRPORT.runways.find((r) => r.designator === '05L/23R') ?? HOME_AIRPORT.runways[0];
  const dir = REAL_RUNWAY_DIR.clone();
  const perp = new THREE.Vector3(dir.z, 0, -dir.x).normalize();

  const center = REAL_RUNWAY_CENTER.clone();
  const halfLen = realRunway.lengthM / 2;

  const along = (t: number) => center.clone().addScaledVector(dir, t);
  const side = (t: number, off: number) =>
    center.clone().addScaledVector(dir, t).addScaledVector(perp, off);

  const runwayTs = [-halfLen, -halfLen * 0.5, 0, halfLen * 0.5, halfLen];
  const runwayNodes = runwayTs.map((t, i) => {
    const p = along(t);
    const label = i === 0 ? 'RWY05' : i === runwayTs.length - 1 ? 'RWY23' : `RWY-${i}`;
    return tm.addNode(p, [], 'runway', undefined, { label, maxSpeed: i === 0 || i === runwayTs.length - 1 ? 90 : 40 });
  });
  for (let i = 0; i < runwayNodes.length - 1; i++) {
    tm.link(runwayNodes[i], runwayNodes[i + 1]);
  }
  const runwayThreshold = runwayNodes[0];
  const runwayEnd = runwayNodes[runwayNodes.length - 1];

  const taxiTs = [-halfLen * 0.9, -halfLen * 0.4, 0, halfLen * 0.4, halfLen * 0.9];
  const taxiNodes = taxiTs.map((t) => tm.addNode(side(t, REAL_AIRPORT_LAYOUT.taxiwayOffsetM), [], 'taxiway'));
  for (let i = 0; i < taxiNodes.length - 1; i++) tm.link(taxiNodes[i], taxiNodes[i + 1]);
  for (let i = 1; i < runwayNodes.length - 1; i++) {
    tm.link(runwayNodes[i], taxiNodes[Math.min(i, taxiNodes.length - 1)]);
  }

  const gateAlong = [-180, -100, -20, 60, 150, 240, 330, 420];
  const remoteAlong = [-500, -420];
  const cargoAlong = [560, 640, 720];

  const stands: { gateId: number; along: number }[] = [];
  gateAlong.forEach((a, i) => stands.push({ gateId: i + 1, along: a }));
  remoteAlong.forEach((a, i) => stands.push({ gateId: 12 + i, along: a }));
  cargoAlong.forEach((a, i) => stands.push({ gateId: 9 + i, along: a }));

  // Service lane behind the stands, parallel to the runway, so service
  // vehicles can reach every gate without crossing the taxiway. It spans
  // the whole stand line, from the remote stands to the cargo ramp.
  const serviceAlong = [-560, -480, -400, -320, -240, -160, -80, 0, 80, 160, 240, 320, 400, 480, 560, 640, 720, 800, 860];
  const serviceNodes = serviceAlong.map((t) =>
    tm.addNode(side(t, REAL_AIRPORT_LAYOUT.serviceLaneOffsetM), [], 'service')
  );
  for (let i = 0; i < serviceNodes.length - 1; i++) tm.link(serviceNodes[i], serviceNodes[i + 1]);
  const nearestServiceNode = (alongPos: number) => {
    let best = serviceNodes[0], bestD = Infinity;
    serviceAlong.forEach((t, i) => {
      const d = Math.abs(t - alongPos);
      if (d < bestD) { bestD = d; best = serviceNodes[i]; }
    });
    return best;
  };

  const gates: GroundNetwork['gates'] = [];
  for (const st of stands) {
    const gatePos = side(st.along, REAL_AIRPORT_LAYOUT.apronOffsetM);
    const leadPos = side(st.along, REAL_AIRPORT_LAYOUT.apronOffsetM - 20);
    const gateNode = tm.addNode(gatePos, [], 'gate', st.gateId);
    const leadNode = tm.addNode(leadPos, [], 'apron');
    tm.link(leadNode, gateNode);
    let best = taxiNodes[0], bestD = Infinity;
    for (const tn of taxiNodes) {
      const d = tm.getNode(tn)!.position.distanceTo(leadPos);
      if (d < bestD) { bestD = d; best = tn; }
    }
    tm.link(leadNode, best);
    // Two service spots per stand, one at each side of the aircraft, on
    // the service lane side of the gate line.
    const spotA = tm.addNode(side(st.along - 13, REAL_AIRPORT_LAYOUT.apronOffsetM - 4), [], 'service', st.gateId, { label: `SVC${st.gateId}A` });
    const spotB = tm.addNode(side(st.along + 13, REAL_AIRPORT_LAYOUT.apronOffsetM - 4), [], 'service', st.gateId, { label: `SVC${st.gateId}B` });
    tm.link(spotA, nearestServiceNode(st.along));
    tm.link(spotB, nearestServiceNode(st.along));
    gates.push({ gateId: st.gateId, gateNode, leadNode, serviceSpots: [spotA, spotB] });
  }

  // Hold-short point for departures, on the taxiway just short of the 05
  // threshold. Labelled HOLD-DEP, the label TrafficManager looks up.
  const holdPos = side(-halfLen * 0.95, REAL_AIRPORT_LAYOUT.taxiwayOffsetM);
  const departureHold = tm.addNode(holdPos, [], 'holding', undefined, { label: 'HOLD-DEP' });
  tm.link(departureHold, taxiNodes[0]);

  // Fuel and baggage depots, behind the service lane, each linked to it.
  // They carry the 'fuel' / 'baggage' labels TrafficManager looks up when
  // it dispatches gate services.
  const fuelDepot = tm.addNode(side(halfLen * 0.8, REAL_AIRPORT_LAYOUT.apronOffsetM + 60), [], 'depot', undefined, { label: 'fuel' });
  tm.link(fuelDepot, nearestServiceNode(halfLen * 0.8));
  const baggageDepot = tm.addNode(side(-halfLen * 0.3, REAL_AIRPORT_LAYOUT.apronOffsetM + 60), [], 'depot', undefined, { label: 'baggage' });
  tm.link(baggageDepot, nearestServiceNode(-halfLen * 0.3));

  return {
    gates,
    fuelDepot,
    baggageDepot,
    runwayThreshold,
    runwayEnd,
    departureHold,
    layout: null as any
  };
}
