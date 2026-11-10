# GDD — Simulador de Piloto de Aviación Comercial (Web)

> Versión: 1.0 · Fecha: 2026-11-06 · Estado: documento de diseño y viabilidad
> Etiquetas: **[MVP]** = primera versión publicable · **[POST]** = post-lanzamiento

---

## 1. RESUMEN EJECUTIVO

**Qué es.** Un simulador de vuelo comercial jugable en navegador, con realismo accesible: el jugador vive el ciclo completo *gate-to-gate* (pushback → taxi → despegue → crucero → aproximación → aterrizaje → gate), opera una aerolínea y habla con la torre. No es un estudio de simulador hardcore: es un juego de aviación con física creíble, consecuencias económicas y un aeropuerto vivo.

**Propuesta de valor.**
- **Acceso inmediato:** sin instalación, WebGL2, desktop prioritario.
- **Operación completa:** no solo volar; gestionar la aerolínea y la reputación.
- **ATC como mecánica central:** voz + opciones, no un adorno.
- **Consecuencia:** cada aterrizaje duro, retraso o error de radio afecta dinero y reputación.

**Modelo recomendado: Free-to-play híbrido (F2P + premium cosmético/suscripción).**
- Base gratis con tutorial, Cessna 172 y 1 ruta: máxima adopción en web.
- Aviones y rutas desbloqueables con moneda del juego **o** compra directa (sin pay-to-win).
- "Captain's Pass" ($4.99/mes): rutas extra, liveries, +25% XP. Cancelable.
- Pack "Full Fleet" ($29.99) para quien no quiere grind.
- **Nunca** vender seguridad, reputación ni ventajas de vuelo: rompe el pilar de consecuencia.

**Viabilidad técnica.** Alta, con condiciones:
- Three.js + WebGL2 maneja un avión detallado, un aeropuerto blockout y tráfico IA en desktop medio a 60 FPS.
- El reconocimiento de voz en navegador **solo es fiable en Chrome/Edge** (Web Speech API). El modo sin micrófono es obligatorio, no un extra.
- El coste real no es el render: es **contenido 3D** (aviones, aeropuertos, cabinas) y **diseño de economía**.

**Alcance realista.**
- Vertical slice (1 vuelo completo, 1 avión, 1 aeropuerto): **10–12 semanas**, 3–4 personas.
- MVP publicable: **8–9 meses**, 6–7 personas.
- Producto completo (12 aviones, 6 aeropuertos, voz, daños, multijugador ATC): **20–24 meses**, 10–12 personas.

**Riesgo #1:** scope creep. El documento marca explícitamente qué NO entra en el MVP.

**KPIs objetivo:** D1 35–40 %, D7 15–18 %, D30 6–8 %; sesión media 25–40 min; 70 % de aterrizajes exitosos tras el tutorial; 60 FPS p95 en desktop medio.

---

## 2. PILARES + LOOP DE JUEGO

### 2.1 Los 5 pilares (no negociables)

| # | Pilar | Qué significa en concreto | Cómo se mide |
|---|-------|---------------------------|--------------|
| 1 | **Vuelo creíble** | Sensación de peso, inercia, respuesta de motores y superficies. Física simplificada, no aproximada a ojo. | Test de pilotos: "se siente como un avión" ≥ 4/5 |
| 2 | **Operación completa** | Del gate al gate. Cada fase tiene reglas, feedback y consecuencias. | % de vuelos que completan las 7 fases |
| 3 | **Aeropuerto vivo** | Tráfico IA, rampa, pasajeros, clima, hora del día. | Densidad de agentes y FPS estables |
| 4 | **Economía consecuente** | Ingresos, costes, mantenimiento, daños y reputación conectados. | Margen por vuelo dentro de banda objetivo |
| 5 | **Comunicación con torre** | Voz + opciones como mecánica central. | % de acciones ATC resueltas correctamente |

### 2.2 Core loop — un vuelo (15–90 min según ruta)

```
PREFLIGHT            DEPARTURE              CRUISE               ARRIVAL              POST-FLIGHT
─────────            ─────────              ──────               ───────              ───────────
Elegir ruta    →     Pushback          →    Ascenso      →       Descenso      →      Aterrizaje
Elegir avión         Taxi                  Crucero              Aproximación         Rodaje a gate
Cargar pax           Despegue              Gestión fuel         ATC vectores         Debrief
Fuel/balance         ATC torre             Clima/viento         Go-around            Cobro + gastos
                                                                                     Reputación
```

**Momento a momento:** volar, mirar instrumentos, responder a la torre, gestionar energía y combustible.
**Cada 3–10 min:** un evento (cambio de altitud, tráfico, clima, instrucción ATC).
**Al final del vuelo:** debrief con puntuación (seguridad, puntualidad, suavidad, eficiencia) → dinero + reputación + XP.

### 2.3 Meta-loop — carrera

```
Vuelo → Dinero + Reputación + XP
   ↓
Desbloquear aviones / rutas / bases
   ↓
Contratos mejores (más pax, más margen, más riesgo)
   ↓
De piloto privado → FO → capitán → dueño de aerolínea
   ↓
Flota y red de rutas propias → gestión (leasing, mantenimiento, tripulación)
   ↓
Eventos de mercado y crisis → decisiones estratégicas
```

