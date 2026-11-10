# Economic Model v1 – Simulador Web
**Versión:** v0.1 | **Fecha:** 2026-11-05

## Principios
- Economía data-driven, balanceada por sumideros = fuentes * 0.85-0.95
- Curvas de progresión suaves: coste = base * multiplicador ^ nivel
- Time-gating suave: construcción escala con log
- Anti-inflación: sinks obligatorios, impuestos mercado, degradación

## Recursos Base
Oro [GOLD], Madera [WOOD], Piedra [STONE], Energía [ENERGY]

## Fórmulas Core

### Generación Pasiva
`gen_per_tick = base_rate * building_level * efficiency_multiplier * bonus_global`
Tick = 5s → generación por minuto = gen_per_tick * 12

### Coste de Upgrade
`cost_next = floor(base_cost * multiplier ^ level)`
multiplier = 1.35 para edificios tier1, 1.5 tier2, 1.65 tier3

### Tiempo de Construcción
`build_time_sec = base_time * (1 + level * 0.25) * difficulty_factor`
Cap máx 24h para edificios end-game

### Mercado NPC
`buy_price = base_value * 0.8`
`sell_price = base_value * 0.6`
Ratio spread 20% para evitar arbitraje infinito

## Curvas de Progresión XP
Nivel 1-50: XP_next = 100 * 1.12 ^ (level-1)
Cap XP/día para evitar grind: 150% de objetivo diario

## Balance Inicial Tabla [CSV]

Ver archivo adjunto `balance_tables.csv` para valores parametrizables.

## Sinks de Economía
1. Upgrades de edificios
2. Investigación tecnológica
3. Mercado NPC con spread
4. Impuestos de mantenimiento diario 0.5% recursos almacenados
5. Decoraciones cosméticas

## Fuentes de Economía
1. Generación pasiva de edificios
2. Misiones diarias / logros
3. Eventos limitados
4. Recompensas de login

## Time-Gating
- Cooldown de recolección manual: 60s → 300s con mejoras
- Cola de construcción: máx 3 edificios simultáneos
- Investigación: 4h-48h

## Parámetros Ajustables para A/B
- `global_generation_multiplier`
- `upgrade_cost_multiplier`
- `market_spread`
- `daily_tax_rate`

## Validación
Simulación determinista: estado(t+1) = f(estado(t), inputs)
Snapshot cada tick, rollback posible con historial 60 ticks.

## Next Steps
Prototipo spreadsheet para simular 30 días de economía con 100 jugadores sintéticos.
