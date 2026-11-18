/**
 * Phase 1 verification script.
 *
 * Run from apps/frontend:
 *   npx ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' scripts/verify-geo.ts
 *
 * It checks the geo helpers, validates the real-world airport metadata, and
 * confirms that the legacy local-scene values were not altered.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_AIRPORTS,
  HOME_AIRPORT,
  REMOTE_AIRPORTS,
  ROUTES,
  WORLD_CATALOGUE,
  getAirportByIcao,
  validateAllAirports
} from '../src/scenes/airports';
import {
  geoToLocal,
  haversineKm,
  initialBearingDeg,
  localToGeo,
  validateAirportGeo
} from '../src/scenes/geo';

let failures = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function near(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

console.log('Geo helpers');
const mexToGdl = haversineKm(
  HOME_AIRPORT.lat,
  HOME_AIRPORT.lon,
  REMOTE_AIRPORTS[0].lat,
  REMOTE_AIRPORTS[0].lon
);
check('MEX-GDL haversine ≈ 460 km', near(mexToGdl, 460, 12), `${mexToGdl.toFixed(1)} km`);
const bearing = initialBearingDeg(
  HOME_AIRPORT.lat,
  HOME_AIRPORT.lon,
  REMOTE_AIRPORTS[0].lat,
  REMOTE_AIRPORTS[0].lon
);
check('MEX-GDL bearing ≈ 290°', near(bearing, 290, 12), `${bearing.toFixed(1)}°`);
check('bearing is 0..360', bearing >= 0 && bearing < 360);

const roundTrip = localToGeo(
  geoToLocal(19.5, -99.1).x,
  geoToLocal(19.5, -99.1).z
);
check(
  'geoToLocal/localToGeo round trip',
  near(roundTrip.lat, 19.5, 1e-9) && near(roundTrip.lon, -99.1, 1e-9),
  JSON.stringify(roundTrip)
);
check(
  'geoToLocal origin is (0, 0)',
  geoToLocal(19.4363, -99.0721).x === 0 && geoToLocal(19.4363, -99.0721).z === 0
);
const compressed = geoToLocal(20.523342, -103.310108, undefined, 0.01);
check(
  'scale 0.01 compresses ~460 km to ~4.6 km',
  near(Math.hypot(compressed.x, compressed.z) / 1000, 4.6, 0.2),
  `${(Math.hypot(compressed.x, compressed.z) / 1000).toFixed(2)} km`
);

console.log('Validation');
check('validateAllAirports() is clean', validateAllAirports().length === 0, validateAllAirports().join('; '));
check('valid airport returns no errors', validateAirportGeo(HOME_AIRPORT).length === 0);
check(
  'bad lat/lon are rejected',
  validateAirportGeo({ ...HOME_AIRPORT, lat: 95, lon: 200 }).length === 2
);
check(
  'bad ICAO is rejected',
  validateAirportGeo({ ...HOME_AIRPORT, icao: 'MEX' }).length === 1
);
check(
  'empty runways are rejected',
  validateAirportGeo({ ...HOME_AIRPORT, runways: [] }).length === 1
);
check(
  'zero-length runway is rejected',
  validateAirportGeo({
    ...HOME_AIRPORT,
    runways: [{ designator: '01/19', headingDeg: 10, lengthM: 0 }]
  }).length === 1
);

console.log('Catalogue');
check('ALL_AIRPORTS still has 7 airports', ALL_AIRPORTS.length === 7);
check('WORLD_CATALOGUE has 17 airports', WORLD_CATALOGUE.length === 17);
check('WORLD_AIRPORTS are not rendered', !ALL_AIRPORTS.some((a) => a.icao === 'KJFK'));
check('ROUTES do not include world extras', !ROUTES.some((r) => r.destination === 'JFK'));
check('getAirportByIcao is case-insensitive', getAirportByIcao('kjfk')?.code === 'JFK');
check('getAirportByIcao finds rendered airports', getAirportByIcao('MMMX')?.code === 'MEX');

console.log('Real route distances (km)');
for (const route of ROUTES) {
  console.log(`  ${route.origin}-${route.destination}: ${route.distanceKm} km${route.cargo ? ' (cargo)' : ''}`);
}
check(
  'no route keeps the old local distance',
  ROUTES.every((r) => r.distanceKm > 100),
  ROUTES.map((r) => r.distanceKm).join(',')
);

console.log('Legacy scene values');
const legacyHome = {
  code: 'MEX',
  x: 0,
  z: 0,
  elevation: 0,
  headingDeg: 180,
  runwayLength: 2300,
  gates: 11
};
check(
  'HOME_AIRPORT legacy values unchanged',
  HOME_AIRPORT.code === legacyHome.code &&
    HOME_AIRPORT.x === legacyHome.x &&
    HOME_AIRPORT.z === legacyHome.z &&
    HOME_AIRPORT.elevation === legacyHome.elevation &&
    HOME_AIRPORT.headingDeg === legacyHome.headingDeg &&
    HOME_AIRPORT.runwayLength === legacyHome.runwayLength &&
    HOME_AIRPORT.gates === legacyHome.gates
);

const expectedRemote: Record<string, [number, number, number, number, number, number]> = {
  GDL: [-4700, -3100, 95, 110, 3200, 12],
  MTY: [4900, -3600, 70, 20, 3000, 8],
  CUN: [5700, 4300, 12, 220, 2800, 10],
  TIJ: [-6100, 3900, 220, 300, 2600, 6],
  QRO: [1800, 5200, 140, 90, 3400, 5],
  MID: [2300, 5300, 18, 140, 2500, 5]
};
for (const airport of REMOTE_AIRPORTS) {
  const expected = expectedRemote[airport.code];
  check(
    `${airport.code} legacy values unchanged`,
    !!expected &&
      airport.x === expected[0] &&
      airport.z === expected[1] &&
      airport.elevation === expected[2] &&
      airport.headingDeg === expected[3] &&
      airport.runwayLength === expected[4] &&
      airport.gates === expected[5]
  );
}

console.log('Source sniff test');
const source = readFileSync(join(process.cwd(), 'src', 'scenes', 'airports.ts'), 'utf8');
check('distanceKm no longer uses Math.hypot', !source.includes('Math.hypot(a.x - b.x'));
check('HAVERSINE import present', source.includes('haversineKm'));

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
