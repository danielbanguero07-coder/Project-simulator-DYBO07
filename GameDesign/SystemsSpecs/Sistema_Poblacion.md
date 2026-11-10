# Sistema de Población
**Versión:** v0.1

## Objetivo
Gestionar capacidad y crecimiento poblacional que limita edificios y producción.

## Inputs
- Viviendas construidas
- Recursos de comida/energía
- Tasa de crecimiento

## Outputs
- Población actual
- Capacidad máxima
- Bonus de felicidad

## Fórmulas
capacidad = sum(viviendas.level * factor)
población += crecimiento_por_tick si alimentos >= umbral
felicidad = clamp(0.5 + (alimentos/capacidad)*0.5, 0,1)

## Edge Cases
- Sobrepoblación → penalización producción -20%
- Población negativa → clamp 0
- Migración masiva → evento especial

## Determinismo
Simulación tick-based, reproducible.

## Telemetría
population_change, housing_utilization
