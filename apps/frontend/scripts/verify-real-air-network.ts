/**
 * Real air-network verification script (headless, no browser needed).
 *
 * Run from apps/frontend:
 *   npx tsx scripts/verify-real-air-network.ts
 *
 * Fase 1, first cut: the real air network (realAirNetwork.ts) and the
 * single MEX <-> GDL test flight (RouteTraffic in real mode).
 *
 * It checks the network geometry (real runway axis, elevations, routes),
 * then flies the whole round trip headless — MEX gate -> 05L takeoff ->
 * GDL landing -> turnaround -> MEX landing -> MEX gate — and asserts the
 * phase sequence, the touchdown elevations and the total time. The
 * en-route legs run at the same 60x compression as the game, so the
 * round trip takes minutes of simulated time, not an hour.
 */
import * as THREE from 'three';

// RouteTraffic draws its nav lights on a canvas, so the DOM call it makes
// is shimmed here. Everything else it touches is pure three.js.
(globalThis as unknown as { document: unknown }).document = {
  createElement: (tag: string) => {
    if (tag !== 'canvas') return {};
    return {
      width: 32,
      height: 32,
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop: () => {} }),
        fillRect: () => {},
        fillStyle: ''
      })
    };
  }
};

import { TrafficManager } from '../src/scenes/trafficManager';
import { SharedAirport } from '../src/scenes/runwayControl';
import { RunwaySequencer } from '../src/scenes/runwaySequencer';
import {
  buildRealAirportGroundNetwork,
  REAL_RUNWAY_CENTER,
  REAL_RUNWAY_DIR
} from '../src/scenes/realGroundNetwork';
import {
  buildRealAirNetwork,
  realAirportView,
  trueHeadingToSceneYaw
} from '../src/scenes/realAirNetwork';
import { validateAirNetwork, buildAirNetwork } from '../src/scenes/airNetwork';
import { RouteTraffic } from '../src/scenes/airRoutes';
import { geoToLocal } from '../src/scenes/geo';
import { HOME_AIRPORT, getAirport } from '../src/scenes/airports';

let failures = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const MEX = HOME_AIRPORT;
const GDL = getAirport('GDL')!;
const MEX_VIEW = realAirportView(MEX);
const GDL_VIEW = realAirportView(GDL);

