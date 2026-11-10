# Convenciones de Componentes

## Principio: Data-Oriented Design (SoA)

Todos los componentes usan **Structure of Arrays** (SoA) con `TypedArrays`:
- `Float32Array` para posiciones, escalas, rates
- `Int32Array` / `Uint32Array` para IDs, contadores, ticks
- `Uint16Array` para niveles, índices de atlas
- `Uint8Array` para estados, flags, booleanos

**Nunca** uses objetos/arrays de JS en hot path.

---

## Estructura de un Componente

```typescript
export const MiComponente = {
  name: 'MiComponente',
  fields: ['campo1', 'campo2', 'campo3'] as const,  // Nombres para debug
  types: ['float32', 'uint32', 'uint16'] as const,  // Tipos de storage
} as const;
```

### Mapeo de Tipos

| TypeScript | TypedArray | Rango | Uso típico |
|------------|------------|-------|------------|
| `float32` | `Float32Array` | ±3.4e38 | Posiciones, rates, escalas, progress (0-1) |
| `float64` | `Float64Array` | ±1.8e308 | Recursos (precisión monetaria), accumulators |
| `int32` | `Int32Array` | ±2.1e9 | Posiciones signed, deltas |
| `uint32` | `Uint32Array` | 0-4.2e9 | Entity IDs, ticks, resource amounts |
| `uint16` | `Uint16Array` | 0-65535 | Niveles, atlas indices, queue sizes |
| `uint8` | `Uint8Array` | 0-255 | Estados, flags, resource types |

---

## Fixed-Point Math (Q16.16)

Para posiciones, escalas, anchors: **usar fixed-point Q16.16**

```typescript
import { toFixedPoint, fromFixedPoint, FIXED_POINT_ONE } from '../math';

// Guardar
positionX.set(world, entity, toFixedPoint(100.5));  // 100.5 → 6586368

// Leer
const x = fromFixedPoint(positionX.get(world, entity)); // → 100.5
```

**Ventajas:**
- Determinista cross-platform (no FPU differences)
- Exact integer arithmetic para lógica de gameplay
- Serialización sin loss de precisión

---

## Convenciones de Nombrado de Campos

| Concepto | Sufijo | Tipo | Ejemplo |
|----------|--------|------|---------|
| ID único | `Id` | `uint32` | `buildingId`, `ownerId` |
| Nivel/grado | `Level` | `uint16` | `level`, `upgradeLevel` |
| Estado enum | `State` | `uint8` | `state`, `animationState` |
| Posición | `X`, `Y`, `Z` | `float32` (FP) | `positionX`, `positionY` |
| Progreso 0-1 | `Progress` | `float32` (FP) | `progress`, `buildProgress` |
| Multiplicador | `Multiplier`, `Rate` | `float32` (FP) | `efficiency`, `productionRate` |
| Timestamp tick | `Tick` | `uint32` | `lastUpdateTick`, `spawnTick` |
| Acumulador | `Accumulator` | `float64` | `accumulator`, `xpAccumulator` |
| Capacidad | `Capacity` | `float64`/`uint32` | `capacityGold`, `maxQueueSize` |
| Contador | `Count`, `Amount` | `uint32`/`float64` | `population`, `gold` |
| Flag bitfield | `Flags` | `uint16` | `flags`, `spriteFlags` |

---

## Componentes Core (Referencia)

### Position (implícito en BuildingComponent)
```typescript
positionX: float32  // Q16.16 world X
positionY: float32  // Q16.16 world Y
```

### Velocity (para unidades móviles)
```typescript
velocityX: float32  // Q16.16 per tick
velocityY: float32  // Q16.16 per tick
```

### ResourceStorage (por jugador)
```typescript
gold: float64
wood: float64
stone: float64
food: float64
energy: float64
capacityGold: float64
capacityWood: float64
capacityStone: float64
capacityFood: float64
capacityEnergy: float64
```

