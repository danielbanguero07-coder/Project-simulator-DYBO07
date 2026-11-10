import { useEffect, useRef, useState } from 'react';
import {
  createQualityDemo,
  type DemoStats,
  type QualityDemoHandle,
  type QualityTier,
} from '@/scenes/qualityDemo';
import type { TextureQualityCap } from '@/scenes/textureStreaming';

interface QualityDemoProps {
  tier: QualityTier;
}

const TEXTURE_CAPS: Array<{ value: TextureQualityCap; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 1024, label: '1K' },
  { value: 2048, label: '2K' },
  { value: 4096, label: '4K' },
];

function formatSize(size: number): string {
  if (size >= 4096) return '4K';
  if (size >= 2048) return '2K';
  if (size >= 1024) return '1K';
  return `${size}px`;
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

const TIER_INFO: Record<
  QualityTier,
  { title: string; badge: string; description: string; bullets: string[] }
> = {
  2: {
    title: 'Nivel 2 — A320 Simulador de Vuelo',
    badge: 'Simulación en tiempo real',
    description:
      'Simulador de vuelo comercial 3D con A320. Control total de motor, flaps, tren de aterrizaje. Física simplificada de rodaje y ascenso. HUD avanzado con PFD.',
    bullets: [
      'Control de throttle: W/S o Shift/Ctrl',
      'Timón y alabeo: A/D o flechas',
      'Elevación: W/S o flechas arriba/abajo',
      'Flaps: 0-3, Tren: G, Vr ~140 kts',
      'HUD PFD: velocidad, altitud, rumbo, pitch/roll',
      'Rendering 4K con streaming por densidad',
    ],
  },
  3: {
    title: 'Nivel 3 — A320 Premium Flight Sim',
    badge: '40–60 FPS',
    description:
      'Simulador de vuelo premium con A320. Hora dorada, bloom, MSAA adaptativo, charcos reflectantes y materiales con clearcoat.',
    bullets: [
      'Hora dorada con sombras largas y cielo cálido',
      'MeshPhysicalMaterial (clearcoat, clearcoatRoughness)',
      'Bloom + MSAA adaptativo + tone mapping ACES',
      'Charco con reflejos de entorno y luces más densas',
      'Avión con winglets, luces de baliza intermitentes',
      'Texturas 4K con streaming por densidad de píxeles',
    ],
  },
};

export function QualityDemo({ tier }: QualityDemoProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<QualityDemoHandle | null>(null);
  const [stats, setStats] = useState<DemoStats>({ fps: 0, drawCalls: 0, triangles: 0 });
  const [uiVisible, setUiVisible] = useState(true);
  const [textureCap, setTextureCap] = useState<TextureQualityCap>('auto');
  const info = TIER_INFO[tier];

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const handle = createQualityDemo(host, tier, setStats);
    handleRef.current = handle;
    return () => {
      handle.dispose();
      handleRef.current = null;
    };
  }, [tier]);

  useEffect(() => {
    handleRef.current?.setTextureQuality(textureCap);
  }, [textureCap, tier]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <div ref={hostRef} className="absolute inset-0" />

      {/* Top-left info */}
      {uiVisible && (
        <div className="pointer-events-none absolute left-4 top-4 max-w-md rounded-xl border border-white/10 bg-slate-950/70 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                tier === 3 ? 'bg-amber-400 text-amber-950' : 'bg-sky-400 text-sky-950'
              }`}
            >
              Tier {tier}
            </span>
            <span className="text-[11px] text-slate-400">{info.badge}</span>
          </div>
          <h1 className="mt-2 text-lg font-bold leading-tight">{info.title}</h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">{info.description}</p>
          <ul className="mt-2 space-y-1 text-[11px] text-slate-400">
            {info.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-1.5">
                <span className="text-slate-500">•</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Aircraft models:{' '}
            <a
              className="underline hover:text-slate-300"
              href="https://github.com/amvlab/aircraft-models"
              target="_blank"
              rel="noreferrer"
            >
              amvlab/aircraft-models
            </a>{' '}
            · CC BY 4.0
          </p>
        </div>
      )}

      {/* Top-right stats */}
      {uiVisible && (
        <div className="pointer-events-none absolute right-4 top-4 w-60 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 font-mono text-[11px] text-slate-300 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500">FPS</span>
            <span className={stats.fps >= 55 ? 'text-emerald-400' : stats.fps >= 30 ? 'text-amber-400' : 'text-red-400'}>
              {stats.fps || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500">Draw calls</span>
            <span>{stats.drawCalls || '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500">Triangles</span>
            <span>{stats.triangles ? stats.triangles.toLocaleString('es-ES') : '—'}</span>
          </div>
          <div className="mt-1.5 border-t border-white/10 pt-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">GPU</span>
              <span
                className={`min-w-0 truncate text-right ${stats.integratedGpu ? 'text-amber-400' : 'text-emerald-400'}`}
                title={stats.gpu}
              >
                {stats.gpu || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500">Escala render</span>
              <span>{Math.round((stats.renderScale ?? 1) * 100)}%</span>
            </div>
          </div>
          {stats.integratedGpu && (
            <p className="mt-1.5 text-[9px] leading-tight text-amber-300/90">
              Integrada en uso · GTX 1650 inactiva
            </p>
          )}
        </div>
      )}

      {/* Streaming panel */}
      {uiVisible && stats.stream && (
        <div className="absolute right-4 top-44 w-64 rounded-lg border border-white/10 bg-slate-950/75 p-3 font-mono text-[11px] text-slate-300 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="font-sans text-[11px] font-semibold text-white">Texturas 4K · streaming</span>
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              LIVE
            </span>
          </div>

          <div className="mt-2 flex gap-1">
            {TEXTURE_CAPS.map((option) => (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => setTextureCap(option.value)}
                className={`flex-1 rounded px-1 py-1 text-[10px] font-semibold transition ${
                  textureCap === option.value
                    ? 'bg-sky-500 text-white'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[9px] leading-tight text-slate-500">
            Auto = por distancia · 1K/2K/4K = resolución fija
          </p>

          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-slate-500">VRAM texturas</span>
            <span>
              {formatMb(stats.stream.residentBytes)} / {formatMb(stats.stream.budgetBytes)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-500 transition-all"
              style={{
                width: `${Math.min(100, (stats.stream.residentBytes / stats.stream.budgetBytes) * 100)}%`,
              }}
            />
          </div>

          <div className="mt-2.5 space-y-1">
            {stats.stream.assets.map((asset: any) => (
              <div key={asset.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-400">{asset.label}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <span
                    className={
                      asset.currentSize >= asset.desiredSize ? 'text-emerald-400' : 'text-amber-400'
                    }
                  >
                    {formatSize(asset.currentSize)}
                  </span>
                  {asset.currentSize < asset.desiredSize && (
                    <span className="text-slate-500">→ {formatSize(asset.desiredSize)}</span>
                  )}
                  {asset.loading && (
                    <span className="inline-block h-2 w-2 animate-spin rounded-full border border-sky-400 border-t-transparent" />
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
            <span>Cargadas {stats.stream.loaded}</span>
            <span>En cola {stats.stream.pending}</span>
            <span>Evictadas {stats.stream.evicted}</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            {stats.stream.lastLoadSize
              ? `Última ${formatSize(stats.stream.lastLoadSize)}: ${stats.stream.lastLoadMs} ms`
              : 'Esperando streaming…'}
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/75 p-1.5 shadow-2xl backdrop-blur">
        <a
          href="/?scene=2"
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            tier === 2 ? 'bg-sky-500 text-white' : 'text-slate-300 hover:bg-white/10'
          }`}
        >
          Nivel 2
        </a>
        <a
          href="/?scene=3"
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            tier === 3 ? 'bg-amber-400 text-amber-950' : 'text-slate-300 hover:bg-white/10'
          }`}
        >
          Nivel 3
        </a>
        <span className="mx-1 h-5 w-px bg-white/15" />
        <a href="/" className="rounded-lg px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10">
          Volver al juego
        </a>
        <button
          type="button"
          onClick={() => setUiVisible((visible) => !visible)}
          className="rounded-lg px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
        >
          {uiVisible ? 'Ocultar UI' : 'Mostrar UI'}
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg bg-slate-950/60 px-2.5 py-1.5 text-[11px] text-slate-400 backdrop-blur">
        Arrastra para orbitar · Rueda para zoom
      </div>
    </div>
  );
}

export default QualityDemo;
