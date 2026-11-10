/**
 * @sim/engine - DevTools
 * ECS Inspector, Time-travel debugging, Performance overlay
 * Target: packages/engine/src/devtools/DevTools.ts
 */

import { World, Entity, ComponentId, SystemFn } from '../core/ecs';
import { MathUtils } from '../math';

// ============================================================================
// Types
// ============================================================================

export interface EntityInspection {
  entity: Entity;
  alive: boolean;
  version: number;
  components: ComponentInspection[];
}

export interface ComponentInspection {
  name: string;
  id: ComponentId;
  fields: FieldInspection[];
}

export interface FieldInspection {
  name: string;
  value: any;
  type: string;
}

export interface SystemInspection {
  name: string;
  priority: number;
  phase: string;
  avgTimeMs: number;
  lastTimeMs: number;
  callCount: number;
}

export interface PerformanceSnapshot {
  tick: number;
  totalTimeMs: number;
  systemTimes: Record<string, number>;
  entityCount: number;
  aliveCount: number;
  memoryUsage: number;
}

export interface HistoryEntry {
  tick: number;
  timestamp: number;
  snapshot: any; // WorldSnapshot
  inputCommands: any[];
}

// ============================================================================
// DevTools Class
// ============================================================================

export class DevTools {
  private world: World;
  private enabled = false;
  private history: HistoryEntry[] = [];
  private maxHistory = 300; // 5 minutes at 1 tick/sec
  private performanceHistory: PerformanceSnapshot[] = [];
  private maxPerfHistory = 600; // 10 minutes
  private systemStats: Map<string, { totalTime: number; count: number; lastTime: number }> = new Map();
  private inspectorPanel: HTMLElement | null = null;
  private perfPanel: HTMLElement | null = null;
  private selectedEntity: Entity | null = null;
  private paused = false;
  private tickSpeed = 1.0;
  
  constructor(world: World) {
    this.world = world;
  }
  
  // ---------------------------------------------------------------------------
  // Enable/Disable
  // ---------------------------------------------------------------------------
  
  enable(): void {
    this.enabled = true;
    this.createUI();
    this.startRecording();
  }
  
  disable(): void {
    this.enabled = false;
    this.destroyUI();
    this.stopRecording();
  }
  
  isEnabled(): boolean {
    return this.enabled;
  }
  
  // ---------------------------------------------------------------------------
  // Recording (Time-travel)
  // ---------------------------------------------------------------------------
  
  private startRecording(): void {
    // Record snapshot every tick
    this.world.addSystem((world) => {
      if (!this.enabled) return;
      
      const snapshot = world.serialize();
      this.history.push({
        tick: world.tick,
        timestamp: performance.now(),
        snapshot,
        inputCommands: [], // Would be filled by InputSystem
      });
      
      // Trim history
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
    }, -100, 'DevToolsRecorder'); // Run first
  }
  
  private stopRecording(): void {
    // Remove recorder system
    // In real implementation, we'd track and remove it
  }
  
  // Time travel
  rewindToTick(tick: number): boolean {
    const entry = this.history.find(h => h.tick === tick);
    if (!entry) return false;
    
    this.world.deserialize(entry.snapshot);
    this.selectedEntity = null;
    this.updateInspector();
    return true;
  }
  
  rewindTicks(count: number): boolean {
    const targetTick = this.world.tick - count;
    return this.rewindToTick(targetTick);
  }
  
  getHistory(): ReadonlyArray<HistoryEntry> {
    return this.history;
  }
  
  getHistoryRange(startTick: number, endTick: number): HistoryEntry[] {
    return this.history.filter(h => h.tick >= startTick && h.tick <= endTick);
  }
  
  // ---------------------------------------------------------------------------
  // Entity Inspection
  // ---------------------------------------------------------------------------
  
