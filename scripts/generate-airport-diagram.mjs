/**
 * Genera docs/airport-diagram.svg: un diagrama cenital del aeropuerto base,
 * con el mismo estilo que el infographic "DIAGRAMA DE UN AEROPUERTO"
 * (titulo rojo/azul, badges numerados 1/2/3, etiquetas con flecha roja).
 *
 * Las coordenadas salen de AIRPORT_LAYOUT (groundNetwork.ts) y de la
 * geometria de qualityDemo.ts, asi el diagrama refleja el escenario real.
 *
 * Uso: node scripts/generate-airport-diagram.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'docs', 'airport-diagram.svg');

/* ------------------------------- proyeccion ------------------------------ */
const S = 0.54;                       // px por metro
const X = (wx) => 410 + S * wx;       // mundo X -> pantalla
const Y = (wz) => 831 - S * wz;       // mundo Z -> pantalla (norte arriba)
const f = (n) => Math.round(n * 100) / 100;

const parts = [];
const add = (s) => parts.push(s);
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* --------------------------------- helpers ------------------------------- */
const labelW = (t) => t.length * 7.3 + 26;

function pill(cx, cy, text) {
  const w = labelW(text);
  const h = 34;
  add(
    `<rect x="${f(cx - w / 2)}" y="${f(cy - h / 2)}" width="${f(w)}" height="${h}" rx="17" fill="#eef6fd" stroke="#cfe0ee" stroke-width="1.4"/>`
  );
  add(
    `<text x="${f(cx)}" y="${f(cy + 5.2)}" text-anchor="middle" font-size="14.5" font-weight="600" fill="#24384d">${esc(text)}</text>`
  );
  return w;
}

function badge(cx, cy, num, word) {
  const w = word.length * 10 + 56;
  const h = 44;
  add(
    `<g><rect x="${f(cx - w / 2)}" y="${f(cy - h / 2)}" width="${f(w)}" height="${h}" rx="22" fill="#ffffff" stroke="#d8e2ec" stroke-width="1.6"/>` +
      `<circle cx="${f(cx - w / 2 + 24)}" cy="${f(cy)}" r="13" fill="#d94f3d"/>` +
      `<text x="${f(cx - w / 2 + 24)}" y="${f(cy + 5)}" text-anchor="middle" font-size="16" font-weight="700" fill="#ffffff">${num}</text>` +
      `<text x="${f(cx - w / 2 + 44)}" y="${f(cy + 6.5)}" font-size="18" font-weight="700" letter-spacing="0.6" fill="#22384f">${esc(word)}</text></g>`
  );
}

function arrow(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bx = x2 - ux * 10;
  const by = y2 - uy * 10;
  const px = -uy * 4.2;
  const py = ux * 4.2;
  const head = `${f(x2)},${f(y2)} ${f(bx + px)},${f(by + py)} ${f(bx - px)},${f(by - py)}`;
  add(
    `<polyline points="${f(x1)},${f(y1)} ${f(bx)},${f(by)}" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity="0.92"/>`
  );
  add(
    `<polygon points="${head}" fill="#ffffff" opacity="0.92" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"/>`
  );
  add(
    `<polyline points="${f(x1)},${f(y1)} ${f(bx)},${f(by)}" fill="none" stroke="#d94f3d" stroke-width="2.2" stroke-linecap="round"/>`
  );
  add(`<polygon points="${head}" fill="#d94f3d"/>`);
}

