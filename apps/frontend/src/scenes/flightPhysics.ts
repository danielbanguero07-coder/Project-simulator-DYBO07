import * as THREE from 'three';

export interface FlightState {
  // Position & Orientation
  position: THREE.Vector3; // world coordinates (meters)
  rotation: THREE.Euler; // pitch, roll, yaw
  velocity: THREE.Vector3; // world velocity vector
  speedKts: number; // airspeed in knots
  altitudeFt: number; // altitude in feet (above MSL/ground)
  verticalSpeedFpm: number; // vertical speed in ft/min

  // A320 Controls & Aircraft Config
  throttle: number; // 0.0 to 1.0 (TOGA / Idle)
  pitchInput: number; // -1.0 to 1.0 (Elevator)
  rollInput: number; // -1.0 to 1.0 (Ailerons)
  yawInput: number; // -1.0 to 1.0 (Rudder)
  flaps: number; // 0, 1, 2, 3 (Flap stages: 0, 1, 2, Full)
  gearDown: boolean; // landing gear deployed
  spoilers: boolean; // ground spoilers / airbrakes
  engineRunning: boolean;

  // Fuel (kg). `fuelTargetKg` is the amount the player asked to load.
  fuelKg: number;
  fuelCapacityKg: number;
  fuelTargetKg: number;
  refueling: boolean;

  // Flight Phase
  onGround: boolean;
  stallWarning: boolean;
  overspeedWarning: boolean;
}

export class FlightPhysics {
  public state: FlightState;
  
  // A320 Physics Constants (realistic values)
  private readonly rotationSpeedKts = 145; // Vr
  private readonly stallSpeedKts = 120;
  /** Height of the wheel contact point above the runway surface. */
  private readonly groundY = 0.32;

  // Aircraft mass and engine thrust
  private readonly aircraftMass = 79000; // kg (~79 tons A320)
  /** Total take-off thrust of both engines, in newtons. */
  private readonly maxEngineThrust = 300000;

  /** Usable fuel capacity of the A320, in kilograms. */
  private readonly fuelCapacityKg = 19000;
  /** Refuelling rate through the ground hose, kg per second. */
  private readonly refuelRateKgPerSecond = 240;

  /** Returns the terrain/airport elevation in metres under the aircraft. */
  private groundSampler: (x: number, z: number) => number = () => 0;

  public setGroundSampler(sampler: (x: number, z: number) => number) {
    this.groundSampler = sampler;
  }

  /** Wheel contact altitude at a world position. */
  private surfaceHeightAt(x: number, z: number): number {
    // Water/sea bed is clamped to the water line so the aircraft stops at the
    // surface instead of sinking through it.
    return Math.max(0, this.groundSampler(x, z)) + this.groundY;
  }

  /**
   * Spawn on taxiway Alpha (x = 72), not on the runway centreline. The old
   * default put the player at (0, -1080), i.e. parked on runway 36L, where
   * AI traffic had to drive around or through the player.
   */
  constructor(initialPosition = new THREE.Vector3(72, 0.32, -1050)) {
    this.state = {
      position: initialPosition.clone(),
      rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
      velocity: new THREE.Vector3(0, 0, 0),
      speedKts: 0,
      altitudeFt: Math.max(0, initialPosition.y * 3.28084),
      verticalSpeedFpm: 0,
      throttle: 0.0,
      pitchInput: 0.0,
      rollInput: 0.0,
      yawInput: 0.0,
      flaps: 0,
      gearDown: true,
      spoilers: false,
      engineRunning: true,
      // Starts with a light fuel load so the player can visibly refuel it.
      fuelKg: 4200,
      fuelCapacityKg: this.fuelCapacityKg,
      fuelTargetKg: this.fuelCapacityKg,
      refueling: false,
      onGround: true,
      stallWarning: false,
      overspeedWarning: false,
    };
  }

