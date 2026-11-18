import * as THREE from 'three';
import { TrafficManager } from './trafficManager';
import { HOME_AIRPORT } from './airports';
import { runwayDir } from './airNetwork';
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
 * Gate line position: apron is taken ~130 m perpendicular to the runway
 * (runwayPerp direction), gates spaced ~80 m along the runway direction,
 * matching the procedural gateZ spacing. Terminal location is approximate
 * (no verified OSM coordinate was available at implementation time) and is
 * pending visual tuning against the Google tiles.
 */
export const REAL_AIRPORT_LAYOUT = {
  runwayLengthM: 3952,
  taxiwayOffsetM: 70,
  apronOffsetM: 130,
  gateSpacingAlongM: 80
};

export function buildRealAirportGroundNetwork(tm: TrafficManager): GroundNetwork {
  const home = HOME_AIRPORT;
  const dir = runwayDir(home).normalize();
  const perp = new THREE.Vector3(dir.z, 0, -dir.x).normalize();

  const center = new THREE.Vector3(0, 0, 0);
  const halfLen = REAL_AIRPORT_LAYOUT.runwayLengthM / 2;

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
    gates.push({ gateId: st.gateId, gateNode, leadNode, serviceSpots: [] });
  }

  const holdPos = side(-halfLen * 0.95, REAL_AIRPORT_LAYOUT.taxiwayOffsetM);
  const departureHold = tm.addNode(holdPos, [], 'holding');

  const fuelDepot = tm.addNode(side(halfLen * 0.8, REAL_AIRPORT_LAYOUT.apronOffsetM + 60), [], 'depot');
  const baggageDepot = tm.addNode(side(-halfLen * 0.3, REAL_AIRPORT_LAYOUT.apronOffsetM + 60), [], 'depot');

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