/** Avion cenital sencillo, morro hacia -X (hacia la terminal). */
function plane(cx, cy, s) {
  const p = (x, y) => `${f(cx + x * s)},${f(cy + y * s)}`;
  const d = [
    `M ${p(-11, 0)}`,
    `Q ${p(-9, -2.3)} ${p(-4, -2.3)}`,
    `L ${p(9, -2.3)}`,
    `Q ${p(11.6, -1.5)} ${p(11.6, 0)}`,
    `Q ${p(11.6, 1.5)} ${p(9, 2.3)}`,
    `L ${p(-4, 2.3)}`,
    `Q ${p(-9, 2.3)} ${p(-11, 0)}`,
    'Z',
    `M ${p(-1, 0)} L ${p(4, -10)} L ${p(7.5, -10)} L ${p(4.5, 0)} Z`,
    `M ${p(-1, 0)} L ${p(4, 10)} L ${p(7.5, 10)} L ${p(4.5, 0)} Z`,
    `M ${p(8, 0)} L ${p(10.5, -4.6)} L ${p(12.2, -4.6)} L ${p(11.2, 0)} Z`,
    `M ${p(8, 0)} L ${p(10.5, 4.6)} L ${p(12.2, 4.6)} L ${p(11.2, 0)} Z`
  ].join(' ');
  add(`<path d="${d}" fill="#ffffff" stroke="#39434f" stroke-width="1.1" stroke-linejoin="round"/>`);
}

/* --------------------------------- cabecera ------------------------------ */
const W = 1080;
const H = 1680;
add(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Arial, Helvetica, sans-serif">`
);
add(`<rect width="${W}" height="${H}" fill="#d8e7f5"/>`);
add(`<rect x="10" y="150" width="34" height="1400" rx="16" fill="#9ad477" opacity="0.85"/>`);
add(`<rect x="${W - 44}" y="150" width="34" height="1400" rx="16" fill="#9ad477" opacity="0.85"/>`);

add(
  `<text x="${W / 2}" y="70" text-anchor="middle" font-size="44" font-weight="800" letter-spacing="1">` +
    `<tspan fill="#d94f3d">DIAGRAMA</tspan><tspan fill="#2f6fb0"> DE UN AEROPUERTO</tspan></text>`
);
add(
  `<text x="${W / 2}" y="106" text-anchor="middle" font-size="16" font-weight="600" fill="#4c6076">` +
    `Aeropuerto base del Simulador de Vuelo 3D &#183; vista cenital (norte arriba)</text>`
);

/* -------------------------------- terreno -------------------------------- */
const siteX = X(-60);
const siteY = Y(1180);
const siteW = X(560) - X(-60);
const siteH = Y(-1260) - Y(1180);
add(
  `<rect x="${f(siteX)}" y="${f(siteY)}" width="${f(siteW)}" height="${f(siteH)}" rx="22" fill="#8fcf6d" stroke="#79bd59" stroke-width="2"/>`
);

/* ------------------------------- superficies ----------------------------- */
// Plataforma de hormigon (apron) x 90..337, z -560..765
add(
  `<rect x="${f(X(90))}" y="${f(Y(765))}" width="${f(X(337) - X(90))}" height="${f(Y(-560) - Y(765))}" fill="#c9ced4" stroke="#b4bac1" stroke-width="1.4"/>`
);
// Rampa de carga 240 x 300 en (210, 640)
add(
  `<rect x="${f(X(90))}" y="${f(Y(790))}" width="${f(X(330) - X(90))}" height="${f(Y(490) - Y(790))}" fill="#bcc2c9"/>`
);
// Via de servicio Sierra (x = 160)
add(
  `<rect x="${f(X(156))}" y="${f(Y(860))}" width="${f(X(164) - X(156))}" height="${f(Y(-540) - Y(860))}" fill="#7a8087"/>`
);
// Carretera de acceso (x = 360)
add(
  `<rect x="${f(X(351))}" y="${f(Y(780))}" width="${f(X(369) - X(351))}" height="${f(Y(-320) - Y(780))}" fill="#6d737a"/>`
);
// Estacionamiento (460, 120) 160 x 300
add(
  `<rect x="${f(X(380))}" y="${f(Y(270))}" width="${f(X(540) - X(380))}" height="${f(Y(-30) - Y(270))}" fill="#74797f" stroke="#666b71" stroke-width="1.2"/>`
);
add(`<g stroke="#ffffff" stroke-width="0.8" opacity="0.55">`);
for (let col = 0; col < 13; col++) {
  const x = X(388 + col * 11.5);
  add(`<line x1="${f(x)}" y1="${f(Y(-12))}" x2="${f(x)}" y2="${f(Y(241.5))}"/>`);
}
for (let row = 0; row < 14; row++) {
  const z = -12 + row * 19.5;
  add(`<line x1="${f(X(388))}" y1="${f(Y(z))}" x2="${f(X(526))}" y2="${f(Y(z))}"/>`);
}
add(`</g>`);