### 2.4 Progresión de carrera

| Tier | Reputación | Desbloquea | Rol |
|------|-----------|------------|-----|
| 0 | 0 | C172, LECU, tutorial | Alumno |
| 1 | 100 | DA40, rutas regionales | Piloto privado |
| 2 | 250 | King Air, ATR 72 | Piloto comercial |
| 3 | 450 | E175, Q400, A220 | Primer oficial |
| 4 | 650 | A320neo, 737-8 | Capitán |
| 5 | 850 | A330-900, 787-9, 777-300ER | Dueño de aerolínea |

La reputación sube por puntualidad, seguridad y satisfacción; baja por incidentes, incursiones y go-arounds evitables.

---

## 3. GDD POR SISTEMAS

> Cada sistema incluye: mecánica, entradas, reglas, feedback y efecto en economía/progresión.

### A) SISTEMA DE VUELO **[MVP]**

**Mecánica.** Modelo de cuerpo rígido 6DOF simplificado, ejecutado a **120 Hz fijo en un Web Worker**; el render interpola a 60 Hz. Fuerzas:

- Sustentación: `L = 0.5 · ρ · V² · S · CL`, con `CL = CL0 + CLα·α` y curva de pérdida a `α > 15°`.
- Resistencia: `D = 0.5 · ρ · V² · S · (CD0 + k·CL²)`.
- Empuje: `T = Tmax · N1`, con retardo de spool `τ = 2.5 s` y consumo `FF = SFC · T`.
- Peso: `m = m_seco + fuel + carga` (disminuye al quemar combustible).

**Entradas.**
- Teclado: flechas/WASD (pitch/roll), Q/E (rudder), Shift/Ctrl (throttle), G (gear), F (flaps), B (brakes).
- Ratón: joystick virtual opcional.
- Gamepad: ejes estándar (Xbox/PS).
- Táctil: joystick + sliders (solo en tablet; móvil en fase posterior).

**Reglas.**
- Velocidades de referencia por avión (V1, VR, V2, Vapp, Vref) visibles en el HUD.
- Stall, sobre-G (> 2.5 g), overspeed y flame-out tienen consecuencias.
- Viento, turbulencia y cizalladura afectan sustentación y rumbo.

**Asistencias (3 perfiles).**
| Perfil | Auto-trim | Auto-throttle | Protecciones | Público |
|--------|-----------|---------------|--------------|---------|
| Arcade | Sí | Sí | Stall/overspeed automáticos | Casual |
| Realista | Opcional | Opcional | Avisos, sin corrección | **Default** |
| Sim | No | No | Ninguna | Veteranos |

**Feedback.** HUD (cinta de velocidad, altitud, actitud, N1, fuel), audio de motores y viento, vibración de turbulencia, avisos ("STALL", "OVERSPEED", "PULL UP").

**Economía/progresión.** Un vuelo suave y eficiente da bonus de puntualidad y menores daños; volar agresivo desgasta motor y tren.

---

### B) AERONAVES (CATÁLOGO) **[MVP: 2 aviones]**

**Mecánica.** Cada avión tiene stats, coste de adquisición, mantenimiento y dificultad. Se compra, se alquila o se hace leasing.

**Reglas de adquisición.**
- **Compra:** pago único, propiedad, valor residual.
- **Alquiler:** pago por vuelo (1.5 % del valor), sin mantenimiento mayor.
- **Leasing:** 0.7 %/mes del valor + depósito 3 meses; devolución con penalización por daños.
- **Desbloqueo:** por reputación (tier) y dinero.

**Feedback.** Ficha con stats, compara con flota actual, simulación de ruta (coste/beneficio estimado).

**Economía.** El avión correcto para la ruta correcta: un wide-body en ruta corta pierde dinero; un regional en ruta larga no llega.

---

### C) CARGA DE PASAJEROS Y CARGA **[MVP básico]**

**Mecánica.** Boarding con tiempo real según capacidad y puertas disponibles.

**Reglas.**
- Tiempo base: `30 s + 0.9 s × pax` (A320: ~3 min con 1 jetway; ~5 min con bus).
- Equipaje: 20 kg/pax de media; exceso genera recargo.
- Catering: 1 camión por 80 pax, 4 min.
- Carga comercial: opcional, 1 ULD = 1,500 kg, ingresos extra.
- Eventos: pasajero conflictivo (+3 min), sobrepeso (+2 min), maleta perdida (−reputación).

**Feedback.** Barra de boarding, pasajeros animados en la terminal, camiones de equipaje, aviso si se retrasa la salida.

**Economía.** Cada minuto de retraso cuesta `$40 + $0.5/pax` y reduce puntualidad. La carga compensa rutas de bajo load factor.

---

### D) COMBUSTIBLE **[MVP]**

