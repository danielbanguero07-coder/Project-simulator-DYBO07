# ECS Systems Spec v1
**Versión:** v0.1

## ProductionSystem
**Frecuencia:** Cada tick (5s)
**Components:** BuildingComponent, ProductionComponent, ResourceStorageComponent
**Pseudocódigo:**
```
for entity in query(Building, Production, Storage):
  if Building.state != PRODUCING: continue
  rate = Production.ratePerTick * Building.efficiency
  Production.accumulator += rate
  while Production.accumulator >= 1:
    addResource(Storage, Production.resourceType, 1)
    Production.accumulator -=1
  Building.lastUpdateTick = currentTick
```
**Edge:** overflow -> cap by capacity

## UpkeepSystem
**Frecuencia:** Cada 288 ticks = 24h
**Components:** BuildingComponent, ResourceStorageComponent, PopulationComponent
**Pseudocódigo:**
```
for entity in query(Building, Storage):
  cost = buildingLevel * upkeepBase
  deduct(Storage.gold, cost)
```
Apply daily tax: Storage.resource *= (1 - 0.005)

## MarketSystem
**Frecuencia:** On demand
**Validaciones:** storage capacity, gold enough, cooldown
**Pseudocódigo:**
```
function buy(player, resource, amount):
  price = baseValue * 0.8 * amount
  if Storage.gold < price: reject
  if Storage[resource] + amount > capacity: reject
  deduct gold, add resource
```

## Determinismo
All systems use tick counter, no Date.now(). Server authoritative.

## Interfaces dev
Components exportados en `packages/engine/src/components/economy.ts`
Systems en `packages/engine/src/systems/economy.ts`
