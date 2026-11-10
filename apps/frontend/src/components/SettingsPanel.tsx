import { useState } from 'react';
import { FLIGHT_CONTROLS } from './MainMenu';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'graphics' | 'controls'>('graphics');
  
  // Graphics settings state
  const [qualityTier, setQualityTier] = useState<2 | 3>(() => {
    return Number(localStorage.getItem('sim_quality_tier') || '3') as 2 | 3;
  });
  const [bloomEnabled, setBloomEnabled] = useState<boolean>(() => {
    return localStorage.getItem('sim_bloom') !== 'false';
  });
  const [msaaEnabled, setMsaaEnabled] = useState<boolean>(() => {
    return localStorage.getItem('sim_msaa') !== 'false';
  });
  const [resolutionMode, setResolutionMode] = useState<'auto' | 'native'>(() => {
    return (localStorage.getItem('sim_resolution') as 'auto' | 'native') || 'auto';
  });

  // Controls remapping state
  const [controls, setControls] = useState(FLIGHT_CONTROLS);
  const [remappingIndex, setRemappingIndex] = useState<number | null>(null);

  const handleSaveGraphics = () => {
    localStorage.setItem('sim_quality_tier', String(qualityTier));
    localStorage.setItem('sim_bloom', String(bloomEnabled));
    localStorage.setItem('sim_msaa', String(msaaEnabled));
    localStorage.setItem('sim_resolution', resolutionMode);
    onClose();
  };

  const handleKeyDownRemap = (e: React.KeyboardEvent, index: number) => {
    e.preventDefault();
    const newKey = e.key.toUpperCase();
    const updated = [...controls];
    updated[index] = { ...updated[index], keys: [newKey] };
    setControls(updated);
    setRemappingIndex(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md font-mono select-none">
      <div className="w-full max-w-lg rounded-2xl border border-white/20 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            ⚙️ Panel de Configuración
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl font-bold transition"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-white/10 pb-3">
          <button
            onClick={() => setActiveTab('graphics')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'graphics'
                ? 'bg-sky-600 text-white shadow-lg'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            🖥️ Gráficos & Rendimiento
          </button>
          <button
            onClick={() => setActiveTab('controls')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'controls'
                ? 'bg-sky-600 text-white shadow-lg'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            🎮 Controles & Teclas
          </button>
        </div>

        {/* Tab Content: Graphics */}
        {activeTab === 'graphics' && (
          <div className="space-y-5 text-sm">
            {/* Quality Tier */}
            <div className="flex items-center justify-between">
              <div>
                <label className="block font-bold text-white">Nivel de Calidad (Tier)</label>
                <span className="text-xs text-slate-400">Tier 2 (Económico) o Tier 3 (Premium 4K)</span>
              </div>
              <div className="flex rounded-lg border border-white/10 bg-slate-800 p-1">
                {[2, 3].map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setQualityTier(tier as 2 | 3)}
                    className={`rounded px-3 py-1 text-xs font-bold transition ${
                      qualityTier === tier ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Tier {tier}
                  </button>
                ))}
              </div>
            </div>

            {/* Bloom Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="block font-bold text-white">Bloom (Resplandor)</label>
                <span className="text-xs text-slate-400">Efecto HDR en luces de pista y atardecer</span>
              </div>
              <input
                type="checkbox"
                checked={bloomEnabled}
                onChange={(e) => setBloomEnabled(e.target.checked)}
                className="h-5 w-5 accent-sky-500 cursor-pointer rounded"
              />
            </div>

            {/* MSAA Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="block font-bold text-white">MSAA (Antialiasing)</label>
                <span className="text-xs text-slate-400">Suavizado de bordes y geometría 3D</span>
              </div>
              <input
                type="checkbox"
                checked={msaaEnabled}
                onChange={(e) => setMsaaEnabled(e.target.checked)}
                className="h-5 w-5 accent-sky-500 cursor-pointer rounded"
              />
            </div>

            {/* Dynamic Resolution */}
            <div className="flex items-center justify-between">
              <div>
                <label className="block font-bold text-white">Resolución Dinámica</label>
                <span className="text-xs text-slate-400">Auto (GPU integrada) o Native (4K/FHD completo)</span>
              </div>
              <div className="flex rounded-lg border border-white/10 bg-slate-800 p-1">
                {(['auto', 'native'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setResolutionMode(mode)}
                    className={`rounded px-3 py-1 text-xs font-bold uppercase transition ${
                      resolutionMode === mode ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: Controls */}
        {activeTab === 'controls' && (
          <div className="space-y-3 max-h-72 overflow-y-auto pr-2">
            <div className="text-xs text-slate-400 mb-2">
              Haz clic en cualquier tecla para remapear sus controles de vuelo:
            </div>
            {controls.map((item, idx) => (
              <div key={item.action} className="flex items-center justify-between rounded-xl bg-slate-800/80 p-3 border border-white/5">
                <div>
                  <div className="text-xs font-bold text-white">{item.action}</div>
                  <div className="text-[10px] text-slate-400">{item.description}</div>
                </div>
                <div>
                  {remappingIndex === idx ? (
                    <input
                      autoFocus
                      type="text"
                      maxLength={3}
                      onKeyDown={(e) => handleKeyDownRemap(e, idx)}
                      onBlur={() => setRemappingIndex(null)}
                      className="w-16 rounded bg-sky-600 px-2 py-1 text-center text-xs font-bold text-white focus:outline-none"
                      placeholder="Tecla"
                    />
                  ) : (
                    <button
                      onClick={() => setRemappingIndex(idx)}
                      className="rounded-lg border border-white/20 bg-slate-900 px-3 py-1 text-xs font-bold text-sky-400 hover:bg-sky-600 hover:text-white transition"
                    >
                      {item.keys.join(' / ')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer actions */}
        <div className="mt-8 flex gap-3 pt-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSaveGraphics}
            className="flex-1 rounded-xl bg-sky-600 py-2.5 text-xs font-semibold text-white hover:bg-sky-500 shadow-lg transition"
          >
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  );
}