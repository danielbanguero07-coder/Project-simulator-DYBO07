# Cómo Añadir un Sistema al Engine

## Resumen
Los sistemas en `@sim/engine` son **funciones puras** con signatura `(world: World, dt: number) => void`. No tienen estado interno, no dependen de closures, y operan solo sobre los componentes del `World`.

---

## 1. Definir los Componentes que Necesitas

En `src/components/tu_dominio.ts`:

```typescript
import { World, defineComponent } from '../core/ecs';

export const TuComponente = {
  name: 'TuComponente',
  fields: ['campo1', 'campo2', 'campo3'] as const,
  types: ['float32', 'uint32', 'uint16'] as const,
} as const;

export function registerTuComponente(world: World) {
  const campo1 = world.defineComponent({ name: 'TuComponente.campo1', size: 1, type: 'float32' });
  const campo2 = world.defineComponent({ name: 'TuComponente.campo2', size: 1, type: 'uint32' });
  const campo3 = world.defineComponent({ name: 'TuComponente.campo3', size: 1, type: 'uint16' });
  
  return {
    TuComponente: {
      id: campo1,
      campo1: { get: (w, e) => w.storage.getFloat32(campo1, e, 0), set: (w, e, v) => w.storage.setFloat32(campo1, e, 0, v) },
      campo2: { get: (w, e) => w.storage.getUint32(campo2, e, 0), set: (w, e, v) => w.storage.setUint32(campo2, e, 0, v) },
      campo3: { get: (w, e) => w.storage.getUint32(campo3, e, 0), set: (w, e, v) => w.storage.setUint32(campo3, e, 0, v) },
    },
  };
}
```

---

## 2. Crear el Sistema

En `src/systems/tu_sistema.ts`:

```typescript
import { World, SystemFn } from '../core/ecs';
import { registerTuComponente, TuComponenteAccessors } from '../components/tu_componente';

export function createTuSistema(accessors: TuComponenteAccessors): SystemFn {
  return (world: World, dt: number): void => {
    const C = accessors.TuComponente;
    
    // Iterar todas las entidades vivas
    for (let entity = 0; entity < world.entityCount; entity++) {
      if (!world.isAlive(entity)) continue;
      if (C.campo1.get(world, entity) === 0) continue; // No tiene el componente
      
      // Lógica pura aquí
      const valor = C.campo1.get(world, entity);
      C.campo2.set(world, entity, valor * 2);
    }
  };
}
```

**Reglas de oro:**
- ✅ Función pura: mismo `(world, dt)` → mismo resultado
- ✅ Sin closures que capturen estado mutable
- ✅ Sin `Date.now()`, `Math.random()`, `performance.now()`
- ✅ Usa `world.tick`, `world.rng` para determinismo
- ✅ Itera con `for` loop simple (más rápido que `forEach`)
- ✅ Early continue para entidades sin componentes

---

## 3. Registrar en el Scheduler

En tu punto de entrada (ej. `src/simulation/main.ts`):

```typescript
import { World, createDefaultScheduler } from '@sim/engine';
import { registerTuComponente, createTuSistema } from '@sim/engine';

const world = new World();
const accessors = registerTuComponente(world);
const scheduler = createDefaultScheduler(world);

// Añadir tu sistema en la fase correcta
scheduler.addSystem({
  name: 'TuSistema',
  fn: createTuSistema(accessors),
  priority: 25,              // Entre Production(20) y Upkeep(30)
  phase: 'simulation',
  dependencies: ['ProductionSystem'], // Debe correr después
});
```

---

## 4. Sistema On-Demand (como MarketSystem)

Para sistemas que no corren cada tick:

```typescript
export function createMarketSystem(accessors) {
  const executeTrade = (request) => { /* ... */ };
  
  const system: SystemFn = (world, dt) => {
    // Solo mantenimiento periódico (reset cooldowns)
    if (world.tick % 720 === 0) { /* reset hourly */ }
  };
  
  return { system, executeTrade };
}
```

Uso desde InputSystem:
```typescript
const { executeTrade } = createMarketSystem(accessors);
// En handler de click:
executeTrade({ playerId, type: 'buy', resourceType: 1, amount: 10 });
```

---

## 5. Tests Deterministas

En `tests/tu_sistema.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@sim/engine/core/ecs';
import { createSeededRNG } from '@sim/engine/math';
import { registerTuComponente, createTuSistema } from '@sim/engine';

function createTestWorld(seed = 'test') {
  const world = new World();
  world.rng = createSeededRNG(seed);
  return world;
}

describe('TuSistema', () => {
  it('produce resultados deterministas', () => {
    const world1 = createTestWorld('seed-123');
    const acc1 = registerTuComponente(world1);
    const sys1 = createTuSistema(acc1);
    
    // Setup entidades...
    
    for (let i = 0; i < 100; i++) sys1(world1, 5000);
    const snap1 = world1.serialize();
    
    // Re-ejecutar con misma seed
    const world2 = createTestWorld('seed-123');
    const acc2 = registerTuComponente(world2);
    const sys2 = createTuSistema(acc2);
    
    // Mismo setup...
    for (let i = 0; i < 100; i++) sys2(world2, 5000);
    const snap2 = world2.serialize();
    
    expect(snap1).toEqual(snap2); // ¡Identico!
  });
});
```

---

## 6. Convenciones de Nombrado

| Elemento | Convención | Ejemplo |
|----------|------------|---------|
| Archivo componente | `kebab-case.ts` | `resource_storage.ts` |
| Componente export | `PascalCase + Component` | `ResourceStorageComponent` |
| Sistema export | `create + PascalCase + System` | `createProductionSystem` |
| Accessor object | `PascalCase` | `ResourceStorage` |
| Campo accessor | `camelCase` | `getGold`, `setGold` |
| Constantes | `SCREAMING_SNAKE` | `UPKEEP_BASE` |
| Enums | `PascalCase` | `BuildingState` |

---

## 7. Performance Tips

1. **Cache array references** fuera del loop:
   ```typescript
   const goldArr = world.storage.getFloat32Array(goldCompId);
   for (let e = 0; e < world.entityCount; e++) {
     if (!alive[e]) continue;
     goldArr[e] += 1; // Acceso directo
   }
   ```

2. **Evita function calls** en hot path:
   ```typescript
   // Lento
   S.getGold(world, e);
   
   // Rápido
   goldArr[e];
   ```

3. **Usa typed arrays directamente** para math pesado:
   ```typescript
   const f64 = new Float64Array(buffer);
   // SIMD-friendly operations
   ```

4. **Batch entity creation** al inicio, no en runtime.

---

## 8. Debugging

```typescript
// En el sistema
if (import.meta.env.DEV) {
  if (world.tick % 60 === 0) {
    console.log(`[TuSistema] tick=${world.tick} processed=${count} entities`);
  }
}

// DevTools inspector
import { createDevTools } from '@sim/engine/devtools';
const devTools = createDevTools(world);
devTools.enable();
// En consola: __SIM_DEVTOOLS__.inspectEntity(42)
```