/* --------------------------- asfalto: pista y taxiways ------------------- */
const asphalt = '#565c64';
const runwayFill = '#4b5158';

// Pista 36L/18R: x = 0, z = -1150..1150 (46 m de ancho)
add(
  `<rect x="${f(X(-23))}" y="${f(Y(1150))}" width="${f(X(23) - X(-23))}" height="${f(Y(-1150) - Y(1150))}" fill="${runwayFill}"/>`
);

// Taxiway Alpha: x = 72, ancho 36 m, z = -1100..1100
add(
  `<rect x="${f(X(54))}" y="${f(Y(1100))}" width="${f(X(90) - X(54))}" height="${f(Y(-1100) - Y(1100))}" fill="${asphalt}"/>`
);

// 4 salidas de alta velocidad: 52 m laterales, 130 m de recorrido, 34 m de ancho
const exitDirLen = Math.hypot(52, 130);
const nx = 130 / exitDirLen;
const nz = 52 / exitDirLen;
for (const z of [-600, -300, 300, 600]) {
  const p = (wx, wz) => `${f(X(wx))},${f(Y(wz))}`;
  const pts = [
    p(20 + 17 * nx, z + 17 * nz),
    p(72 + 17 * nx, z - 130 + 17 * nz),
    p(72 - 17 * nx, z - 130 - 17 * nz),
    p(20 - 17 * nx, z - 17 * nz)
  ].join(' ');
  add(`<polygon points="${pts}" fill="${asphalt}"/>`);
}

// Calles transversales Alpha -> Bravo: 80 x 34 m en x = 85
for (const z of [-500, -300, 100, 600]) {
  add(
    `<rect x="${f(X(45))}" y="${f(Y(z) - 17 * S)}" width="${f(X(125) - X(45))}" height="${f(34 * S)}" fill="${asphalt}"/>`
  );
}

/* -------------------------------- pintura -------------------------------- */
const yellow = '#f2c744';
const white = '#f5f7f8';

// Eje de la pista (blanco discontinuo)
add(
  `<line x1="410" y1="${f(Y(1120))}" x2="410" y2="${f(Y(-1120))}" stroke="${white}" stroke-width="2.4" stroke-dasharray="16 16"/>`
);
// Eje de Alpha
add(
  `<line x1="${f(X(72))}" y1="${f(Y(1080))}" x2="${f(X(72))}" y2="${f(Y(-1080))}" stroke="${white}" stroke-width="2" stroke-dasharray="13 15"/>`
);
// Eje de Bravo (amarillo, sobre la plataforma)
add(
  `<line x1="${f(X(95))}" y1="${f(Y(780))}" x2="${f(X(95))}" y2="${f(Y(-560))}" stroke="${yellow}" stroke-width="1.8" stroke-dasharray="9 11"/>`
);
// Eje de las calles transversales
for (const z of [-500, -300, 100, 600]) {
  add(
    `<line x1="${f(X(47))}" y1="${f(Y(z))}" x2="${f(X(123))}" y2="${f(Y(z))}" stroke="${yellow}" stroke-width="1.6" stroke-dasharray="5 6"/>`
  );
}
// Eje de las 4 salidas (sigue la diagonal)
for (const z of [-600, -300, 300, 600]) {
  const a = [20 + 52 * 0.08, z - 130 * 0.08];
  const b = [20 + 52 * 0.94, z - 130 * 0.94];
  add(
    `<line x1="${f(X(a[0]))}" y1="${f(Y(a[1]))}" x2="${f(X(b[0]))}" y2="${f(Y(b[1]))}" stroke="${yellow}" stroke-width="1.8" stroke-dasharray="7 8"/>`
  );
  // Barras hold-short (doble barra) + luz roja de espera
  for (const t of [0.18, 0.28]) {
    const cxw = 20 + 52 * t;
    const czw = z - 130 * t;
    for (const off of [0, 2.4]) {
      const x1 = cxw - 16 * nx + off * nx;
      const z1 = czw - 16 * nz + off * nz;
      const x2 = cxw + 16 * nx + off * nx;
      const z2 = czw + 16 * nz + off * nz;
      add(
        `<line x1="${f(X(x1))}" y1="${f(Y(z1))}" x2="${f(X(x2))}" y2="${f(Y(z2))}" stroke="${yellow}" stroke-width="2.4"/>`
      );
    }
    add(
      `<circle cx="${f(X(cxw))}" cy="${f(Y(czw))}" r="2.2" fill="#ff4d4d" stroke="#ffffff" stroke-width="0.8"/>`
    );
  }
}

