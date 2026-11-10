# ECS Systems Implementation Spec v0.2
**Target:** bitecs | **Tick:** 5s servidor, 60Hz lógica con accumulator

## ProductionSystem
**Componentes requeridos:** BuildingComponent, ProductionComponent, ResourceStorageComponent
**Orden:** Post-InputSystem, Pre-NetworkSync
**Frecuencia:** Cada tick

**Pseudocódigo:**
```
for each entity with Building, Production, Storage:
  if Building.state != PRODUCING: continue
  dt = currentTick - Building.lastUpdateTick
  Building.lastUpdateTick = currentTick
  
  Production.accumulator += dt * Building.efficiency * Production.ratePerTick
  
  while Production.accumulator >= 1.0:
    if canStore(Storage, Production.resourceType, 1):
      addResource(Storage, Production.resourceType, 1)
      Production.accumulator -= 1.0
      emit ResourceGainedEvent(entity, amount=1)
    else:
      Building.state = IDLE
      emit ProductionHaltedEvent(entity, reason=STORAGE_FULL)
      break
```

**Edge cases:**
- Building destruido → refund 50% recursos invertidos
- Efficiency cambia mid-cycle → rate recalculado próximo tick
- Server restart → snapshot accumulator + lastUpdateTick

**Serialización:**
Delta: state, progress, Storage.* changed
Full snapshot cada 60 ticks

**Tests:**
Seed fijo → output determinista
Invariant: Storage >=0
Stress 10k buildings <2ms/tick

## UpkeepSystem
**Componentes:** BuildingComponent, ResourceStorageComponent, PopulationComponent
**Orden:** Daily, después ProductionSystem
**Frecuencia:** Cada 288 ticks

**Pseudocódigo:**
```
for each entity with Building, Storage:
  upkeep = Building.level * upkeepBase[Building.buildingId]
  if Storage.gold < upkeep:
    Building.state = DAMAGED
    emit UpkeepFailedEvent
  else:
    Storage.gold -= upkeep
```
Daily tax 0.5% sobre Storage

**Edge:** Recursos insuficientes → degradación progresiva

## MarketSystem
**Componentes:** ResourceStorageComponent, PlayerComponent
**Orden:** OnDemand
**Pseudocódigo:**
```
function buy(playerId, resource, amount):
  price = baseValue[resource] * 0.8 * amount
  if Storage.gold < price: reject
  if Storage[resource] + amount > capacity: reject
  deduct gold, add resource
  emit MarketTradeEvent
```

**Edge:** Cooldown 5s anti-spam, límite por hora

## BuildingUpgradeSystem
**Componentes:** BuildingComponent, UpgradeQueueComponent, ResourceStorageComponent
**Orden:** Pre-ProductionSystem
**Frecuencia:** Cada tick

**Pseudocódigo:**
```
if Building.state == UPGRADING:
  Building.progress += dt / buildTime
  if Building.progress >=1:
    Building.level +=1
    Building.state = IDLE
    recalc Production.rate
```

**Edge:** Cancel upgrade → reembolso 50%

## PopulationNeedsSystem
**Componentes:** PopulationComponent, ResourceStorageComponent
**Orden:** Post-UpkeepSystem
**Frecuencia:** Cada 288 ticks

**Pseudocódigo:**
```
foodNeed = Population.population * foodPerCapita
if Storage.food < foodNeed:
  Population.happiness -= 0.1
  Population.growthRate *= 0.9
else:
  Population.population += floor(Population.growthRate * happiness)
```

**Edge:** Sobrepoblación → producción -20%
