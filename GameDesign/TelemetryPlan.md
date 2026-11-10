# Telemetry Plan
**Versión:** v0.1 | **Herramienta:** PostHog/Amplitude

## Principios
- Eventos nombrados snake_case, props consistentes
- Sampling 100% críticos, 10% verbose
- PII nunca enviado

## Eventos Core

### Sesión
- `session_start` {user_id, platform, timestamp}
- `session_end` {duration_sec}
- `daily_login` {streak}

### Economía
- `resource_gain` {resource, amount, source, building_id}
- `resource_spend` {resource, amount, sink}
- `build_started` {building_id, level, cost}
- `build_completed` {building_id, duration_sec}
- `upgrade_purchased` {building_id, from_level, to_level, cost}

### Progresión
- `xp_gained` {amount, source}
- `level_up` {new_level}
- `mission_completed` {mission_id, reward}
- `achievement_unlocked` {achievement_id}

### Mercado
- `market_buy` {resource, amount, price_total}
- `market_sell` {resource, amount, price_total}

### Retención
- `daily_goal_progress` {goal_id, progress_pct}
- `first_build_time_to` {seconds}
- `tutorial_step` {step, success}

## KPIs Derivados
- D1/D7/D30 retención
- ARPU
- Tiempo promedio sesión
- Recursos/min promedio
- Tasa conversión tutorial → first build
- Salud economía: inflación semanal recursos

## Heatmaps
- Clicks UI principal
- Fricción en construcción

## A/B Tests
- `upgrade_cost_multiplier` variant A/B
- `daily_reward_amount`

## Privacy
Anonimizar user_id, retención 90 días raw, agregados ilimitados.

## Integración
SDK init en app load, flush cada 30s o on visibility change.