  inspectEntity(entity: Entity): EntityInspection | null {
    if (!this.world.isAlive(entity)) return null;
    
    const components: ComponentInspection[] = [];
    
    // Iterate all registered components
    for (const [id, def] of this.world.storage['definitions']) {
      const fields: FieldInspection[] = [];
      
      for (let i = 0; i < def.size; i++) {
        let value: any;
        switch (def.type) {
          case 'float32':
            value = this.world.storage.getFloat32(id, entity, i);
            break;
          case 'int32':
            value = this.world.storage.getInt32(id, entity, i);
            break;
          case 'uint32':
            value = this.world.storage.getUint32(id, entity, i);
            break;
          case 'uint16':
            const arr16 = this.world.storage.getUint16Array(id);
            value = arr16?.[entity * def.size + i];
            break;
          case 'uint8':
            const arr8 = this.world.storage.getUint8Array(id);
            value = arr8?.[entity * def.size + i];
            break;
        }
        
        fields.push({
          name: def.name + (def.size > 1 ? `[${i}]` : ''),
          value,
          type: def.type,
        });
      }
      
      components.push({
        name: def.name,
        id,
        fields,
      });
    }
    
    return {
      entity,
      alive: this.world.isAlive(entity),
      version: this.world.getVersion(entity),
      components,
    };
  }
  
  getSelectedEntity(): Entity | null {
    return this.selectedEntity;
  }
  
  selectEntity(entity: Entity | null): void {
    this.selectedEntity = entity;
    this.updateInspector();
  }
  
  // ---------------------------------------------------------------------------
  // System Inspection
  // ---------------------------------------------------------------------------
  
  getSystemStats(): SystemInspection[] {
    const stats: SystemInspection[] = [];
    
    for (const sys of this.world.getSystems()) {
      const s = this.systemStats.get(sys.name) || { totalTime: 0, count: 0, lastTime: 0 };
      stats.push({
        name: sys.name,
        priority: sys.priority,
        phase: 'simulation',
        avgTimeMs: s.count > 0 ? s.totalTime / s.count : 0,
        lastTimeMs: s.lastTime,
        callCount: s.count,
      });
    }
    
    return stats;
  }
  
  recordSystemTime(name: string, timeMs: number): void {
    const s = this.systemStats.get(name) || { totalTime: 0, count: 0, lastTime: 0 };
    s.totalTime += timeMs;
    s.count++;
    s.lastTime = timeMs;
    this.systemStats.set(name, s);
  }
  
  // ---------------------------------------------------------------------------
  // Performance Monitoring
  // ---------------------------------------------------------------------------
  
  recordPerformance(snapshot: PerformanceSnapshot): void {
    this.performanceHistory.push(snapshot);
    if (this.performanceHistory.length > this.maxPerfHistory) {
      this.performanceHistory.shift();
    }
    this.updatePerfPanel();
  }
  
  getPerformanceHistory(): ReadonlyArray<PerformanceSnapshot> {
    return this.performanceHistory;
  }
  
  getCurrentFPS(): number {
    if (this.performanceHistory.length < 2) return 60;
    const recent = this.performanceHistory.slice(-60);
    const avgTime = recent.reduce((sum, s) => sum + s.totalTimeMs, 0) / recent.length;
    return avgTime > 0 ? 1000 / avgTime : 60;
  }
  
  getAvgFrameTime(): number {
    if (this.performanceHistory.length === 0) return 0;
    const recent = this.performanceHistory.slice(-60);
    return recent.reduce((sum, s) => sum + s.totalTimeMs, 0) / recent.length;
  }
  
  // ---------------------------------------------------------------------------
  // Debug Commands
  // ---------------------------------------------------------------------------
  
  spawnEntity(archetype: string, params: any = {}): Entity {
    const entity = this.world.createEntity();
    
    switch (archetype) {
      case 'building':
        // Would use building commands
        break;
      case 'player':
        // Would initialize player components
        break;
    }
    
    return entity;
  }
  
  killEntity(entity: Entity): boolean {
    return this.world.destroyEntity(entity);
  }
  
  fastForward(ticks: number): void {
    for (let i = 0; i < ticks; i++) {
      this.world.update(5000); // 5s per tick
    }
  }
  
  setTickSpeed(speed: number): void {
    this.tickSpeed = Math.max(0, speed);
  }
  
