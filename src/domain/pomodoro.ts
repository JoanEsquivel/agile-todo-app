import type { ISODateTime, PomodoroSettings } from './types';

/*
 * Pomodoro timer core — pure (INV-3), deadline-based.
 *
 * A running phase is represented by its `endsAt` deadline, never by an
 * accumulated countdown: remaining time is always re-derived from the wall
 * clock the caller passes in, so throttled background-tab intervals can't
 * drift the timer — on the next tick it simply reads correct again. While
 * paused, `remainingMs` is the frozen authority and `endsAt` is null.
 */

export type PomodoroPhase = 'work' | 'break' | 'longBreak';

export interface PomodoroRun {
  phase: PomodoroPhase;
  /** Deadline while running; null while paused. */
  endsAt: ISODateTime | null;
  /** Frozen remainder while paused; while running it's a snapshot from the
   *  last transition and `remainingMs()` is the accessor to trust. */
  remainingMs: number;
  /** Completed work phases this run — drives the long-break cadence. */
  completedWork: number;
  running: boolean;
}

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  workMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
};

export const LONG_BREAK_EVERY = 4;

const MS_PER_MINUTE = 60_000;

function phaseDurationMs(phase: PomodoroPhase, settings: PomodoroSettings): number {
  if (phase === 'work') return settings.workMinutes * MS_PER_MINUTE;
  if (phase === 'break') return settings.breakMinutes * MS_PER_MINUTE;
  return settings.longBreakMinutes * MS_PER_MINUTE;
}

function beginPhase(
  phase: PomodoroPhase,
  completedWork: number,
  settings: PomodoroSettings,
  now: ISODateTime,
): PomodoroRun {
  const duration = phaseDurationMs(phase, settings);
  return {
    phase,
    endsAt: new Date(Date.parse(now) + duration).toISOString(),
    remainingMs: duration,
    completedWork,
    running: true,
  };
}

export function startRun(settings: PomodoroSettings, now: ISODateTime): PomodoroRun {
  return beginPhase('work', 0, settings, now);
}

export function remainingMs(run: PomodoroRun, now: ISODateTime): number {
  if (!run.running || run.endsAt === null) return run.remainingMs;
  // Clamped both ways: to 0 past the deadline, and to the snapshot taken at
  // the last transition — a caller's clock can tick up to an interval before
  // the deadline was created, which would otherwise read as "25:01".
  return Math.min(run.remainingMs, Math.max(0, Date.parse(run.endsAt) - Date.parse(now)));
}

export function pauseRun(run: PomodoroRun, now: ISODateTime): PomodoroRun {
  if (!run.running) return run;
  return { ...run, running: false, endsAt: null, remainingMs: remainingMs(run, now) };
}

export function resumeRun(run: PomodoroRun, now: ISODateTime): PomodoroRun {
  if (run.running) return run;
  return {
    ...run,
    running: true,
    endsAt: new Date(Date.parse(now) + run.remainingMs).toISOString(),
  };
}

function nextPhase(run: PomodoroRun, completedWork: number): PomodoroPhase {
  if (run.phase !== 'work') return 'work';
  return completedWork > 0 && completedWork % LONG_BREAK_EVERY === 0 ? 'longBreak' : 'break';
}

/** Natural end of a phase: a finished work phase counts toward the long break. */
export function completePhase(
  run: PomodoroRun,
  settings: PomodoroSettings,
  now: ISODateTime,
): PomodoroRun {
  const completedWork = run.phase === 'work' ? run.completedWork + 1 : run.completedWork;
  return beginPhase(nextPhase(run, completedWork), completedWork, settings, now);
}

/** Manual advance: same transition, but a skipped work phase earns no credit. */
export function skipPhase(
  run: PomodoroRun,
  settings: PomodoroSettings,
  now: ISODateTime,
): PomodoroRun {
  return beginPhase(nextPhase(run, run.completedWork), run.completedWork, settings, now);
}
