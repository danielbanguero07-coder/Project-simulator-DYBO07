import React from 'react';
import type { FlightState } from '@/scenes/flightPhysics';

interface FlightHUDProps {
  state: FlightState;
  onThrottleChange: (val: number) => void;
  onFlapsChange: (flaps: number) => void;
  onToggleGear: () => void;
  onMenuBack: () => void;
  gameTime?: string;
}

export function FlightHUD({ state, onThrottleChange, onFlapsChange, onToggleGear, onMenuBack, gameTime }: FlightHUDProps) {
  // rotation.x is negative when the nose points up (aircraft faces +Z).
  const pitchDeg = Math.round((-state.rotation.x * 180) / Math.PI);
  const rollDeg = Math.round((state.rotation.z * 180) / Math.PI);
  const headingDeg = Math.round(((state.rotation.y * 180) / Math.PI + 360) % 360);

  return (
    <div className="pointer-events-none absolute inset-0 font-mono text-white select-none overflow-hidden">
      {/* 1. TOP LEFT: Menu Button & Simul Time */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuBack}
          className="pointer-events-auto flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/80 px-3.5 py-2 text-xs font-bold text-white shadow-xl backdrop-blur-md transition hover:bg-slate-800"
        >
          ← Volver al Menú
        </button>

        <div className="pointer-events-auto rounded-lg border border-white/10 bg-slate-950/80 px-3 py-1.5 shadow-xl backdrop-blur-md text-xs">
          <span className="text-[10px] uppercase text-slate-500 mr-2">Hora</span>
          <span className="font-bold text-emerald-400">{gameTime || '--:-- GMT'}</span>
        </div>
      </div>

      {/* 2. TOP CENTER: Attitude & Heading Indicator (Attitude tape) */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
        <div className="pointer-events-auto flex items-center gap-5 rounded-xl border border-white/20 bg-slate-950/80 px-5 py-2.5 shadow-2xl backdrop-blur-md">
          <div className="text-center">
            <div className="text-[9px] uppercase tracking-wider text-slate-400">Pitch</div>
            <div className="text-lg font-bold text-sky-300">{pitchDeg}°</div>
          </div>
          <div className="h-6 w-px bg-white/10" />
          <div className="text-center">
            <div className="text-[9px] uppercase tracking-wider text-slate-400">Roll</div>
            <div className="text-lg font-bold text-sky-300">{rollDeg}°</div>
          </div>
          <div className="h-6 w-px bg-white/10" />
          <div className="text-center">
            <div className="text-[9px] uppercase tracking-wider text-slate-400">Rumbo (HDG)</div>
            <div className="text-lg font-bold text-amber-300">{headingDeg.toString().padStart(3, '0')}°</div>
          </div>
        </div>
      </div>

      {/* 3. MID-TOP LEFT: Airspeed Tape */}
      <div className="absolute top-16 left-4 z-20">
        <div className="pointer-events-auto rounded-xl border border-white/20 bg-slate-950/80 p-3 shadow-2xl backdrop-blur-md w-36">
          <div className="text-[9px] uppercase tracking-wider text-slate-400">Velocidad (IAS)</div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className={`text-2xl font-bold ${state.overspeedWarning ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`}>
              {Math.round(state.speedKts)}
            </span>
            <span className="text-[10px] text-slate-400">KTS</span>
          </div>
          {state.stallWarning && (
            <div className="mt-1 rounded bg-red-600/90 px-1.5 py-0.5 text-center text-[9px] font-bold tracking-widest text-white animate-bounce">
              ⚠️ STALL
            </div>
          )}
          {state.onGround && (
            <div className={`mt-1 rounded px-1.5 py-0.5 text-center text-[9px] font-bold tracking-wider ${
              state.speedKts >= 145 ? 'bg-emerald-600/90 text-white animate-pulse' : 'bg-slate-800/90 text-amber-300'
            }`}>
              {state.speedKts >= 145 ? 'S → ROTAR / DESPEGAR' : `DESPEGUE A ${Math.max(0, Math.ceil(145 - state.speedKts))} KT`}
            </div>
          )}
          {state.overspeedWarning && (
            <div className="mt-1 rounded bg-amber-500/90 px-1.5 py-0.5 text-center text-[9px] font-bold tracking-widest text-slate-950">
              ⚡ OVERSPEED
            </div>
          )}
        </div>
      </div>

      {/* 4. MID-TOP RIGHT: Altimeter & V/S Tape */}
      <div className="absolute top-16 right-4 z-20">
        <div className="pointer-events-auto rounded-xl border border-white/20 bg-slate-950/80 p-3 shadow-2xl backdrop-blur-md w-36 text-right">
          <div className="text-[9px] uppercase tracking-wider text-slate-400">Altitud (MSL)</div>
          <div className="flex items-baseline justify-end gap-1 mt-0.5">
            <span className="text-2xl font-bold text-emerald-400">
              {Math.round(state.altitudeFt).toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400">FT</span>
          </div>
          <div className="text-[9px] text-slate-400 mt-0.5">
            V/S: <span className={state.verticalSpeedFpm >= 0 ? 'text-sky-400' : 'text-amber-400'}>{Math.round(state.verticalSpeedFpm)} FPM</span>
          </div>
        </div>
      </div>

      {/* Center Reticle / Flight Director crosshairs cue */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative h-20 w-20 opacity-60">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-sky-400/60 -translate-y-1/2" />
          <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-sky-400/60 -translate-x-1/2" />
          <div className="absolute top-1/2 left-1/2 h-3.5 w-3.5 rounded-full border-2 border-sky-400 -translate-x-1/2 -translate-y-1/2" />
        </div>
      </div>

      {/* 5. BOTTOM RIGHT: Cockpit Controls (Throttle, Flaps, Gear) */}
      <div className="absolute bottom-6 right-4 z-20">
        <div className="pointer-events-auto rounded-xl border border-white/20 bg-slate-950/85 p-3 shadow-2xl backdrop-blur-md space-y-2">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-slate-400">Empuje / Throttle</div>
              <div className="flex items-center gap-2 mt-0.5">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={state.throttle}
                  onChange={(e) => onThrottleChange(parseFloat(e.target.value))}
                  className="w-24 accent-sky-500 cursor-pointer"
                />
                <span className="font-mono text-[10px] font-bold text-sky-400 w-8 text-right">
                  {Math.round(state.throttle * 100)}%
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onToggleGear}
                className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition border ${
                  state.gearDown
                    ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                    : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                🛞 Tren: {state.gearDown ? 'BAJO' : 'ARRIBA'}
              </button>

              <div className="flex rounded-lg border border-white/10 bg-slate-900 p-0.5 gap-0.5">
                {[0, 1, 2, 3].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => onFlapsChange(f)}
                    className={`rounded px-2 py-1 text-[10px] font-semibold transition ${
                      state.flaps === f
                        ? 'bg-sky-500 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    F{f === 3 ? 'ULL' : f}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[9px] text-slate-400 border-t border-white/10 pt-1.5">
            <span>Estado: <strong className={state.onGround ? 'text-amber-400' : 'text-emerald-400'}>{state.onGround ? 'En suelo' : 'En vuelo'}</strong></span>
            <span>Motores: <span className="text-emerald-400 font-bold">OK</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FlightHUD;