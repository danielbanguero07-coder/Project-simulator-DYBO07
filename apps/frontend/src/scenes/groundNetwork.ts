import * as THREE from 'three';
import { TrafficManager } from './trafficManager';

/**
 * Complete ground movement network for the airport.
 *
 * Coordinate layout (matches `qualityDemo.ts` scenery):
 *   - Runway 36L/18R .......... x = 0,     z = -1150 .. +1150
 *   - Four high-speed exits ... z = -600, -300, +300, +600 (22 deg, 130 m run)
 *   - Parallel taxiway Alpha .. x = 72,    z = -1100 .. +1100 (36 m wide)
 *   - Apron taxilane Bravo .... x = 95
 *   - Gate stands 1-8 ......... x = 130,   z = -180, -100, -20, 60, 150, 240, 330, 420
 *                               (gates 1 and 4 accept wide-body aircraft)
 *   - Remote stands 12-13 ..... x = 130,   z = -500, -420 (south apron)
 *   - Cargo stands 9-11 ....... x = 130,   z = 560, 640, 720
 *   - Service lane Sierra ..... x = 160,   z = -540 .. 860
 *   - Fuel farm ............... (190, 860)
 *   - Baggage / catering depot  (186, -230)
 *
 * Two disjoint sub-graphs are built: aircraft (runway/taxiway/apron/gate) and
 * vehicles (service/depot). They share no edge, which is exactly the
 * "allowed / not allowed zones" rule the AI must respect.
 */

export interface GateInfo {
  gateId: number;
  gateNode: number;
  leadNode: number;
  serviceSpots: number[];
}

export interface GroundNetwork {
  gates: GateInfo[];
  fuelDepot: number;
  baggageDepot: number;
  runwayThreshold: number;
  runwayEnd: number;
  /** Hold-short point where departures queue before entering the runway. */
  departureHold: number;
  layout: typeof AIRPORT_LAYOUT;
}

export const AIRPORT_LAYOUT = {
  runwayX: 0,
  runwayThresholdZ: -1150,
  runwayEndZ: 1150,
  /** Centre of the wide parallel taxiway Alpha (asphalt strip is 36 m wide). */
  taxiwayX: 72,
  /** Centre of the apron taxilane Bravo. */
  taxilaneX: 95,
  gateX: 130,
  leadX: 110,
  serviceLaneX: 160,
  /** Z of the four high-speed exits joining the runway to Alpha. */
  runwayExitZ: [-600, -300, 300, 600] as number[],
  /** Longitudinal run of each high-speed exit (metres towards -Z). */
  runwayExitDrop: 130,
  /** Z of the apron cross taxilanes joining Alpha to Bravo. */
  crossTaxilaneZ: [-500, -300, 100, 600] as number[],
  /** Passenger gates 1..8 (gates 1 and 4 accept wide-bodies). */
  gateZ: [-180, -100, -20, 60, 150, 240, 330, 420] as number[],
  /** Remote stands 12..13 on the extended south apron. */
  remoteGateZ: [-500, -420] as number[],
  /** Cargo stands 9..11 on the northern cargo ramp. */
  cargoZ: [560, 640, 720] as number[],
  fuelFarm: new THREE.Vector3(190, 0, 860),
  baggageDepot: new THREE.Vector3(186, 0, -230)
};

interface StandDefinition {
  gateId: number;
  z: number;
  kind: 'gate' | 'remote' | 'cargo';
}

