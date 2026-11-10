import { useState } from 'react';
import { useGame } from '@/store/gameStore';
import { SettingsPanel } from './SettingsPanel';
import { CreditsModal } from './CreditsModal';

/** Key mappings for flight controls - easily extendable */
export const FLIGHT_CONTROLS = [
  { keys: ['W', '↑'], action: 'Elevador (Nose Up/Down)', description: 'Control de alizena vertical' },
  { keys: ['A', '←'], action: 'Alabeo (Bank Left/Right)', description: 'Control de alabeo lateral' },
  { keys: ['S', '↓'], action: 'Elevador (Nose Down/Up)', description: 'Control de alizena vertical' },
  { keys: ['D', '→'], action: 'Alabeo (Bank Right/Left)', description: 'Control de alabeo lateral' },
  { keys: ['Shift'], action: 'Throttle +', description: 'Aumentar potencia' },
  { keys: ['Ctrl'], action: 'Throttle -', description: 'Reducir potencia' },
  { keys: ['G'], action: 'Tren de aterrizaje', description: 'Subir/Bajar tren' },
  { keys: ['F'], action: 'Flaps', description: 'Cambiar superficie de aerolineria' },
];

/** Main menu hub - central entry point for the flight simulator */
export function MainMenu({ onStartFlight }: { onStartFlight?: () => void }) {
  const { username, logout } = useGame();
  const [showSettings, setShowSettings] = useState(false);
  const [showCredits, setShowCredits] = useState(false);

  const handleStartFlight = () => {
    onStartFlight?.();
  };

  return (
    <>
      <div className="flex min-h-screen w-full flex-col items-center justify-center px-4 bg-slate-950 text-white font-mono">
        {/* Logo / Title Section */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-emerald-400 mb-2 tracking-wider">
            ✈️ FLIGHT SIMULATOR
          </h1>
          <p className="text-sm text-slate-400">
            A320 Professional Edition | Welcome, {username || 'Guest'}
          </p>
        </div>

        {/* Menu Options Grid */}
        <div className="grid w-full max-w-md gap-3">
          <MenuButton 
            label="INICIAR VUELO" 
            icon="🛫" 
            onClick={handleStartFlight}
            className="bg-sky-600 hover:bg-sky-500"
          />
          <MenuButton 
            label="CONFIGURACIÓN" 
            icon="⚙️" 
            onClick={() => setShowSettings(true)}
            className="bg-slate-700 hover:bg-slate-600"
          />
          <MenuButton 
            label="CRÉDITOS" 
            icon="ℹ️" 
            onClick={() => setShowCredits(true)}
            className="bg-purple-600 hover:bg-purple-500"
          />
          <MenuButton 
            label="SALIR" 
            icon="🚪" 
            onClick={() => logout()}
            className="bg-red-600 hover:bg-red-500"
          />
        </div>

        {/* Footer */}
        <div className="mt-16 text-xs text-slate-500">
          <p>Tecla G: Bajar/levantar tren de aterrizaje | Shift/Ctrl: Throttle</p>
          <p>Press F for Flaps | A/D: Alabeo | W/S: Elevación</p>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsPanel 
          onClose={() => setShowSettings(false)} 
        />
      )}

      {/* Credits Modal */}
      {showCredits && (
        <CreditsModal 
          onClose={() => setShowCredits(false)} 
        />
      )}
    </>
  );
}

interface MenuButtonProps {
  label: string;
  icon: string;
  onClick: () => void;
  className?: string;
}

function MenuButton({ label, icon, onClick, className = '' }: MenuButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 hover:scale-[1.02] ${className}`}
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-left">{label}</span>
    </button>
  );
}