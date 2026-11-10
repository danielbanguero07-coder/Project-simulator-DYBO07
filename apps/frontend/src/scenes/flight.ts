import * as THREE from 'three';

/**
 * Flight status enumeration
 */
export enum FlightStatus {
  Scheduled = 'scheduled',
  Taxiing = 'taxiing',
  Takeoff = 'takeoff',
  Landing = 'landing',
  Parked = 'parked',
  Boarding = 'boarding',
  Deplaning = 'deplaning',
}

/**
 * Interface representing an airline flight
 */
export interface Flight {
  /** Unique flight number (e.g., "AZ123", "BA456") */
  flightNumber: string;
  /** Aircraft type (e.g., "A320", "B777", "A380") */
  aircraftType: string;
  /** Current status of the flight */
  status: FlightStatus;
  /** Origin airport code (e.g., "MEX", "JFK") */
  origin: string;
  /** Destination airport code (e.g., "NYC", "MIA") */
  destination: string;
  /** Number of passengers on board */
  passengers: number;
  /** Scheduled departure time in game hours */
  scheduledDeparture: number;
  /** Scheduled arrival time in game hours */
  scheduledArrival: number;
  /** Reference to the aircraft 3D object in the scene */
  aircraft?: THREE.Object3D;
  /** Current gate assignment (if at airport) */
  gate?: number;
  /** Node index in the traffic network for ground movement */
  currentNodeIndex?: number;
}

/**
 * Parameters for creating a new flight
 */
export interface FlightParams {
  flightNumber: string;
  aircraftType: string;
  origin: string;
  destination: string;
  scheduledDeparture: number;
  scheduledArrival: number;
}

/**
 * Generates a random number of passengers within a realistic range
 * based on aircraft type
 */
export function generatePassengers(aircraftType: string): number {
  const baseCounts: Record<string, [number, number]> = {
    A320: [120, 180],
    A321: [150, 220],
    B737: [120, 189],
    A350: [250, 350],
    A380: [400, 550],
    B787: [240, 330],
    B777: [300, 400],
    ATR72: [40, 72],
    // Freighters carry no passengers.
    B747: [0, 0],
    MD11: [0, 0],
    default: [80, 180],
  };

  const range = baseCounts[aircraftType] ?? baseCounts.default;
  const min = range[0];
  const max = range[1];

  // Random integer between min and max (inclusive)
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Creates a new Flight instance with random passengers
 */
export function createFlight(params: FlightParams): Flight {
  return {
    flightNumber: params.flightNumber,
    aircraftType: params.aircraftType,
    status: FlightStatus.Scheduled,
    origin: params.origin,
    destination: params.destination,
    passengers: generatePassengers(params.aircraftType),
    scheduledDeparture: params.scheduledDeparture,
    scheduledArrival: params.scheduledArrival,
  };
}