export function buildAirportGroundNetwork(tm: TrafficManager): GroundNetwork {
  const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);
  const link = (a: number, b: number) => tm.link(a, b);

  const {
    runwayX,
    runwayThresholdZ,
    runwayEndZ,
    taxiwayX,
    taxilaneX,
    gateX,
    leadX,
    serviceLaneX,
    runwayExitZ,
    runwayExitDrop,
    crossTaxilaneZ,
    gateZ,
    remoteGateZ,
    cargoZ,
    fuelFarm,
    baggageDepot
  } = AIRPORT_LAYOUT;

  /* ---------------------------- aircraft ---------------------------- */

  // Runway 36L/18R with four exit nodes.
  const runwayZ = [runwayThresholdZ, ...runwayExitZ, runwayEndZ];
  const runwayNodes = runwayZ.map((z, i) => {
    const isEnd = i === 0 || i === runwayZ.length - 1;
    const label = i === 0 ? 'RWY36' : i === runwayZ.length - 1 ? 'RWY18' : `RWY-EXIT-${i}`;
    return tm.addNode(V(runwayX, z), [], 'runway', undefined, {
      label,
      maxSpeed: isEnd ? 90 : 40
    });
  });
  const runwayNodeForZ = new Map<number, number>();
  runwayZ.forEach((z, i) => runwayNodeForZ.set(z, runwayNodes[i]));
  for (let i = 0; i < runwayNodes.length - 1; i++) link(runwayNodes[i], runwayNodes[i + 1]);

  // Parallel taxiway Alpha. The union of exit-merge and cross-taxilane Z
  // values gives the nodes where the runway exits and apron entrances branch
  // off. High-speed exits merge 130 m further down the runway direction.
  const exitMergeZ = runwayExitZ.map((z) => z - runwayExitDrop);
  const alphaZ = Array.from(
    new Set([-1100, 1100, ...exitMergeZ, ...crossTaxilaneZ])
  ).sort((a, b) => a - b);
  const alphaByZ = new Map<number, number>();
  const alphaNodes = alphaZ.map((z, i) => {
    const node = tm.addNode(V(taxiwayX, z), [], 'taxiway', undefined, { label: `A${i + 1}` });
    alphaByZ.set(z, node);
    return node;
  });
  for (let i = 0; i < alphaNodes.length - 1; i++) link(alphaNodes[i], alphaNodes[i + 1]);

  // High-speed exits: runway centreline -> runway edge -> holding point ->
  // Alpha. The diagonal matches the 22-degree asphalt strip drawn in the
  // scenery, so aircraft visibly turn off along the painted exit.
  runwayExitZ.forEach((z, i) => {
    const rwy = runwayNodeForZ.get(z);
    const alpha = alphaByZ.get(z - runwayExitDrop);
    if (rwy === undefined || alpha === undefined) return;
    const edge = tm.addNode(V(23, z), [], 'runway', undefined, { label: `RWY-EXIT-${i + 1}-EDGE` });
    const holdX = 45;
    const t = (holdX - 23) / (taxiwayX - 23);
    const hold = tm.addNode(V(holdX, z - runwayExitDrop * t), [], 'holding', undefined, {
      label: `HOLD-${i + 1}`
    });
    link(rwy, edge);
    link(edge, hold);
    link(hold, alpha);
  });

  // Taxiway ends connect back to the runway at both thresholds.
  link(alphaByZ.get(-1100)!, runwayNodes[0]);
  link(alphaByZ.get(1100)!, runwayNodes[runwayNodes.length - 1]);

  // Hold-short point for departures: it sits on Alpha just short of the
  // runway-end connector, still outside the 46 m of runway asphalt and in
  // the middle of the taxi lane, so aircraft queue single-file behind each
  // other. They only enter the runway once the shared controller grants it.
  // Before this node existed every waiting aircraft stopped on the runway
  // centreline at (0, 1150) and they all overlapped each other on the runway.
  const departureHold = tm.addNode(V(taxiwayX, 1112), [], 'holding', undefined, {
    label: 'HOLD-DEP',
    maxSpeed: 12
  });
  link(departureHold, alphaByZ.get(1100)!);
  link(departureHold, runwayNodes[runwayNodes.length - 1]);

  // Apron taxilane Bravo: spine from the south remote stands to the cargo
  // ramp, with extra nodes where the cross taxilanes meet it.
  const bravoZ = Array.from(
    new Set([-560, 780, ...remoteGateZ, ...gateZ, ...cargoZ, ...crossTaxilaneZ])
  ).sort((a, b) => a - b);
  const bravoByZ = new Map<number, number>();
  const bravoNodes = bravoZ.map((z, i) => {
    const node = tm.addNode(V(taxilaneX, z), [], 'apron', undefined, { label: `B${i + 1}` });
    bravoByZ.set(z, node);
    return node;
  });
  for (let i = 0; i < bravoNodes.length - 1; i++) link(bravoNodes[i], bravoNodes[i + 1]);

  // Cross taxilanes: Alpha -> Bravo. These are the visible entrance lanes
  // into the apron.
  for (const z of crossTaxilaneZ) {
    const alpha = alphaByZ.get(z);
    const bravo = bravoByZ.get(z);
    if (alpha !== undefined && bravo !== undefined) link(alpha, bravo);
  }

  // Stands. Passenger gates keep the 1-8 ids, remote stands are 12-13 and
  // the cargo ramp keeps 9-11. Order matters for pickFreeGate: airliners
  // fill the terminal gates first, then the remote stands, then cargo.
  const stands: StandDefinition[] = [
    ...gateZ.map((z, i) => ({ gateId: i + 1, z, kind: 'gate' as const })),
    ...remoteGateZ.map((z, i) => ({ gateId: 12 + i, z, kind: 'remote' as const })),
    ...cargoZ.map((z, i) => ({ gateId: 9 + i, z, kind: 'cargo' as const }))
  ];

  const leads = stands.map((stand) =>
    tm.addNode(V(leadX, stand.z), [], 'apron', stand.gateId, { label: `LEAD-${stand.gateId}` })
  );
  const gateNodes = stands.map((stand) => {
    const label =
      stand.kind === 'gate'
        ? `GATE${stand.gateId}`
        : stand.kind === 'remote'
          ? `REMOTE${stand.gateId}`
          : `CARGO${stand.gateId}`;
    return tm.addNode(V(gateX, stand.z), [], 'gate', stand.gateId, { label });
  });

  stands.forEach((stand, i) => {
    const bravo = bravoByZ.get(stand.z);
    if (bravo !== undefined) link(bravo, leads[i]);
    link(leads[i], gateNodes[i]);
  });

  /* ----------------------------- vehicles ---------------------------- */

  // Service lane Sierra (runs behind the gate stands, in front of terminal).
  // It now reaches both the extended south apron and the relocated fuel farm.
  const serviceZ = [
    -540, -500, -460, -420, -380, -230, -190, -180, -140, -100, -60, -20,
    20, 60, 150, 240, 330, 420, 520, 560, 600, 640, 700, 720, 780, 860
  ];
  const serviceNodes = serviceZ.map((z, i) =>
    tm.addNode(V(serviceLaneX, z), [], 'service', undefined, { label: `S${i + 1}` })
  );
  for (let i = 0; i < serviceNodes.length - 1; i++) link(serviceNodes[i], serviceNodes[i + 1]);

  const nearestService = (z: number) => {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    serviceZ.forEach((sz, i) => {
      const distance = Math.abs(sz - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    });
    return bestIndex;
  };

  // Two service spots per stand, one at each side of the aircraft. The
  // gateId is the real stand id (not the array index), so vehicles dispatched
  // to gate 12 or 13 find their own spots.
  const serviceSpots: number[][] = stands.map((stand) => {
    const a = tm.addNode(V(126, stand.z - 13), [], 'service', stand.gateId, {
      label: `SVC${stand.gateId}A`
    });
    const b = tm.addNode(V(126, stand.z + 13), [], 'service', stand.gateId, {
      label: `SVC${stand.gateId}B`
    });
    const lane = serviceNodes[nearestService(stand.z)];
    link(a, lane);
    link(b, lane);
    return [a, b];
  });

  // Fuel farm at the north end of the service lane.
  const fuelDepot = tm.addNode(V(fuelFarm.x, fuelFarm.z), [], 'depot', undefined, { label: 'fuel' });
  link(fuelDepot, serviceNodes[nearestService(fuelFarm.z)]);

  // Baggage + catering depot behind the south end of the apron.
  const baggageDepotNode = tm.addNode(V(baggageDepot.x, baggageDepot.z), [], 'depot', undefined, {
    label: 'baggage'
  });
  link(baggageDepotNode, serviceNodes[nearestService(baggageDepot.z)]);

  return {
    gates: stands.map((stand, i) => ({
      gateId: stand.gateId,
      gateNode: gateNodes[i],
      leadNode: leads[i],
      serviceSpots: serviceSpots[i]
    })),
    fuelDepot,
    baggageDepot: baggageDepotNode,
    runwayThreshold: runwayNodes[0],
    runwayEnd: runwayNodes[runwayNodes.length - 1],
    departureHold,
    layout: AIRPORT_LAYOUT
  };
}