  public setControls(controls: {
    throttle?: number;
    pitch?: number;
    roll?: number;
    yaw?: number;
    flaps?: number;
    gearDown?: boolean;
  }) {
    if (controls.throttle !== undefined) {
      this.state.throttle = THREE.MathUtils.clamp(controls.throttle, 0, 1);
    }
    if (controls.pitch !== undefined) {
      this.state.pitchInput = THREE.MathUtils.clamp(controls.pitch, -1, 1);
    }
    if (controls.roll !== undefined) {
      this.state.rollInput = THREE.MathUtils.clamp(controls.roll, -1, 1);
    }
    if (controls.yaw !== undefined) {
      this.state.yawInput = THREE.MathUtils.clamp(controls.yaw, -1, 1);
    }
    if (controls.flaps !== undefined) {
      this.state.flaps = THREE.MathUtils.clamp(Math.round(controls.flaps), 0, 3);
    }
    if (controls.gearDown !== undefined) {
      this.state.gearDown = controls.gearDown;
    }
  }

  /** Selects how much fuel to load, as a percentage of full capacity. */
  public setFuelTargetPercent(percent: number) {
    const clamped = THREE.MathUtils.clamp(percent, 0, 100);
    this.state.fuelTargetKg = (clamped / 100) * this.state.fuelCapacityKg;
  }

  /**
   * Starts/stops refuelling. Only possible on the ground: the truck connects
   * to the wing and the tanks fill progressively in `update()`.
   */
  public toggleRefuel(): boolean {
    const s = this.state;
    if (!s.onGround) {
      s.refueling = false;
      return false;
    }
    if (s.refueling) {
      s.refueling = false;
      return false;
    }
    // If the selected target is already reached, ask for a full load.
    if (s.fuelKg >= s.fuelTargetKg) s.fuelTargetKg = s.fuelCapacityKg;
    if (s.fuelKg >= s.fuelTargetKg) return false;
    s.refueling = true;
    return true;
  }

  public update(dt: number) {
    const s = this.state;
    if (!s.engineRunning) {
      s.throttle = 0;
    }

    // Fuel: engines burn progressively, the ground hose fills up to the
    // selected target. Refuelling is impossible once airborne.
    s.fuelKg = Math.max(0, s.fuelKg - (0.08 + s.throttle * 0.85) * dt);
    if (!s.onGround) s.refueling = false;
    if (s.refueling) {
      s.fuelKg = Math.min(
        s.fuelTargetKg,
        s.fuelKg + this.refuelRateKgPerSecond * dt
      );
      if (s.fuelKg >= s.fuelTargetKg) {
        s.fuelKg = s.fuelTargetKg;
        s.refueling = false;
      }
    }

    const thrustN = s.throttle * this.maxEngineThrust;
    const massKg = this.aircraftMass;
    const surfaceY = this.surfaceHeightAt(s.position.x, s.position.z);

    if (s.onGround) {
      // Ground roll / taxiing with realistic mass inertia
      const rollingResistance = 0.025 * massKg * 9.81;
      const dragFactor = s.spoilers ? 4.0 : 2.4; // aerodynamic drag on the roll
      const dragN = s.speedKts * s.speedKts * dragFactor;
      const acceleration = (thrustN - rollingResistance - dragN) / massKg;

      // Apply acceleration (can be negative = deceleration)
      const newSpeedMps = (s.speedKts * 0.514444) + acceleration * dt;

      // Minimum speed when not powered (coasting to stop). The extra braking
      // term lets the aircraft stop within a runway after landing instead of
      // rolling for kilometres.
      if (s.throttle === 0 && s.speedKts > 0) {
        const decelRate = 1.4; // m/s² deceleration
        s.speedKts = Math.max(0, (newSpeedMps - decelRate * dt) / 0.514444);
      } else {
        s.speedKts = Math.max(0, newSpeedMps / 0.514444);
      }

      // Steering: positive yawInput turns left.
      s.rotation.y += s.yawInput * 0.8 * dt * (s.speedKts / 50 + 0.2);

      // Rotation at Vr: pull back (S) above 145 kt.
      const rotateNow = s.speedKts >= this.rotationSpeedKts && s.pitchInput > 0.2;
      if (rotateNow) {
        s.onGround = false;
        // Negative rotation.x is nose-up for a +Z-forward aircraft.
        s.rotation.x = -0.14;
        s.position.y = surfaceY + 0.12;
      }

      const forwardDir = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, s.rotation.y, 0));
      s.position.x += forwardDir.x * (s.speedKts * 0.514444) * dt;
      s.position.z += forwardDir.z * (s.speedKts * 0.514444) * dt;

