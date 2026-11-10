import * as THREE from 'three';
import { TrafficManager } from './trafficManager';

/**
 * Complete ground movement network for the airport.
 *
 * Coordinate layout (matches `qualityDemo.ts` scenery):
 *   - Runway 36L/18R .......... x = 0,     z = -1150 .. +1150
 *   - Parallel taxiway Alpha .. x = 45
 *   - Apron taxilane Bravo .... x = 95
 *   - Gate stands ............. x = 130,   z = -180, -100, -20, 60, 150, 240, 330, 420
 *                               (gates 1 and 4 accept wide-body aircraft)
 *   - Cargo stands 9-11 ....... x = 130,   z = 560, 640, 720
 *   - Service lane Sierra ..... x = 160,   z = -190 .. 700
 *   - Fuel farm ............... (60, 100)
 *   - Baggage / catering depot  (160, -230)
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
  layout: typeof AIRPORT_LAYOUT;
}

export const AIRPORT_LAYOUT = {
  runwayX: 0,
  runwayThresholdZ: -1150,
  runwayEndZ: 1150,
  taxiwayX: 45,
  taxilaneX: 95,
  gateX: 130,
  leadX: 110,
  serviceLaneX: 160,
  /** Passenger gates 1..8 (gates 1 and 4 accept wide-bodies). */
  gateZ: [-180, -100, -20, 60, 150, 240, 330, 420] as number[],
  /** Cargo stands 9..11 on the northern cargo ramp. */
  cargoZ: [560, 640, 720] as number[],
  fuelFarm: new THREE.Vector3(60, 0, 100),
  baggageDepot: new THREE.Vector3(160, 0, -230)
};

