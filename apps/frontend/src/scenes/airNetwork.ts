import * as THREE from 'three';
import {
  ALL_AIRPORTS,
  ROUTES,
  getAirport,
  HOME_AIRPORT,
  type AirportDefinition,
  type FlightRoute
} from './airports';

/**
 * Robust aerial node system.
 *
 * Before this file, RouteTraffic flew a single Bezier curve straight from
 * one airport centre to the other. There was no route, no waypoint, no
 * arrival procedure — a plane just "knew" where the other airport was.
 * That is why the traffic looked incoherent: every aircraft on the same
 * leg flew the exact same line, at the same height, head-on into the
 * traffic coming the other way.
 *
 * Now every flight is a route through named nodes, like a real flight:
 *
 *   RUNWAY-<A>  (on the runway, taking off)
 *     -> DEP-<A>     (climb-out, 1500 m past the runway end, ~180 m up)
 *     -> WPT-<A>-<B> (en-route waypoint, midway, offset to one side so
 *                      the opposite direction flies 1200 m apart)
 *     -> ARR-<B>     (arrival fix, 2000 m before the runway, ~280 m up)
 *     -> FINAL-<B>   (final approach, 900 m out, ~120 m up)
 *     -> RUNWAY-<B>  (touchdown)
 *     -> ground nodes (taxiway / apron / gate, see airRoutes.ts)
 *
 *   HOLD-<B> is the holding orbit: if the runway is busy at FINAL, the
 *   aircraft diverts to HOLD instead of landing on top of traffic, and
 *   rejoins ARR when the runway is free.
 *
 * The graph is built from the airports in airports.ts, so adding an
 * airport automatically adds its nodes and its routes. Routes are found
 * with Dijkstra over the graph (cost = 3D distance), never hard-coded.
 * validateAirNetwork() checks the whole graph: every airport reachable
 * from every other, no orphan node, every node has somewhere to go.
 */

export type AirNodeType =
  | 'runway'
  | 'departure'
  | 'enroute'
  | 'arrival'
  | 'final'
  | 'holding';

export interface AirNode {
  id: string;
  label: string;
  type: AirNodeType;
  airportCode: string;
  /** Position in metres; y is the altitude the aircraft should be at here. */
  position: THREE.Vector3;
  /** Speed in m/s the aircraft should aim for on the way to this node. */
  speed: number;
  /** Neighbour node ids, in the order they may be flown to. */
  connections: string[];
}

export class AirNetwork {
  readonly nodes = new Map<string, AirNode>();

  add(node: AirNode): void {
    this.nodes.set(node.id, node);
  }

  link(from: string, to: string): void {
    const node = this.nodes.get(from);
    if (node && !node.connections.includes(to)) node.connections.push(to);
  }

  get(id: string): AirNode | undefined {
    return this.nodes.get(id);
  }

  /** Shortest route (Dijkstra, cost = 3D distance) between two nodes. */
  findRoute(fromId: string, toId: string): AirNode[] | null {
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) return null;
    const dist = new Map<string, number>();
    const prev = new Map<string, string>();
    const done = new Set<string>();
    for (const id of this.nodes.keys()) dist.set(id, Number.POSITIVE_INFINITY);
    dist.set(fromId, 0);

    for (;;) {
      let current: string | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (const [id, d] of dist) {
        if (!done.has(id) && d < best) {
          best = d;
          current = id;
        }
      }
      if (current === null) break;
      if (current === toId) break;
      done.add(current);
      const node = this.nodes.get(current);
      if (!node) continue;
      for (const nextId of node.connections) {
        const next = this.nodes.get(nextId);
        if (!next) continue;
        const cost = best + node.position.distanceTo(next.position);
        if (cost < (dist.get(nextId) ?? Number.POSITIVE_INFINITY)) {
          dist.set(nextId, cost);
          prev.set(nextId, current);
        }
      }
    }

    if ((dist.get(toId) ?? Number.POSITIVE_INFINITY) === Number.POSITIVE_INFINITY) {
      return null;
    }
    const ids: string[] = [];
    let cursor: string | undefined = toId;
    while (cursor !== undefined) {
      ids.unshift(cursor);
      cursor = prev.get(cursor);
    }
    if (ids[0] !== fromId) return null;
    return ids
      .map((id) => this.nodes.get(id))
      .filter((n): n is AirNode => n !== undefined);
  }

  /** Route for a flight: runway of origin -> runway of destination. */
  findFlightRoute(originCode: string, destinationCode: string): AirNode[] | null {
    return this.findRoute(`RUNWAY-${originCode}`, `RUNWAY-${destinationCode}`);
  }
}

