/**
 * Headless checks for the AI-follow camera mode ("Seguir IA").
 *
 * Run from apps/frontend with:  npx -y tsx scripts/verify-ai-follow.ts
 *
 * It checks the live pose the camera chases (RouteTraffic, real mode,
 * single MEX-GDL test flight), the chase geometry (camera behind and
 * above the aircraft, looking ahead of it) and the direct tracking
 * (the camera moves exactly with the aircraft — no smoothing lag at the
 * 60x en-route speed). The camera wiring itself (updateCamera in
 * qualityDemo.ts, the C key and the select in AirportGameView) is covered
 * by typecheck + build and by the visual test on Dani's PC.
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
  REAL_RUNWAY_DIR
} from '../src/scenes/realGroundNetwork';
import { buildRealAirNetwork } from '../src/scenes/realAirNetwork';
import { RouteTraffic } from '../src/scenes/airRoutes';
import { aiFollowPose } from '../src/scenes/cameraFollow';
import { HOME_AIRPORT } from '../src/scenes/airports';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const approx = (a: number, b: number, tol = 0.01): boolean => Math.abs(a - b) <= tol;
const MEX = HOME_AIRPORT;

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
const network = buildRealAirNetwork();
const traffic = new RouteTraffic(scene, {
  premium: false,
  count: 1,
  realNetwork: network,
  realMode: true,
  realGround
});

const spawnPose = traffic.getFirstAgentPose();
check('first agent pose exists at spawn', spawnPose !== null);
if (spawnPose) {
  check(
    'spawn pose is parked at real gate 1 (2 m above the local ground, not MSL 2232 m)',
    Math.abs(spawnPose.position.x - -659) < 5 &&
      Math.abs(spawnPose.position.z - -95) < 5 &&
      Math.abs(spawnPose.position.y - 2) < 5,
    `(${spawnPose.position.x.toFixed(0)}, ${spawnPose.position.y.toFixed(0)}, ${spawnPose.position.z.toFixed(0)})`
  );
  check('spawn yaw is finite', Number.isFinite(spawnPose.yaw));

  // Chase geometry: camera behind + above, looking ahead.
  const forward = new THREE.Vector3(Math.sin(spawnPose.yaw), 0, Math.cos(spawnPose.yaw));
  const pose = aiFollowPose(spawnPose.position, spawnPose.yaw);
  const camOffset = pose.camera.clone().sub(spawnPose.position);
  const lookOffset = pose.target.clone().sub(spawnPose.position);
  check('follow camera sits behind the aircraft', camOffset.dot(forward) < 0, camOffset.dot(forward).toFixed(1));
  check('follow camera sits above the aircraft', camOffset.y > 0, camOffset.y.toFixed(1));
  check('follow target looks ahead of the aircraft', lookOffset.dot(forward) > 0, lookOffset.dot(forward).toFixed(1));

  // Direct tracking: the camera moves exactly with the aircraft, no lag.
  const moved = spawnPose.position.clone().addScaledVector(forward, 120);
  const movedPose = aiFollowPose(moved, spawnPose.yaw);
  const camDelta = movedPose.camera.clone().sub(pose.camera);
  check(
    'camera follows a 120 m jump exactly (no smoothing lag)',
    approx(camDelta.dot(forward), 120, 0.01) &&
      approx(camDelta.clone().sub(forward.clone().multiplyScalar(120)).length(), 0, 0.01),
    `${camDelta.dot(forward).toFixed(2)} m along track`
  );

  // The aircraft actually departs: after 25 s sim it has left the gate.
  const DT = 1 / 60;
  for (let i = 0; i < 25 * 60; i++) traffic.update(DT);
  const laterPose = traffic.getFirstAgentPose();
  check('test flight pose exists after 25 s', laterPose !== null);
  if (laterPose) {
    const moved = laterPose.position.distanceTo(spawnPose.position);
    check('test flight has left the gate after 25 s', moved > 50, `${moved.toFixed(0)} m`);
  }
}

// No aircraft at all: the pose is null (camera falls back to the player).
const empty = new RouteTraffic(scene, {
  premium: false,
  count: 0,
  realNetwork: network,
  realMode: true,
  realGround
});
check('no aircraft means no pose to follow', empty.getFirstAgentPose() === null);

traffic.dispose();
empty.dispose();

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