**Mecánica.**
```
Fuel = Trip fuel + Contingency (5%) + Alternate + Final reserve (30 min) + Taxi
Trip fuel = FF_crucero × tiempo_estimado × factor_viento × factor_peso
```
- `factor_viento`: 0.92 con viento de cola fuerte, 1.08 en contra.
- `factor_peso`: 1 + 0.4 × (peso_actual − peso_medio)/peso_medio.

**Reglas.**
- Repostaje en rampa: precio por aeropuerto ($0.75–$1.35/kg) + fee de servicio.
- Quedarse corto: emergencia, desvío, aterrizaje con < reserva final → multa y −reputación.
- Fuel dumping solo en aviones que lo permiten (post-MVP).

**Feedback.** Calculadora de fuel en preflight, aviso "FUEL LOW" a 20 min de reserva, consumo en vivo.

**Economía.** Cargar de más cuesta dinero y peso; de menos es riesgo. Diferencia de precio entre aeropuertos crea decisiones (tankering).

---

### E) TORRE DE CONTROL Y TRÁFICO AÉREO **[MVP: opciones · POST: voz]**

**Mecánica.** Comunicación por radio con fraseología OACI simplificada.

**Comandos mínimos.**
`request pushback` · `request taxi` · `request takeoff` · `request descent` · `request approach` · `request landing` · `go around` · `mayday`

**Flujo ATC.**
```
Clearance → Pushback → Taxi → Tower (takeoff) → Departure → Center → Approach → Tower (landing) → Ground
```

**Reglas.**
- Cada instrucción tiene ventana de respuesta (p. ej. 20 s). Ignorarla = penalización.
- Errores de fraseología: el ATC pide "Say again" (tolerancia), no falla instantáneo.
- Tráfico IA con separación mínima: 3 nm en aproximación, 1,000 ft vertical.
- Colisión/incursión de pista = fin de sesión + penalización grave de reputación.

**Voz [POST].**
- Web Speech API (`SpeechRecognition`, `lang: es-ES/en-US`) + gramática restringida por fase.
- Puntuación: coincidencia de keywords + Levenshtein; umbral 0.6; si < 0.6 → "Say again".
- TTS: `SpeechSynthesis` + packs de audio pregrabado para el ATC (mejor inmersión).
- **Fallback obligatorio:** botones con las mismas frases siempre visibles.

**Reputación ATC.** Buen piloto (respuestas correctas y a tiempo) → prioridad y vectores más cortos. Conflictivo → esperas, vectores largos, más riesgo.

---

### F) AEROPUERTO VIVO **[MVP: blockout + día/noche · POST: densidad total]**

**Mecánica.** Aeropuertos con layout propio: pistas, calles de rodaje, gates, terminal.

**Elementos.**
- Tráfico IA (despegues, llegadas, rodaje) con rutas predefinidas y *pooling*.
- Vehículos de rampa: remolques, cisternas, buses, catering, equipaje.
- Pasajeros animados en terminal y finger.
- Hora del día e iluminación dinámica (day/night cycle de 24 min reales por hora de juego).
- Clima: claro, lluvia, niebla, nieve, tormenta; afecta visibilidad y frenado.

**Eventos ambientales [POST].** Obras, cierre de pista, huelga, manifestación → desvíos y retrasos.

**Rendimiento.** Agentes con instancing y LOD; máximo 40 agentes visibles en MVP.

---

### G) ECONOMÍA REALISTA **[MVP: versión simple]**

**Ingresos.** Tickets (economy/business/first), carga, puntualidad, extras.
**Costes.** Fuel, mantenimiento, salarios, tasas, handling, seguros, leasing, catering.

**Reputación de aerolínea (0–1000).**
- Puntualidad 40 %, seguridad 40 %, satisfacción 20 %.
- Afecta load factor (±8 %), precio de tickets (±5 %) y acceso a contratos.

**Eventos de mercado.**
- Crisis del petróleo: fuel +60 % durante 2–7 días de juego.
- Baja demanda estacional: load factor −12 %.
- Boom turístico: +15 % en rutas vacacionales.

**Balance.** Margen objetivo por vuelo: **12–25 %**. Por debajo de 8 % el jugador debe cambiar avión/ruta/precio.

---

### H) DAÑOS Y MANTENIMIENTO **[POST: profundo · MVP: desgaste simple]**

**Componentes:** motor, tren de aterrizaje, flaps, fuselaje, aviónica. Salud 0–100.

**Fuentes de daño.**
| Evento | Componente | Daño |
|--------|-----------|------|
| Aterrizaje > 2.5 g | Tren | −8 a −15 |
| Aterrizaje > 3.2 g | Fuselaje | −10 |
| Sobrepeso | Fuselaje/tren | −5 |
| Overspeed flaps | Flaps | −12 |
| Sobrecarga motor (> 100 % N1) | Motor | −2/min |
| Incursión de pista | Todos | −20 y revisión obligatoria |

**Desgaste por hora de vuelo:** motor 0.12 %/h · tren 0.05 %/ciclo · flaps 0.03 %/ciclo · fuselaje 0.02 %/h · aviónica 0.01 %/h.

