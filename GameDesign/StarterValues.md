# Starter Values – Economic Model v0.1

## Recursos Iniciales Jugador
- gold: 500
- wood: 200
- stone: 150
- food: 100
- energy: 50

## Costes Edificios Nivel 1

### Woodcutter
- gold: 100
- wood: 50
- build_time_sec: 300 (5 min)
- base_rate_gold: 0.5 por tick

### Stone Mine
- gold: 120
- stone: 60
- build_time_sec: 360 (6 min)
- base_rate_stone: 0.6 por tick

### Generator
- gold: 150
- stone: 80
- build_time_sec: 420 (7 min)
- base_rate_energy: 1.0 por tick

### House [Capacidad]
- gold: 80
- wood: 100
- capacity +10 población
- build_time_sec: 240

## Mercado
- buy_multiplier: 0.8
- sell_multiplier: 0.6
- spread: 20%

## Economía Global
- daily_tax_rate: 0.5%
- global_generation_multiplier: 1.0
- construction_queue_max: 3

## Ratios UI
- ResourceBar labels: GOLD, WOOD, STONE, FOOD, ENERGY
- BuildingCard price display: gold + wood/stone icon
- Progress bar: building.progress 0-1

Fuente: balance_tables.csv + EconomicModel.md