### BuildingData
```typescript
buildingId: uint32     // BuildingType enum
level: uint16          // 1-99
state: uint8           // BuildingState enum
ownerId: uint32        // Player entity
positionX: float32     // Q16.16
positionY: float32     // Q16.16
progress: float32      // Q16.16 0-1
efficiency: float32    // Q16.16 0-2
lastUpdateTick: uint32
productionRate: float64 // per tick
```

### SpriteRef (Render)
```typescript
atlas: uint16          // AtlasIndex enum
frame: uint16          // Frame index in atlas
tint: uint32           // 0xAARRGGBB
scale: float32         // Q16.16
anchorX: float32       // Q16.16
anchorY: float32       // Q16.16
zIndex: int16          // Render order
flags: uint16          // Bitfield: flipX|flipY|additive|premult
```

### Health (Combate)
```typescript
current: float32       // Q16.16
max: float32           // Q16.16
regenRate: float32     // Q16.16 per tick
armor: float32         // Q16.16 0-1
lastDamageTick: uint32
```

### Owner (Propiedad)
```typescript
ownerId: uint32        // Player/entity owner
teamId: uint16         // Team/faction
permissions: uint16    // Bitfield permissions
```

### Level (Progresión)
```typescript
level: uint16          // Current level
xp: float64            // Current XP
xpToNext: float64      // XP needed for next level
skillPoints: uint16    // Unspent points
```

---

## Registro de Componentes

```typescript
// En registerTuDominio(world)
const campo1 = world.defineComponent({ 
  name: 'MiComponente.campo1', 
  size: 1, 
  type: 'float32' 
});
// size = número de valores por entidad (para arrays: size > 1)
```

**Importante:** `size` es elementos por entidad. Para `Vec2` usar `size: 2`.

---

## Acceso Type-Safe

Siempre exponer accessors con getters/setters tipados:

```typescript
export const MiAccessor = {
  id: campo1Id,
  campo1: {
    get: (w, e) => w.storage.getFloat32(campo1Id, e, 0),
    set: (w, e, v) => w.storage.setFloat32(campo1Id, e, 0, v),
  },
  campo2: {
    get: (w, e) => w.storage.getUint32(campo2Id, e, 0),
    set: (w, e, v) => w.storage.setUint32(campo2Id, e, 0, v),
  },
};
```

**Nunca** expongas `storage` directamente a los sistemas.

---

## Serialización

Los componentes se serializan automáticamente via `World.serialize()`:

```typescript
// WorldSnapshot incluye:
{
  tick: 1234,
  components: {
    'MiComponente.campo1': { type: 'float32', size: 1, data: [...] },
    'MiComponente.campo2': { type: 'uint32', size: 1, data: [...] },
  }
}
```

Para campos que **no** deben serializarse (caché, derivados):
```typescript
world.defineComponent({ 
  name: 'MiComponente.campoDerivado', 
  size: 1, 
  type: 'float32',
  // No serializar: se recalcula en deserialize
  serialize: false  // (añadir soporte en ECS core si necesario)
});
```

---

## Migración de Versiones

Cuando cambies estructura de componente:

1. **Añade campos nuevos** al final (backward compatible)
2. **Nunca elimines** campos, márcalos `deprecated`
3. **Versiona** el schema en `WorldSnapshot`:
   ```typescript
   { schemaVersion: 2, components: {...} }
   ```
4. En `deserialize`, maneja versiones antiguas:
   ```typescript
   if (snapshot.schemaVersion < 2) {
     // Migrar: asignar defaults a campos nuevos
   }
   ```

---

## Checklist Nuevo Componente

- [ ] `defineComponent` con `name`, `size`, `type` correctos
- [ ] Accessors con `get`/`set` type-safe
- [ ] Nombres de campos siguen convención tabla arriba
- [ ] Fixed-point para posiciones/escalas/progreso
- [ ] `float64` para recursos/economía
- [ ] Registrado en `registerXxxComponents(world)`
- [ ] Exportado en `src/components/index.ts`
- [ ] Tests deterministas en `tests/`
- [ ] Documentado en esta guía