**Mantenimiento.**
- Preventivo: A-check cada 500 h ($8k), C-check cada 4,000 h ($120k A320).
- Correctivo: coste ×2.5 y tiempo fuera de servicio.
- Fallo en vuelo (solo perfil Sim): probabilidad `0.02 %/h × (100 − salud)`.

---

### I) COMUNICACIÓN POR VOZ **[POST — prioridad alta]**

**Arquitectura.**
```
Mic → Web Speech API (STT) → Normalizador → Grammar matcher → ATC state machine
                                                   ↓
                                            TTS / audio pregrabado → Altavoz
```
- STT: Web Speech API (Chrome/Edge). Firefox/Safari → solo opciones.
- Alternativa post-lanzamiento: STT servidor (Whisper) vía WebSocket para máxima compatibilidad.
- TTS: `SpeechSynthesis` + packs de audio reales para fraseología.

**Tolerancia a errores.**
- Umbral de confianza 0.6.
- Si no entiende: "Say again" + resalta opciones válidas.
- Si dice algo incorrecto: corrección ("Negative, contact Ground 121.9").
- Nunca bloquea el progreso: siempre hay botón equivalente.

**Accesibilidad.** Modo sin micrófono obligatorio; subtítulos de todas las transmisiones; opción de velocidad de voz.

---

### J) PROGRESIÓN Y CARRERA **[MVP: básica]**

**Estructura.** Contratos con origen/destino, avión requerido, recompensa y penalizaciones. El jugador elige entre 3 contratos rotativos.

**Desbloqueos.**
- Aviones por reputación + dinero.
- Rutas por reputación y acuerdos con aeropuertos.
- Bases: expandir operaciones a nuevos hubs.

**Logros.** "Primer vuelo", "10 aterrizajes suaves", "1,000 pasajeros", "Sin retrasos 7 días", "Capitán".

**Meta final.** Fundar tu aerolínea: nombre, librea, flota, rutas, tripulación. Modo gestión ligero, no un tycoon completo.

---

### K) GRÁFICOS Y RENDIMIENTO WEB **[MVP: desktop 60 FPS]**

**Motor recomendado: Three.js r160+ (WebGL2).**
- Razón: ecosistema, control del pipeline, integración React, comunidad.
- Babylon.js es alternativa válida si el equipo prioriza herramientas de editor; PlayCanvas si se quiere editor en la nube.
- **No** motor propietario ni WASM pesado en el MVP.

**Pipeline de assets.**
- glTF 2.0 + Draco (geometría) + KTX2/Basis (texturas).
- LOD: 3 niveles por avión (interior, exterior cercano, exterior lejano).
- Instancing para vehículos de rampa y pasajeros.
- Carga progresiva: primero aeropuerto, luego avión, luego detalles.
- Física y lógica en Web Workers.

**Presupuesto de rendimiento.**
| Métrica | Desktop 1080p | Móvil gama media |
|---------|---------------|------------------|
| FPS objetivo | 60 (p95 ≥ 58) | 30 (p95 ≥ 28) |
| Draw calls | < 200 | < 100 |
| Triángulos visibles | < 1.5 M | < 300 k |
| VRAM | < 1.5 GB | < 512 MB |
| Carga inicial | < 5 s (10 Mbps) | < 8 s |

**Estilo visual.** Realista estilizado: materiales PBR simples, iluminación baked + dinámica, sin fotorrealismo. Prioriza legibilidad de instrumentos y silueta de aviones.

**Calidad.** Presets Bajo/Medio/Alto; detección automática por GPU y ajuste dinámico de resolución (DLSS no disponible en web; usar render scale 0.75–1.0).

---

## 4. DISEÑO DE ECONOMÍA (NÚMEROS CONCRETOS)

### 4.1 Supuestos base

- Moneda: USD 1:1 ("créditos").
- Precio combustible base: **$0.90/kg** (rango $0.65–$1.35).
- Load factor base: **80 %** (+ hasta 8 % por reputación).
- Hora de juego = 1 minuto real (acelerable en crucero ×2/×4).
- Dificultad económica: misiones MVP con margen 12–25 %.

### 4.2 Precios de ticket (por tramo)

| Clase de ruta | Distancia | Economy | Business | First |
|---------------|-----------|---------|----------|-------|
| Corta | < 500 nm | $85 | $220 | — |
| Media | 500–1,500 nm | $140 | $380 | — |
| Larga | > 1,500 nm | $420 | $1,400 | $2,800 |

### 4.3 Costes operativos

| Concepto | Fórmula / valor |
|----------|-----------------|
| Fuel | kg consumidos × precio/kg del aeropuerto |
| Landing fee | Ligero $150 · Regional $600 · Narrowbody $1,800 · Widebody $5,500 |
| Handling | $9/pax regional · $14/pax narrowbody · $22/pax widebody |
| Catering | $8/pax corta · $12/pax media · $18/pax larga |
| Salarios | Capitán $9,500/mes · FO $5,500/mes · TCP $3,200/mes |
| Mantenimiento | USD/h según tabla de avión |
| Seguro | 0.5 %/año del valor del avión |
| Leasing | 0.7 %/mes del valor |

### 4.4 Ejemplo 1 — A320neo, MAD→BCN (260 nm, 1.4 h bloque)

