import React from 'react';
import type { FlightState } from '@/scenes/flightPhysics';
import { type AirportDefinition } from '@/scenes/airports';
import { drawSatelliteBackground } from '@/scenes/mapBackground';
import {
  createProjection,
  getHomeAirport,
  getMapAirports,
  mapPhaseLabel,
  trueHeadingFromYaw,
  type MapAircraft
} from '@/scenes/mapMarkers';

interface NavigationMapProps {
  state: FlightState;
  isRealWorld: boolean;
  getTrafficMarkers?: () => MapAircraft[];
  onSelectAirport?: (airport: AirportDefinition) => void;
}

// Local view, centred on MEX: the whole playable region in procedural mode,
// the ~10 km tile area in real mode.
const MAP_SIZE = 200; // px

function markerColor(phase: string): string {
  if (['airborne', 'approach', 'takeoff', 'holding', 'landing'].includes(phase)) return 'bg-sky-400';
  if (['taxiIn', 'taxiOut', 'rollout', 'lineup'].includes(phase)) return 'bg-amber-300';
  return 'bg-slate-300';
}

export function NavigationMap({ state, isRealWorld, getTrafficMarkers, onSelectAirport }: NavigationMapProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [markers, setMarkers] = React.useState<MapAircraft[]>([]);

  const airports = React.useMemo(() => getMapAirports(isRealWorld), [isRealWorld]);
  const home = React.useMemo(() => getHomeAirport(isRealWorld), [isRealWorld]);
  const projection = React.useMemo(() => {
    const span = isRealWorld ? 20000 : 14400;
    return createProjection(MAP_SIZE, MAP_SIZE, 0, 0, MAP_SIZE / span);
  }, [isRealWorld]);

  // Satellite-style background, redrawn when the mode changes.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawSatelliteBackground(ctx, { projection, realMode: isRealWorld });
  }, [projection, isRealWorld]);

  // Live traffic, 4 times per second.
  React.useEffect(() => {
    if (!getTrafficMarkers) return;
    const tick = () => setMarkers(getTrafficMarkers().filter((m) => m.visible));
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [getTrafficMarkers]);

  const player = React.useMemo(() => {
    const limit = isRealWorld ? 10000 : 7200;
    const px = Math.max(-limit, Math.min(limit, state.position.x));
    const pz = Math.max(-limit, Math.min(limit, state.position.z));
    const point = projection.toPx(px, pz);
    const homePoint = projection.toPx(home.x, home.z);
    return {
      ...point,
      home: homePoint,
      headingDeg: trueHeadingFromYaw(state.rotation.y)
    };
  }, [state.position.x, state.position.z, state.rotation.y, projection, home]);

  const nearest = React.useMemo(() => {
    let best = { code: home.code, distance: Infinity };
    for (const airport of airports) {
      const distance = Math.hypot(airport.x - state.position.x, airport.z - state.position.z);
      if (distance < best.distance) best = { code: airport.code, distance };
    }
    return best;
  }, [state.position.x, state.position.z, airports, home]);

  const inView = markers.filter((m) => projection.inView(m.x, m.z));

  return (
    <div className="pointer-events-auto overflow-hidden rounded-xl border border-white/20 bg-slate-950/90 shadow-2xl backdrop-blur-md max-w-xs">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">NavSystem · México</div>
        <div className="text-[10px] font-mono text-emerald-400">
          {Math.round(state.position.x)}, {Math.round(state.position.z)}
        </div>
      </div>

      <div className="relative h-[200px] w-[200px] overflow-hidden rounded-t-xl">
        {/* Satellite-style background (canvas, drawn once per mode). */}
        <canvas ref={canvasRef} width={MAP_SIZE} height={MAP_SIZE} className="absolute inset-0 h-full w-full" />

        {/* Route network from the home hub to every remote airport. */}
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}>
          {airports
            .filter((airport) => airport.code !== home.code)
            .map((airport) => {
              const target = projection.toPx(airport.x, airport.z);
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
        </svg>

        {/* Airports */}
        {airports.map((airport) => {
          const point = projection.toPx(airport.x, airport.z);
          if (!projection.inView(airport.x, airport.z)) return null;
          const isHomeAirport = airport.code === home.code;
          return (
            <div
              key={airport.code}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${point.x}px`, top: `${point.y}px` }}
              title={`${airport.code} · ${airport.city}`}
            >
              <span
                className={`block h-1.5 w-1.5 rounded-full ring-1 ${
                  isHomeAirport ? 'bg-amber-300 ring-amber-200/70' : 'bg-sky-400 ring-sky-200/40'
                }`}
              />
              <span
                className={`mt-0.5 text-[7px] font-bold leading-none ${
                  isHomeAirport ? 'text-amber-200' : 'text-sky-200/90'
                }`}
              >
                {airport.code}
              </span>
            </div>
          );
        })}

        {/* AI aircraft (en-route + airport traffic). */}
        {inView.map((marker) => {
          const point = projection.toPx(marker.x, marker.z);
          return (
            <div
              key={marker.id}
              className="absolute h-2.5 w-2.5"
              style={{
                left: `${point.x}px`,
                top: `${point.y}px`,
                transform: `translate(-50%, -50%) rotate(${marker.headingDeg}deg)`
              }}
              title={`${marker.label} · ${mapPhaseLabel(marker.phase)} · ${Math.round(marker.altitude)} m`}
            >
              <div className={`h-full w-full ${markerColor(marker.phase)} [clip-path:polygon(50%_0%,0%_100%,100%_100%)]`} />
            </div>
          );
        })}

        {/* Player aircraft */}
        <div
          className="absolute h-3 w-3"
          style={{
            left: `${player.x}px`,
            top: `${player.y}px`,
            transform: `translate(-50%, -50%) rotate(${player.headingDeg}deg)`
          }}
        >
          <div className="h-full w-full bg-emerald-300 [clip-path:polygon(50%_0%,0%_100%,100%_100%)]" />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-t border-white/10 px-2 py-1.5">
        {airports.map((airport) => (
          <button
            key={airport.code}
            type="button"
            title={`${airport.name} · ${airport.city}`}
            onClick={() => onSelectAirport?.(airport)}
            className={`rounded px-1.5 py-0.5 text-[9px] font-bold transition ${
              airport.code === home.code
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
        {inView.length > 0 && <span className="text-sky-300">{inView.length} avión{inView.length > 1 ? 'es' : ''}</span>}
      </div>
    </div>
  );
}
