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
  const [tower, setTower] = useState<DemoStats['runway']>(undefined);
  const [ground, setGround] = useState<DemoStats['ground']>(undefined);
  const [serviceMsg, setServiceMsg] = useState<string | null>(null);
  const serviceTimer = useRef<number | null>(null);
  const [showControlsHelp, setShowControlsHelp] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [showRadial, setShowRadial] = useState(false);
  const radialRef = useRef(false);
  const radialGateRef = useRef(0);
  const timeManagerRef = useRef<TimeManager>(new TimeManager({ timeScale: 1/60, initialHour: 12 }));

  useEffect(() => {
    radialRef.current = showRadial;
  }, [showRadial]);

  const cycleCamera = useCallback(() => {
    const modes = ['AIRCRAFT_FOLLOW', 'COCKPIT_VIEW', 'FREE_ORBIT', 'PARKING_VIEW'] as const;
    const current = demoRef.current?.getCameraMode() ?? 'AIRCRAFT_FOLLOW';
    const index = modes.indexOf(current as (typeof modes)[number]);
    demoRef.current?.setCameraMode(modes[(index + 1) % modes.length]);
  }, []);

  const focusNextGate = useCallback(() => {
    radialGateRef.current = (radialGateRef.current % 8) + 1;
    demoRef.current?.focusGate(radialGateRef.current);
  }, []);

  const showServiceMessage = useCallback((message: string) => {
    setServiceMsg(message);
    if (serviceTimer.current !== null) window.clearTimeout(serviceTimer.current);
    serviceTimer.current = window.setTimeout(() => setServiceMsg(null), 3500);
  }, []);

  const toggleGround = useCallback((kind: 'boarding' | 'baggage') => {
    const result = demoRef.current?.toggleGroundService(kind);
    if (!result || !result.ok) {
      showServiceMessage('Acércate a una puerta para dar servicio');
    } else {
      showServiceMessage(
        `${kind === 'boarding' ? 'Embarque' : 'Maletas'} ${
          result.enabled ? 'permitido' : 'cancelado'
        } · Puerta ${result.gate}`
      );
    }
  }, [showServiceMessage]);

  const toggleRefuel = useCallback(() => {
    const gate = demoRef.current?.getPlayerGate() ?? null;
    if (gate === null) {
      showServiceMessage('Aparca en una puerta para repostar');
      return;
    }
    const enabled = physicsRef.current.toggleRefuel();
    showServiceMessage(
      enabled
        ? `Repostaje iniciado · Puerta ${gate}`
        : 'Repostaje detenido'
    );
  }, [showServiceMessage]);

  useEffect(() => {
    return () => {
      if (serviceTimer.current !== null) window.clearTimeout(serviceTimer.current);
    };
  }, []);

  // Keyboard controls listener for A320 Flight (WASD / Arrows / Shift / Ctrl / G / F)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (key === 'v' && !e.repeat) {
      e.preventDefault();
      setShowRadial((open) => !open);
      return;
    }
    if (key === 'escape' && radialRef.current) {
      setShowRadial(false);
      return;
    }
    // While the radial menu is open the aircraft ignores control keys, so a
    // click on the menu cannot also push the throttle or the yoke.
    if (radialRef.current) return;

    const physics = physicsRef.current;
    const current = physics.state;
    
    let throttle = current.throttle;
    let pitch = current.pitchInput;
    let roll = current.rollInput;
    let yaw = current.yawInput;
    let flaps = current.flaps;
    let gearDown = current.gearDown;

    switch (key) {
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
      if (newStats.runway) setTower(newStats.runway);
      if (newStats.ground) setGround(newStats.ground);
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
        // Refuelling only makes sense while parked at a stand. If the player
        // taxis away, stop the hose so the truck does not follow the aircraft.
        const playerGate = demoRef.current.getPlayerGate();
        if (state.refueling && playerGate === null) {
          physicsRef.current.toggleRefuel();
        }
        demoRef.current.setPlayerFueling(state.refueling && playerGate !== null);
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

  const towerHolder = tower?.holder
    ? tower.holder.replace(/^tm-/, '').replace(/^route-/, 'RUTA ')
    : null;
  const towerState = !tower?.holder
    ? 'LIBRE'
    : tower.holderUse === 'arrival'
      ? 'ATERRIZAJE'
      : 'DESPEGUE';

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

      {/* Radial aircraft menu (V opens/closes, Esc closes) */}
      {showRadial && (() => {
        const actions: Array<{
          icon: string;
          label: string;
          hint: string;
          active?: boolean;
          run: () => void;
        }> = [
          {
            icon: '🧑‍🤝‍🧑',
            label: 'Embarque',
            hint: ground?.boarding
              ? `Embarcando ${ground.boarded}/${ground.passengers}`
              : ground && ground.boarded >= ground.passengers
                ? `Completo ${ground.boarded}/${ground.passengers}`
                : 'Permitir embarque',
            active: ground?.boarding === true,
            run: () => toggleGround('boarding')
          },
          {
            icon: '🧳',
            label: 'Maletas',
            hint: ground?.baggage
              ? `Cargando ${(ground.baggageLoadedKg / 1000).toFixed(1)}/${(ground.baggageKg / 1000).toFixed(1)} t`
              : 'Permitir maletas',
            active: ground?.baggage === true,
            run: () => toggleGround('baggage')
          },
          {
            icon: '⛽',
            label: 'Repostar',
            hint: flightState.refueling
              ? `Repostando ${(flightState.fuelKg / 1000).toFixed(1)} t`
              : `Cargar hasta ${(flightState.fuelTargetKg / 1000).toFixed(1)} t`,
            active: flightState.refueling,
            run: toggleRefuel
          },
          {
            icon: '🚀',
            label: 'TOGA',
            hint: 'Empuje 100%',
            run: () => physicsRef.current.setControls({ throttle: 1 })
          },
          {
            icon: '🛬',
            label: 'Tren',
            hint: 'Tren arriba/abajo',
            run: () => physicsRef.current.setControls({ gearDown: !physicsRef.current.state.gearDown })
          },
          {
            icon: '🪂',
            label: 'Flaps',
            hint: 'Siguiente posición',
            run: () => physicsRef.current.setControls({ flaps: (physicsRef.current.state.flaps + 1) % 4 })
          },
          {
            icon: '🎥',
            label: 'Cámara',
            hint: 'Siguiente vista',
            run: cycleCamera
          },
          {
            icon: '🛗',
            label: 'Puerta',
            hint: 'Enfocar pasarela',
            run: focusNextGate
          },
          {
            icon: '🗺️',
            label: 'Mapa',
            hint: 'Mostrar/ocultar',
            run: () => setShowMap((visible) => !visible)
          }
        ];
        return (
          <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/45 backdrop-blur-[2px]"
            onClick={() => setShowRadial(false)}
            role="dialog"
            aria-label="Menú radial del avión"
          >
            <div
              className="relative h-[340px] w-[340px]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="absolute inset-0 rounded-full border border-white/15 bg-slate-900/55 shadow-2xl" />
              <div className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-sky-400/30 bg-slate-950/80 text-center">
                <span className="font-mono text-sm font-bold text-sky-300">A320</span>
                <span className="mt-0.5 font-mono text-[8px] text-slate-300">
                  PAX {ground?.boarded ?? 0}/{ground?.passengers ?? 180}
                </span>
                <span className="font-mono text-[8px] text-amber-300">
                  FUEL {(flightState.fuelKg / 1000).toFixed(1)} t
                </span>
                <span className="mt-0.5 font-mono text-[7px] text-slate-500">V · Esc cerrar</span>
              </div>
              {actions.map((action, index) => {
                const angle = -Math.PI / 2 + (index * Math.PI * 2) / actions.length;
                const x = 170 + Math.cos(angle) * 122;
                const y = 170 + Math.sin(angle) * 122;
                return (
                  <button
                    key={action.label}
                    type="button"
                    title={action.hint}
                    onClick={() => {
                      action.run();
                      setShowRadial(false);
                    }}
                    className="absolute flex h-[74px] w-[74px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-full border border-white/15 bg-slate-900/85 text-slate-200 shadow-lg transition hover:border-sky-400/60 hover:bg-slate-800 active:scale-95"
                    style={{
                      left: x,
                      top: y,
                      ...(action.active
                        ? { borderColor: 'rgba(52, 211, 153, 0.75)' }
                        : {})
                    }}
                  >
                    <span className="text-lg leading-none">{action.icon}</span>
                    <span className="font-mono text-[9px] font-bold">{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

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

        {/* Simulated tower: who owns runway 36L right now */}
        {tower && (
          <div className="w-44 rounded-lg border border-white/10 bg-slate-950/60 p-2 font-mono text-[9px] text-slate-300 backdrop-blur-md">
            <div className="flex justify-between border-b border-white/10 pb-1 mb-1">
              <span className="font-bold text-white/70">TORRE · RWY 36L</span>
              <span
                className={
                  tower.holder
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }
              >
                {towerState}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span className="truncate">{towerHolder ?? 'Pista despejada'}</span>
              <span>{tower.queue > 0 ? `${tower.queue} en espera` : 'sin cola'}</span>
            </div>
            {tower.holder && (
              <div className="mt-0.5 text-right text-slate-500">
                {Math.round(tower.heldFor)} s de ocupación
              </div>
            )}
          </div>
        )}

        {/* Aircraft loading panel: passengers, baggage and fuel, all live */}
        <div className="pointer-events-auto w-48 rounded-lg border border-white/10 bg-slate-950/80 p-2 font-mono text-[9px] text-slate-300 backdrop-blur-md">
          <div className="flex justify-between border-b border-white/10 pb-1 mb-1">
            <span className="font-bold text-white/70">AVIÓN · CARGA</span>
            <span className={ground?.gate ? 'text-sky-400' : 'text-slate-500'}>
              {ground?.gate ? `PUERTA ${ground.gate}` : 'SIN PUERTA'}
            </span>
          </div>

          {/* Passengers */}
          <div className="flex justify-between">
            <span>PAX</span>
            <span className="text-sky-300">
              {ground?.boarded ?? 0}/{ground?.passengers ?? 180}
            </span>
          </div>
          <div className="mb-1 h-1 w-full overflow-hidden rounded bg-slate-700">
            <div
              className="h-1 rounded bg-sky-400 transition-[width] duration-300"
              style={{ width: `${Math.round((ground?.progress ?? 0) * 100)}%` }}
            />
          </div>

          {/* Baggage */}
          <div className="flex justify-between">
            <span>BODEGA</span>
            <span className="text-emerald-300">
              {((ground?.baggageLoadedKg ?? 0) / 1000).toFixed(1)}/
              {((ground?.baggageKg ?? 2200) / 1000).toFixed(1)} t
            </span>
          </div>
          <div className="mb-1 h-1 w-full overflow-hidden rounded bg-slate-700">
            <div
              className="h-1 rounded bg-emerald-400 transition-[width] duration-300"
              style={{ width: `${Math.round((ground?.baggageProgress ?? 0) * 100)}%` }}
            />
          </div>

          {/* Fuel */}
          <div className="flex justify-between">
            <span>FUEL</span>
            <span className="text-amber-300">
              {(flightState.fuelKg / 1000).toFixed(1)}/
              {(flightState.fuelTargetKg / 1000).toFixed(1)} t
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded bg-slate-700">
            <div
              className={`h-1 rounded transition-[width] duration-300 ${
                flightState.refueling ? 'bg-amber-400 animate-pulse' : 'bg-amber-500'
              }`}
              style={{
                width: `${Math.min(
                  100,
                  Math.round(
                    (flightState.fuelKg / Math.max(1, flightState.fuelTargetKg)) * 100
                  )
                )}%`
              }}
            />
          </div>
          <div className="mt-1 grid grid-cols-4 gap-1 text-[8px]">
            {[25, 50, 75, 100].map((percent) => {
              const selected =
                Math.round(
                  (flightState.fuelTargetKg / flightState.fuelCapacityKg) * 100
                ) === percent;
              return (
                <button
                  key={percent}
                  type="button"
                  onClick={() => physicsRef.current.setFuelTargetPercent(percent)}
                  className={`rounded border px-0.5 py-0.5 transition ${
                    selected
                      ? 'border-amber-400/70 bg-amber-500/20 text-amber-200'
                      : 'border-white/10 bg-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {percent}%
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={toggleRefuel}
            className={`mt-1 w-full rounded border px-1 py-0.5 text-[8px] transition ${
              flightState.refueling
                ? 'border-amber-400/70 bg-amber-500/25 text-amber-200'
                : 'border-white/10 bg-slate-800/80 text-slate-300 hover:text-amber-200'
            }`}
          >
            {flightState.refueling ? 'DETENER REPOSTAJE' : 'REPOSTAR'}
          </button>

          <div className="mt-1 flex gap-1">
            <button
              type="button"
              onClick={() => toggleGround('boarding')}
              className={`flex-1 rounded px-1 py-0.5 text-center transition ${
                ground?.boarding
                  ? 'bg-sky-500/25 text-sky-200'
                  : 'bg-slate-800/80 text-slate-500 hover:text-sky-200'
              }`}
            >
              {ground?.boarding ? 'EMB. ON' : 'EMBARQUE'}
            </button>
            <button
              type="button"
              onClick={() => toggleGround('baggage')}
              className={`flex-1 rounded px-1 py-0.5 text-center transition ${
                ground?.baggage
                  ? 'bg-emerald-500/25 text-emerald-200'
                  : 'bg-slate-800/80 text-slate-500 hover:text-emerald-200'
              }`}
            >
              {ground?.baggage ? 'MAL. ON' : 'MALETAS'}
            </button>
          </div>
          {!ground?.gate && (
            <div className="mt-1 text-[8px] leading-tight text-slate-500">
              Aparca en una puerta para cargar
            </div>
          )}
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
            <div className="flex justify-between"><span>V</span><span className="text-sky-400">Menú radial</span></div>
            <div className="mt-1 border-t border-white/10 pt-1 text-[8px] leading-relaxed text-amber-300">
              Despegue: T → espera 145 kt → mantén S para rotar.
            </div>
          </div>
        )}
      </div>

      {serviceMsg && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-sky-400/40 bg-slate-950/90 px-3 py-1.5 font-mono text-[10px] text-sky-200 shadow-xl backdrop-blur-md">
          {serviceMsg}
        </div>
      )}
    </div>
  );
}

export default AirportGameView;