// Umbral norte (piano keys) y sur
for (const end of [1150, -1150]) {
  const yTop = end > 0 ? Y(end) : Y(end) - 32.4;
  for (let i = 0; i < 8; i++) {
    const wx = -19 + i * 5.15;
    add(
      `<rect x="${f(X(wx))}" y="${f(yTop)}" width="3" height="32.4" fill="${white}"/>`
    );
  }
}
// Zona de tacto (touchdown zone): dos barras por umbral
for (const end of [850, -850]) {
  const yTop = end > 0 ? Y(end) : Y(end) - 32.4;
  for (const [a, b] of [[-16, -6], [6, 16]]) {
    add(
      `<rect x="${f(X(a))}" y="${f(yTop)}" width="${f(X(b) - X(a))}" height="32.4" fill="${white}"/>`
    );
  }
}

// Designadores de pista pintados sobre el eje
add(
  `<text x="410" y="${f(Y(1075))}" transform="rotate(-90 410 ${f(Y(1075))})" text-anchor="middle" font-size="16" font-weight="800" fill="${white}" letter-spacing="1">18R</text>`
);
add(
  `<text x="410" y="${f(Y(-1075))}" transform="rotate(-90 410 ${f(Y(-1075))})" text-anchor="middle" font-size="16" font-weight="800" fill="${white}" letter-spacing="1">36L</text>`
);

// Lineas de guia desde Bravo hasta cada posicion (13 posiciones)
const standZ = [
  -500, -420, -180, -100, -20, 60, 150, 240, 330, 420, 560, 640, 720
];
for (const z of standZ) {
  add(
    `<line x1="${f(X(95))}" y1="${f(Y(z))}" x2="${f(X(130))}" y2="${f(Y(z))}" stroke="${yellow}" stroke-width="1.7"/>`
  );
}

/* --------------------------------- luces --------------------------------- */
// Luces de borde de pista (ambar)
add(`<g fill="#ffd27a">`);
for (let y = Y(1150); y <= Y(-1150); y += 32.4) {
  add(`<circle cx="${f(X(-23))}" cy="${f(y)}" r="1.5"/>`);
  add(`<circle cx="${f(X(23))}" cy="${f(y)}" r="1.5"/>`);
}
add(`</g>`);
// Luces de borde de Alpha (azules)
add(`<g fill="#4a90e2">`);
for (let y = Y(1100); y <= Y(-1100); y += 54) {
  add(`<circle cx="${f(X(55))}" cy="${f(y)}" r="1.3"/>`);
  add(`<circle cx="${f(X(89))}" cy="${f(y)}" r="1.3"/>`);
}
add(`</g>`);

