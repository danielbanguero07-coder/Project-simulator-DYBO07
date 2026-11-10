# Core Loop Document – Simulador Web
**Versión:** v0.1 | **Fecha:** 2026-11-05 | **Owner:** Game Designer

## Visión de Loop
Juego de gestión de recursos por turnos-tick con progresión a largo plazo, jugable en sesiones cortas y retención por metas diarias.

## Core Loop por Horizonte Temporal

### Cada 30 segundos – Micro Loop
**Acción:** Revisar generación pasiva, recolectar/claim.
**Jugador hace:** Ver UI de recursos → pulsar "Recolectar" / "Claim" cuando timer está listo.
**Feedback:** Animación de +recursos, sonido, barra de progreso.
**Objetivo:** Dopamina inmediata, hábito de check-in.

### Cada 5 minutos – Meso Loop
**Acción:** Asignar trabajo, construir/upgradear, decidir gasto.
**Jugador hace:** 
1. Revisar cola de producción de edificios.
2. Gastar recursos en upgrade de edificio o investigación.
3. Comprar en mercado NPC si ratio favorable.
**Feedback:** Nuevo edificio aparece, stats suben, XP otorgada.
**Objetivo:** Sentido de progreso tangible.

### Cada 30 minutos – Macro Loop
**Acción:** Planificar economía, optimizar layout, completar misiones.
**Jugador hace:**
1. Revisar dashboards de eficiencia (recursos/min).
2. Rebalancear producción vs consumo.
3. Completar 1-2 misiones diarias / logros.
**Feedback:** Recompensas de misión, desbloqueo de rama tecnológica.
**Objetivo:** Decisión estratégica, retención sesión media.

### Cada día – Meta Loop
**Acción:** Logros diarios, eventos, planificación a largo plazo.
**Jugador hace:**
1. Completar objetivos diarios → recompensas premium.
2. Revisar progreso de árbol de tecnología / season pass.
3. Preparar para evento semanal.
**Feedback:** Banner diario, streak counter, recompensas escalables.
**Objetivo:** Retención D1/D7, hábito.

## Bucles de Progresión
1. **Progresión vertical:** Subir nivel → más capacidad de recursos, desbloquear edificios tier 2/3.
2. **Progresión horizontal:** Desbloquear tipos de recursos y sinergias.
3. **Meta-progresión:** Pase de temporada, logros permanentes, colecciones.

## Retención Hooks
- Streak diario, bonus por login consecutivo.
- Time-gating suave: tiempos de construcción crecientes, no bloqueantes.
- FOMO controlado: eventos limitados 72h con recompensas cosméticas.

## Principios de Diseño
- Determinista y tick-based: 1 tick = 5 segundos servidor/cliente.
- Progreso visible siempre; nunca perder progreso por inactividad.
- Coste de oportunidad claro en cada decisión.

## KPIs asociados
Sesión media 8-12 min, D1 ≥45%, D7 ≥20%, D30 ≥8%, check-ins/día ≥3.
