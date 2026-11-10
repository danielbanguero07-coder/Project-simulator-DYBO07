// src/workers/simulation-worker.ts
// ---------------------------------------------------------------------------
// Web Worker: Economic Simulation (Offloaded from Main Thread)
// Handles massive batch updates of resources, market prices, and production.
// Uses Comlink for typed RPC.
// Target: < 50ms per tick for 10k entities (avoid blocking the render loop).
// ---------------------------------------------------------------------------

import { expose } from 'comlink';

// --- Tipos ---

export interface Entity {
  id: string;
  resources: Record<string, number>; // e.g. { gold: 100, wood: 50 }
  production: Record<string, number>; // rate per tick
  capacity: Record<string, number>;
  level: number;
}

export interface SimulationTickRequest {
  entities: Entity[];
  tickIntervalMs: number;
  marketPrices: Record<string, number>;
  globalModifiers: Record<string, number>;
}

export interface SimulationTickResult {
  updatedEntities: Entity[];
  totalResources: Record<string, number>;
  marketFluctuation: Record<string, number>;
  tickTimeMs: number;
}

export interface BatchSimulationRequest {
  ticks: number; // Number of ticks to simulate
  entities: Entity[];
  marketPrices: Record<string, number>;
  globalModifiers: Record<string, number>;
}

export interface BatchSimulationResult {
  finalEntities: Entity[];
  totalResources: Record<string, number>;
  ticksSimulated: number;
  batchTimeMs: number;
}

// --- Simulation Logic ---

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function simulateTick(
  entities: Entity[],
  marketPrices: Record<string, number>,
  globalModifiers: Record<string, number>
): { updatedEntities: Entity[]; totalResources: Record<string, number> } {
  const updated: Entity[] = new Array(entities.length);
  const totals: Record<string, number> = {};

  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    const newResources: Record<string, number> = {};
    const keys = Object.keys(e.resources);

    for (const key of keys) {
      const prod = e.production[key] || 0;
      const cap = e.capacity[key] || Infinity;
      const modifier = globalModifiers[key] || 1.0;
      const current = e.resources[key] || 0;

      // Apply production with capacity clamping
      let newValue = current + prod * modifier;
      newValue = clamp(newValue, 0, cap);
      newResources[key] = newValue;
      totals[key] = (totals[key] || 0) + newValue;
    }

    updated[i] = {
      ...e,
      resources: newResources,
    };
  }

  return { updatedEntities: updated, totalResources: totals };
}

function simulateBatch(
  ticks: number,
  entities: Entity[],
  marketPrices: Record<string, number>,
  globalModifiers: Record<string, number>
): BatchSimulationResult {
  const t0 = performance.now();
  let currentEntities = entities.map((e) => ({ ...e, resources: { ...e.resources } }));
  let currentMarket = { ...marketPrices };

  for (let t = 0; t < ticks; t++) {
    const { updatedEntities, totalResources } = simulateTick(
      currentEntities,
      currentMarket,
      globalModifiers
    );
    currentEntities = updatedEntities;

    // Market fluctuation: random walk with mean reversion
    for (const resource of Object.keys(currentMarket)) {
      const noise = (Math.random() - 0.5) * 0.02; // ±1%
      const reversion = (1.0 - currentMarket[resource]) * 0.005; // mean reversion
      currentMarket[resource] = clamp(
        currentMarket[resource] + noise + reversion,
        0.1,
        10.0
      );
    }
  }

  const t1 = performance.now();
  return {
    finalEntities: currentEntities,
    totalResources: {},
    ticksSimulated: ticks,
    batchTimeMs: t1 - t0,
  };
}

// --- Exponer API tipada vía Comlink ---
const api = {
  simulateTick(
    request: SimulationTickRequest
  ): Promise<SimulationTickResult> {
    const t0 = performance.now();
    const { updatedEntities, totalResources } = simulateTick(
      request.entities,
      request.marketPrices,
      request.globalModifiers
    );

    // Market fluctuation
    const marketFluctuation: Record<string, number> = {};
    for (const key of Object.keys(request.marketPrices)) {
      const noise = (Math.random() - 0.5) * 0.02;
      const reversion = (1.0 - request.marketPrices[key]) * 0.005;
      marketFluctuation[key] = clamp(
        request.marketPrices[key] + noise + reversion,
        0.1,
        10.0
      );
    }

    const t1 = performance.now();
    return Promise.resolve({
      updatedEntities,
      totalResources,
      marketFluctuation,
      tickTimeMs: t1 - t0,
    });
  },

  simulateBatch(
    request: BatchSimulationRequest
  ): Promise<BatchSimulationResult> {
    return Promise.resolve(
      simulateBatch(
        request.ticks,
        request.entities,
        request.marketPrices,
        request.globalModifiers
      )
    );
  },

  ping(): Promise<string> {
    return Promise.resolve('pong');
  },
};

expose(api);