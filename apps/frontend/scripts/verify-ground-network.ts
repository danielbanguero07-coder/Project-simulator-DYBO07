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
  REAL_AIRPORT_LAYOUT
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
// Same source as the builder: the real runway metadata, NOT
// HOME_AIRPORT.headingDeg (180°, the procedural runway orientation).
const realRunway =
  HOME_AIRPORT.runways.find((r) => r.designator === '05L/23R') ?? HOME_AIRPORT.runways[0];
const realYaw = (realRunway.headingDeg * Math.PI) / 180;
const dir = new THREE.Vector3(Math.sin(realYaw), 0, Math.cos(realYaw)).normalize();
const threshold = realTm.getNode(realNet.runwayThreshold)!.position;
const end = realTm.getNode(realNet.runwayEnd)!.position;
const length = threshold.distanceTo(end);
check('runway length is 3952 m', Math.abs(length - 3952) < 1, `${length.toFixed(1)} m`);
const runwayVec = end.clone().sub(threshold).normalize();
check('runway points along heading 59.4°', runwayVec.dot(dir) > 0.999, runwayVec.dot(dir).toFixed(4));
check(
  'threshold 05 is the south-west end',
  threshold.x < 0 && threshold.z < 0,
  `(${threshold.x.toFixed(0)}, ${threshold.z.toFixed(0)})`
);
check(
  'player spawn (-halfLength along dir) is the 05 threshold',
  threshold.distanceTo(dir.clone().multiplyScalar(-REAL_AIRPORT_LAYOUT.runwayLengthM / 2)) < 1,
  `(${threshold.x.toFixed(0)}, ${threshold.z.toFixed(0)})`
);
const gate1 = realTm.getNode(realNet.gates[0].gateNode)!.position;
const gate1Along = gate1.dot(dir);
const gate1Perp = gate1.x * dir.z - gate1.z * dir.x;
check('gate 1 sits ~130 m off the runway centreline', Math.abs(Math.abs(gate1Perp) - 130) < 1, `${gate1Perp.toFixed(1)} m`);
check('gate 1 is at along -180 m', Math.abs(gate1Along - -180) < 1, `${gate1Along.toFixed(1)} m`);

console.log('Ambient traffic on the real network');
realTm.seedAmbientTraffic(8);
const vehicles = (realTm as unknown as { vehicles: { object: THREE.Object3D }[] }).vehicles;
check('seedAmbientTraffic(8) spawns vehicles', vehicles.length > 0, `${vehicles.length} vehicles`);
check(
  'all spawned vehicles stand on the real service lane',
  vehicles.every((v) => {
    const p = v.object.position;
    const along = p.dot(dir);
    const perp = p.x * dir.z - p.z * dir.x;
    return along >= -600 && along <= 900 && Math.abs(perp) > 100 && Math.abs(perp) < 200;
  })
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
