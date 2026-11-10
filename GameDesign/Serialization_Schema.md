# Serialization Schema v0.2
**Formato:** MessagePack / FlatBuffers | **Frecuencia:** Delta cada tick, Full cada 60 ticks

## Snapshot Structure
```
GameState {
  tick: uint32
  players: [PlayerState]
  entities: [EntityState]
}
```

## PlayerState
```
playerId: uint32
resources: {
  gold: float64
  wood: float64
  stone: float64
  food: float64
  energy: float64
}
population: {
  population: uint32
  capacity: uint32
  happiness: float32
}
```

## EntityState
```
entityId: uint32
components: {
  Building?: {
    buildingId: uint32
    level: uint16
    state: uint8
    progress: float32
    efficiency: float32
    lastUpdateTick: uint32
  }
  Production?: {
    resourceType: uint8
    ratePerTick: float64
    accumulator: float64
  }
  ResourceStorage?: { ... }
}
```

## Network Sync Strategy
- **Delta:** solo campos changed desde último ack
- **Full:** cada 60 ticks o reconexión
- **Rollback:** historial 60 ticks servidor para prediction correction

## Determinismo
- No Date.now() en serialización
- Tick counter como source of truth
- Checksum CRC32 por snapshot

## Ejemplo MessagePack
tick: 12345
entityId: 42
Building.state: 1
ResourceStorage.gold: 1500.5

## Seguridad
- Validar límites capacidad en servidor antes de aplicar
- Reject state client si checksum mismatch