console.log('Real air network geometry');
const network = buildRealAirNetwork();
const report = validateAirNetwork(network);
check('validateAirNetwork() is clean', report.ok, report.errors.join('; '));
check('55 nodes (5 per airport + one waypoint per directed route)', report.nodeCount === 55, `${report.nodeCount}`);
const mexRunway = network.get('RUNWAY-MEX')!;
const gdlRunway = network.get('RUNWAY-GDL')!;
check(
  'MEX runway node is the real 05L/23R centre',
  Math.abs(mexRunway.position.x - REAL_RUNWAY_CENTER.x) < 2 &&
    Math.abs(mexRunway.position.z - REAL_RUNWAY_CENTER.z) < 2,
  `(${mexRunway.position.x.toFixed(1)}, ${mexRunway.position.z.toFixed(1)})`
);
check('MEX runway node is at the real elevation + 2 m', Math.abs(mexRunway.position.y - 2232) < 1, `${mexRunway.position.y}`);
const gdlLocal = geoToLocal(GDL.lat, GDL.lon, { lat: MEX.lat, lon: MEX.lon });
check(
  'GDL runway node is the airport reference point (approximate centre)',
  Math.abs(gdlRunway.position.x - gdlLocal.x) < 2 &&
    Math.abs(gdlRunway.position.z - gdlLocal.z) < 2,
  `(${gdlRunway.position.x.toFixed(0)}, ${gdlRunway.position.z.toFixed(0)})`
);
check('GDL runway node is at the real elevation + 2 m', Math.abs(gdlRunway.position.y - 1531) < 1, `${gdlRunway.position.y}`);
check(
  'MEX scene yaw is 120.6° (true 59.4°)',
  Math.abs(MEX_VIEW.headingDeg - 120.6) < 0.5,
  `${MEX_VIEW.headingDeg.toFixed(1)}°`
);
check(
  'GDL scene yaw is 65.9° (true 114.1°)',
  Math.abs(GDL_VIEW.headingDeg - 65.9) < 0.5,
  `${GDL_VIEW.headingDeg.toFixed(1)}°`
);
check(
  'trueHeadingToSceneYaw is the inverse of the true bearing',
  Math.abs(trueHeadingToSceneYaw(59.4) - 120.6) < 0.01
);
const mexDep = network.get('DEP-MEX')!;
const depVec = new THREE.Vector3(
  mexDep.position.x - mexRunway.position.x,
  0,
  mexDep.position.z - mexRunway.position.z
).normalize();
check(
  'MEX departure fix lies along the real runway axis',
  Math.abs(depVec.x - REAL_RUNWAY_DIR.x) < 0.01 && Math.abs(depVec.z - REAL_RUNWAY_DIR.z) < 0.01,
  `(${depVec.x.toFixed(3)}, ${depVec.z.toFixed(3)})`
);
const routeOut = network.findFlightRoute('MEX', 'GDL');
check('MEX -> GDL route exists', routeOut !== null, 'null');
check(
  'MEX -> GDL route goes through the en-route waypoint',
  routeOut !== null && routeOut.some((n) => n.id === 'WPT-MEX-GDL'),
  routeOut?.map((n) => n.id).join(' -> ') ?? 'null'
);
check(
  'MEX -> GDL route has at least 5 nodes',
  (routeOut?.length ?? 0) >= 5,
  `${routeOut?.length ?? 0}`
);
const routeBack = network.findFlightRoute('GDL', 'MEX');
check('GDL -> MEX route exists', routeBack !== null, 'null');
const wpt = network.get('WPT-MEX-GDL')!;
const midExpected = mexRunway.position.clone().add(gdlRunway.position).multiplyScalar(0.5);
// Horizontal distance only: the waypoint flies 1048 m above the midpoint
// (cruise 2930 m vs the midpoint elevation 1881 m).
const wptOffMid = Math.hypot(
  wpt.position.x - midExpected.x,
  wpt.position.z - midExpected.z
);
check(
  'WPT-MEX-GDL sits midway on the real leg (not next to MEX)',
  wptOffMid < 1000,
  `${wptOffMid.toFixed(0)} m off the midpoint`
);
check('WPT-MEX-GDL cruise altitude is 2930 m', Math.abs(wpt.position.y - 2930) < 1, `${wpt.position.y}`);
// Procedural regression: the same builder with the procedural catalogue
// must produce the same waypoints as before (midpoint of the compressed
// leg plus the 600 m lateral offset, cruise 394 m over the 95 m pad),
// i.e. the endpoint lookup change is a no-op in procedural mode.
const procNetwork = buildAirNetwork();
const procWpt = procNetwork.get('WPT-MEX-GDL')!;
const procCruise = Math.min(700, Math.max(350, Math.hypot(-4700, -3100) * 0.07));
check(
  'procedural WPT-MEX-GDL is unchanged (midpoint of the compressed leg)',
  Math.abs(procWpt.position.x - -2681) < 5 &&
    Math.abs(procWpt.position.z - -1049) < 5 &&
    Math.abs(procWpt.position.y - (95 + procCruise)) < 1,
  `(${procWpt.position.x.toFixed(0)}, ${procWpt.position.y.toFixed(0)}, ${procWpt.position.z.toFixed(0)})`
);
const legKm = mexRunway.position.distanceTo(gdlRunway.position) / 1000;
check('MEX-GDL leg is ~459 km (real distance)', Math.abs(legKm - 459) < 5, `${legKm.toFixed(1)} km`);

console.log('Round-trip simulation (headless RouteTraffic, real mode)');
const scene = new THREE.Scene();
const shared = new SharedAirport();
const sequencer = new RunwaySequencer(shared.runway);
const tm = new TrafficManager(scene, shared, sequencer);
const realNet = buildRealAirportGroundNetwork(tm);
// Same spots qualityDemo.ts reads from the active ground network.
const stands = realNet.gates
  .map((gate) => {
    const node = tm.getNode(gate.gateNode);
    return node
      ? { id: gate.gateId, position: node.position.clone().setY(MEX.elevationRealM + 2) }
      : null;
  })
  .filter((s): s is { id: number; position: THREE.Vector3 } => s !== null);
