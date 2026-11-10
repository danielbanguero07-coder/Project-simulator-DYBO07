// src/workers/wrapper.ts
// ---------------------------------------------------------------------------
// Wrapper tipado para consumir los Web Workers desde el Main Thread.
// Usa Comlink para RPC tipada sin serialización manual.
// ---------------------------------------------------------------------------

import { wrap } from 'comlink';
import type { PathfindingWorker } from './pathfinding-worker';
import type { SimulationWorker } from './simulation-worker';

// --- Pathfinding Worker ---
let pathfindingWorkerInstance: ReturnType<typeof wrap<PathfindingWorker>> | null = null;

export function getPathfindingWorker(): ReturnType<typeof wrap<PathfindingWorker>> {
  if (!pathfindingWorkerInstance) {
    const worker = new Worker(
      new URL('./pathfinding-worker.ts', import.meta.url),
      { type: 'module' }
    );
    pathfindingWorkerInstance = wrap<PathfindingWorker>(worker);
  }
  return pathfindingWorkerInstance;
}

// --- Simulation Worker ---
let simulationWorkerInstance: ReturnType<typeof wrap<SimulationWorker>> | null = null;

export function getSimulationWorker(): ReturnType<typeof wrap<SimulationWorker>> {
  if (!simulationWorkerInstance) {
    const worker = new Worker(
      new URL('./simulation-worker.ts', import.meta.url),
      { type: 'module' }
    );
    simulationWorkerInstance = wrap<SimulationWorker>(worker);
  }
  return simulationWorkerInstance;
}

// --- Helpers ---

/**
 * Ejecuta pathfinding en batch y actualiza la UI sin bloquear el hilo principal.
 * Ideal para 50-500 entidades moviéndose simultáneamente.
 */
export async function runPathfindingBatch(
  requests: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>,
  grid: { walkable: boolean; cost: number }[][],
  gridWidth: number,
  gridHeight: number
) {
  const worker = getPathfindingWorker();
  const result = await worker.astarBatch({
    requests,
    grid,
    gridWidth,
    gridHeight,
  });
  return result.results;
}

/**
 * Ejecuta un tick de simulación económica masiva en el worker.
 * El worker procesa 10k entities sin bloquear el render loop.
 */
export async function runSimulationTick(
  entities: Array<{
    id: string;
    resources: Record<string, number>;
    production: Record<string, number>;
    capacity: Record<string, number>;
    level: number;
  }>,
  marketPrices: Record<string, number>,
  globalModifiers: Record<string, number>
) {
  const worker = getSimulationWorker();
  return worker.simulateTick({
    entities,
    tickIntervalMs: 1000,
    marketPrices,
    globalModifiers,
  });
}

/**
 * Ejecuta múltiples ticks de simulación (e.g. 100 ticks = ~100s de gameplay).
 * Útil para el save/load o para el "fast-forward".
 */
export async function runSimulationBatch(
  ticks: number,
  entities: Array<{
    id: string;
    resources: Record<string, number>;
    production: Record<string, number>;
    capacity: Record<string, number>;
    level: number;
  }>,
  marketPrices: Record<string, number>,
  globalModifiers: Record<string, number>
) {
  const worker = getSimulationWorker();
  return worker.simulateBatch({
    ticks,
    entities,
    marketPrices,
    globalModifiers,
  });
}

/**
 * Limpieza de workers (llamar al cerrar el juego o cambiar de screen).
 */
export function terminateWorkers() {
  if (pathfindingWorkerInstance) {
    (pathfindingWorkerInstance as any).terminate?.();
    pathfindingWorkerInstance = null;
  }
  if (simulationWorkerInstance) {
    (simulationWorkerInstance as any).terminate?.();
    simulationWorkerInstance = null;
  }
}