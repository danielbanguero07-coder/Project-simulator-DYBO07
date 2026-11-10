# Performance Budget & SLIs/SLOs

> **Objetivo de Ingeniería**: Garantizar **60 fps estables** en dispositivos móviles mid-range (Android 8+ / iOS 14+), **TTI < 3.0s**, **Consumo de Memoria < 150 MB** y un **Bundle JS inicial < 170 KB gzipped** (~500 KB uncompressed).
>
> **Premisa**: *"Performance is a feature, not a bug fix."* Metodología: **Measure → Optimize → Verify → Automate**.

---

## 1. Dispositivos de Referencia (Tiering Hardware)

Para evitar sesgos de máquinas de desarrollo de alta gama, toda medición y validación en staging/QA se referencia a los siguientes perfiles:

| Tier | Dispositivo de Referencia | Especificaciones Hardware | Target FPS | Target TTI | Memory Cap |
|---|---|---|---|---|---|
| **Tier 1 (Target Core)** | Moto G (Gen 7/8), Samsung Galaxy A22, Redmi Note 8 | Quad/Octa Cortex-A53 @ 1.8GHz, 3GB RAM, Adreno 506/Mali-G52, Android 8+ | **60 fps** (min 55 en peaks) | **< 3.0s** | **< 150 MB** |
| **Tier 2 (iOS Baseline)** | iPhone 8 / iPhone SE (2020) | A11/A13 Bionic, 2GB/3GB RAM, iOS 14+ / WebKit Mobile | **60 fps** estables | **< 2.5s** | **< 150 MB** |
| **Tier 3 (Desktop)** | Chrome / Edge / Firefox / Safari (Core i3, 8GB RAM, iGPU) | 60Hz / 120Hz display | **60 / 120 fps** | **< 1.8s** | **< 250 MB** |

---

## 2. Matriz de Performance Budget por Entorno

Los umbrales en **CI (Staging)** bloquean el merge (Pull Request) si se produce una regresión mayor al **5%** contra la rama base (`main`).

| Categoría | Métrica | Target (Prod) | Límite CI (Staging Gate) | Alerta Dev (Soft) | Herramienta de Medición | Responsable |
|---|---|---|---|---|---|---|
| **Runtime (Game Loop)** | **Frame Rate (Promedio)** | **60 fps** | ≥ 58 fps | < 60 fps | Chrome DevTools / `perf_hooks` / Stats.js | Optimization Engineer + GameDev |
| | **Frame Time (1% Low)** | **≤ 16.6 ms** | ≤ 18.0 ms (max 1 dropped frame/seg) | > 16.6 ms | DevTools Performance Flamechart | GameDev + Opt Engineer |
| | **Jank Frames (>20ms)** | **0%** en idle, **< 1%** en acción masiva | ≤ 2% frames | > 1% | Automated Playwright Trace | GameDev |
| | **Draw Calls por Frame** | **≤ 35** | ≤ 45 | > 35 | PixiJS Renderer Stats / WebGL Inspector | Optimization Engineer |
| | **Max Active Sprites (Main)** | **≤ 500** en Container estándar / **≥ 10,000** en `ParticleContainer` | N/A | > 500 en standard | PixiJS Inspector | GameDev |
| **Memoria** | **JS Heap (Average)** | **< 100 MB** | ≤ 120 MB | > 100 MB | Chrome Memory Snapshot / `performance.memory` | Optimization Engineer |
| | **JS Heap Peak (Stress)** | **< 150 MB** | ≤ 140 MB | > 130 MB | 30-min Playwright Soak Test | QA + Optimization Engineer |
| | **Memory Leak Rate** | **0 KB/min** tras 10 min de gameplay | < 50 KB/min (GC delta) | > 0 KB delta | Heap Diff Automations | Optimization Engineer |
| | **VRAM Texturas Activas** | **< 75 MB** | ≤ 90 MB | > 75 MB | WebGL Memory Extension / Pixi Texture GC | Optimization Engineer |
| **Network & Bundles** | **Bundle JS Inicial (Gzip)** | **< 170 KB** | ≤ 175 KB (**Hard Fail**) | > 160 KB | `analyze-bundle.ts` / Bundlewatch | Optimization Engineer + Frontend |
| | **Bundle JS Inicial (Brotli)** | **< 145 KB** | ≤ 150 KB | > 140 KB | `analyze-bundle.ts` | DevOps + Opt Engineer |
| | **Initial CSS (Gzip)** | **< 20 KB** | ≤ 25 KB | > 20 KB | Bundle Analyzer | Frontend Lead |
| | **Atlas Inicial (KTX2/WebP)** | **< 450 KB** | ≤ 500 KB | > 450 KB | `analyze-assets.ts` | Game Designer + Opt Engineer |
| | **Total Initial Download** | **< 850 KB** (código + assets L0) | ≤ 1.0 MB | > 850 KB | Lighthouse / Network Panel | Optimization Engineer |
| **Core Web Vitals** | **LCP (Largest Contentful Paint)** | **< 1.8s** (Mobile 4G) | ≤ 2.2s | > 2.0s | Lighthouse CI / RUM (`web-vitals`) | Frontend Lead |
| | **TTI (Time to Interactive)** | **< 3.0s** (Mobile 4G) | ≤ 3.2s | > 3.0s | Lighthouse CI | Optimization Engineer |
| | **TBT (Total Blocking Time)** | **< 150 ms** | ≤ 200 ms | > 150 ms | Lighthouse CI | Optimization Engineer |
| | **INP (Interaction to Next Paint)**| **< 100 ms** (Canvas input) | ≤ 150 ms | > 100 ms | RUM + Playwright synthetic | GameDev + Frontend |
| | **CLS (Cumulative Layout Shift)**| **0.00** (Canvas con tamaño fijo) | 0.00 | > 0.01 | Lighthouse CI | Frontend Lead |

