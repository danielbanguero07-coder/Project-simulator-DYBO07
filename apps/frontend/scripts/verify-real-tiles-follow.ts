/**
 * Headless checks for the real-world tile follow (image-94: textures stop
 * loading when the player flies away from MEX).
 *
 * Run from apps/frontend with:  npx -y tsx scripts/verify-real-tiles-follow.ts
 *
 * The streaming itself needs Cesium ion + a browser, so this script checks
 * the parts that can run headless: the recenter decision, the local <->
 * geodetic round-trip the follow uses, and — with the real SphereRegion
 * class from 3d-tiles-renderer — that moving `region.sphere.center` is
 * picked up live by the plugin's tile check (no tileset rebuild needed).
 * The visual test on Dani's PC is the final proof: fly 10+ km from MEX and
 * watch the ground refine under the aircraft.
 */

import { TilesRenderer } from '3d-tiles-renderer';
import { SphereRegion } from '3d-tiles-renderer/plugins';
import * as THREE from 'three';
import { shouldRecenterRegion } from '../src/scenes/realWorldTiles';
import { geoToLocal, localToGeo } from '../src/scenes/geo';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const approx = (a: number, b: number, tol = 0.01): boolean => Math.abs(a - b) <= tol;
const HOME_ORIGIN = { lat: 19.435822, lon: -99.07033 };

// ---- Recenter decision ---------------------------------------------------------
check('spawn (-1751, 702) does not recenter (1886 m < 2000 m)', !shouldRecenterRegion(0, 0, -1751, 702));
check(
  "Dani's screenshot position (-9285, -5150) recenters",
  shouldRecenterRegion(0, 0, -9285, -5150)
);
check('exactly 2000 m recenters', shouldRecenterRegion(0, 0, 2000, 0));
check('1999 m does not recenter', !shouldRecenterRegion(0, 0, 1999, 0));
check(
  'no recenter right after recentering to the same spot',
  !shouldRecenterRegion(-9285, -5150, -9285, -5150)
);
check(
  'recenters again 2 km further out',
  shouldRecenterRegion(-9285, -5150, -11285, -5150)
);

// ---- Coordinate round-trip the follow uses --------------------------------------
const geo = localToGeo(-9285, -5150, HOME_ORIGIN, 1);
const back = geoToLocal(geo.lat, geo.lon, HOME_ORIGIN, 1);
check(
  'local -> geo -> local round-trips the follow position',
  approx(back.x, -9285, 1) && approx(back.z, -5150, 1),
  `(${back.x.toFixed(1)}, ${back.z.toFixed(1)})`
);

// ---- SphereRegion reads the sphere live ------------------------------------------
const region = new SphereRegion({
  sphere: new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10_000),
  mask: true,
  errorTarget: 25
});
// Stub bounding volume: reports the sphere centre it was checked against.
const stubVolume = {
  intersectsSphere: (sphere: THREE.Sphere): number => sphere.center.x
};
const before = region.intersectsTile(stubVolume as never) as unknown as number;
region.sphere.center.set(100, 0, 0);
const after = region.intersectsTile(stubVolume as never) as unknown as number;
check('SphereRegion reads the moved sphere centre', before === 0 && after === 100, `${before} -> ${after}`);

// ---- ECEF distance of the follow centre -------------------------------------------
const tiles = new TilesRenderer();
const mexEcef = new THREE.Vector3();
tiles.ellipsoid.getCartographicToPosition(
  THREE.MathUtils.degToRad(HOME_ORIGIN.lat),
  THREE.MathUtils.degToRad(HOME_ORIGIN.lon),
  2230,
  mexEcef
);
const followEcef = new THREE.Vector3();
tiles.ellipsoid.getCartographicToPosition(
  THREE.MathUtils.degToRad(geo.lat),
  THREE.MathUtils.degToRad(geo.lon),
  2230,
  followEcef
);
const ecefDistance = mexEcef.distanceTo(followEcef);
const flatDistance = Math.hypot(-9285, -5150);
check(
  'follow centre is ~10.6 km from MEX in ECEF',
  approx(ecefDistance, flatDistance, 100),
  `${ecefDistance.toFixed(0)} m vs ${flatDistance.toFixed(0)} m flat`
);
tiles.dispose();

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
