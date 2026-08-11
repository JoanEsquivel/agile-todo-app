import {
  DEFAULT_POMODORO_SETTINGS,
  LONG_BREAK_EVERY,
  startRun,
  remainingMs,
  pauseRun,
  resumeRun,
  completePhase,
  skipPhase,
} from './pomodoro';

const T0 = '2026-08-18T12:00:00.000Z';
const MIN = 60_000;

const at = (offsetMs: number) => new Date(Date.parse(T0) + offsetMs).toISOString();

describe('startRun', () => {
  it('starts a running work phase with the full work duration ahead', () => {
    const run = startRun(DEFAULT_POMODORO_SETTINGS, T0);
    expect(run.phase).toBe('work');
    expect(run.running).toBe(true);
    expect(run.completedWork).toBe(0);
    expect(remainingMs(run, T0)).toBe(25 * MIN);
  });

  it('respects custom durations', () => {
    const run = startRun({ workMinutes: 50, breakMinutes: 10, longBreakMinutes: 30 }, T0);
    expect(remainingMs(run, T0)).toBe(50 * MIN);
  });
});

describe('remainingMs', () => {
  it('counts down from the deadline, not from accumulated ticks', () => {
    const run = startRun(DEFAULT_POMODORO_SETTINGS, T0);
    expect(remainingMs(run, at(10 * MIN))).toBe(15 * MIN);
  });

  it('clamps at zero past the deadline', () => {
    const run = startRun(DEFAULT_POMODORO_SETTINGS, T0);
    expect(remainingMs(run, at(26 * MIN))).toBe(0);
  });
});

describe('pause and resume', () => {
  it('pausing freezes the remaining time', () => {
    const run = pauseRun(startRun(DEFAULT_POMODORO_SETTINGS, T0), at(5 * MIN));
    expect(run.running).toBe(false);
    // Frozen: however much later we ask, the remaining time is unchanged.
    expect(remainingMs(run, at(60 * MIN))).toBe(20 * MIN);
  });

  it('resuming re-derives the deadline from the frozen remainder', () => {
    const paused = pauseRun(startRun(DEFAULT_POMODORO_SETTINGS, T0), at(5 * MIN));
    const resumed = resumeRun(paused, at(60 * MIN));
    expect(resumed.running).toBe(true);
    expect(remainingMs(resumed, at(60 * MIN))).toBe(20 * MIN);
    expect(remainingMs(resumed, at(70 * MIN))).toBe(10 * MIN);
  });
});

describe('completePhase', () => {
  it('moves work to a short break and counts the completed pomodoro', () => {
    const next = completePhase(startRun(DEFAULT_POMODORO_SETTINGS, T0), DEFAULT_POMODORO_SETTINGS, at(25 * MIN));
    expect(next.phase).toBe('break');
    expect(next.completedWork).toBe(1);
    expect(next.running).toBe(true);
    expect(remainingMs(next, at(25 * MIN))).toBe(5 * MIN);
  });

  it(`awards a long break after every ${LONG_BREAK_EVERY}th work phase`, () => {
    let run = startRun(DEFAULT_POMODORO_SETTINGS, T0);
    for (let i = 0; i < LONG_BREAK_EVERY - 1; i++) {
      run = completePhase(run, DEFAULT_POMODORO_SETTINGS, T0); // work -> break
      run = completePhase(run, DEFAULT_POMODORO_SETTINGS, T0); // break -> work
    }
    const fourth = completePhase(run, DEFAULT_POMODORO_SETTINGS, T0);
    expect(fourth.completedWork).toBe(LONG_BREAK_EVERY);
    expect(fourth.phase).toBe('longBreak');
    expect(remainingMs(fourth, T0)).toBe(15 * MIN);
  });

  it('returns to work after any break, without counting it', () => {
    const onBreak = completePhase(startRun(DEFAULT_POMODORO_SETTINGS, T0), DEFAULT_POMODORO_SETTINGS, T0);
    const backToWork = completePhase(onBreak, DEFAULT_POMODORO_SETTINGS, T0);
    expect(backToWork.phase).toBe('work');
    expect(backToWork.completedWork).toBe(1);
    expect(remainingMs(backToWork, T0)).toBe(25 * MIN);
  });
});

describe('skipPhase', () => {
  it('advances the phase without crediting a completed pomodoro', () => {
    const skipped = skipPhase(startRun(DEFAULT_POMODORO_SETTINGS, T0), DEFAULT_POMODORO_SETTINGS, T0);
    expect(skipped.phase).toBe('break');
    expect(skipped.completedWork).toBe(0);
  });

  it('a skipped work phase therefore never triggers the long break', () => {
    let run = startRun(DEFAULT_POMODORO_SETTINGS, T0);
    for (let i = 0; i < LONG_BREAK_EVERY * 2; i++) {
      run = skipPhase(run, DEFAULT_POMODORO_SETTINGS, T0);
    }
    expect(run.completedWork).toBe(0);
    expect(run.phase).not.toBe('longBreak');
  });
});