| Concepto | Cálculo | USD |
|----------|---------|-----|
| Ingresos | 148 pax × $95 medio | **14,060** |
| Fuel | 3,920 kg × $0.90 | −3,528 |
| Landing + handling | 1,800 + 148×14 | −3,872 |
| Catering | 148 × $8 | −1,184 |
| Tripulación | 2 × $55/h × 1.4 h | −154 |
| Mantenimiento | $1,200/h × 1.4 h | −1,680 |
| Seguro prorrateado | — | −300 |
| **Beneficio** | | **≈ 3,342 (24 %)** |

### 4.5 Ejemplo 2 — 787-9, LHR→JFK (3,000 nm, 7.5 h bloque)

| Concepto | Cálculo | USD |
|----------|---------|-----|
| Ingresos | 243 pax × $420 medio | **102,060** |
| Fuel | 49,500 kg × $0.90 | −44,550 |
| Landing + handling | 5,500 + 243×22 | −10,846 |
| Catering | 243 × $18 | −4,374 |
| Tripulación | 2 pilotos + 8 TCP (7.5 h) | −2,400 |
| Mantenimiento | $2,500/h × 7.5 h | −18,750 |
| Seguro prorrateado | — | −1,200 |
| **Beneficio** | | **≈ 19,940 (20 %)** |

### 4.6 Curva de progresión económica

| Hito | Dinero acumulado esperado | Desbloqueo |
|------|---------------------------|------------|
| 10 vuelos C172 | $8k–$15k | DA40 |
| 40 vuelos regionales | $120k–$250k | ATR 72 / Q400 |
| 150 vuelos narrowbody | $1.5M–$3M | A320neo / 737-8 |
| 400 vuelos | $8M–$15M | Primer widebody |

### 4.7 Balance inicial (bandas objetivo)

| Métrica | Banda sana | Acción si se sale |
|---------|-----------|-------------------|
| Margen por vuelo | 12–25 % | Ajustar precio ticket o coste fuel |
| Load factor | 70–88 % | Ajustar frecuencia/ruta |
| Retraso medio | < 6 min | Revisar boarding y ATC |
| Coste mantenimiento / ingresos | 8–15 % | Revisar desgaste |
| Quiebra | < 2 % de jugadores | Suavizar penalizaciones |

---

## 5. ARQUITECTURA TÉCNICA WEB

### 5.1 Frontend

```
React 18 + TypeScript + Tailwind (UI/HUD)
        │
Zustand (estado de juego, UI) ── Event Bus
        │
Three.js r160 (escena 3D, WebGL2)
        │
Web Worker (física 120 Hz + lógica de vuelo)
        │
Asset loader (glTF + Draco + KTX2, carga progresiva)
```

- **UI:** React para menús, HUD, debrief, economía. Overlay DOM sobre el canvas (no UI dentro de Three.js salvo instrumentos 3D).
- **Estado:** Zustand con slices (flight, economy, career, settings). Server reconciliation para economía.
- **Física:** worker dedicado con `SharedArrayBuffer`/transferables; render interpola.
- **Audio:** Web Audio API, mezcla por capas (motor, viento, radio, ambiente).
- **Persistencia local:** IndexedDB para caché de assets y ajustes.

### 5.2 Backend

```
NestJS 10 (ya existente, reutilizable)
 ├─ Auth JWT (existente)
 ├─ Prisma + PostgreSQL (jugadores, flota, rutas, economía)
 ├─ Redis (sesiones, pub/sub, leaderboards)
 ├─ Socket.IO (estado de vuelo, ATC compartido)
 ├─ BullMQ (trabajos: liquidación de vuelos, eventos de mercado)
 └─ OpenTelemetry + Prometheus + Sentry (existente)
```

- **Economía autoritativa en servidor:** el cliente envía telemetría de vuelo firmada; el servidor valida y liquida.
- **Anti-cheat básico:** límites físicos (velocidad, combustible, tiempo), hash de sesión, rate limiting.
- **APIs REST:** `/flights`, `/fleet`, `/routes`, `/economy`, `/career`. WebSocket para tiempo real.

### 5.3 Comunicación en tiempo real

- Socket.IO con rooms: `flight:<id>`, `atc:<airport>`, `world:<id>`.
- Deltas de estado a 5–10 Hz (no 60 Hz); interpolación en cliente.
- Redis adapter para escalar horizontalmente (ya instalado `@socket.io/redis-adapter`).
- Reconexión con snapshot + deltas; tolerancia a pérdida de paquetes.

### 5.4 Servicios de voz

| Componente | MVP | Post |
|------------|-----|------|
| STT | Web Speech API (Chrome/Edge) | Whisper server (WebSocket) |
| TTS | SpeechSynthesis | Packs de audio pregrabado |
| Gramática | Lista cerrada por fase | NLP más flexible |
| Fallback | Botones de fraseología | Igual (obligatorio) |

### 5.5 Infraestructura, escalabilidad y seguridad

