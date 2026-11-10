interface CreditsModalProps {
  onClose: () => void;
}

export function CreditsModal({ onClose }: CreditsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md font-mono select-none">
      <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-slate-900 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            ℹ️ Créditos
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl font-bold transition"
          >
            ×
          </button>
        </div>
        <div className="space-y-4 text-sm">
          <div className="text-center">
            <p className="font-bold text-emerald-400 text-lg">A320 Flight Simulator</p>
            <p className="text-slate-300">Professional 3D Edition</p>
          </div>
          
          <div className="pt-4 border-t border-white/10">
            <p className="text-xs text-slate-400 mb-2">Tecnologías</p>
            <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
              <li>Three.js - Renderizado 3D WebGL</li>
              <li>React 18 - UI Framework</li>
              <li>Zustand - Gestión de estado</li>
              <li>Socket.IO - Comunicación en tiempo real</li>
            </ul>
          </div>

          <div className="pt-2 border-t border-white/5">
            <p className="text-xs text-slate-400 mb-2">Creador</p>
            <p className="text-xs text-sky-300">AngelStudio • AngelCode</p>
          </div>

          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs text-slate-500">Versión: 0.1.0 | Licencia: MIT</p>
          </div>
        </div>
      </div>
    </div>
  );
}