import * as THREE from 'three';
import { Flight, FlightStatus, createFlight } from './flight';
import { TimeManager } from './timeSystem';
import { TrafficManager } from './trafficManager';
import { getFleetSpec, pickFleetType, type AircraftCategory } from './fleet';
import { HOME_AIRPORT, pickRoute } from './airports';

/** Traffic mix: mostly narrow-body, a few regional, wide-body and freighters. */
const CATEGORY_MIX: AircraftCategory[] = [
  'narrow', 'narrow', 'narrow', 'narrow',
  'regional', 'regional',
  'wide', 'wide',
  'cargo', 'cargo'
];

const PAX_AIRLINES = ['DL', 'AA', 'UA', 'BA', 'AF', 'LH', 'IB', 'LA', 'AM', 'KL'];
const CARGO_AIRLINES = ['FX', 'UPS', '5X', 'CV', 'KZ', 'QR'];

export class ScheduleManager {
  private flights: Flight[] = [];
  private checkIntervalTimer: number = 0;

  constructor(
    private timeManager: TimeManager,
    private trafficManager: TrafficManager
  ) {}

  /**
   * Initializes scheduled flights distributed across the 24-hour cycle
   */
  initSchedule() {
    for (let i = 0; i < 24; i++) {
      const category = CATEGORY_MIX[Math.floor(Math.random() * CATEGORY_MIX.length)];
      const type = pickFleetType(category);
      const spec = getFleetSpec(type);
      const cargo = spec.cargo === true;

      const pool = cargo ? CARGO_AIRLINES : PAX_AIRLINES;
      const code = `${pool[Math.floor(Math.random() * pool.length)]}${Math.floor(Math.random() * 9000) + 1000}`;
      // Scheduled traffic always departs from the modelled home hub and heads
      // to one of the remote airports in the world catalogue.
      const route = pickRoute(cargo, HOME_AIRPORT.code);
      const departure = (i + Math.random() * 0.5) % 24;

      this.flights.push(createFlight({
        flightNumber: code,
        aircraftType: type,
        origin: HOME_AIRPORT.code,
        destination: route.destination,
        scheduledDeparture: departure,
        scheduledArrival: (departure + 2.5) % 24,
      }));
    }
    
    console.log(`[ScheduleManager] Initialized ${this.flights.length} scheduled flights.`);
  }

  /**
   * Update called every frame to check if flights need to start their lifecycle.
   * Every 10-15 minutes of game time, evaluate scheduled flights.
   */
  update(dt: number) {
    const currentHour = this.timeManager.getHour();
    
    // Accumulate real time or game time delta. Assuming dt is real-world seconds.
    // With timeScale, 1 real second = timeScale game hours.
    this.checkIntervalTimer += dt;

    // Check every ~5 real seconds (corresponds to game-time intervals based on timeScale)
    if (this.checkIntervalTimer >= 5.0) {
      this.checkIntervalTimer = 0;
      this.evaluateFlights(currentHour);
    }
  }

  private evaluateFlights(currentHour: number) {
    for (const flight of this.flights) {
      if (flight.status === FlightStatus.Scheduled) {
        // If current game time has reached or passed scheduled departure (within a 0.3 hour window)
        const timeDiff = (currentHour - flight.scheduledDeparture + 24) % 24;
        if (timeDiff >= 0 && timeDiff < 0.4) {
          const started = this.trafficManager.addFlight(flight);
          if (started) {
            console.log(`[ScheduleManager] Flight ${flight.flightNumber} (${flight.aircraftType}) starting departure/arrival cycle at hour ${currentHour.toFixed(2)}.`);
          } else {
            // All gates busy: keep it scheduled, it will be retried.
            flight.status = FlightStatus.Scheduled;
          }
        }
      }
    }
  }

  getPendingFlights(): Flight[] {
    return this.flights.filter(f => f.status === FlightStatus.Scheduled);
  }

  getActiveFlights(): Flight[] {
    return this.flights.filter(f => f.status !== FlightStatus.Scheduled);
  }
}