export function buildAirportGroundNetwork(tm: TrafficManager): GroundNetwork {
  const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);
  const link = (a: number, b: number) => tm.link(a, b);

  /* ---------------------------- aircraft ---------------------------- */

  // Runway 36L/18R
  const r0 = tm.addNode(V(0, -1150), [], 'runway', undefined, { label: 'RWY36', maxSpeed: 90 });
  const r1 = tm.addNode(V(0, -600), [], 'runway', undefined, { label: 'RWY36-MID', maxSpeed: 90 });
  const r2 = tm.addNode(V(0, -300), [], 'runway', undefined, { label: 'RWY-EXIT-S', maxSpeed: 40 });
  const r3 = tm.addNode(V(0, 300), [], 'runway', undefined, { label: 'RWY-EXIT-N', maxSpeed: 40 });
  const r4 = tm.addNode(V(0, 1150), [], 'runway', undefined, { label: 'RWY18' });
  link(r0, r1); link(r1, r2); link(r2, r3); link(r3, r4);

  // Holding points just outside the runway
  const h1 = tm.addNode(V(25, -330), [], 'holding', undefined, { label: 'HOLD-S' });
  const h2 = tm.addNode(V(25, 330), [], 'holding', undefined, { label: 'HOLD-N' });
  link(r2, h1);
  link(r3, h2);

  // Parallel taxiway Alpha
  const a1 = tm.addNode(V(45, -600), [], 'taxiway', undefined, { label: 'A1' });
  const a2 = tm.addNode(V(45, -300), [], 'taxiway', undefined, { label: 'A2' });
  const a3 = tm.addNode(V(45, -100), [], 'taxiway', undefined, { label: 'A3' });
  const a4 = tm.addNode(V(45, 100), [], 'taxiway', undefined, { label: 'A4' });
  const a5 = tm.addNode(V(45, 300), [], 'taxiway', undefined, { label: 'A5' });
  const a6 = tm.addNode(V(45, 600), [], 'taxiway', undefined, { label: 'A6' });
  const a7 = tm.addNode(V(45, 1100), [], 'taxiway', undefined, { label: 'A7' });
  link(a1, a2); link(a2, a3); link(a3, a4); link(a4, a5); link(a5, a6); link(a6, a7);
  link(a1, r1);
  link(h1, a2);
  link(h2, a5);
  link(a7, r4);

  // Apron taxilane Bravo. The spine runs past all passenger gates and then
  // north into the cargo ramp.
  const gateZ = AIRPORT_LAYOUT.gateZ;
  const cargoZ = AIRPORT_LAYOUT.cargoZ;
  const leadZ = [...gateZ, ...cargoZ];
  const bravoZ = [...gateZ, 520, ...cargoZ];
  const bravo = bravoZ.map((z, i) =>
    tm.addNode(V(AIRPORT_LAYOUT.taxilaneX, z), [], 'apron', undefined, { label: `B${i}` })
  );
  for (let i = 0; i < bravo.length - 1; i++) link(bravo[i], bravo[i + 1]);
  link(a3, bravo[1]);
  link(a4, bravo[3]);
  link(a6, bravo[bravoZ.indexOf(cargoZ[0])]);

  // Gate lead-in nodes (pushback axis) for passenger + cargo stands.
  const leads = leadZ.map((z, i) =>
    tm.addNode(V(AIRPORT_LAYOUT.leadX, z), [], 'apron', i + 1, { label: `LEAD${i + 1}` })
  );
  // Link Bravo to gate lead-ins. Index match is: gateZ[n] -> leads[n].
  // The first 4 leads connect to Bravo nodes directly after a3 and a4.
  leads.forEach((lead, i) => {
    if (i < 4) {
      link(bravo[i + 1], lead);
    } else if (i < 8) {
      link(bravo[i + 2], lead);
    } else {
      // Cargo leads connect at bravo[bravoZ.indexOf(520)] onwards.
      const bz = bravoZ.indexOf(520) + (i - 8);
      if (bz >= 0 && bz < bravo.length) link(bravo[bz], lead);
    }
  });

  /** Gate stands (nose towards +X / terminal). Gates 1-8 are passenger, 9-11 are cargo. */
  const passengerGates = gateZ.map((z, i) =>
    tm.addNode(V(AIRPORT_LAYOUT.gateX, z), [], 'gate', i + 1, { label: `GATE${i + 1}` })
  );
  const cargoGates = cargoZ.map((z, i) =>
    tm.addNode(V(AIRPORT_LAYOUT.gateX, z), [], 'gate', i + 9, { label: `CARGO${i + 9}` })
  );
  const allGates = [...passengerGates, ...cargoGates];
  leads.forEach((lead, i) => link(lead, allGates[i]));

  /* ----------------------------- vehicles ---------------------------- */

  // Service lane Sierra (runs behind the gate stands, in front of terminal).
  // It is extended north to serve the cargo ramp.
  const serviceZ = [-190, -140, -100, -60, -20, 20, 60, 150, 240, 330, 420, 520, 600, 700];
  const serviceNodes = serviceZ.map((z, i) =>
    tm.addNode(V(AIRPORT_LAYOUT.serviceLaneX, z), [], 'service', undefined, { label: `S${i + 1}` })
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

  // Two service spots per stand, one at each side of the aircraft.
  const serviceSpots: number[][] = leadZ.map((z, i) => {
    const a = tm.addNode(V(126, z - 13), [], 'service', i + 1, { label: `SVC${i + 1}A` });
    const b = tm.addNode(V(126, z + 13), [], 'service', i + 1, { label: `SVC${i + 1}B` });
    const lane = serviceNodes[nearestService(z)];
    link(a, lane);
    link(b, lane);
    return [a, b];
  });

  // Fuel farm road (west of the apron) + depot node
  const f0 = tm.addNode(V(60, 100), [], 'depot', undefined, { label: 'fuel' });
  const f1 = tm.addNode(V(60, 130), [], 'service', undefined, { label: 'F1' });
  const f2 = tm.addNode(V(100, 130), [], 'service', undefined, { label: 'F2' });
  const f3 = tm.addNode(V(140, 130), [], 'service', undefined, { label: 'F3' });
  link(f0, f1); link(f1, f2); link(f2, f3);
  link(f3, serviceNodes[nearestService(60)]);

  // Baggage + catering depot behind the south end of the service lane
  const d0 = tm.addNode(V(160, -230), [], 'depot', undefined, { label: 'baggage' });
  const d1 = tm.addNode(V(160, -210), [], 'service', undefined, { label: 'D1' });
  link(d0, d1); link(d1, serviceNodes[0]);

  return {
    gates: allGates.map((gateNode, i) => ({
      gateId: i + 1,
      gateNode,
      leadNode: leads[i],
      serviceSpots: serviceSpots[i]
    })),
    fuelDepot: f0,
    baggageDepot: d0,
    runwayThreshold: r0,
    runwayEnd: r4,
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
