# Worker Candidates & Integration Strategy

## 1. Análisis de Candidatos

Tras revisar `System_Dependencies_Graph.md`, identificamos los sistemas ideales para mover a Web Workers con el objetivo de liberar el hilo principal (Main Thread) para el renderizado (PixiJS) y la interacción UI (React).

| Sistema | Decisión | Motivo ( CPU Savings ) |
| :--- | :--- | :--- |
| **ProductionSystem** | **SÍ** | Operaciones matemáticas masivas sobre 10k entidades. Elimina GC spikes por acumuladores. |
| **PopulationNeedsSystem** | **SÍ** | A* Pathfinding + cálculo complejo de felicidad. |
| **UpkeepSystem** | **SÍ** | Cálculo en lote sobre BuildingComponents. Operación O(n). |
| **MarketSystem** | NO | Lógica simple, alta dependencia de interacción inmediata. |
| **BuildingUpgradeSystem** | NO | Event-driven, depende de InputSystem y estado de UI. |

---

## 2. Propuesta API Comlink

Se utilizará una interfaz de `SystemProcessorWorker` para centralizar los cálculos masivos.

### Tipo de Datos (Worker Request/Response)
```typescript
// Shared Types (definir en types/worker.d.ts)
export interface SystemTickRequest {
  system: 'production' | 'upkeep' | 'population';
  entities: any[]; // Data buffer para minimizar serialización
  params: Record<string, any>;
}

export interface SystemTickResponse {
  system: string;
  results: Record<string, any>; // Delta updates
  processingTimeMs: number;
}
```

### API Interface
```typescript
export interface SystemProcessorWorker {
  runTick(request: SystemTickRequest): Promise<SystemTickResponse>;
}
```

---

## 3. Estimación CPU Savings

| Sistema | Frecuencia | Costo Main Thread (est.) | Costo Worker | Ganancia |
| :--- | :--- | :--- | :--- | :--- |
| **ProductionSystem** | 1 tick/s | 15ms | < 2ms | **13ms** |
| **UpkeepSystem** | 1 tick/s | 8ms | < 1ms | **7ms** |
| **PopulationNeeds** | 0.5 tick/s | 25ms | < 5ms | **20ms** |
| **TOTAL** | - | **48ms** | **8ms** | **40ms/tick** |

*Nota: Con un frame budget de 16.6ms, liberar 40ms es crítico para evitar stuttering.*

---

## 4. Plan de Integración: `SystemScheduler`

El `SystemScheduler` (Main Thread) actuará como orquestador y se encargará de gestionar el flujo de datos (Input/Output).

1. **Pipeline de Tick**:
   - `scheduler.emit("pre-worker")`: Main thread prepara buffers (JSON a ArrayBuffer).
   - `worker.runTick(batch)`: Llamada asíncrona no bloqueante.
   - `scheduler.emit("post-worker")`: Main thread aplica `delta updates` al State (ECS).
   - `renderSystem.render()`: Render final con datos consistentes.

2. **Manejo de Dependencias**:
   - Para mantener la integridad, `ProductionSystem` y `UpkeepSystem` se enviarán secuencialmente al worker, pero se recibirán como una única promesa de procesamiento (`Promise.all`).
   - El resultado del `PopulationNeedsSystem` se aplicará tras confirmar el estado de `ResourceStorage`.

3. **Sincronización**:
   - Uso de **Snapshot Pattern**: Se envía una "foto" del estado al worker, el worker procesa, y devuelve una "lista de cambios". El hilo principal aplica los cambios en el frame inmediatamente posterior.