function runwayDir(airport: AirportDefinition): THREE.Vector3 {
  const yaw = (airport.headingDeg * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
}

/** Unit vector 90° to the runway heading, on the XZ plane. */
function runwayPerp(airport: AirportDefinition): THREE.Vector3 {
  const dir = runwayDir(airport);
  return new THREE.Vector3(dir.z, 0, -dir.x);
}

export function buildAirNetwork(airports: AirportDefinition[] = ALL_AIRPORTS): AirNetwork {
  const network = new AirNetwork();

  for (const airport of airports) {
    const dir = runwayDir(airport);
    const perp = runwayPerp(airport);
    const centre = new THREE.Vector3(airport.x, airport.elevation, airport.z);
    const elev = airport.elevation;

    network.add({
      id: `RUNWAY-${airport.code}`,
      label: `RWY ${airport.code}`,
      type: 'runway',
      airportCode: airport.code,
      position: new THREE.Vector3(centre.x, elev + 2, centre.z),
      speed: 35,
      connections: []
    });
    network.add({
      id: `DEP-${airport.code}`,
      label: `DEP ${airport.code}`,
      type: 'departure',
      airportCode: airport.code,
      position: new THREE.Vector3(
        centre.x + dir.x * 1500,
        elev + 180,
        centre.z + dir.z * 1500
      ),
      speed: 95,
      connections: []
    });
    network.add({
      id: `ARR-${airport.code}`,
      label: `ARR ${airport.code}`,
      type: 'arrival',
      airportCode: airport.code,
      position: new THREE.Vector3(
        centre.x - dir.x * 2000,
        elev + 280,
        centre.z - dir.z * 2000
      ),
      speed: 90,
      connections: []
    });
    network.add({
      id: `FINAL-${airport.code}`,
      label: `FINAL ${airport.code}`,
      type: 'final',
      airportCode: airport.code,
      position: new THREE.Vector3(
        centre.x - dir.x * 900,
        elev + 120,
        centre.z - dir.z * 900
      ),
      speed: 65,
      connections: []
    });
    network.add({
      id: `HOLD-${airport.code}`,
      label: `HOLD ${airport.code}`,
      type: 'holding',
      airportCode: airport.code,
      position: new THREE.Vector3(
        centre.x + perp.x * 900,
        elev + 400,
        centre.z + perp.z * 900
      ),
      speed: 90,
      connections: []
    });

    network.link(`RUNWAY-${airport.code}`, `DEP-${airport.code}`);
    network.link(`ARR-${airport.code}`, `FINAL-${airport.code}`);
    network.link(`FINAL-${airport.code}`, `RUNWAY-${airport.code}`);
    network.link(`ARR-${airport.code}`, `HOLD-${airport.code}`);
    network.link(`HOLD-${airport.code}`, `ARR-${airport.code}`);
  }

  // One en-route waypoint per directed route, offset sideways so the two
  // directions of the same city pair never fly the same line head-on.
  // Both directions are built: a flight's return leg flies the reverse
  // route, and ROUTES only lists MEX -> remote, not remote -> MEX.
  const directedRoutes: FlightRoute[] = [];
  for (const route of ROUTES) {
    directedRoutes.push(route);
    directedRoutes.push({
      origin: route.destination,
      destination: route.origin,
      distanceKm: route.distanceKm,
      cargo: route.cargo
    });
  }
  for (const route of directedRoutes) {
    const origin = getAirport(route.origin);
    const destination = getAirport(route.destination);
    if (!origin || !destination) continue;
    const midX = (origin.x + destination.x) / 2;
    const midZ = (origin.z + destination.z) / 2;
    const legX = destination.x - origin.x;
    const legZ = destination.z - origin.z;
    const legLen = Math.max(1, Math.hypot(legX, legZ));
    // Perpendicular, +600 m one way and -600 m the other way.
    const side = route.origin < route.destination ? 1 : -1;
    const perpX = (-legZ / legLen) * 600 * side;
    const perpZ = (legX / legLen) * 600 * side;
    const distance = Math.hypot(legX, legZ);
    const cruise = Math.min(700, Math.max(350, distance * 0.07));
    const id = `WPT-${route.origin}-${route.destination}`;
    if (network.get(id)) continue;
    network.add({
      id,
      label: `WPT ${route.origin}-${route.destination}`,
      type: 'enroute',
      airportCode: destination.code,
      position: new THREE.Vector3(
        midX + perpX,
        Math.max(origin.elevation, destination.elevation) + cruise,
        midZ + perpZ
      ),
      speed: 120,
      connections: []
    });
    network.link(`DEP-${route.origin}`, id);
    network.link(id, `ARR-${route.destination}`);
    // A waypoint can also divert to the holding orbit of its destination.
    network.link(id, `HOLD-${route.destination}`);
  }

  return network;
}

export function validateAirNetwork(network: AirNetwork): {
  ok: boolean;
  errors: string[];
  nodeCount: number;
  edgeCount: number;
} {
  const errors: string[] = [];
  let edgeCount = 0;
  for (const node of network.nodes.values()) {
    edgeCount += node.connections.length;
    if (node.connections.length === 0) {
      errors.push(`orphan node ${node.id} (${node.label}): no outgoing route`);
    }
    for (const nextId of node.connections) {
      if (!network.get(nextId)) {
        errors.push(`node ${node.id} points to missing node ${nextId}`);
      }
    }
  }

  for (const airport of ALL_AIRPORTS) {
    for (const type of ['RUNWAY', 'DEP', 'ARR', 'FINAL', 'HOLD'] as const) {
      if (!network.get(`${type}-${airport.code}`)) {
        errors.push(`airport ${airport.code} is missing its ${type} node`);
      }
    }
  }

  // Every airport must be reachable from every other airport.
  for (const a of ALL_AIRPORTS) {
    for (const b of ALL_AIRPORTS) {
      if (a.code === b.code) continue;
      const route = network.findFlightRoute(a.code, b.code);
      if (!route) {
        errors.push(`no air route from ${a.code} to ${b.code}`);
      } else if (route.length < 5) {
        errors.push(
          `air route ${a.code} -> ${b.code} is too short (${route.length} nodes): ${route.map((n) => n.id).join(' -> ')}`
        );
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    nodeCount: network.nodes.size,
    edgeCount
  };
}

export { HOME_AIRPORT };
