import * as THREE from 'three';
import { haversineKm, validateAirportGeo } from './geo';

/**
 * World airport catalogue.
 *
 * Two coordinate systems coexist here:
 *
 * - Local scene coordinates (`x`, `z`, `elevation`, `headingDeg`,
 *   `runwayLength`): LEGACY values in metres on the same XZ plane as the home
 *   airport (MEX at the origin). They remain authoritative for rendering,
 *   traffic, physics and airport layout in the current procedural world.
 * - Real geodetic data (`icao`, `country`, `lat`, `lon`, `elevationRealM`,
 *   `runways`): REAL-WORLD metadata verified against OurAirports
 *   (https://ourairports.com/data/). Elevations are converted from feet and
 *   rounded to the nearest metre; runway lengths and widths are converted from
 *   feet to metres. This data drives distance calculations and future
 *   georeferencing only: it does not move or reshape anything in the scene.
 */
export type AirportType = 'hub' | 'regional' | 'cargo' | 'military';

/** Real-world runway metadata. */
export interface Runway {
  /** Published designator pair, e.g. "05L/23R". */
  designator: string;
  /**
   * True heading of the lower-numbered end in degrees (0-360), from
   * OurAirports. When OurAirports leaves it blank it is computed from the
   * published runway-end coordinates.
   */
  headingDeg: number;
  /** Physical runway length in metres. */
  lengthM: number;
  /** Physical runway width in metres when known. */
  widthM?: number;
}

/** Real-world geodetic data shared by rendered airports and the catalogue. */
export interface AirportGeo {
  /** REAL DATA: four-letter ICAO code (e.g. MMMX). */
  icao: string;
  /** REAL DATA: country name. */
  country: string;
  /** REAL DATA: latitude in decimal degrees (-90..90). */
  lat: number;
  /** REAL DATA: longitude in decimal degrees (-180..180). */
  lon: number;
  /** REAL DATA: elevation above mean sea level in metres. */
  elevationRealM: number;
  /** REAL DATA: open runways at the airport. */
  runways: Runway[];
}

export interface AirportDefinition extends AirportGeo {
  /** LEGACY local scene code (IATA-like, e.g. MEX). */
  code: string;
  /** LEGACY display name used by the scene and UI. */
  name: string;
  /** LEGACY city label used by the scene and UI. */
  city: string;
  /** LEGACY scene classification. */
  type: AirportType;
  /** LEGACY local scene X in metres (MEX = 0). */
  x: number;
  /** LEGACY local scene Z in metres (MEX = 0; +Z points south). */
  z: number;
  /** LEGACY terrain elevation of the flattened airport pad, in scene metres. */
  elevation: number;
  /** LEGACY runway heading in the scene, degrees clockwise from +Z. */
  headingDeg: number;
  /** LEGACY runway length in scene metres. */
  runwayLength: number;
  /** LEGACY passenger/cargo stands in the simplified scene. */
  gates: number;
}

/**
 * Data-only catalogue entry for an airport that is not rendered yet.
 *
 * It deliberately has no local scene coordinates (`x`, `z`, `elevation`): those
 * must be derived in a future phase, not invented here.
 */
export interface WorldAirport extends AirportGeo {
  code: string;
  name: string;
  city: string;
  type: AirportType;
}

export const HOME_AIRPORT: AirportDefinition = {
  code: 'MEX',
  name: 'Aeropuerto Internacional Benito Juárez',
  city: 'Ciudad de México',
  type: 'hub',
  icao: 'MMMX',
  country: 'México',
  lat: 19.435822,
  lon: -99.07033,
  elevationRealM: 2230,
  runways: [
    { designator: '05L/23R', headingDeg: 59.4, lengthM: 3952, widthM: 45 },
    { designator: '05R/23L', headingDeg: 59.4, lengthM: 3900, widthM: 45 }
  ],
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
    icao: 'MMGL',
    country: 'México',
    lat: 20.523342,
    lon: -103.310108,
    elevationRealM: 1529,
    runways: [
      // OurAirports has no published heading for 11L; computed from its ends.
      { designator: '11L/29R', headingDeg: 114.1, lengthM: 3538, widthM: 45 },
      { designator: '11R/29L', headingDeg: 113, lengthM: 4000, widthM: 60 }
    ],
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
    icao: 'MMMY',
    country: 'México',
    lat: 25.778521,
    lon: -100.106989,
    elevationRealM: 390,
    runways: [
      { designator: '12/30', headingDeg: 121, lengthM: 3000, widthM: 45 },
      { designator: '16/34', headingDeg: 165, lengthM: 1801, widthM: 30 }
    ],
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
    icao: 'MMUN',
    country: 'México',
    lat: 21.040817,
    lon: -86.87347,
    elevationRealM: 7,
    runways: [
      { designator: '12L/30R', headingDeg: 123.6, lengthM: 2800, widthM: 45 },
      { designator: '12R/30L', headingDeg: 123.6, lengthM: 3500, widthM: 60 }
    ],
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
    icao: 'MMTJ',
    country: 'México',
    lat: 32.541043,
    lon: -116.969976,
    elevationRealM: 149,
    runways: [{ designator: '09/27', headingDeg: 99, lengthM: 2960, widthM: 44 }],
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
    icao: 'MMQT',
    country: 'México',
    lat: 20.618779,
    lon: -100.186449,
    elevationRealM: 1919,
    runways: [{ designator: '09/27', headingDeg: 100.8, lengthM: 3500, widthM: 45 }],
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
    icao: 'MMMD',
    country: 'México',
    lat: 20.930485,
    lon: -89.645462,
    elevationRealM: 12,
    runways: [
      { designator: '10/28', headingDeg: 105, lengthM: 3200, widthM: 46 },
      { designator: '18/36', headingDeg: 181, lengthM: 2300, widthM: 46 }
    ],
    x: 2300,
    z: 5300,
    elevation: 18,
    headingDeg: 140,
    runwayLength: 2500,
    gates: 5
  }
];