- **Hosting:** CDN (Cloudflare) para assets; app en contenedores (Docker) detrás de Nginx.
- **Escalabilidad:** stateless frontend; backend horizontal con Redis pub/sub; Postgres con réplicas de lectura.
- **Seguridad:** HTTPS, Helmet, CORS estricto, rate limiting, validación de payloads (class-validator), JWT corto + refresh, secrets en vault.
- **Observabilidad:** métricas FPS/crash en cliente (Sentry), trazas OTel, dashboards de economía.

---

## 6. CATÁLOGO DE AERONAVES INICIAL (12)

| # | Modelo | Clase | Pax | MTOW (kg) | Alcance (nm) | Crucero (kt) | Consumo (kg/h) | Precio (M USD) | Maint. (USD/h) | Dificultad |
|---|--------|-------|-----|-----------|--------------|--------------|----------------|----------------|----------------|------------|
| 1 | Cessna 172S | Ligero | 3 | 1,111 | 640 | 122 | 34 | 0.35 | 45 | 1 |
| 2 | Diamond DA40 NG | Ligero | 3 | 1,310 | 750 | 140 | 26 | 0.55 | 55 | 1 |
| 3 | King Air 350i | Turbohélice | 9 | 6,804 | 1,800 | 312 | 600 | 7.5 | 350 | 2 |
| 4 | ATR 72-600 | Regional | 72 | 23,000 | 825 | 275 | 1,100 | 26 | 650 | 3 |
| 5 | Bombardier Q400 | Regional | 78 | 29,574 | 1,100 | 360 | 1,500 | 32 | 700 | 3 |
| 6 | Embraer E175 | Regional jet | 88 | 38,790 | 2,150 | 447 | 2,400 | 46 | 850 | 3 |
| 7 | Airbus A220-300 | Narrowbody | 145 | 70,900 | 3,350 | 447 | 2,500 | 91 | 1,050 | 4 |
| 8 | Airbus A320neo | Narrowbody | 180 | 79,000 | 3,500 | 450 | 2,800 | 110 | 1,200 | 4 |
| 9 | Boeing 737-8 | Narrowbody | 189 | 82,190 | 3,550 | 453 | 2,900 | 121 | 1,250 | 4 |
| 10 | Airbus A330-900 | Widebody | 287 | 251,000 | 7,200 | 470 | 6,400 | 296 | 2,400 | 5 |
| 11 | Boeing 787-9 | Widebody | 296 | 254,000 | 7,635 | 488 | 6,600 | 292 | 2,500 | 5 |
| 12 | Boeing 777-300ER | Widebody | 396 | 351,500 | 7,370 | 490 | 9,500 | 375 | 3,000 | 5 |

**MVP:** Cessna 172S + Airbus A320neo (2 aviones).
**Notas de diseño:** los valores son de simulación, no datos de certificación. Se ajustan con telemetría.

---

## 7. CATÁLOGO DE AEROPUERTOS INICIAL (6)

| # | Código | Aeropuerto | Pistas | Gates | Dificultad | Rol en el juego |
|---|--------|-----------|--------|-------|------------|-----------------|
| 1 | LECU | Cuatro Vientos (Madrid) | 1 (1,500 m) | 8 | 1 | Tutorial / aviación ligera |
| 2 | LEBL | Barcelona-El Prat | 3 | 60 | 3 | Hub regional |
| 3 | LEMD | Madrid-Barajas | 4 | 120 | 4 | Hub principal |
| 4 | EGLL | London Heathrow | 2 | 115 | 5 | Alta densidad / slots |
| 5 | KJFK | New York JFK | 4 | 128 | 5 | Largo radio / clima |
| 6 | OMDB | Dubai | 2 | 90 | 4 | Hub widebody |

**MVP:** LECU + LEMD (LEMD simplificado: 2 pistas, 20 gates).
**Post:** LEBL, EGLL, KJFK, OMDB con tráfico completo y eventos.

---

## 8. ROADMAP POR FASES

### FASE 0 — Prototipo técnico (10–12 semanas)
**Objetivo:** validar que el vuelo se siente bien en navegador.
- 1 avión (C172), 1 aeropuerto (LECU blockout), vuelo básico, cámara, HUD, input teclado/gamepad.
- Física en Web Worker, 60 FPS en desktop medio.
- Sin economía, sin ATC, sin arte final.

**Equipo:** 3–4 (1 gameplay/tech lead, 1 3D technical artist, 1 frontend 3D, 0.5 backend).
**Riesgos:** física poco creíble, rendimiento, pipeline de assets.
**Salida:** demo jugable de 5 min + informe de FPS y sensación de vuelo.

### FASE 1 — MVP jugable (5–6 meses)
**Objetivo:** primer vuelo completo publicable.
- 2 aviones (C172, A320neo), 2 aeropuertos (LECU, LEMD simplificado), 3 rutas.
- Economía simple (ingresos/costes), ATC por opciones, día/noche, tutorial, guardado.
- Login y persistencia (reutiliza backend actual).

**Equipo:** 6–7 (tech lead, 2 gameplay, 1–2 3D, 1 backend, 1 UI/UX, QA parcial).
**Riesgos:** contenido 3D, balance económico, alcance del ATC.
**Salida:** web pública (soft launch), métricas D1/D7.

