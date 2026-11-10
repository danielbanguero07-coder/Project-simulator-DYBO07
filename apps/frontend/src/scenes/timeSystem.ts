import * as THREE from 'three';

/**
 * Día types para control específico de cada fase
 */
export type DayPhase = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'night' | 'deep_night';

/**
 * Opciones del sistema de tiempo
 */
export interface TimeSystemOptions {
  /** Minutes of game time per real-world second. */
  timeScale?: number;
  /** Initial game time in hours (0-24). */
  initialHour?: number;
}

/**
 * Interfaces para los parámetros de clima por fase
 */
export interface PhaseWeatherParams {
  /** Color del cielo */
  skyColor: number;
  /** Color de niebla */
  fogColor: number;
  /** Intensidad de la luz solar */
  sunIntensity: number;
  /** Color de la luz solar */
  sunColor: number;
  /** Color de la luz ambiente */
  hemisphereColor: number;
  /** Color del horizonte */
  horizonColor: number;
  /** Color del zenit */
  zenithColor: number;
  /** Turbidity del cielo */
  turbidity: number;
  /** Rayleigh scattering */
  rayleigh: number;
  /** Mie coefficient */
  mieCoefficient: number;
  /** Niebla density */
  fogDensity: number;
  /** Luces nocturnas activas */
  nightLightsEnabled: boolean;
  /** Intensidad de luces nocturnas */
  nightLightsIntensity: number;
  /** Niebla nocturna */
  nightFog: boolean;
  /** Niebla diurna */
  dayFog: boolean;
}

/**
 * Parámetros de transición entre fases
 */
export interface PhaseTransition {
  progress: number; // 0 to 1
  fromPhase: DayPhase;
  toPhase: DayPhase | null;
}

/**
 * Constantes de colores para cada fase del día
 * Basados en referencias reales de aeropuertos
 */
const PHASE_COLORS: Record<DayPhase, PhaseWeatherParams> = {
  // Madrugada (00:00 - 05:00): Noche azul profunda, niebla nocturna
  deep_night: {
    skyColor: 0x0a0e2a, // Azul negro profundo
    fogColor: 0x1a1a3a,
    sunIntensity: 0.1,
    sunColor: 0x2a3a5a,
    hemisphereColor: 0x1a2a4a,
    horizonColor: 0x0a1225,
    zenithColor: 0x05081a,
    turbidity: 5,
    rayleigh: 0.8,
    mieCoefficient: 0.003,
    fogDensity: 0.0008,
    nightLightsEnabled: true,
    nightLightsIntensity: 1.0,
    nightFog: true,
    dayFog: false,
  },

  // Noche (20:00 - 24:00): Atmósfera nocturna, luces emisivas
  night: {
    skyColor: 0x15254a,
    fogColor: 0x2a3a6a,
    sunIntensity: 0.25,
    sunColor: 0x4a6a8a,
    hemisphereColor: 0x2a4a7a,
    horizonColor: 0x15254a,
    zenithColor: 0x0a1530,
    turbidity: 6,
    rayleigh: 1.2,
    mieCoefficient: 0.004,
    fogDensity: 0.0006,
    nightLightsEnabled: true,
    nightLightsIntensity: 0.8,
    nightFog: true,
    dayFog: false,
  },

  // Atardecer / Hora Dorada (18:00 - 20:00): Tonos purpúreos/dorados intensos
  dusk: {
    skyColor: 0x5d3a7a,
    fogColor: 0x4a2d5a,
    sunIntensity: 1.2,
    sunColor: 0xffa96a,
    hemisphereColor: 0x7a5d8a,
    horizonColor: 0x4a2d5a,
    zenithColor: 0x5d3a7a,
    turbidity: 8,
    rayleigh: 3,
    mieCoefficient: 0.008,
    fogDensity: 0.0004,
    nightLightsEnabled: true,
    nightLightsIntensity: 0.4,
    nightFog: false,
    dayFog: true,
  },

  // Tarde (15:00 - 18:00): Sol bajando al oeste, sombras largas y cálidas
  afternoon: {
    skyColor: 0x8a7fb5,
    fogColor: 0x9a8fc5,
    sunIntensity: 0.95,
    sunColor: 0xffc97a,
    hemisphereColor: 0x7fa5c5,
    horizonColor: 0x9a8fc5,
    zenithColor: 0x8a7fb5,
    turbidity: 5.5,
    rayleigh: 1.8,
    mieCoefficient: 0.005,
    fogDensity: 0.00025,
    nightLightsEnabled: false,
    nightLightsIntensity: 0,
    nightFog: false,
    dayFog: true,
  },

  // Mediodía (11:00 - 15:00): Sol en lo alto, máxima intensidad blanca
  noon: {
    skyColor: 0x8eb5f5,
    fogColor: 0xa8c8ff,
    sunIntensity: 1.2,
    sunColor: 0xffffff,
    hemisphereColor: 0x9eb8ff,
    horizonColor: 0xb8d4ff,
    zenithColor: 0x6da5ff,
    turbidity: 3,
    rayleigh: 2.5,
    mieCoefficient: 0.003,
    fogDensity: 0.0001,
    nightLightsEnabled: false,
    nightLightsIntensity: 0,
    nightFog: false,
    dayFog: false,
  },

  // Mañana (07:00 - 11:00): Cielo azul claro, luz solar nítida
  morning: {
    skyColor: 0x9ec1ff,
    fogColor: 0xc0d4ff,
    sunIntensity: 0.9,
    sunColor: 0xfff2d0,
    hemisphereColor: 0xc0e0ff,
    horizonColor: 0xd9e8ff,
    zenithColor: 0x7ab4ff,
    turbidity: 4,
    rayleigh: 1.5,
    mieCoefficient: 0.002,
    fogDensity: 0.00015,
    nightLightsEnabled: false,
    nightLightsIntensity: 0,
    nightFog: false,
    dayFog: false,
  },

  // Amanecer (05:00 - 07:00): Transición a tonos anaranjados y cálidos
  dawn: {
    skyColor: 0xffd9b8,
    fogColor: 0xffe5d0,
    sunIntensity: 0.7,
    sunColor: 0xffca8a,
    hemisphereColor: 0xffd9b8,
    horizonColor: 0xffe5d0,
    zenithColor: 0xf5d9a8,
    turbidity: 7,
    rayleigh: 2,
    mieCoefficient: 0.005,
    fogDensity: 0.0003,
    nightLightsEnabled: false,
    nightLightsIntensity: 0.2,
    nightFog: false,
    dayFog: true,
  },
};

