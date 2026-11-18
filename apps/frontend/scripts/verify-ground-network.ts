/**
 * Ground-network verification script (headless, no browser needed).
 *
 * Run from apps/frontend:
 *   npx tsx scripts/verify-ground-network.ts
 *
 * It builds the procedural network and the real MEX network in separate
 * TrafficManager graphs and checks that each one validates, that every
 * gate is reachable from the runway and back, that every gate has two
 * service spots reachable from both depots, and that the real network
 * sits on the real 05L/23R runway (heading 59.4°, 3952 m).
 */
import * as THREE from 'three';
import { TrafficManager } from '../src/scenes/trafficManager';
import { SharedAirport } from '../src/scenes/runwayControl';
import { RunwaySequencer } from '../src/scenes/runwaySequencer';
import {
  buildAirportGroundNetwork,
  validateGroundNetwork,
  type GroundNetwork
} from '../src/scenes/groundNetwork';
import {
  buildRealAirportGroundNetwork,
  REAL_AIRPORT_LAYOUT,
  REAL_RUNWAY_CENTER,
  REAL_RUNWAY_DIR,
  REAL_RUNWAY_DISPLACED_M
} from '../src/scenes/realGroundNetwork';
import { HOME_AIRPORT } from '../src/scenes/airports';

let failures = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function freshTrafficManager(): TrafficManager {
  const scene = new THREE.Scene();
  const shared = new SharedAirport();
  const sequencer = new RunwaySequencer(shared.runway);
  return new TrafficManager(scene, shared, sequencer);
}

function checkNetwork(label: string, tm: TrafficManager, net: GroundNetwork): void {
  console.log(label);
  const report = validateGroundNetwork(tm, net);
  check('validateGroundNetwork() is clean', report.ok, report.errors.join('; '));
  check('13 gates (8 terminal + 2 remote + 3 cargo)', net.gates.length === 13, `${net.gates.length}`);
  check(
    'every gate has 2 service spots',
    net.gates.every((g) => g.serviceSpots.length === 2),
    net.gates.map((g) => g.serviceSpots.length).join(',')
  );
  check(
    'every gate reachable from the runway threshold',
    net.gates.every((g) => tm.findPath(net.runwayThreshold, g.gateNode, 'aircraft') !== null)
  );
  check(
    'every gate can taxi out to the runway end',
    net.gates.every((g) => tm.findPath(g.gateNode, net.runwayEnd, 'aircraft') !== null)
  );
  check(
    'fuel depot reaches every service spot',
    net.gates.every((g) => g.serviceSpots.every((s) => tm.findPath(net.fuelDepot, s, 'vehicle') !== null))
  );
  check(
    'baggage depot reaches every service spot',
    net.gates.every((g) => g.serviceSpots.every((s) => tm.findPath(net.baggageDepot, s, 'vehicle') !== null))
  );
  const hold = tm.getNode(net.departureHold);
  check('departure hold is labelled HOLD-DEP', hold?.label === 'HOLD-DEP', hold?.label ?? 'none');
  check(
    'departure hold is linked to the taxiway',
    (hold?.connections.length ?? 0) > 0,
    `${hold?.connections.length ?? 0} links`
  );
  check(
    'fuel depot is labelled fuel',
    tm.getNode(net.fuelDepot)?.label === 'fuel',
    tm.getNode(net.fuelDepot)?.label ?? 'none'
  );
  check(
    'baggage depot is labelled baggage',
    tm.getNode(net.baggageDepot)?.label === 'baggage',
    tm.getNode(net.baggageDepot)?.label ?? 'none'
  );
}

const proceduralTm = freshTrafficManager();
checkNetwork('Procedural network', proceduralTm, buildAirportGroundNetwork(proceduralTm));

const realTm = freshTrafficManager();
const realNet = buildRealAirportGroundNetwork(realTm);
checkNetwork('Real MEX network', realTm, realNet);

