import React from 'react';
import type { FlightState } from '@/scenes/flightPhysics';
import { type AirportDefinition } from '@/scenes/airports';
import { drawSatelliteBackground } from '@/scenes/mapBackground';
import {
  createProjection,
  fitProjection,
  getHomeAirport,
  getMapAirports,
  mapPhaseLabel,
  trueHeadingFromYaw,
  type MapAircraft,
  type MapProjection
} from '@/scenes/mapMarkers';

interface WorldMapProps {
  state: FlightState;
  isRealWorld: boolean;
  getTrafficMarkers?: () => MapAircraft[];
  onSelectAirport?: (airport: AirportDefinition) => void;
  onClose: () => void;
}

const MAP_W = 880;
const MAP_H = 560;

function markerColor(phase: string): string {
  if (['airborne', 'approach', 'takeoff', 'holding', 'landing'].includes(phase)) return 'bg-sky-400';
  if (['taxiIn', 'taxiOut', 'rollout', 'lineup'].includes(phase)) return 'bg-amber-300';
  return 'bg-slate-300';
}

export function WorldMap({ state, isRealWorld, getTrafficMarkers, onSelectAirport, onClose }: WorldMapProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [markers, setMarkers] = React.useState<MapAircraft[]>([]);
  const [view, setView] = React.useState<'world' | 'player'>('world');
  const [playerCenter, setPlayerCenter] = React.useState<{ x: number; z: number } | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const airports = React.useMemo(() => getMapAirports(isRealWorld), [isRealWorld]);
  const home = React.useMemo(() => getHomeAirport(isRealWorld), [isRealWorld]);

  const projection: MapProjection = React.useMemo(() => {
    if (view === 'player') {
      const center = playerCenter ?? { x: state.position.x, z: state.position.z };
      return createProjection(MAP_W, MAP_H, center.x, center.z, MAP_W / 30000);
    }
    return fitProjection(MAP_W, MAP_H, airports);
  }, [view, airports, playerCenter, state.position.x, state.position.z]);

  // Satellite-style background, redrawn when the view or the mode changes.
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

  const player = React.useMemo(
    () => ({
      point: projection.toPx(state.position.x, state.position.z),
      headingDeg: trueHeadingFromYaw(state.rotation.y)
    }),
    [state.position.x, state.position.z, state.rotation.y, projection]
  );

  const inView = markers.filter((m) => projection.inView(m.x, m.z));
  const selected = markers.find((m) => m.id === selectedId) ?? null;
  const selectedDistanceKm = selected
    ? Math.hypot(selected.x - state.position.x, selected.z - state.position.z) / 1000
    : 0;

  const openPlayerView = () => {
    setPlayerCenter({ x: state.position.x, z: state.position.z });
    setView('player');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-[880px] max-w-[94vw] overflow-hidden rounded-xl border border-white/20 bg-slate-950/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
            Mapa · Navegación {isRealWorld ? '· Mundo real' : '· Procedural'}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setView('world')}
              className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                view === 'world' ? 'bg-sky-400/25 text-sky-200' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              Mundo
            </button>
            <button
              type="button"
              onClick={openPlayerView}
              className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                view === 'player' ? 'bg-sky-400/25 text-sky-200' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              Jugador
            </button>
            {view === 'player' && (
              <button
                type="button"
                onClick={() => setPlayerCenter({ x: state.position.x, z: state.position.z })}
                className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-300 hover:bg-white/10"
              >
                Centrar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              title="Cerrar (M o Esc)"
              className="ml-1 rounded bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-300 hover:bg-white/10"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="relative aspect-[880/560] w-full">
          <canvas ref={canvasRef} width={MAP_W} height={MAP_H} className="absolute inset-0 h-full w-full" />

          <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${MAP_W} ${MAP_H}`}>
            {airports
              .filter((airport) => airport.code !== home.code)
              .map((airport) => {
                const from = projection.toPx(home.x, home.z);
                const to = projection.toPx(airport.x, airport.z);
                return (
                  <line
                    key={airport.code}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="rgba(56, 189, 248, 0.35)"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                );
              })}
          </svg>

          {airports.map((airport) => {
            const point = projection.toPx(airport.x, airport.z);
            if (!projection.inView(airport.x, airport.z)) return null;
            const isHomeAirport = airport.code === home.code;
            return (
              <button
                key={airport.code}
                type="button"
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${(point.x / MAP_W) * 100}%`, top: `${(point.y / MAP_H) * 100}%` }}
                title={`${airport.code} · ${airport.city} — volar la cámara`}
                onClick={() => {
                  onSelectAirport?.(airport);
                  onClose();
                }}
              >
                <span
                  className={`block h-2 w-2 rounded-full ring-1 ${
                    isHomeAirport ? 'bg-amber-300 ring-amber-200/70' : 'bg-sky-400 ring-sky-200/40'
                  }`}
                />
                <span
                  className={`mt-0.5 text-[9px] font-bold leading-none ${
                    isHomeAirport ? 'text-amber-200' : 'text-sky-200/90'
                  }`}
                >
                  {airport.code}
                </span>
              </button>
            );
          })}

          {inView.map((marker) => {
            const point = projection.toPx(marker.x, marker.z);
            const isSelected = marker.id === selectedId;
            return (
              <button
                key={marker.id}
                type="button"
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${(point.x / MAP_W) * 100}%`, top: `${(point.y / MAP_H) * 100}%` }}
                title={`${marker.label} · ${mapPhaseLabel(marker.phase)} · ${Math.round(marker.altitude)} m`}
                onClick={() => setSelectedId(isSelected ? null : marker.id)}
              >
                <span
                  className={`block h-3.5 w-3.5 ${markerColor(marker.phase)} ${
                    isSelected ? 'ring-2 ring-white' : ''
                  } [clip-path:polygon(50%_0%,0%_100%,100%_100%)]`}
                  style={{ transform: `rotate(${marker.headingDeg}deg)` }}
                />
                <span className="mt-0.5 rounded bg-slate-950/70 px-1 text-[8px] font-bold leading-tight text-sky-200">
                  {marker.label}
                </span>
              </button>
            );
          })}

          {projection.inView(state.position.x, state.position.z) && (
            <div
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${(player.point.x / MAP_W) * 100}%`, top: `${(player.point.y / MAP_H) * 100}%` }}
              title="Tú"
            >
              <span
                className="block h-4 w-4 bg-emerald-300 [clip-path:polygon(50%_0%,0%_100%,100%_100%)]"
                style={{ transform: `rotate(${player.headingDeg}deg)` }}
              />
              <span className="mt-0.5 rounded bg-slate-950/70 px-1 text-[8px] font-bold leading-tight text-emerald-200">
                TÚ
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-3 py-1.5 text-[10px] font-mono text-slate-400">
          {selected ? (
            <span className="text-slate-200">
              <span className="font-bold text-sky-300">{selected.label}</span> · {mapPhaseLabel(selected.phase)}
              {selected.destination ? ` → ${selected.destination}` : ''} · {Math.round(selected.altitude)} m ·{' '}
              {Math.round(selected.speed * 3.6)} km/h · a {selectedDistanceKm.toFixed(1)} km de ti
            </span>
          ) : (
            <span>Toca un avión para ver sus datos · Toca un aeropuerto para volar la cámara</span>
          )}
          <span className="text-sky-300">
            {inView.length} avión{inView.length === 1 ? '' : 'es'} en vista
          </span>
        </div>
      </div>
    </div>
  );
}