/**
 * Gestión del tiempo y clima con fases del día sincronizadas
 */
export class TimeManager {
  private gameTime: number; // In hours (0-24)
  private timeScale: number;
  private readonly clock: THREE.Clock;

  constructor(options: TimeSystemOptions = {}) {
    this.gameTime = options.initialHour ?? 12;
    // 1 real minute = 1 game hour => 1 game hour per 60 real seconds => 1/60 hours per real second
    this.timeScale = options.timeScale ?? (1 / 60); 
    this.clock = new THREE.Clock();
  }

  update(): number {
    const delta = this.clock.getDelta();
    this.gameTime = (this.gameTime + delta * this.timeScale) % 24;
    return this.gameTime;
  }

  getFormattedTime(): string {
    const hours = Math.floor(this.gameTime);
    const minutes = Math.floor((this.gameTime - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} GMT`;
  }

  /**
   * Obtiene la fase del día actual basada en la hora del juego
   */
  getCurrentPhase(): DayPhase {
    const hour = this.gameTime;
    
    if (hour >= 0 && hour < 5) return 'deep_night';
    if (hour >= 5 && hour < 7) return 'dawn';
    if (hour >= 7 && hour < 11) return 'morning';
    if (hour >= 11 && hour < 15) return 'noon';
    if (hour >= 15 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 20) return 'dusk';
    if (hour >= 20 && hour < 24) return 'night';
    
    return 'morning'; // Fallback
  }

  /**
   * Calcula la transición entre fases con un progress (0-1)
   */
  getPhaseTransition(): PhaseTransition {
    const hour = this.gameTime;
    
    // Definir los límites de cada fase
    const phaseLimits: Array<{end: number; phase: DayPhase}> = [
      {end: 5, phase: 'deep_night'},
      {end: 7, phase: 'dawn'},
      {end: 11, phase: 'morning'},
      {end: 15, phase: 'noon'},
      {end: 18, phase: 'afternoon'},
      {end: 20, phase: 'dusk'},
      {end: 24, phase: 'night'},
    ];
    
    // Encontrar la fase actual y la siguiente
    let currentPhase: DayPhase = 'morning';
    let nextPhase: DayPhase | null = null;
    let progress = 0;
    
    for (let i = 0; i < phaseLimits.length; i++) {
      const {end, phase} = phaseLimits[i];
      if (hour >= (i === 0 ? 0 : phaseLimits[i-1].end) && hour < end) {
        currentPhase = phase;
        if (i < phaseLimits.length - 1) {
          nextPhase = phaseLimits[i + 1].phase;
          progress = (hour - (i === 0 ? 0 : phaseLimits[i-1].end)) / (end - (i === 0 ? 0 : phaseLimits[i-1].end));
        }
        break;
      }
    }
    
    return { progress, fromPhase: currentPhase, toPhase: nextPhase };
  }

  /**
   * Interpolación de color entre dos valores hex
   */
  private lerpColor(color1: number, color2: number, t: number): number {
    const r = THREE.MathUtils.lerp(
      (color1 >> 16) & 0xff,
      (color2 >> 16) & 0xff,
      t
    );
    const g = THREE.MathUtils.lerp(
      (color1 >> 8) & 0xff,
      (color2 >> 8) & 0xff,
      t
    );
    const b = THREE.MathUtils.lerp(
      color1 & 0xff,
      color2 & 0xff,
      t
    );
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  }

  /**
   * Obtiene parámetros meteorológicos interpolados entre fases
   */
  getWeatherParams(): PhaseWeatherParams {
    const transition = this.getPhaseTransition();
    const {fromPhase, toPhase, progress} = transition;
    
    if (!toPhase || progress === 0) {
      return PHASE_COLORS[fromPhase];
    }
    
    const fromParams = PHASE_COLORS[fromPhase];
    const toParams = PHASE_COLORS[toPhase];
    
    // Helper to check if toPhase is night-related
    const toIsNightPhase = (phase: DayPhase): boolean => phase === 'night' || phase === 'deep_night';
    const toIsDayFogPhase = (phase: DayPhase): boolean => 
      phase === 'dawn' || phase === 'morning' || phase === 'afternoon' || phase === 'noon';

    // Interpolación de colores
    return {
      skyColor: this.lerpColor(fromParams.skyColor, toParams.skyColor, progress),
      fogColor: this.lerpColor(fromParams.fogColor, toParams.fogColor, progress),
      sunIntensity: THREE.MathUtils.lerp(fromParams.sunIntensity, toParams.sunIntensity, progress),
      sunColor: this.lerpColor(fromParams.sunColor, toParams.sunColor, progress),
      hemisphereColor: this.lerpColor(fromParams.hemisphereColor, toParams.hemisphereColor, progress),
      horizonColor: this.lerpColor(fromParams.horizonColor, toParams.horizonColor, progress),
      zenithColor: this.lerpColor(fromParams.zenithColor, toParams.zenithColor, progress),
      turbidity: THREE.MathUtils.lerp(fromParams.turbidity, toParams.turbidity, progress),
      rayleigh: THREE.MathUtils.lerp(fromParams.rayleigh, toParams.rayleigh, progress),
      mieCoefficient: THREE.MathUtils.lerp(fromParams.mieCoefficient, toParams.mieCoefficient, progress),
      fogDensity: THREE.MathUtils.lerp(fromParams.fogDensity, toParams.fogDensity, progress),
      nightLightsEnabled: toIsNightPhase(toPhase) || 
                           (fromPhase === 'dusk' && toPhase === 'night' && progress > 0.3),
      nightLightsIntensity: THREE.MathUtils.lerp(fromParams.nightLightsIntensity, toParams.nightLightsIntensity, progress),
      nightFog: toIsNightPhase(toPhase),
      dayFog: toIsDayFogPhase(toPhase) ||
              (fromPhase === 'dusk' && toPhase === 'night' && progress < 0.7),
    };
  }

  /**
   * Returns 0 (night) to 1 (day) for smooth transitions
   * Updated to support finer granularity of day phases
   */
  getDayIntensity(): number {
    const hour = this.gameTime;
    
    // Madrugada profunda (00:00 - 05:00): intensidad 0
    if (hour >= 0 && hour < 5) return THREE.MathUtils.lerp(0, 0.15, (hour - 0) / 5);
    
    // Amanecer (05:00 - 07:00): transición de 0.15 a 0.5
    if (hour >= 5 && hour < 7) return THREE.MathUtils.lerp(0.15, 0.5, (hour - 5) / 2);
    
    // Mañana (07:00 - 11:00): 0.5 a 0.85
    if (hour >= 7 && hour < 11) return THREE.MathUtils.lerp(0.5, 0.85, (hour - 7) / 4);
    
    // Mediodía (11:00 - 15:00): máximo 1.0
    if (hour >= 11 && hour < 15) return THREE.MathUtils.lerp(0.85, 1.0, (hour - 11) / 4);
    
    // Tarde (15:00 - 18:00): descendencia de 1.0 a 0.85
    if (hour >= 15 && hour < 18) return THREE.MathUtils.lerp(1.0, 0.85, (hour - 15) / 3);
    
    // Atardecer (18:00 - 20:00): transición de 0.85 a 0.15
    if (hour >= 18 && hour < 20) return THREE.MathUtils.lerp(0.85, 0.15, (hour - 18) / 2);
    
    // Noche (20:00 - 24:00): 0.15 a 0
    return THREE.MathUtils.lerp(0.15, 0, (hour - 20) / 4);
  }

  /**
   * Check if it's nighttime (for legacy compatibility)
   */
  isNight(): boolean {
    const hour = this.gameTime;
    return hour >= 20 || hour < 5;
  }

  /**
   * Get current hour for external access
   */
  getHour(): number {
    return this.gameTime;
  }

  /**
   * Set hour manually (for testing or external control)
   */
  setHour(hour: number): void {
    this.gameTime = THREE.MathUtils.clamp(hour % 24, 0, 24);
  }
}