### FASE 2 — Voz, daños y aeropuerto vivo (5–6 meses)
- Voz (Chrome/Edge) + fallback, daños y mantenimiento, vehículos y pasajeros animados.
- Clima dinámico, 3 aviones más, 2 aeropuertos más.
- Multijugador ATC limitado (2–4 jugadores por aeropuerto).

**Equipo:** 9 (añade 1 audio, 1 QA, 1 DevOps parcial, 1 gameplay).
**Riesgos:** precisión del STT, rendimiento con densidad, complejidad de red.

### FASE 3 — Contenido, progresión y monetización (4–5 meses)
- 12 aviones, 6 aeropuertos, carrera completa, contratos, logros.
- Monetización (Captain's Pass, liveries, packs), eventos de mercado.
- Optimización móvil, localización (ES/EN).

**Equipo:** 10–12.
**Riesgos:** monetización percibida como pay-to-win, deuda técnica, contenido insuficiente.

**Total hasta lanzamiento completo:** ~20–24 meses.

---

## 9. EQUIPO NECESARIO

| Rol | Fase 0 | Fase 1 | Fase 2 | Fase 3 | Skills clave |
|-----|--------|--------|--------|--------|--------------|
| Tech lead / gameplay | 1 | 1 | 1 | 1 | Arquitectura, física, JS/TS |
| Gameplay engineer | — | 1 | 2 | 2 | Three.js, simulación, workers |
| Frontend 3D engineer | 1 | 1 | 1 | 1 | Three.js, shaders, optimización |
| Technical artist 3D | 1 | 1–2 | 2 | 2 | Blender, glTF, PBR, LOD |
| Backend engineer | 0.5 | 1 | 1 | 1 | NestJS, Prisma, Redis, sockets |
| UI/UX designer | 0.5 | 1 | 1 | 1 | HUD, accesibilidad, Figma |
| Sound designer | — | 0.5 | 1 | 1 | Motor, radio, ambiente |
| QA | — | 0.5 | 1 | 2 | Testing funcional, rendimiento |
| Producer | 0.5 | 0.5 | 1 | 1 | Planificación, riesgos |
| DevOps | — | 0.25 | 0.5 | 0.5 | Docker, CI/CD, observabilidad |

---

## 10. RIESGOS TÉCNICOS Y DE DISEÑO

| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| **Realismo vs accesibilidad** | Alta | Alto | 3 perfiles de asistencia; default "Realista"; tutorial progresivo; telemetría de abandono |
| **STT en navegador** | Alta | Medio | Web Speech API solo Chrome/Edge; gramática cerrada; botones siempre; post: Whisper server |
| **Rendimiento 3D móvil** | Alta | Medio | Desktop primero; presets y render scale; LOD agresivo; MVP sin móvil completo |
| **Balance económico** | Media | Alto | Simulador en spreadsheet + telemetría; bandas objetivo; ajustes semanales |
| **Scope creep** | Muy alta | Muy alto | MVP congelado y checklist de "NO"; gate de fase; una feature nueva = una fuera |
| **Coste de contenido 3D** | Alta | Alto | Blockout first; assets modulares; comprar packs con licencia; no modelar cabinas completas en MVP |
| **Sensación de vuelo pobre** | Media | Muy alto | Prototipo Fase 0 con piloto real; ajustar física antes de arte |
| **Latencia de red** | Media | Medio | Deltas a 5–10 Hz; predicción cliente; modo offline para economía |
| **Fatiga de sesión larga** | Media | Medio | Vuelos de 15–40 min; guardado mid-flight; acelerar crucero |
| **Legal/marcas de aviones** | Baja | Medio | Licencias o modelos genéricos estilizados si no hay acuerdo |

---

## 11. KPIs DE ÉXITO

| Categoría | KPI | Objetivo MVP | Objetivo post |
|-----------|-----|--------------|---------------|
| Retención | D1 | ≥ 35 % | ≥ 40 % |
| Retención | D7 | ≥ 15 % | ≥ 18 % |
| Retención | D30 | ≥ 6 % | ≥ 8 % |
| Engagement | Sesión media | 20–30 min | 25–40 min |
| Onboarding | Tutorial completado | ≥ 75 % | ≥ 85 % |
| Gameplay | Aterrizajes exitosos (tras tutorial) | ≥ 65 % | ≥ 75 % |
| Gameplay | Go-arounds evitables | < 20 % | < 12 % |
| Técnico | FPS p95 desktop | ≥ 55 | ≥ 58 |
| Técnico | FPS p95 móvil | — | ≥ 28 |
| Técnico | Crash rate | < 3 % | < 1 % |
| Técnico | Carga inicial p75 | < 6 s | < 5 s |
| Negocio | Conversión F2P | 1.5–2.5 % | 2–4 % |
| Negocio | ARPPU | $6–10 | $8–15 |
| Satisfacción | NPS | ≥ 35 | ≥ 45 |

---

## 12. MVP SCOPE

### 12.1 SÍ entra en el MVP

- **Aviones:** Cessna 172S + Airbus A320neo.
- **Aeropuertos:** LECU (tutorial) + LEMD simplificado (2 pistas, 20 gates).
- **Rutas:** 3 (LECU local, LEMD–LEBL, LEMD–LEMD circuito).
- **Vuelo:** física completa, 3 perfiles de asistencia, día/noche.
- **Operación:** pushback, taxi, despegue, crucero, aproximación, aterrizaje, gate.
- **ATC:** por opciones (sin voz), 8 comandos mínimos, tráfico IA básico.
- **Economía:** tickets, fuel, tasas, mantenimiento simple, reputación básica.
- **Progresión:** 5 niveles de reputación, desbloqueo de 2 aviones.
- **UI:** HUD, menús, debrief, tutorial, guardado.
- **Input:** teclado, ratón, gamepad.
- **Plataforma:** desktop Chrome/Edge/Firefox; responsive básico.

### 12.2 NO entra en el MVP (post-lanzamiento)

- Voz (STT/TTS).
- Daños profundos y fallos en vuelo.
- Aeropuerto vivo completo (vehículos y pasajeros animados).
- Clima dinámico avanzado y eventos ambientales.
- Widebodies y aviones 3–12 del catálogo.
- Multijugador y ATC compartido.
- Leasing, seguros, bolsa, eventos de mercado.
- Móvil completo y táctil avanzado.
- Editor de liveries / contenido de usuario.
- Localización a más de ES/EN.

### 12.3 Criterio de salida del MVP

- Un jugador nuevo completa el tutorial y un vuelo gate-to-gate sin ayuda.
- 60 FPS p95 en desktop medio.
- Economía con margen dentro de 12–25 % en las 3 rutas.
- Crash rate < 3 %.
- 10 playtesters externos: ≥ 7 completan el tutorial.

---

## CHECKLIST DE ARRANQUE (10 pasos para empezar mañana)

1. **Congelar este GDD v1** y crear `ADR-001: motor Three.js y alcance del MVP`. Nada entra sin pasar por el documento.
2. **Spike de render:** Three.js + un A320 glTF de prueba + cabina simple; medir FPS y draw calls en 3 equipos (integrada, GTX 1060, móvil).
3. **Modelo de vuelo en Web Worker:** implementar sustentación/resistencia/empuje a 120 Hz y validar que las V-speeds y la tasa de ascenso son creíbles.
4. **Blockout de LECU:** pista, calles de rodaje, apron y 8 gates con medidas reales; pipeline glTF + Draco + LOD.
5. **Controles y cámara:** teclado, gamepad y ratón; cámara cockpit/exterior; HUD mínimo (velocidad, altitud, actitud, N1).
6. **Máquina de estados ATC por opciones:** clearance → pushback → taxi → takeoff → approach → landing → ground, con ventanas de tiempo.
7. **Backend de vuelo:** reutilizar auth actual; endpoints `POST /flights/start`, `POST /flights/finish`, ledger de economía y guardado.
8. **Simulador económico:** hoja de cálculo con las 3 rutas MVP y telemetría de ingresos/costes; fijar bandas.
9. **Vertical slice:** un vuelo completo gate-to-gate con puntuación y debrief; sin arte final.
10. **Playtest con 10 usuarios:** medir tutorial, aterrizajes exitosos y FPS; decidir go/no-go para Fase 1.

---

## ANEXO — ESTADO ACTUAL DEL REPO Y BRECHA CON ESTE GDD

> Diagnóstico honesto para alinear expectativas.

**Lo que existe hoy:**
- Monorepo con `backend/` (NestJS 10 + Prisma/PostgreSQL + Redis + Socket.IO + OTel) y `apps/frontend/` (React + Vite + PixiJS 2D).
- Simulador 2D de gestión: recursos (oro/madera/piedra/comida), edificios ("house"), tick de simulación, WebSocket con deltas.
- Es un **esqueleto técnico funcional**, no el juego descrito en este documento.

**Lo que se puede reutilizar:**
- Backend: auth JWT, Prisma, Redis pub/sub, Socket.IO, métricas, estructura de módulos.
- Monorepo, CI, docs de proceso.
- El patrón de estado servidor-autoritativo y deltas por WebSocket.

**Lo que NO se reutiliza:**
- Todo el frontend de juego (PixiJS 2D, edificios, economía de recursos).
- Los sistemas de simulación actuales (construcción, población, mercado genérico).
- El arte y los assets.

**Brecha para "gráficos decentes":**
- Requiere un **frontend 3D nuevo** (Three.js) y un **pipeline de assets** (Blender → glTF → Draco/KTX2 → LOD).
- El backend actual sirve como base, pero hay que añadir los dominios de vuelo, flota, rutas y economía aeronáutica.
- Estimación realista para un MVP con gráficos decentes: **8–9 meses** con 6–7 personas; el vertical slice de Fase 0, **10–12 semanas** con 3–4.

**Recomendación:** no intentar convertir el simulador 2D actual en el simulador de vuelo. Tratar el repo actual como backend + laboratorio, y arrancar el juego 3D como una app nueva dentro del monorepo (`apps/flight-sim`), reutilizando auth y sockets.