/* ------------------------------- edificios ------------------------------- */
// Terminal: 80 x 640 en (215, 115), con sobresalida de cubierta
add(
  `<rect x="${f(X(168))}" y="${f(Y(443))}" width="${f(X(262) - X(168))}" height="${f(Y(-213) - Y(443))}" rx="3" fill="#b7c0c9"/>`
);
add(
  `<rect x="${f(X(175))}" y="${f(Y(435))}" width="${f(X(255) - X(175))}" height="${f(Y(-205) - Y(435))}" fill="#eef1f5" stroke="#c3cad1" stroke-width="1.2"/>`
);
for (const dz of [-150, -60, 30, 120, 210, 300]) {
  add(
    `<rect x="${f(X(255) - 3)}" y="${f(Y(dz + 30))}" width="3" height="${f(60 * S)}" fill="#9fb4c6" opacity="0.9"/>`
  );
}

// Pasarelas de embarque (jetways) hasta las posiciones 1-8
for (const z of [-180, -100, -20, 60, 150, 240, 330, 420]) {
  add(
    `<rect x="${f(X(132))}" y="${f(Y(z) - 3)}" width="${f(X(173) - X(132))}" height="6" rx="2.5" fill="#9aa4ad" stroke="#7f8a93" stroke-width="0.9"/>`
  );
  add(
    `<rect x="${f(X(167))}" y="${f(Y(z) - 3.8)}" width="${f(7 * S)}" height="7.6" rx="1.5" fill="#87919a"/>`
  );
}

// Torre de control en (268, 52)
add(
  `<circle cx="${f(X(268))}" cy="${f(Y(52))}" r="10" fill="#e3e8ee" stroke="#b9c2ca" stroke-width="1.4"/>`
);
add(`<circle cx="${f(X(268))}" cy="${f(Y(52))}" r="5.5" fill="#1f4a63"/>`);

// Hangares de mantenimiento (3) en x = 330
for (const z0 of [-200, -110, -20]) {
  add(
    `<rect x="${f(X(282.5))}" y="${f(Y(z0 + 35))}" width="${f(X(377.5) - X(282.5))}" height="${f(70 * S)}" fill="#a8b2ba" stroke="#929ca4" stroke-width="1.2"/>`
  );
  add(
    `<rect x="${f(X(282.5))}" y="${f(Y(z0 + 25))}" width="2.4" height="${f(50 * S)}" fill="#3a4148"/>`
  );
}

// Hangares de carga (3) en x = 300, z = 560/640/720
for (const z of [560, 640, 720]) {
  add(
    `<rect x="${f(X(258))}" y="${f(Y(z + 31))}" width="${f(X(342) - X(258))}" height="${f(62 * S)}" fill="#9aa4ad" stroke="#868f98" stroke-width="1.2"/>`
  );
  add(
    `<rect x="${f(X(258))}" y="${f(Y(z + 20))}" width="2.4" height="${f(40 * S)}" fill="#3a4148"/>`
  );
}

// Deposito de combustible: muro de contencion + dos tanques en (190, 850)
add(
  `<rect x="${f(X(167))}" y="${f(Y(862))}" width="${f(X(213) - X(167))}" height="${f(24 * S)}" rx="2" fill="#8c9299"/>`
);
for (const tx of [176, 204]) {
  add(
    `<circle cx="${f(X(tx))}" cy="${f(Y(850))}" r="4.2" fill="#d9dee4" stroke="#a9b2ba" stroke-width="1.1"/>`
  );
}

// Deposito de equipajes / catering en (186, -232)
add(
  `<rect x="${f(X(171))}" y="${f(Y(-219))}" width="${f(X(201) - X(171))}" height="${f(26 * S)}" fill="#a9b1b8" stroke="#939ba2" stroke-width="1.1"/>`
);