      if (s.onGround) {
        s.position.y = this.surfaceHeightAt(s.position.x, s.position.z);
        s.altitudeFt = Math.max(0, s.position.y * 3.28084);
        s.verticalSpeedFpm = 0;
        s.rotation.x = 0;
        s.rotation.z = 0;
      }
    } else {
      // Airborne flight physics with mass and inertia
      const rollRate = 1.5;

      // Positive pitchInput = pull back = nose up, which is negative
      // rotation.x for an aircraft whose nose points along +Z. Damping the
      // pitch toward the commanded attitude makes the nose return to level
      // when the key is released instead of holding the last angle forever.
      const targetPitch = -s.pitchInput * 0.35;
      s.rotation.x = THREE.MathUtils.damp(s.rotation.x, targetPitch, 2.5, dt);
      s.rotation.z = THREE.MathUtils.clamp(s.rotation.z - s.rollInput * rollRate * dt, -Math.PI / 2.5, Math.PI / 2.5);
      s.rotation.y += s.yawInput * 0.5 * dt - s.rotation.z * 0.4 * dt;

      const noseUp = -s.rotation.x;
      const forwardSpeedMps = s.speedKts * 0.514444;

      // Vertical speed follows the flight-path angle. Below the stall speed
      // the wing stops supporting the aircraft and it sinks.
      const speedRatio = s.speedKts / this.stallSpeedKts;
      const sinkMps = speedRatio < 1 ? -(1 - speedRatio) * 12 : 0;
      // Limit the climb/descent rate to what an A320 can actually sustain.
      const vertSpeedMps = THREE.MathUtils.clamp(
        forwardSpeedMps * Math.sin(noseUp) + sinkMps,
        -22,
        15
      );
      s.verticalSpeedFpm = vertSpeedMps * 196.85;

      // Aerodynamic drag grows with the square of airspeed and balances the
      // engines around 330-340 kt at full thrust.
      const dragN = forwardSpeedMps * forwardSpeedMps * 9.5 + (s.gearDown ? 2500 : 0);
      const accelerationAir = (thrustN - dragN) / massKg;
      const newSpeedMps = Math.max(30, forwardSpeedMps + accelerationAir * dt);
      s.speedKts = newSpeedMps / 0.514444;

      const flightDir = new THREE.Vector3(0, 0, 1).applyEuler(s.rotation);
      s.position.addScaledVector(flightDir, forwardSpeedMps * dt);
      const landedSurface = this.surfaceHeightAt(s.position.x, s.position.z);
      s.altitudeFt = Math.max(0, s.position.y * 3.28084);

      // Touchdown: any contact with the runway/terrain settles the aircraft,
      // even on a firm landing. Previously only rates above -400 fpm counted,
      // so a normal descent kept `onGround = false` and the visual aircraft
      // sank through the runway.
      if (s.position.y <= landedSurface + 0.04) {
        s.position.y = landedSurface;
        s.onGround = true;
        s.rotation.x = 0;
        s.rotation.z = 0;
        s.verticalSpeedFpm = 0;
      }
    }

    s.stallWarning = !s.onGround && s.speedKts < this.stallSpeedKts && s.altitudeFt > 30;
    s.overspeedWarning = s.speedKts > 320;
  }
}
