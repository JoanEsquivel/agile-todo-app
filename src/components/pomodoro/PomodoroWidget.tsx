import { useEffect } from 'react';
import { useAppStore } from '../../store/store';
import { remainingMs } from '../../domain/pomodoro';
import { useNow } from '../../hooks/useNow';
import { playBeep, notifyPhaseEnd } from './notify';
import styles from './PomodoroWidget.module.css';

const PHASE_LABEL = { work: 'Focus', break: 'Break', longBreak: 'Long break' } as const;

const END_MESSAGE = {
  work: ['Focus complete', 'Time for a break'],
  break: ['Break over', 'Back to focus'],
  longBreak: ['Long break over', 'Back to focus'],
} as const;

function format(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * The always-mounted header timer. Holds the app's only 1s clock
 * subscription (a leaf — never put useNow(1000) anywhere near App itself)
 * and is the one place a passed deadline is detected: completing re-arms
 * `endsAt` in the future, so the effect is naturally idempotent across
 * re-renders. Being plain buttons in the header, its controls keep working
 * while a [role=dialog] has every shortcut except ⌘K disabled.
 */
export function PomodoroWidget({ onOpenModal }: { onOpenModal: () => void }) {
  const run = useAppStore((s) => s.pomodoro);
  const pausePomodoro = useAppStore((s) => s.pausePomodoro);
  const resumePomodoro = useAppStore((s) => s.resumePomodoro);
  const completePomodoroPhase = useAppStore((s) => s.completePomodoroPhase);
  const now = useNow(run?.running ? 1000 : 60_000);
  const nowIso = now.toISOString();

  const endedPhase = run?.running && remainingMs(run, nowIso) <= 0 ? run.phase : null;
  useEffect(() => {
    if (!endedPhase) return;
    completePomodoroPhase();
    playBeep();
    const [title, body] = END_MESSAGE[endedPhase];
    notifyPhaseEnd(title, body);
  }, [endedPhase, completePomodoroPhase]);

  if (!run) {
    return (
      <button type="button" className={styles.idle} aria-label="Pomodoro timer" onClick={onOpenModal}>
        <span className={styles.idleDial} aria-hidden="true" />
        Pomodoro
      </button>
    );
  }

  const remaining = remainingMs(run, nowIso);
  return (
    <div className={styles.widget} data-phase={run.phase}>
      <span className={styles.dot} aria-hidden="true" />
      <button
        type="button"
        className={styles.time}
        aria-label="Pomodoro settings"
        title="Open pomodoro"
        onClick={onOpenModal}
      >
        {format(remaining)}
      </button>
      <span className={styles.phase}>{run.running ? PHASE_LABEL[run.phase] : 'Paused'}</span>
      {run.running ? (
        <button type="button" className={styles.control} aria-label="Pause timer" onClick={pausePomodoro}>
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M4 2h3v12H4zM9 2h3v12H9z" fill="currentColor" />
          </svg>
        </button>
      ) : (
        <button type="button" className={styles.control} aria-label="Resume timer" onClick={resumePomodoro}>
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M4 2l9 6-9 6z" fill="currentColor" />
          </svg>
        </button>
      )}
    </div>
  );
}