/* ------------------------------- aeronaves ------------------------------- */
// Posiciones de pasajeros 1-8 (1 y 4 admiten ancho)
const gateZ = [-180, -100, -20, 60, 150, 240, 330, 420];
gateZ.forEach((z, i) => {
  const id = i + 1;
  plane(X(130), Y(z), id === 1 || id === 4 ? 1.3 : 1);
});
// Posiciones remotas 12-13
plane(X(130), Y(-500), 1);
plane(X(130), Y(-420), 1);
// Rampa de carga 9-11
for (const z of [560, 640, 720]) plane(X(130), Y(z), 1.05);

/* --------------------------- roseta de los vientos ----------------------- */
add(
  `<g><circle cx="672" cy="262" r="19" fill="#ffffff" stroke="#cfe0ee" stroke-width="1.6"/>` +
    `<polygon points="672,246 666.5,259 677.5,259" fill="#d94f3d"/>` +
    `<text x="672" y="274" text-anchor="middle" font-size="12.5" font-weight="700" fill="#24384d">N</text></g>`
);

/* -------------------------------- etiquetas ------------------------------ */
const RIGHT_EDGE = 345;   // las etiquetas de la izquierda terminan aqui
const LEFT_EDGE = 730;    // las de la derecha empiezan aqui

function labelLeft(cy, text, tx, ty) {
  const w = labelW(text);
  const cx = RIGHT_EDGE - w / 2;
  pill(cx, cy, text);
  arrow(RIGHT_EDGE + 5, cy, tx, ty);
}

function labelRight(cy, text, tx, ty) {
  const w = labelW(text);
  const cx = LEFT_EDGE + w / 2;
  pill(cx, cy, text);
  arrow(LEFT_EDGE - 5, cy, tx, ty);
}

// Columna izquierda
labelLeft(240, 'Umbral (Threshold)', 395, 242);
labelLeft(300, 'Diseñador de pista · 36L/18R', 406, 268);
labelLeft(360, 'Zona de tacto (Touchdown Zone)', 395, 388);
labelLeft(520, 'Calle de rodaje Alpha · 36 m', 440, 520);
labelLeft(580, 'Salidas de alta velocidad · 22°', 432, 542);
labelLeft(700, 'Posiciones de estacionamiento (1-8)', 477, 700);
labelLeft(1186, 'Posición de espera (Holding)', 430, 1186);
labelLeft(1440, 'Umbral · 36L', 395, 1440);

// Columna derecha
labelRight(250, 'Depósito de combustible', 527, 372);
labelRight(470, 'Rampa y hangares de carga', 597, 500);
labelRight(540, 'Estacionamiento y acceso', 704, 660);
labelRight(660, 'Torre de control (ATC)', 560, 800);
labelRight(780, 'Terminal + pasarelas', 550, 870);
labelRight(900, 'Hangares / mantenimiento', 617, 940);
labelRight(1010, 'Posiciones remotas (12-13)', 497, 1085);
labelRight(1120, 'Vía de servicio Sierra', 499, 1120);

// Secciones numeradas (badges)
badge(150, 449, '3', 'RUNWAY');
badge(530, 999, '2', 'APRON');
badge(537, 1186, '1', 'TERMINAL');

/* --------------------------------- footer -------------------------------- */
add(`<line x1="60" y1="1556" x2="${W - 60}" y2="1556" stroke="#b9c9d9" stroke-width="1.5"/>`);
add(
  `<text x="${W / 2}" y="1594" text-anchor="middle" font-size="16" font-weight="700" fill="#33506b">` +
    `Simulador de Vuelo 3D &#183; aeropuerto base (pista 36L/18R, calles Alpha y Bravo)</text>`
);
add(
  `<text x="${W / 2}" y="1626" text-anchor="middle" font-size="13.5" fill="#5b7085">` +
    `Geometria real: groundNetwork.ts + qualityDemo.ts &#183; modelo de aeronave A320 (GLB) con atribucion CC BY 4.0</text>`
);
add(`</svg>`);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, parts.join('\n'), 'utf8');
console.log(`OK -> ${OUT}`);
