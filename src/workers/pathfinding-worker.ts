// src/workers/pathfinding-worker.ts
// ---------------------------------------------------------------------------
// Web Worker: A* Pathfinding (Offloaded from Main Thread)
// Uses Comlink for typed RPC.
// Target: < 5ms per batch of pathfinding queries (e.g. 100 entities).
// ---------------------------------------------------------------------------

import { expose } from 'comlink';

// --- Tipos ---

export interface GridCell {
  x: number;
  y: number;
  walkable: boolean;
  cost: number; // 1.0 = normal, 2.0 =困难, 0 = impassable
}

export interface PathRequest {
  from: { x: number; y: number };
  to: { x: number; y: number };
  maxSteps?: number;
}

export interface PathResult {
  path: Array<{ x: number; y: number }>;
  cost: number;
  found: boolean;
}

export interface BatchPathRequest {
  requests: PathRequest[];
  grid: GridCell[][];
  gridWidth: number;
  gridHeight: number;
}

export interface BatchPathResult {
  results: PathResult[];
  batchTimeMs: number;
}

// --- Heurística Manhattan (A* admissible) ---
function heuristic(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// --- Nodos para el A* ---
class AStarNode {
  constructor(
    public x: number,
    public y: number,
    public g: number = 0,
    public h: number = 0,
    public parent: AStarNode | null = null
  ) {}
  get f(): number {
    return this.g + this.h;
  }
}

// --- Algoritmo A* por batch ---
function astarBatch(batch: BatchPathRequest): BatchPathResult {
  const { requests, grid, gridWidth, gridHeight } = batch;
  const results: PathResult[] = [];
  const t0 = performance.now();

  for (const req of requests) {
    results.push(astarSingle(req, grid, gridWidth, gridHeight));
  }

  const t1 = performance.now();
  return { results, batchTimeMs: t1 - t0 };
}

function astarSingle(
  req: PathRequest,
  grid: GridCell[][],
  gridWidth: number,
  gridHeight: number
): PathResult {
  const { from, to, maxSteps = 200 } = req;

  // Mapa de walkable (acceso O(1) por coords)
  const walkable = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) return false;
    return grid[y][x].walkable;
  };

  // Mapa de costos
  const costAt = (x: number, y: number): number => {
    if (!walkable(x, y)) return Infinity;
    return grid[y][x].cost || 1.0;
  };

  const openSet: AStarNode[] = [new AStarNode(from.x, from.y, 0, heuristic(from, to))];
  const closedSet = new Set<string>();
  let steps = 0;

  while (openSet.length > 0 && steps < maxSteps) {
    steps++;

    // Buscar el nodo con menor f()
    let lowestIndex = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[lowestIndex].f) lowestIndex = i;
    }

    const current = openSet.splice(lowestIndex, 1)[0];
    closedSet.add(`${current.x},${current.y}`);

    // ¿Llegamos al destino?
    if (current.x === to.x && current.y === to.y) {
      const path: Array<{ x: number; y: number }> = [];
      let node: AStarNode | null = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return { path, cost: current.g, found: true };
    }

    // Vecinos (4-directional)
    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];

    for (const nb of neighbors) {
      const key = `${nb.x},${nb.y}`;
      if (closedSet.has(key) || !walkable(nb.x, nb.y)) continue;

      const g = current.g + costAt(nb.x, nb.y);
      let existing = openSet.find((n) => n.x === nb.x && n.y === nb.y);
      if (existing) {
        if (g < existing.g) {
          existing.g = g;
          existing.parent = current;
        }
      } else {
        openSet.push(
          new AStarNode(nb.x, nb.y, g, heuristic(nb, to), current)
        );
      }
    }
  }

  return { path: [], cost: Infinity, found: false };
}

// --- Exponer API tipada vía Comlink ---
const api = {
  astarBatch(batch: BatchPathRequest): Promise<BatchPathResult> {
    return Promise.resolve(astarBatch(batch));
  },
  // Helper para warm-up del worker (asegura que el worker esté listo)
  ping(): Promise<string> {
    return Promise.resolve('pong');
  },
};

expose(api);