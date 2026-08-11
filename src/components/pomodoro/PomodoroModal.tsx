import { useAppStore } from '../../store/store';
import { remainingMs, LONG_BREAK_EVERY } from '../../domain/pomodoro';
import { useNow } from '../../hooks/useNow';
import { Modal } from '../common/Modal';
import { requestNotificationPermission } from './notify';
import styles from './PomodoroModal.module.css';

const PHASE_LABEL = { work: 'Focus', break: 'Break', longBreak: 'Long break' } as const;

function format(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function DurationField({ label, value, onCommit }: {
  label: string; value: number; onCommit: (minutes: number) => void;
}) {
  return (
    <div className={styles.field}>
      <label>
        {label}
        <input
          type="number"
          min={1}
          defaultValue={value}
          onChange={(e) => onCommit(e.target.valueAsNumber)}
        />
      </label>
    </div>
  );
}

export function PomodoroModal({ onClose }: { onClose: () => void }) {
  const run = useAppStore((s) => s.pomodoro);
  const settings = useAppStore((s) => s.pomodoroSettings);
  const startPomodoro = useAppStore((s) => s.startPomodoro);
  const pausePomodoro = useAppStore((s) => s.pausePomodoro);
  const resumePomodoro = useAppStore((s) => s.resumePomodoro);
  const skipPomodoroPhase = useAppStore((s) => s.skipPomodoroPhase);
  const stopPomodoro = useAppStore((s) => s.stopPomodoro);
  const setPomodoroSettings = useAppStore((s) => s.setPomodoroSettings);
  const announce = useAppStore((s) => s.announce);
  const now = useNow(run?.running ? 1000 : 60_000);

  // The cycle position: filled dots are completed pomodoros in the current
  // set of LONG_BREAK_EVERY (a full set shows all dots filled during the
  // long break itself).
  const cycleFill = run
    ? run.completedWork % LONG_BREAK_EVERY === 0 && run.phase === 'longBreak'
      ? LONG_BREAK_EVERY
      : run.completedWork % LONG_BREAK_EVERY
    : 0;

  return (
    <Modal title="Pomodoro" onClose={onClose}>
      <div className={styles.display}>
        <p className={styles.time}>{run ? format(remainingMs(run, now.toISOString())) : format(settings.workMinutes * 60_000)}</p>
        <p className={styles.phase}>
          {run ? (run.running ? PHASE_LABEL[run.phase] : `${PHASE_LABEL[run.phase]} — paused`) : 'Ready'}
        </p>
        <div className={styles.cycles} aria-label={`${cycleFill} of ${LONG_BREAK_EVERY} pomodoros until the long break`}>
          {Array.from({ length: LONG_BREAK_EVERY }, (_, i) => (
            <span key={i} className={styles.cycleDot} data-done={i < cycleFill ? '' : undefined} />
          ))}
        </div>
      </div>

      <div className={styles.controls}>
        {!run && <button className={styles.primary} onClick={startPomodoro}>Start</button>}
        {run && run.running && <button className={styles.primary} onClick={pausePomodoro}>Pause</button>}
        {run && !run.running && <button className={styles.primary} onClick={resumePomodoro}>Resume</button>}
        {run && <button onClick={skipPomodoroPhase}>Skip phase</button>}
        {run && <button onClick={stopPomodoro}>Stop</button>}
      </div>

      <fieldset className={styles.settings}>
        <legend>Durations (minutes)</legend>
        <DurationField label="Focus minutes" value={settings.workMinutes}
          onCommit={(m) => setPomodoroSettings({ workMinutes: m })} />
        <DurationField label="Break minutes" value={settings.breakMinutes}
          onCommit={(m) => setPomodoroSettings({ breakMinutes: m })} />
        <DurationField label="Long break minutes" value={settings.longBreakMinutes}
          onCommit={(m) => setPomodoroSettings({ longBreakMinutes: m })} />
      </fieldset>

      <div className={styles.notifyRow}>
        <span>Get a browser notification when a phase ends</span>
        <button
          aria-label="Enable browser notifications"
          onClick={async () => {
            const result = await requestNotificationPermission();
            announce(result === 'granted' ? 'Notifications enabled' : 'Notifications not allowed');
          }}
        >
          Enable
        </button>
      </div>
    </Modal>
  );
}