export const ALL_AIRPORTS: AirportDefinition[] = [HOME_AIRPORT, ...REMOTE_AIRPORTS];

/**
 * DATA ONLY: ten world airports reserved for future phases.
 *
 * They are NOT part of `ALL_AIRPORTS` or `ROUTES` and are not rendered in the
 * current scene. Keep them here as verified reference data until the world is
 * georeferenced.
 */
export const WORLD_AIRPORTS: WorldAirport[] = [
  {
    code: 'JFK',
    name: 'John F. Kennedy International Airport',
    city: 'Nueva York',
    type: 'hub',
    icao: 'KJFK',
    country: 'Estados Unidos',
    lat: 40.639447,
    lon: -73.779317,
    elevationRealM: 4,
    runways: [
      { designator: '04L/22R', headingDeg: 31, lengthM: 3682, widthM: 61 },
      { designator: '04R/22L', headingDeg: 30.6, lengthM: 2560, widthM: 61 },
      { designator: '13L/31R', headingDeg: 121, lengthM: 3048, widthM: 61 },
      { designator: '13R/31L', headingDeg: 121, lengthM: 4423, widthM: 61 }
    ]
  },
  {
    code: 'LAX',
    name: 'Los Angeles International Airport',
    city: 'Los Ángeles',
    type: 'hub',
    icao: 'KLAX',
    country: 'Estados Unidos',
    lat: 33.942501,
    lon: -118.407997,
    elevationRealM: 38,
    runways: [
      { designator: '6L/24R', headingDeg: 83, lengthM: 2721, widthM: 46 },
      { designator: '6R/24L', headingDeg: 83, lengthM: 3310, widthM: 46 },
      { designator: '7L/25R', headingDeg: 83, lengthM: 3930, widthM: 46 },
      { designator: '7R/25L', headingDeg: 83, lengthM: 3382, widthM: 61 }
    ]
  },
  {
    code: 'MIA',
    name: 'Miami International Airport',
    city: 'Miami',
    type: 'hub',
    icao: 'KMIA',
    country: 'Estados Unidos',
    lat: 25.796011,
    lon: -80.289751,
    elevationRealM: 2,
    runways: [
      { designator: '08L/26R', headingDeg: 87.4, lengthM: 2621, widthM: 46 },
      { designator: '08R/26L', headingDeg: 87, lengthM: 3202, widthM: 61 },
      { designator: '09/27', headingDeg: 87, lengthM: 3967, widthM: 46 },
      { designator: '12/30', headingDeg: 119, lengthM: 2853, widthM: 46 }
    ]
  },
  {
    code: 'MAD',
    name: 'Adolfo Suárez Madrid-Barajas Airport',
    city: 'Madrid',
    type: 'hub',
    icao: 'LEMD',
    country: 'España',
    lat: 40.493407,
    lon: -3.572249,
    elevationRealM: 609,
    runways: [
      { designator: '14L/32R', headingDeg: 144.2, lengthM: 3500, widthM: 60 },
      { designator: '14R/32L', headingDeg: 144.2, lengthM: 3988, widthM: 60 },
      { designator: '18L/36R', headingDeg: 181, lengthM: 3500, widthM: 60 },
      { designator: '18R/36L', headingDeg: 181, lengthM: 4350, widthM: 60 }
    ]
  },
  {
    code: 'CDG',
    name: 'Charles de Gaulle International Airport',
    city: 'París',
    type: 'hub',
    icao: 'LFPG',
    country: 'Francia',
    lat: 49.00896,
    lon: 2.554117,
    elevationRealM: 119,
    runways: [
      { designator: '08L/26R', headingDeg: 85, lengthM: 4215, widthM: 45 },
      { designator: '08R/26L', headingDeg: 85.1, lengthM: 2700, widthM: 60 },
      { designator: '09L/27R', headingDeg: 85.3, lengthM: 2700, widthM: 60 },
      { designator: '09R/27L', headingDeg: 86, lengthM: 4200, widthM: 45 }
    ]
  },
  {
    code: 'LHR',
    name: 'London Heathrow Airport',
    city: 'Londres',
    type: 'hub',
    icao: 'EGLL',
    country: 'Reino Unido',
    lat: 51.470748,
    lon: -0.459909,
    elevationRealM: 25,
    runways: [
      { designator: '09L/27R', headingDeg: 90, lengthM: 3901, widthM: 50 },
      { designator: '09R/27L', headingDeg: 90, lengthM: 3658, widthM: 50 }
    ]
  },
  {
    code: 'GRU',
    name: 'São Paulo/Guarulhos International Airport',
    city: 'São Paulo',
    type: 'hub',
    icao: 'SBGR',
    country: 'Brasil',
    lat: -23.431274,
    lon: -46.469954,
    elevationRealM: 750,
    runways: [
      { designator: '10L/28R', headingDeg: 74, lengthM: 3700, widthM: 45 },
      { designator: '10R/28L', headingDeg: 74, lengthM: 3000, widthM: 45 }
    ]
  },
  {
    code: 'BOG',
    name: 'El Dorado International Airport',
    city: 'Bogotá',
    type: 'hub',
    icao: 'SKBO',
    country: 'Colombia',
    lat: 4.70159,
    lon: -74.1469,
    elevationRealM: 2548,
    runways: [
      { designator: '14L/32R', headingDeg: 127, lengthM: 3800, widthM: 45 },
      { designator: '14R/32L', headingDeg: 127, lengthM: 3800, widthM: 45 }
    ]
  },
  {
    code: 'LIM',
    name: 'Jorge Chávez International Airport',
    city: 'Lima',
    type: 'hub',
    // OurAirports still lists Lima as SPIM; the airport's current ICAO is SPJC.
    icao: 'SPJC',
    country: 'Perú',
    lat: -12.0219,
    lon: -77.114305,
    elevationRealM: 34,
    runways: [
      { designator: '16L/34R', headingDeg: 154, lengthM: 3507, widthM: 45 },
      // OurAirports has no published heading for 16R; computed from its ends.
      { designator: '16R/34L', headingDeg: 154.3, lengthM: 3480, widthM: 45 }
    ]
  },
  {
    code: 'SCL',
    name: 'Comodoro Arturo Merino Benítez International Airport',
    city: 'Santiago',
    type: 'hub',
    icao: 'SCEL',
    country: 'Chile',
    lat: -33.390252,
    lon: -70.794697,
    elevationRealM: 474,
    runways: [
      { designator: '17L/35R', headingDeg: 178, lengthM: 3750, widthM: 55 },
      { designator: '17R/35L', headingDeg: 177, lengthM: 3750, widthM: 45 }
    ]
  }
];