---

## 3. SLA y Políticas de Aceptación (Gates de CI/CD)

### 3.1. Regla de Oro: Bloqueo de PR (Hard Gate)
Ningún Pull Request podrá integrarse a `main` o `staging` si:
1. Incrementa el bundle JS inicial más de **3 KB gzipped** sin justificación previa y firma del Optimization Engineer.
2. Supera el hard limit de **170 KB gzipped inicial**.
3. El test de stress sintético de Playwright reporta un FPS promedio **< 55 fps** o picos de garbage collection > **35 ms**.
4. La puntuación Lighthouse Performance en emulación mobile (Moto G4) es **< 90/100**.

### 3.2. Proceso de Excepción Técnica
Si una feature crítica (e.g. sistema masivo de trade o render isometric) requiere superar temporalmente un budget:
- Solicitar RFC de Rendimiento al Optimization Engineer.
- Demostrar mitigación paralela (e.g., lazy loading, offloading a Worker, streaming de assets).
- Aprobación requerida: **Optimization Engineer** + **Tech Lead Frontend**.

---

## 4. Matriz de Responsabilidades (RACI)

| Métrica / Área | Optimization Engineer | Tech Lead Frontend / GameDev | DevOps | QA Lead | Product Owner |
|---|---|---|---|---|---|
| **Definición de Budgets** | **Accountable (A)** | Consulted (C) | Consulted (C) | Consulted (C) | Informed (I) |
| **FPS / Render Loop** | Accountable (A) | Responsible (R) | Informed (I) | Responsible (R) | Informed (I) |
| **Bundle Splitting / Tree-shaking** | Responsible (R) | Responsible (R) | Consulted (C) | Informed (I) | Informed (I) |
| **Web Workers Offloading** | Accountable (A) | Responsible (R) | Informed (I) | Consulted (C) | Informed (I) |
| **Assets Pipeline (KTX2/Draco)** | Responsible (R) | Consulted (C) | Responsible (R) | Informed (I) | Consulted (C) |
| **CDN / HTTP3 / Caching** | Consulted (C) | Informed (I) | Responsible (R) | Informed (I) | Informed (I) |
| **Lighthouse CI & Regresiones** | Responsible (R) | Informed (I) | Responsible (R) | Consulted (C) | Informed (I) |
| **Pruebas de Fuga de Memoria (Soak)**| Accountable (A) | Consulted (C) | Informed (I) | Responsible (R) | Informed (I) |

---

## 5. Estrategia de Monitoreo Continuo

1. **Local (Dev loop)**:
   - Panel de estadísticas en esquina (`stats.js` o custom overlay con FPS, Draw Calls, Texturas y Heap).
   - Hook de Pre-commit (`npm run test:perf-budget`) que corre `analyze-bundle.ts`.
2. **Pull Request (CI)**:
   - Lighthouse CI ejecuta 3 iteraciones en emulador mobile.
   - Playwright ejecuta escenario de 1,000 entidades recolectando métricas CDPSession (Chromium Tracing).
   - Reporte automático con diff de bundle size en el comentario del PR.
3. **Producción (RUM - Real User Monitoring)**:
   - Telemetría ligera vía `navigator.sendBeacon` muestreando el 5% de usuarios:
     - Percentiles p50, p90, p99 de FPS.
     - LCP, INP, CLS via librería oficial `web-vitals`.
     - Frecuencia de crashes por Out-Of-Memory (capturado por beforeunload / heartbeats).
