import { useEffect, useRef, useState, useCallback } from 'react';
import { useGame } from '@/store/gameStore';
import { createQualityDemo as initQualityDemo, type QualityDemoHandle } from '@/scenes/qualityDemo';
import type { DemoStats } from '@/scenes/qualityDemo';
import type { BoardingStatus } from '@/scenes/boardingSystem';
import FlightHUD from '@/components/FlightHUD';
import { NavigationMap } from '@/components/NavigationMap';
import { FlightPhysics, type FlightState } from '@/scenes/flightPhysics';
import { TimeManager } from '@/scenes/timeSystem';

export function AirportGameView({ onMenuBack }: { onMenuBack?: () => void }) {
  const { username, logout } = useGame();
  const containerRef = useRef<HTMLDivElement>(null);
  const demoRef = useRef<QualityDemoHandle | null>(null);
  const physicsRef = useRef<FlightPhysics>(new FlightPhysics());
  
  const [stats, setStats] = useState<DemoStats>({
    fps: 0,
    drawCalls: 0,
    triangles: 0,
  });
  
  const [flightState, setFlightState] = useState<FlightState>(physicsRef.current.state);
  const [uiVisible] = useState(true);
  const [gameTime, setGameTime] = useState('--:-- GMT');
  const [boarding, setBoarding] = useState<BoardingStatus[]>([]);
  const [showControlsHelp, setShowControlsHelp] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const timeManagerRef = useRef<TimeManager>(new TimeManager({ timeScale: 1/60, initialHour: 12 }));

  // Keyboard controls listener for A320 Flight (WASD / Arrows / Shift / Ctrl / G / F)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const physics = physicsRef.current;
    const current = physics.state;
    
    let throttle = current.throttle;
    let pitch = current.pitchInput;
    let roll = current.rollInput;
    let yaw = current.yawInput;
    let flaps = current.flaps;
    let gearDown = current.gearDown;

    switch (e.key.toLowerCase()) {
      case 'w':
      case 'arrowup':
        pitch = -0.8; // morro abajo / empujar
        break;
      case 's':
      case 'arrowdown':
        pitch = 0.8; // morro arriba / tirar
        break;
      case 'a':
      case 'arrowleft':
        roll = 1.0; // alabeo a la izquierda
        yaw = 0.5;
        break;
      case 'd':
      case 'arrowright':
        roll = -1.0; // alabeo a la derecha
        yaw = -0.5;
        break;
      case 'shift':
        throttle = Math.min(1.0, throttle + 0.1);
        break;
      case 'control':
      case 'ctrl':
        throttle = Math.max(0.0, throttle - 0.1);
        break;
      case 't':
        throttle = 1.0; // TOGA: full take-off thrust
        break;
      case 'g':
        gearDown = !gearDown;
        break;
      case 'f':
        flaps = (flaps + 1) % 4;
        break;
    }

    physics.setControls({ throttle, pitch, roll, yaw, flaps, gearDown });
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const physics = physicsRef.current;
    const current = physics.state;
    let pitch = current.pitchInput;
    let roll = current.rollInput;
    let yaw = current.yawInput;

    switch (e.key.toLowerCase()) {
      case 'w':
      case 's':
      case 'arrowup':
      case 'arrowdown':
        pitch = 0.0;
        break;
      case 'a':
      case 'd':
      case 'arrowleft':
      case 'arrowright':
        roll = 0.0;
        yaw = 0.0;
        break;
    }

    physics.setControls({ pitch, roll, yaw });
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  // Main simulation loop for physics & 3D scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const handle = initQualityDemo(container, 3, (newStats: DemoStats) => {
      setStats(newStats);
      if (newStats.boarding) setBoarding(newStats.boarding);
    });
    demoRef.current = handle;
    // Let the physics follow the real terrain/airport elevation, so landing at
    // a remote airport (which sits at 12-220 m) stops on its runway instead of
    // falling through to the home elevation.
    physicsRef.current.setGroundSampler((x, z) => handle.heightAt(x, z));

    // Dev helper: allows inspecting/stepping the live flight model from the
    // console without depending on the render loop.
    const debugWindow = window as unknown as { __flightPhysics?: FlightPhysics };
    debugWindow.__flightPhysics = physicsRef.current;

    const runPhysicsLoop = () => {
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      physicsRef.current.update(dt);
      const state = physicsRef.current.state;
      setFlightState({ ...state });

      // Update game time
      timeManagerRef.current.update();
      setGameTime(timeManagerRef.current.getFormattedTime());

      // Link physics to 3D scene
      if (demoRef.current) {
        demoRef.current.updateAircraft(state.position, state.rotation, state.gearDown);
      }

      animationFrameId = requestAnimationFrame(runPhysicsLoop);
    };

    animationFrameId = requestAnimationFrame(runPhysicsLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      delete (window as unknown as { __flightPhysics?: FlightPhysics }).__flightPhysics;
      handle.dispose();
      demoRef.current = null;
    };
  }, []);

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100 select-none">
      {/* 3D Airport & A320 Flight Canvas */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* 1. Bottom-Left: Navigation Map (SAT) */}
      <div className="absolute bottom-4 left-4 z-20">
        <div className="relative">
          {/* Toggle Map Button */}
          <button
            type="button"
            onClick={() => setShowMap(!showMap)}
            className="pointer-events-auto absolute -top-2 -right-2 z-30 w-7 h-7 rounded-full bg-slate-900/80 border border-white/20 flex items-center justify-center hover:bg-slate-800 transition-all duration-200 shadow-lg"
            title={showMap ? 'Ocultar mapa' : 'Mostrar mapa'}
          >
            {showMap ? (
              // Ojo abierto
              <svg className="w-3.5 h-3.5 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-4 0 3 3 0 014 0z" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            ) : (
              // Ojo cerrado
              <svg className="w-3.5 h-3.5 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-5.523 0-10-4.477-10-10a10.05 10.05 0 011.175-1.875M9.9 15.117l4.175-4.175M6 6h12M6 6l12 12" />
              </svg>
            )}
          </button>
          {/* Navigation Map with fade transition */}
          <div className={`transition-opacity duration-300 ease-in-out ${showMap ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <NavigationMap
              state={flightState}
              onSelectAirport={(airport) =>
                demoRef.current?.focusAirport(airport.x, airport.z, airport.elevation)
              }
            />
          </div>
        </div>
      </div>

      {/* 2. Flight instruments + top-left menu button (full-screen overlay) */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <FlightHUD
          state={flightState}
          onThrottleChange={(throttle: number) => physicsRef.current.setControls({ throttle })}
          onFlapsChange={(flaps: number) => physicsRef.current.setControls({ flaps })}
          onToggleGear={() => physicsRef.current.setControls({ gearDown: !physicsRef.current.state.gearDown })}
          onMenuBack={onMenuBack || (() => {})}
          gameTime={gameTime}
        />
      </div>

      {/* 3. Top-Right: Destination & Performance (below the HUD altitude tape) */}
      <div className="absolute top-40 right-3 z-20 flex flex-col items-end gap-1.5 pointer-events-none">
        {/* Destination Badge */}
        <div className="rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-1 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase text-slate-400 font-mono">RWY 36L</span>
            <span className="font-mono text-xs font-bold text-sky-400">
              {Math.max(0, Math.round(1150 - flightState.position.z))}m
            </span>
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        </div>

        {/* Boarding counters: one row per gate currently loading people */}
        {boarding.some((b) => b.active) && (
          <div className="w-44 rounded-lg border border-white/10 bg-slate-950/60 p-2 font-mono text-[9px] text-slate-300 backdrop-blur-md">
            <div className="flex justify-between border-b border-white/10 pb-1 mb-1">
              <span className="font-bold text-white/70">EMBARQUE</span>
              <span className="text-sky-400">PAX</span>
            </div>
            {boarding
              .filter((b) => b.active)
              .slice(0, 4)
              .map((b) => (
                <div key={b.gateId} className="mt-1 first:mt-0">
                  <div className="flex justify-between">
                    <span className="text-slate-300">
                      P{b.gateId} · {b.flightNumber}
                    </span>
                    <span className="text-sky-400">
                      {b.boarded}/{b.passengers}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1 w-full overflow-hidden rounded bg-slate-700">
                    <div
                      className="h-1 rounded bg-sky-400 transition-[width] duration-700"
                      style={{ width: `${Math.round(b.progress * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Stats */}
        {uiVisible && (
          <div className="w-44 rounded-lg border border-white/10 bg-slate-950/60 p-2 font-mono text-[9px] text-slate-300 backdrop-blur-md">
            <div className="flex justify-between border-b border-white/10 pb-1 mb-1">
              <span className="font-bold text-white/70">SISTEMA</span>
              <span className={stats.fps >= 55 ? 'text-emerald-400' : 'text-amber-400'}>{stats.fps || '—'} FPS</span>
            </div>
            <div className="space-y-0.5 text-slate-400">
              <div className="flex justify-between"><span>GPU</span><span className={stats.integratedGpu ? 'text-amber-400' : 'text-emerald-400'}>{stats.gpu || 'GTX 1650'}</span></div>
              <div className="flex justify-between"><span>VRAM</span><span className="text-sky-400">{stats.stream ? Math.round(stats.stream.residentBytes / (1024 * 1024)) : 0} MB</span></div>
            </div>
            <div className="mt-1.5 pt-1 border-t border-white/5 text-right">
              <button type="button" className="text-slate-500 hover:text-amber-400 pointer-events-auto" onClick={logout}>SALIR ({username})</button>
            </div>
          </div>
        )}

        {/* Toggle Help */}
        <button type="button" onClick={() => setShowControlsHelp(!showControlsHelp)} className="pointer-events-auto rounded-lg border border-white/10 bg-slate-950/60 px-2 py-0.5 text-[9px] font-mono text-slate-300 backdrop-blur-md hover:bg-slate-800 transition">
          {showControlsHelp ? '❌ Ocultar Controles' : '🎮 Ayuda Controles'}
        </button>

        {/* Camera Mode Selector */}
        <div className="pointer-events-auto rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase text-slate-400 font-mono">Cámara</span>
            <select
              className="bg-slate-900 border border-white/10 rounded text-white text-[9px] font-mono px-1.5 py-0.5 focus:outline-none focus:border-sky-400"
              onChange={(e) => demoRef.current?.setCameraMode(e.target.value as 'AIRCRAFT_FOLLOW' | 'FREE_ORBIT' | 'COCKPIT_VIEW' | 'PARKING_VIEW')}
              title="Cambia modo de cámara (C para alternar)"
            >
              <option value="AIRCRAFT_FOLLOW">📷 Seguir Avión</option>
              <option value="FREE_ORBIT">🔄 Orbita Libre</option>
              <option value="COCKPIT_VIEW">👁️ Vista Cabina</option>
              <option value="PARKING_VIEW">🅿️ Vista Parking</option>
            </select>
          </div>
          <div className="text-[8px] text-slate-500 mt-0.5">C: Alternar | Mouse: Orbitar (FREE/PARKING)</div>
        </div>

        {/* Controls Help */}
        {showControlsHelp && (
          <div className="pointer-events-auto w-52 rounded-lg border border-white/20 bg-slate-950/90 p-2.5 shadow-2xl backdrop-blur-md text-[9px] text-slate-300 space-y-1 font-mono">
            <div className="font-bold text-white border-b border-white/10 pb-1 mb-1">🎮 A320 CONTROLS</div>
            <div className="flex justify-between"><span>S / ↓</span><span className="text-sky-400">Morro arriba</span></div>
            <div className="flex justify-between"><span>W / ↑</span><span className="text-sky-400">Morro abajo</span></div>
            <div className="flex justify-between"><span>A / D</span><span className="text-sky-400">Alerones</span></div>
            <div className="flex justify-between"><span>T</span><span className="text-sky-400">Empuje 100%</span></div>
            <div className="flex justify-between"><span>Shift/Ctrl</span><span className="text-sky-400">Empuje ±10%</span></div>
            <div className="flex justify-between"><span>G / F</span><span className="text-sky-400">Tren / Flaps</span></div>
            <div className="mt-1 border-t border-white/10 pt-1 text-[8px] leading-relaxed text-amber-300">
              Despegue: T → espera 145 kt → mantén S para rotar.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AirportGameView;
