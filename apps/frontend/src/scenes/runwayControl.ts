/**
 * Shared airport coordination.
 *
 * Before this file existed, the two traffic systems — RouteTraffic (the
 * planes flying between airports) and TrafficManager (the planes on the
 * ground at MEX) — each used the same runway and the same gates without
 * ever talking to each other. The result, visible in the game, was
 * several aircraft on runway 36L at the same time, landing on top of a
 * departing aircraft, and two aircraft parked at the same gate.
 *
 * There is one runway and one set of gates at MEX, so there is one
 * shared controller, created once in qualityDemo.ts and handed to both
 * managers. A runway or a gate can only be held by one aircraft at a
 * time. Everything else is a queue: an aircraft that cannot get the
 * runway waits — in a holding orbit in the air, or at the holding
 * point on the ground — instead of entering it anyway.
 *
 * Every acquire has a matching release in the same manager, so the
 * runway can never stay locked forever.
 */
export class RunwayController {
  private holder: string | null = null;

  isFree(): boolean {
    return this.holder === null;
  }

  isHeldBy(id: string): boolean {
    return this.holder === id;
  }

  /** Take the runway if it is free (or already held by this aircraft). */
  request(id: string): boolean {
    if (this.holder === null || this.holder === id) {
      this.holder = id;
      return true;
    }
    return false;
  }

  release(id: string): void {
    if (this.holder === id) this.holder = null;
  }

  holderId(): string | null {
    return this.holder;
  }
}

export class SharedAirport {
  readonly runway = new RunwayController();
  /** gateId -> owner id, for the MEX passenger gates 1-8. */
  private gates = new Map<number, string>();

  requestGate(gateId: number, owner: string): boolean {
    const current = this.gates.get(gateId);
    if (current === undefined || current === owner) {
      this.gates.set(gateId, owner);
      return true;
    }
    return false;
  }

  releaseGate(owner: string): void {
    for (const [gateId, current] of this.gates) {
      if (current === owner) this.gates.delete(gateId);
    }
  }

  isGateFree(gateId: number): boolean {
    return !this.gates.has(gateId);
  }
}
