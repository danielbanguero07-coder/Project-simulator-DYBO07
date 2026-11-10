import * as THREE from 'three';

/**
 * World airport catalogue.
 *
 * Coordinates are metres on the same XZ plane as the home airport (MEX at the
 * origin). The home airport is fully modelled; remote airports are simplified
 * but lit, with a runway, apron, terminal and jetways so they read correctly
 * from the air.
 */
export type AirportType = 'hub' | 'regional' | 'cargo' | 'military';

export interface AirportDefinition {
  code: string;
  name: string;
  city: string;
  type: AirportType;
  x: number;
  z: number;
  /** Terrain elevation of the flattened airport pad (metres). */
  elevation: number;
  /** Runway heading in degrees, clockwise from +Z. */
  headingDeg: number;
  /** Runway length in metres. */
  runwayLength: number;
  /** Passenger/cargo stands (used for the simplified remote airports). */
  gates: number;
}

export const HOME_AIRPORT: AirportDefinition = {
  code: 'MEX',
  name: 'Aeropuerto Internacional Benito Juárez',
  city: 'Ciudad de México',
  type: 'hub',
  x: 0,
  z: 0,
  elevation: 0,
  headingDeg: 180,
  runwayLength: 2300,
  gates: 11
};

export const REMOTE_AIRPORTS: AirportDefinition[] = [
  {
    code: 'GDL',
    name: 'Aeropuerto Internacional de Guadalajara',
    city: 'Guadalajara',
    type: 'hub',
    x: -4700,
    z: -3100,
    elevation: 95,
    headingDeg: 110,
    runwayLength: 3200,
    gates: 12
  },
  {
    code: 'MTY',
    name: 'Aeropuerto Internacional de Monterrey',
    city: 'Monterrey',
    type: 'regional',
    x: 4900,
    z: -3600,
    elevation: 70,
    headingDeg: 20,
    runwayLength: 3000,
    gates: 8
  },
  {
    code: 'CUN',
    name: 'Aeropuerto Internacional de Cancún',
    city: 'Cancún',
    type: 'hub',
    x: 5700,
    z: 4300,
    elevation: 12,
    headingDeg: 220,
    runwayLength: 2800,
    gates: 10
  },
  {
    code: 'TIJ',
    name: 'Aeropuerto Internacional de Tijuana',
    city: 'Tijuana',
    type: 'regional',
    x: -6100,
    z: 3900,
    elevation: 220,
    headingDeg: 300,
    runwayLength: 2600,
    gates: 6
  },
  {
    code: 'QRO',
    name: 'Aeropuerto Intercontinental de Querétaro',
    city: 'Querétaro',
    type: 'cargo',
    x: 1800,
    z: 5200,
    elevation: 140,
    headingDeg: 90,
    runwayLength: 3400,
    gates: 5
  },
  {
    code: 'MID',
    name: 'Aeropuerto Internacional de Mérida',
    city: 'Mérida',
    type: 'regional',
    x: 2300,
    z: 5300,
    elevation: 18,
    headingDeg: 140,
    runwayLength: 2500,
    gates: 5
  }
];

export const ALL_AIRPORTS: AirportDefinition[] = [HOME_AIRPORT, ...REMOTE_AIRPORTS];

export interface FlightRoute {
  origin: string;
  destination: string;
  distanceKm: number;
  cargo: boolean;
}

function distanceKm(a: AirportDefinition, b: AirportDefinition): number {
  return Math.round(Math.hypot(a.x - b.x, a.z - b.z) / 1000);
}

export function getAirport(code: string): AirportDefinition | undefined {
  return ALL_AIRPORTS.find((airport) => airport.code === code);
}

/** Routes leaving the home hub. */
export const ROUTES: FlightRoute[] = REMOTE_AIRPORTS.flatMap((destination) => {
  const pax: FlightRoute = {
    origin: HOME_AIRPORT.code,
    destination: destination.code,
    distanceKm: distanceKm(HOME_AIRPORT, destination),
    cargo: false
  };
  const cargo: FlightRoute = { ...pax, cargo: true };
  return [pax, cargo];
});

/** A couple of inter-hub connections so the sky is not all MEX traffic. */
for (let i = 0; i < REMOTE_AIRPORTS.length; i++) {
  const a = REMOTE_AIRPORTS[i];
  const b = REMOTE_AIRPORTS[(i + 1) % REMOTE_AIRPORTS.length];
  if (a.type === 'hub' || b.type === 'hub') {
    ROUTES.push({
      origin: a.code,
      destination: b.code,
      distanceKm: distanceKm(a, b),
      cargo: a.type === 'cargo' || b.type === 'cargo'
    });
  }
}

export function pickRoute(cargo: boolean, origin?: string): FlightRoute {
  let pool = ROUTES.filter(
    (route) => route.cargo === cargo && (origin === undefined || route.origin === origin)
  );
  if (pool.length === 0) {
    pool = ROUTES.filter((route) => origin === undefined || route.origin === origin);
  }
  if (pool.length === 0) pool = ROUTES;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** World position of an airport (Y is its elevation). */
export function airportPosition(airport: AirportDefinition): THREE.Vector3 {
  return new THREE.Vector3(airport.x, airport.elevation, airport.z);
}
