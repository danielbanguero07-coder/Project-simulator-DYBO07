# Sistema de Construcción
**Versión:** v0.1

## Objetivo
Permitir al jugador crear/upgradear edificios que generan recursos pasivamente.

## Inputs
- Recursos del jugador {gold, wood, stone, energy}
- Estado del edificio {id, level, build_progress, queue_position}
- Parámetros de balance `buildings.csv`

## Outputs
- Edificio construido/upgradado
- Deducción de recursos
- Evento de telemetría

## Flujo
1. Jugador solicita build
2. Validar recursos >= coste
3. Crear entidad con estado `building`
4. Tick server avanza `build_progress += delta`
5. Al completar, cambiar estado a `active`, aplicar bonuses

## Pseudocódigo
```
function startBuild(player, buildingId):
  cost = getCost(buildingId, player.level)
  if player.resources < cost: return error
  deduct(player, cost)
  entity = createEntity(buildingId, state='building', progress=0)
  scheduleComplete(entity, buildTime)
```

## Edge Cases
- Overflow recursos → cap a MAX_INT
- Desconexión → persistir progreso
- Cancelar → reembolso 50% ?
- Múltiples upgrades simultáneos → cola máx 3

## Determinismo
Estado guardado cada tick. Rollback usa snapshot anterior.

## Contratos Dev
Server es fuente de verdad para progreso. Cliente predice con interpolación.
