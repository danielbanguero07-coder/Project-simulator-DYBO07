import React from 'react';
import type { FlightState } from '@/scenes/flightPhysics';
import { ALL_AIRPORTS, HOME_AIRPORT, type AirportDefinition } from '@/scenes/airports';

interface NavigationMapProps {
  state: FlightState;
  onSelectAirport?: (airport: AirportDefinition) => void;
}

// The map covers the whole playable region: the home hub plus every remote
// airport in the world catalogue.
const MAP_SIZE = 200; // px
const WORLD_LIMIT = 7200; // metres from the home hub

function toMap(x: number, z: number) {
  return {
    x: ((x + WORLD_LIMIT) / (WORLD_LIMIT * 2)) * MAP_SIZE,
    y: ((z + WORLD_LIMIT) / (WORLD_LIMIT * 2)) * MAP_SIZE,
  };
}

export function NavigationMap({ state, onSelectAirport }: NavigationMapProps) {
  const player = React.useMemo(() => {
    const px = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, state.position.x));
    const pz = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, state.position.z));
    const point = toMap(px, pz);
    const home = toMap(HOME_AIRPORT.x, HOME_AIRPORT.z);
    return {
      ...point,
      home,
      headingDeg: (state.rotation.y * 180) / Math.PI,
    };
  }, [state.position.x, state.position.z, state.rotation.y]);

  const nearest = React.useMemo(() => {
    let best = { code: HOME_AIRPORT.code, distance: Infinity };
    for (const airport of ALL_AIRPORTS) {
      const distance = Math.hypot(
        airport.x - state.position.x,
        airport.z - state.position.z
      );
      if (distance < best.distance) best = { code: airport.code, distance };
    }
    return best;
  }, [state.position.x, state.position.z]);

  return (
    <div className="pointer-events-auto overflow-hidden rounded-xl border border-white/20 bg-slate-950/90 shadow-2xl backdrop-blur-md max-w-xs">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">NavSystem · México</div>
        <div className="text-[10px] font-mono text-emerald-400">
          {Math.round(state.position.x)}, {Math.round(state.position.z)}
        </div>
      </div>

      <div className="relative h-[200px] w-[200px] overflow-hidden rounded-t-xl bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900">
        {/* Route network from the home hub to every remote airport. */}
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}>
          {ALL_AIRPORTS.filter((airport) => airport.code !== HOME_AIRPORT.code).map((airport) => {
            const target = toMap(airport.x, airport.z);
            return (
              <line
                key={airport.code}
                x1={player.home.x}
                y1={player.home.y}
                x2={target.x}
                y2={target.y}
                stroke="rgba(56, 189, 248, 0.35)"
                strokeWidth="0.8"
                strokeDasharray="3 3"
              />
            );
          })}
          {/* Home runway (36/18) for orientation. */}
          <line
            x1={player.home.x}
            y1={player.home.y - 12}
            x2={player.home.x}
            y2={player.home.y + 12}
            stroke="rgba(226, 232, 240, 0.6)"
            strokeWidth="1.6"
          />
        </svg>

        {/* Airports */}
        {ALL_AIRPORTS.map((airport) => {
          const point = toMap(airport.x, airport.z);
          const isHome = airport.code === HOME_AIRPORT.code;
          return (
            <div
              key={airport.code}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${point.x}px`, top: `${point.y}px` }}
              title={`${airport.code} · ${airport.city}`}
            >
              <span
                className={`block h-1.5 w-1.5 rounded-full ring-1 ${
                  isHome
                    ? 'bg-amber-300 ring-amber-200/70'
                    : 'bg-sky-400 ring-sky-200/40'
                }`}
              />
              <span
                className={`mt-0.5 text-[7px] font-bold leading-none ${
                  isHome ? 'text-amber-200' : 'text-sky-200/90'
                }`}
              >
                {airport.code}
              </span>
            </div>
          );
        })}

        {/* Player aircraft */}
        <div
          className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 transition-transform duration-75"
          style={{
            left: `${player.x}px`,
            top: `${player.y}px`,
            transform: `rotate(${player.headingDeg + 180}deg)`,
          }}
        >
          <div className="h-full w-full bg-emerald-300 [clip-path:polygon(50%_0%,0%_100%,100%_100%)]" />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-t border-white/10 px-2 py-1.5">
        {ALL_AIRPORTS.map((airport) => (
          <button
            key={airport.code}
            type="button"
            title={`${airport.name} · ${airport.city}`}
            onClick={() => onSelectAirport?.(airport)}
            className={`rounded px-1.5 py-0.5 text-[9px] font-bold transition ${
              airport.code === HOME_AIRPORT.code
                ? 'bg-amber-400/20 text-amber-200 hover:bg-amber-400/35'
                : 'bg-white/5 text-sky-200/85 hover:bg-sky-400/20'
            }`}
          >
            {airport.code}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between px-3 py-1 text-[9px] font-mono text-slate-400">
        <span>Más cercano: {nearest.code}</span>
        <span>{(nearest.distance / 1000).toFixed(1)} km</span>
      </div>
    </div>
  );
}
