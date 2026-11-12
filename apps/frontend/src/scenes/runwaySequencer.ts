/**
 * Fair queue for the single runway at MEX.
 *
 * `RunwayController` in `runwayControl.ts` is a plain lock: the first caller
 * wins and everybody else retries every frame. That is enough to keep two
 * aircraft off the runway at the same time, but it is unfair — a steady
 * stream of arrivals can keep winning the lock while the departures queued at
 * `HOLD-DEP` never move. That is exactly the "planes pile up and never take
 * off" bug.
 *
 * This sequencer wraps that lock without modifying it (`runwayControl.ts` is
 * frozen) and adds:
 *
 *  - FIFO ordering: a free runway goes to the oldest waiting request, not to
 *    whichever manager happens to poll first in that frame.
 *  - Aging: an aircraft already in the air gets a head start (it cannot be
 *    told to stop), but the longer a request waits the higher it climbs, so a
 *    departure is never starved by a queue of arrivals.
 *  - A 120 s guard: if a holder never releases (removed aircraft, a broken
 *    state machine), the runway is freed instead of locking the airport
 *    forever.
 */
import type { RunwayController } from './runwayControl';

/** Whether the caller needs the runway on the ground or in the air. */
export type RunwayUse = 'departure' | 'arrival';

/** Minimal surface shared with `RunwayController`, so either can be passed. */
export interface RunwayLock {
  isFree(): boolean;
  isHeldBy(id: string): boolean;
  request(id: string, use?: RunwayUse): boolean;
  release(id: string): void;
  holderId(): string | null;
}

export interface RunwaySequencerOptions {
  /** Force-release a lock held longer than this (seconds). */
  maxHoldSeconds?: number;
  /** Drop a queued request that stopped asking for this long (seconds). */
  staleSeconds?: number;
  /** Head start given to aircraft already in the air (seconds of waiting). */
  airborneHeadStartSeconds?: number;
}

interface QueueEntry {
  id: string;
  use: RunwayUse;
  /** Sequencer time when the request first arrived. */
  since: number;
  /** Sequencer time of the most recent request call. */
  lastAsk: number;
}

export class RunwaySequencer implements RunwayLock {
  private readonly queue: QueueEntry[] = [];
  private time = 0;
  private holderSince: number | null = null;
  private holderUse: RunwayUse | null = null;
  private readonly maxHoldSeconds: number;
  private readonly staleSeconds: number;
  private readonly airborneHeadStartSeconds: number;
  /** Last forced release, useful for diagnostics and tests. */
  private lastForcedRelease: { id: string; afterSeconds: number } | null = null;

  constructor(
    private readonly controller: RunwayController,
    options: RunwaySequencerOptions = {}
  ) {
    this.maxHoldSeconds = options.maxHoldSeconds ?? 120;
    this.staleSeconds = options.staleSeconds ?? 8;
    this.airborneHeadStartSeconds = options.airborneHeadStartSeconds ?? 20;
  }

  isFree(): boolean {
    return this.controller.isFree();
  }

  isHeldBy(id: string): boolean {
    return this.controller.isHeldBy(id);
  }

  holderId(): string | null {
    return this.controller.holderId();
  }

  /**
   * Ask for the runway. Returns true only when this caller now holds it.
   * Called every frame by the waiting aircraft, so it doubles as "still
   * interested" and keeps the queue entry alive.
   */
  request(id: string, use: RunwayUse = 'departure'): boolean {
    const now = this.time;
    let entry = this.find(id);
    if (entry === undefined) {
      entry = { id, use, since: now, lastAsk: now };
      this.queue.push(entry);
    } else {
      entry.lastAsk = now;
      // An aircraft in the air keeps its priority even if it was first seen
      // on the ground (e.g. a departure that went around).
      if (use === 'arrival') entry.use = 'arrival';
    }

    if (this.controller.isHeldBy(id)) {
      this.holderUse = use;
      return true;
    }
    if (!this.controller.isFree()) return false;

    this.prune(now);
    const head = this.pickHead();
    // FIFO politeness: a free runway still goes to the longest waiter. The
    // request returns false for everyone else so they keep holding short.
    if (head !== undefined && head.id !== id) return false;
    return this.grant(entry, now);
  }

  release(id: string): void {
    this.remove(id);
    this.controller.release(id);
    if (!this.controller.isHeldBy(id)) {
      this.holderSince = null;
      this.holderUse = null;
    }
  }

  /** Advances the clock; call once per frame from the main loop. */
  update(dt: number): void {
    this.time += dt;
    const holder = this.controller.holderId();
    if (holder === null) {
      this.holderSince = null;
      this.holderUse = null;
    } else if (this.holderSince === null) {
      // Locked before the sequencer knew about it: start the clock now.
      this.holderSince = this.time;
    } else if (this.time - this.holderSince > this.maxHoldSeconds) {
      const afterSeconds = Math.round(this.time - this.holderSince);
      console.warn(
        `[runway] ${holder} held the runway for ${afterSeconds} s; force releasing`
      );
      this.lastForcedRelease = { id: holder, afterSeconds };
      this.controller.release(holder);
      this.holderSince = null;
      this.holderUse = null;
    }
    this.prune(this.time);
  }

  /** Read-only state for the HUD and for validation scripts. */
  snapshot(): {
    holder: string | null;
    holderUse: RunwayUse | null;
    heldFor: number;
    queue: { id: string; use: RunwayUse; waited: number }[];
  } {
    return {
      holder: this.controller.holderId(),
      holderUse: this.holderUse,
      heldFor: this.holderSince === null ? 0 : this.time - this.holderSince,
      queue: this.queue.map((entry) => ({
        id: entry.id,
        use: entry.use,
        waited: this.time - entry.since
      }))
    };
  }

  lastForcedReleaseInfo(): { id: string; afterSeconds: number } | null {
    return this.lastForcedRelease;
  }

  /* ------------------------------ internals ------------------------------ */

  private find(id: string): QueueEntry | undefined {
    return this.queue.find((entry) => entry.id === id);
  }

  private remove(id: string): void {
    const index = this.queue.findIndex((entry) => entry.id === id);
    if (index >= 0) this.queue.splice(index, 1);
  }

  private pickHead(): QueueEntry | undefined {
    let best: QueueEntry | undefined;
    let bestScore = -Infinity;
    for (const entry of this.queue) {
      const headStart = entry.use === 'arrival' ? this.airborneHeadStartSeconds : 0;
      const score = this.time - entry.since + headStart;
      // Ties go to the request that arrived first (FIFO).
      if (score > bestScore || (score === bestScore && best !== undefined && entry.since < best.since)) {
        best = entry;
        bestScore = score;
      }
    }
    return best;
  }

  private grant(entry: QueueEntry, now: number): boolean {
    if (!this.controller.request(entry.id)) return false;
    this.remove(entry.id);
    this.holderSince = now;
    this.holderUse = entry.use;
    this.lastForcedRelease = null;
    return true;
  }

  private prune(now: number): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (now - this.queue[i].lastAsk > this.staleSeconds) this.queue.splice(i, 1);
    }
  }
}