console.log('Real runway geometry');
// The anchor is the real 05L/23R threshold geometry (SkyVector), NOT the
// (sin, cos) heading convention: the codebase's yaw is mirrored vs true
// compass (forward is (sin yaw, cos yaw) with +Z south), so the runway
// direction (0.861, -0.509) is NOT (sin 59.4°, cos 59.4°). Its TRUE compass
// bearing is atan2(east, north) = atan2(dir.x, -dir.z) = 59.4°.
const dir = REAL_RUNWAY_DIR.clone();
const center = REAL_RUNWAY_CENTER;
// Along/perp are measured from the real runway centre, not from (0, 0):
// the centre is ~440 m west of the airport reference point.
const alongOf = (p: THREE.Vector3) => p.clone().sub(center).dot(dir);
const perpOf = (p: THREE.Vector3) =>
  (p.x - center.x) * dir.z - (p.z - center.z) * dir.x;
const trueBearingDeg = (Math.atan2(dir.x, -dir.z) * 180) / Math.PI;
check(
  'runway centre is the 05L/23R threshold midpoint, ~440 m west of the ARP',
  Math.abs(center.x - -437.8) < 2 && Math.abs(center.z - -74.9) < 2,
  `(${center.x.toFixed(1)}, ${center.z.toFixed(1)})`
);
check(
  'runway direction matches the threshold geometry (SkyVector)',
  Math.abs(dir.x - 0.8607) < 0.001 && Math.abs(dir.z - -0.509) < 0.001,
  `(${dir.x.toFixed(4)}, ${dir.z.toFixed(4)})`
);
check(
  'runway true compass bearing is 59.4°',
  Math.abs(trueBearingDeg - 59.4) < 0.5,
  `${trueBearingDeg.toFixed(1)}°`
);
const threshold = realTm.getNode(realNet.runwayThreshold)!.position;
const end = realTm.getNode(realNet.runwayEnd)!.position;
const length = threshold.distanceTo(end);
check('runway length is 3952 m', Math.abs(length - 3952) < 1, `${length.toFixed(1)} m`);
const runwayVec = end.clone().sub(threshold).normalize();
check('runway points along the threshold axis', runwayVec.dot(dir) > 0.999, runwayVec.dot(dir).toFixed(4));
check(
  'threshold 05 is the south-west end',
  threshold.x < 0 && threshold.z > 0,
  `(${threshold.x.toFixed(0)}, ${threshold.z.toFixed(0)})`
);
check(
  'threshold 05 is centre minus halfLength along dir',
  threshold.distanceTo(center.clone().addScaledVector(dir, -REAL_AIRPORT_LAYOUT.runwayLengthM / 2)) < 1,
  `(${threshold.x.toFixed(0)}, ${threshold.z.toFixed(0)})`
);
const spawn = center
  .clone()
  .addScaledVector(dir, -(REAL_AIRPORT_LAYOUT.runwayLengthM / 2 - REAL_RUNWAY_DISPLACED_M));
check(
  'player spawn (05L displaced threshold) is on the runway centreline',
  Math.abs(perpOf(spawn)) < 1,
  `${perpOf(spawn).toFixed(1)} m off centreline`
);
check(
  'player spawn is 450 m past the physical 05 end',
  Math.abs(spawn.distanceTo(threshold) - REAL_RUNWAY_DISPLACED_M) < 1,
  `${spawn.distanceTo(threshold).toFixed(1)} m`
);
check(
  'player spawn is on asphalt: remaining runway to the 23R end is 3502 m',
  Math.abs(end.clone().sub(spawn).dot(dir) - 3502) < 1,
  `${end.clone().sub(spawn).dot(dir).toFixed(1)} m`
);
const gate1 = realTm.getNode(realNet.gates[0].gateNode)!.position;
check('gate 1 sits ~130 m off the runway centreline', Math.abs(Math.abs(perpOf(gate1)) - 130) < 1, `${perpOf(gate1).toFixed(1)} m`);
check('gate 1 is at along -180 m', Math.abs(alongOf(gate1) - -180) < 1, `${alongOf(gate1).toFixed(1)} m`);

console.log('Ambient traffic on the real network');
realTm.seedAmbientTraffic(8);
const vehicles = (realTm as unknown as { vehicles: { object: THREE.Object3D }[] }).vehicles;
check('seedAmbientTraffic(8) spawns vehicles', vehicles.length > 0, `${vehicles.length} vehicles`);
check(
  'all spawned vehicles stand on the real service lane',
  vehicles.every((v) => {
    const p = v.object.position;
    const along = alongOf(p);
    const perp = perpOf(p);
    return along >= -600 && along <= 900 && Math.abs(perp) > 100 && Math.abs(perp) < 200;
  })
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
