# Economic Simulation Notebook v0.1

## Objetivo
Validar curvas de `balance_tables.csv` contra KPIs: inflación/deflación, progresión, time-gating.

## Setup
```python
import pandas as pd
df = pd.read_csv('balance_tables.csv')
```

## Simulación Básica
- 100 jugadores sintéticos
- Tick 5s, 288 ticks/día
- 1 edificio inicial, upgrades cada 5 días si coste alcanzable

## Métricas
- Inflación semanal recursos
- Tiempo medio a primer upgrade
- Sesión simulada: check-ins 3/día
- ARPU proxy: gasto en upgrades

## Resultados Esperados
- Crecimiento sostenible 10-30% semanal
- Primer upgrade día 3-7
- No overflow de recursos

## Próximos pasos
- Añadir variabilidad jugador (casual/hardcore)
- Test A/B multiplier 1.35 vs 1.5
- Calibrar daily tax 0.5%

Ver `economic_simulation.py` para implementación.
