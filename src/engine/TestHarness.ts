/**
 * TestHarness
 *
 * Engine-side test instrumentation, active only under the WEB_TEST harness (`?test=1`). Two jobs:
 *
 *  1. A GAME-TIME event bus. Systems call `TestHarness.event(tag, data)` at lifecycle points (cast
 *     conjure/impact/complete, beam attach/remove, …). Each event is stamped with accumulated
 *     game-time (`gt`, seconds) and frame index — NOT wall-clock — so a timeline is identical on a
 *     fast machine and under slow headless software rendering. This is what makes timing bugs (e.g.
 *     the 3s cast→visual delay) measurable instead of guessed at.
 *
 *  2. Deterministic time. Set `TestHarness.fixedDelta` to pin every frame to a constant game-time
 *     step (so a scenario advances the same game-time regardless of real fps); `TestHarness.paused`
 *     freezes the sim. The main loop (GameState.Update) honours both.
 *
 * Disabled by default: `event()` is a cheap `enabled` check + return in normal play, so there is no
 * production cost. Read the log from a test driver via `window.KotOR.TestHarness.getEvents()`.
 *
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 *
 * @file TestHarness.ts
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */

export interface TestEvent {
  /** Accumulated game-time in seconds (machine-independent). */
  gt: number;
  /** Frame index since the harness started. */
  frame: number;
  /** Wall-clock ms (performance.now) — for cross-checking against real-time only. */
  rt: number;
  tag: string;
  data?: any;
}

export class TestHarness {
  /** Turned on when the game boots under the WEB_TEST environment (?test=1). */
  static enabled: boolean = false;

  static events: TestEvent[] = [];
  static gameTime: number = 0;
  static frame: number = 0;

  /** When non-null, the main loop uses this as its per-frame delta (deterministic game-time). */
  static fixedDelta: number | null = null;
  /** When true, the main loop schedules the next frame but runs no update/render. */
  static paused: boolean = false;

  private static readonly MAX_EVENTS = 8000;

  /** Record a lifecycle event (no-op unless the harness is enabled). */
  static event(tag: string, data?: any): void {
    if (!this.enabled) return;
    this.events.push({
      gt: +this.gameTime.toFixed(4),
      frame: this.frame,
      rt: (typeof performance !== 'undefined') ? +performance.now().toFixed(1) : 0,
      tag,
      data,
    });
    if (this.events.length > this.MAX_EVENTS) this.events.shift();
  }

  /** Called once per frame by GameState.Update to advance the game-time clock + frame counter. */
  static tick(gameTime: number): void {
    if (!this.enabled) return;
    this.gameTime = gameTime;
    this.frame++;
  }

  static reset(): void { this.events.length = 0; }
  static getEvents(): TestEvent[] { return this.events.slice(); }

  /** Pause/resume the sim (test driver convenience). */
  static setPaused(p: boolean): void { this.paused = !!p; }
  /** Pin the per-frame delta (seconds) for reproducible game-time; pass null to use the real clock. */
  static setFixedDelta(dt: number | null): void { this.fixedDelta = (dt == null) ? null : Math.max(0, dt); }
}