  togglePause(): void {
    this.paused = !this.paused;
  }
  
  isPaused(): boolean {
    return this.paused;
  }
  
  // ---------------------------------------------------------------------------
  // UI Creation (Overlay)
  // ---------------------------------------------------------------------------
  
  private createUI(): void {
    if (typeof document === 'undefined') return; // Server-side
    
    // Create inspector panel
    this.inspectorPanel = document.createElement('div');
    this.inspectorPanel.id = 'sim-devtools-inspector';
    this.inspectorPanel.style.cssText = `
      position: fixed; top: 10px; right: 10px; width: 350px; max-height: 80vh;
      background: rgba(0,0,0,0.9); color: #0f0; font-family: monospace; font-size: 11px;
      border: 1px solid #0f0; border-radius: 4px; padding: 8px; overflow: auto;
      z-index: 10000; pointer-events: auto;
    `;
    this.inspectorPanel.innerHTML = '<h3 style="margin:0 0 8px">ECS Inspector</h3><div id="inspector-content">Select entity</div>';
    document.body.appendChild(this.inspectorPanel);
    
    // Create performance panel
    this.perfPanel = document.createElement('div');
    this.perfPanel.id = 'sim-devtools-perf';
    this.perfPanel.style.cssText = `
      position: fixed; bottom: 10px; left: 10px; width: 300px; height: 150px;
      background: rgba(0,0,0,0.9); color: #0f0; font-family: monospace; font-size: 11px;
      border: 1px solid #0f0; border-radius: 4px; padding: 8px; overflow: auto;
      z-index: 10000; pointer-events: auto;
    `;
    this.perfPanel.innerHTML = '<h3 style="margin:0 0 8px">Performance</h3><canvas id="perf-graph" width="280" height="100"></canvas>';
    document.body.appendChild(this.perfPanel);
    
    // Create controls
    const controls = document.createElement('div');
    controls.id = 'sim-devtools-controls';
    controls.style.cssText = `
      position: fixed; bottom: 10px; right: 10px;
      background: rgba(0,0,0,0.9); color: #0f0; font-family: monospace; font-size: 11px;
      border: 1px solid #0f0; border-radius: 4px; padding: 8px;
      z-index: 10000; pointer-events: auto;
    `;
    controls.innerHTML = `
      <h3 style="margin:0 0 8px">Controls</h3>
      <button id="dt-pause">Pause</button>
      <button id="dt-step">Step</button>
      <button id="dt-ff10">FF x10</button>
      <button id="dt-ff100">FF x100</button>
      <br><label>Speed: <input type="range" id="dt-speed" min="0" max="10" step="0.1" value="1"></label>
      <br><button id="dt-rewind10">Rewind 10</button>
      <button id="dt-rewind100">Rewind 100</button>
    `;
    document.body.appendChild(controls);
    
    // Bind events
    this.bindControls();
  }
  
  private bindControls(): void {
    const pauseBtn = document.getElementById('dt-pause');
    const stepBtn = document.getElementById('dt-step');
    const ff10Btn = document.getElementById('dt-ff10');
    const ff100Btn = document.getElementById('dt-ff100');
    const speedInput = document.getElementById('dt-speed') as HTMLInputElement;
    const rewind10Btn = document.getElementById('dt-rewind10');
    const rewind100Btn = document.getElementById('dt-rewind100');
    
    pauseBtn?.addEventListener('click', () => {
      this.togglePause();
      if (pauseBtn) pauseBtn.textContent = this.paused ? 'Resume' : 'Pause';
    });
    
    stepBtn?.addEventListener('click', () => {
      if (this.paused) this.world.update(5000);
    });
    
    ff10Btn?.addEventListener('click', () => this.fastForward(10));
    ff100Btn?.addEventListener('click', () => this.fastForward(100));
    
    speedInput?.addEventListener('input', () => {
      this.setTickSpeed(parseFloat(speedInput.value));
    });
    
    rewind10Btn?.addEventListener('click', () => this.rewindTicks(10));
    rewind100Btn?.addEventListener('click', () => this.rewindTicks(100));
  }
  