/**
 * Sanity-checks the authored graph. Run once after building it: it catches a
 * typed connection, a gate that no aircraft can reach, a service spot cut off
 * from its depot, or an illegal aircraft/vehicle shared edge.
 */
export function validateGroundNetwork(tm: TrafficManager, net: GroundNetwork): {
  ok: boolean;
  errors: string[];
  aircraftNodes: number;
  vehicleNodes: number;
  links: number;
} {
  const errors: string[] = [];
  let aircraftNodes = 0;
  let vehicleNodes = 0;
  let links = 0;

  for (let i = 0; i < tm.getNodeCount(); i++) {
    const node = tm.getNode(i);
    if (!node) continue;
    if (node.allowed.includes('aircraft')) aircraftNodes++;
    if (node.allowed.includes('vehicle')) vehicleNodes++;
    links += node.connections.length;

    for (const b of node.connections) {
      const other = tm.getNode(b);
      if (!other) {
        errors.push(`node ${i} points to missing node ${b}`);
        continue;
      }
      const shared = node.allowed.filter((k) => other.allowed.includes(k));
      if (shared.length === 0) {
        errors.push(`illegal edge ${node.label ?? i} -> ${other.label ?? b} (no shared agent)`);
      }
      // Vehicles must never be able to reach runway/taxiway/gate nodes.
      if (other.allowed.includes('vehicle') && ['runway', 'taxiway', 'gate', 'holding'].includes(other.type ?? '')) {
        errors.push(`vehicle edge into restricted node ${other.label ?? b} (${other.type})`);
      }
    }
  }

  for (const gate of net.gates) {
    const inbound = tm.findPath(net.runwayThreshold, gate.gateNode, 'aircraft');
    if (!inbound) errors.push(`gate ${gate.gateId} cannot be reached from RWY36`);
    const outbound = tm.findPath(gate.gateNode, net.runwayEnd, 'aircraft');
    if (!outbound) errors.push(`gate ${gate.gateId} has no taxi-out route to RWY18`);
    for (const spot of gate.serviceSpots) {
      if (!tm.findPath(net.fuelDepot, spot, 'vehicle')) {
        errors.push(`fuel depot cannot reach service spot ${spot}`);
      }
      if (!tm.findPath(net.baggageDepot, spot, 'vehicle')) {
        errors.push(`baggage depot cannot reach service spot ${spot}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    aircraftNodes,
    vehicleNodes,
    links: links / 2
  };
}