/**
 * DATA ONLY: the seven rendered airports plus the ten world airports above.
 * Used by `getAirportByIcao()` and `validateAllAirports()`; not rendered and
 * not part of `ALL_AIRPORTS` or `ROUTES`.
 */
export const WORLD_CATALOGUE: Array<AirportDefinition | WorldAirport> = [
  ...ALL_AIRPORTS,
  ...WORLD_AIRPORTS
];

export interface FlightRoute {
  origin: string;
  destination: string;
  distanceKm: number;
  cargo: boolean;
}

/** Real great-circle distance in kilometres between two airports. */
function distanceKm(a: AirportGeo, b: AirportGeo): number {
  return Math.round(haversineKm(a.lat, a.lon, b.lat, b.lon));
}

export function getAirport(code: string): AirportDefinition | undefined {
  return ALL_AIRPORTS.find((airport) => airport.code === code);
}

/** Look up a rendered or data-only airport by ICAO code. */
export function getAirportByIcao(icao: string): AirportDefinition | WorldAirport | undefined {
  const normalized = icao.trim().toUpperCase();
  return WORLD_CATALOGUE.find((airport) => airport.icao === normalized);
}

/** Validate the real-world data of every rendered and catalogue airport. */
export function validateAllAirports(): string[] {
  return WORLD_CATALOGUE.flatMap((airport) => validateAirportGeo(airport));
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