  private destroyUI(): void {
    this.inspectorPanel?.remove();
    this.perfPanel?.remove();
    document.getElementById('sim-devtools-controls')?.remove();
    this.inspectorPanel = null;
    this.perfPanel = null;
  }
  
  private updateInspector(): void {
    if (!this.inspectorPanel) return;
    
    const content = document.getElementById('inspector-content');
    if (!content) return;
    
    if (this.selectedEntity === null) {
      content.innerHTML = 'No entity selected';
      return;
    }
    
    const inspection = this.inspectEntity(this.selectedEntity);
    if (!inspection) {
      content.innerHTML = 'Entity not found';
      return;
    }
    
    let html = `<div>Entity: ${inspection.entity} (v${inspection.version}) ${inspection.alive ? '✓' : '✗'}</div>`;
    
    for (const comp of inspection.components) {
      html += `<details><summary>${comp.name}</summary>`;
      for (const field of comp.fields) {
        const val = typeof field.value === 'number' && field.type === 'float32' 
          ? (field.value / MathUtils.FIXED_POINT_ONE).toFixed(4)
          : field.value;
        html += `<div style="margin-left:16px">${field.name}: <span style="color:#ff0">${val}</span></div>`;
      }
      html += '</details>';
    }
    
    content.innerHTML = html;
  }
  
  private updatePerfPanel(): void {
    if (!this.perfPanel) return;
    
    const canvas = document.getElementById('perf-graph') as HTMLCanvasElement;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const history = this.performanceHistory.slice(-60);
    if (history.length === 0) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    const maxTime = Math.max(...history.map(h => h.totalTimeMs), 16.67);
    
    for (let i = 0; i < history.length; i++) {
      const x = (i / Math.max(history.length - 1, 1)) * canvas.width;
      const y = canvas.height - (history[i].totalTimeMs / maxTime) * canvas.height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    
    ctx.stroke();
    
    // Draw 60fps line (16.67ms)
    const fps60Y = canvas.height - (16.67 / maxTime) * canvas.height;
    ctx.strokeStyle = '#f00';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, fps60Y);
    ctx.lineTo(canvas.width, fps60Y);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Update text
    const fps = this.getCurrentFPS().toFixed(1);
    const avgTime = this.getAvgFrameTime().toFixed(2);
    this.perfPanel.querySelector('h3')!.textContent = `Performance: ${fps} FPS (${avgTime}ms)`;
  }
  
  // ---------------------------------------------------------------------------
  // Export/Import for debugging
  // ---------------------------------------------------------------------------
  
  exportHistory(): string {
    return JSON.stringify(this.history.map(h => ({
      tick: h.tick,
      timestamp: h.timestamp,
      entityCount: h.snapshot.entityCount,
      aliveCount: h.snapshot.aliveCount,
    })), null, 2);
  }
  
  exportPerformance(): string {
    return JSON.stringify(this.performanceHistory, null, 2);
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createDevTools(world: World): DevTools {
  return new DevTools(world);
}

// ============================================================================
// Global accessor (for console debugging)
// ============================================================================

declare global {
  interface Window {
    __SIM_DEVTOOLS__?: DevTools;
  }
}

export function exposeDevToolsGlobally(devTools: DevTools): void {
  if (typeof window !== 'undefined') {
    window.__SIM_DEVTOOLS__ = devTools;
    console.log('DevTools exposed as window.__SIM_DEVTOOLS__');
    console.log('Commands:');
    console.log('  __SIM_DEVTOOLS__.inspectEntity(id)');
    console.log('  __SIM_DEVTOOLS__.rewindTicks(n)');
    console.log('  __SIM_DEVTOOLS__.fastForward(n)');
    console.log('  __SIM_DEVTOOLS__.spawnEntity(archetype, params)');
    console.log('  __SIM_DEVTOOLS__.killEntity(id)');
    console.log('  __SIM_DEVTOOLS__.togglePause()');
    console.log('  __SIM_DEVTOOLS__.setTickSpeed(speed)');
  }
}