const hold = tm.getNode(realNet.departureHold)!.position;
const threshold = tm.getNode(realNet.runwayThreshold)!.position;
const realGround = {
  stands,
  queue: [0, 1, 2].map((slot) =>
    hold.clone().addScaledVector(REAL_RUNWAY_DIR, slot * 55).setY(MEX.elevationRealM + 2)
  ),
  threshold: threshold.clone().setY(MEX.elevationRealM + 2)
};
const traffic = new RouteTraffic(scene, {
  premium: false,
  count: 1,
  realNetwork: network,
  realMode: true,
  realGround
});
check('exactly one test flight', traffic.count === 1, `${traffic.count}`);

const DT = 1 / 60;
const MAX_SIM_S = 900;
let simS = 0;
let lastPhase = '';
const transitions: { at: number; phase: string }[] = [];
let maxAlt = 0;
let touchdownGdl: number | null = null;
let touchdownMex: number | null = null;
let landedGdl = false;
let nanSeen = false;
while (simS < MAX_SIM_S) {
  traffic.update(DT);
  simS += DT;
  const snap = traffic.snapshot()[0];
  if (!snap) break;
  if (!Number.isFinite(snap.x) || !Number.isFinite(snap.z) || !Number.isFinite(snap.altitude)) {
    nanSeen = true;
    break;
  }
  maxAlt = Math.max(maxAlt, snap.altitude);
  if (snap.phase !== lastPhase) {
    transitions.push({ at: simS, phase: snap.phase });
    if (snap.phase === 'landing' && snap.destination === 'GDL' && touchdownGdl === null) {
      touchdownGdl = snap.altitude;
      landedGdl = true;
    }
    if (snap.phase === 'landing' && snap.destination === 'MEX' && touchdownMex === null) {
      touchdownMex = snap.altitude;
    }
    lastPhase = snap.phase;
  }
  // Round trip done: parked again after having landed at GDL and at MEX.
  if (landedGdl && touchdownMex !== null && snap.phase === 'parked') break;
}
const phases = transitions.map((t) => t.phase);
console.log(`  phases: ${transitions.map((t) => `${t.phase}@${t.at.toFixed(0)}s`).join(' -> ')}`);
check('no NaN positions during the flight', !nanSeen);
check(
  'phase sequence flies MEX -> GDL -> MEX',
  phases.join(',').includes('parked,taxiOut,airborne,landing,taxiIn,parked,taxiOut,airborne,landing,taxiIn,parked'),
  phases.join(',')
);
check(
  'touchdown at GDL is at the real elevation + 2 m (1531)',
  touchdownGdl !== null && Math.abs(touchdownGdl - 1531) < 5,
  `${touchdownGdl ?? 'never landed'}`
);
check(
  'touchdown at MEX is at the real elevation + 2 m (2232)',
  touchdownMex !== null && Math.abs(touchdownMex - 2232) < 5,
  `${touchdownMex ?? 'never landed'}`
);
check(
  'cruise reaches the en-route altitude (~2930 m)',
  maxAlt > 2800 && maxAlt < 3100,
  `${maxAlt} m`
);
check(
  'round trip completes in minutes, not an hour (60x en route)',
  simS < MAX_SIM_S && simS < 600,
  `${simS.toFixed(0)} s sim`
);
const finalSnap = traffic.snapshot()[0];
const finalPos = new THREE.Vector3(finalSnap.x, finalSnap.altitude, finalSnap.z);
const nearestStand = stands.reduce(
  (best, s) => Math.min(best, s.position.distanceTo(finalPos)),
  Infinity
);
check(
  'flight ends parked at a real MEX gate',
  finalSnap.phase === 'parked' && nearestStand < 100,
  `phase=${finalSnap.phase}, ${nearestStand.toFixed(0)} m from the nearest gate`
);
traffic.dispose();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
