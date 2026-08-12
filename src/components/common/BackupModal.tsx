import { useEffect, useRef, useState } from 'react';
import { appStorage, useAppStore } from '../../store/store';
import { parseBackup, serializeState } from '../../store/exportImport';
import { summarizeBackup, type BackupSummary } from '../../domain/backup';
import { todayLocal } from '../../store/clock';
import type { PersistedState } from '../../domain/types';
import { Modal } from './Modal';
import styles from './BackupModal.module.css';

/** Picking a file only parses it. `confirm` holds the parsed document until
 *  the user explicitly accepts the replacement -- importState is destructive
 *  and irreversible, so nothing reaches the store before that click. Both
 *  summaries are snapshotted on entry rather than recomputed per render. */
type Step =
  | { step: 'idle'; error: string | null }
  | {
      step: 'confirm';
      pending: PersistedState;
      fileName: string;
      current: BackupSummary;
      incoming: BackupSummary;
    };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function countsLabel(s: BackupSummary): string {
  return `${plural(s.todos, 'todo')}, ${plural(s.notes, 'note')}, ${plural(s.months, 'month')}`;
}

export function BackupModal({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<Step>({ step: 'idle', error: null });
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Modal's own initialFocusRef only fires on mount, so the step change
  // needs its own move -- onto Cancel, never onto the destructive button.
  useEffect(() => {
    if (state.step === 'confirm') cancelRef.current?.focus();
  }, [state.step]);

  const exportBackup = () => {
    const s = useAppStore.getState();
    const json = serializeState({
      schemaVersion: s.schemaVersion, fortnights: s.fortnights,
      activeFortnightId: s.activeFortnightId, todos: s.todos, notes: s.notes,
      lastRolloverDay: s.lastRolloverDay, pomodoroSettings: s.pomodoroSettings,
    });
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `agile-todo-app-backup-${todayLocal()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    useAppStore.getState().announce('Backup downloaded');
  };

  const chooseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Cleared before the await so re-picking the same file re-fires `change`.
    e.target.value = '';
    if (!file) return;
    try {
      const pending = parseBackup(await file.text());
      setState({
        step: 'confirm',
        pending,
        fileName: file.name,
        current: summarizeBackup(useAppStore.getState()),
        incoming: summarizeBackup(pending),
      });
    } catch (err) {
      setState({ step: 'idle', error: err instanceof Error ? err.message : 'Import failed.' });
    }
  };

  const confirmImport = () => {
    if (state.step !== 'confirm') return;
    // importState clears rehydrationError in the same set(), which re-enables
    // guardedStorage writes -- so it must precede the flush (INV-7).
    useAppStore.getState().importState(state.pending);
    appStorage.flush();
    useAppStore.getState().announce('Board replaced from backup');
    onClose();
  };

  return (
    <Modal title="Backup" onClose={onClose}>
      {state.step === 'idle' ? (
        <>
          <section className={styles.section}>
            <h3 className={styles.heading}>Export</h3>
            <p className={styles.body}>
              Download your whole board as a JSON file — every month, todo, note and your Pomodoro settings.
            </p>
            <div>
              <button type="button" className={styles.primary} onClick={exportBackup}>Download backup</button>
            </div>
          </section>
          <section className={styles.section}>
            <h3 className={styles.heading}>Import</h3>
            <p className={styles.body}>Restore a backup you downloaded earlier.</p>
            <label className={styles.fileLabel}>
              Choose file…
              <input className={styles.fileInput} type="file" accept="application/json" onChange={chooseFile} />
            </label>
            <p className={styles.warning}>
              Importing <strong>replaces</strong> your current board. Export first if you haven’t.
            </p>
            {state.error && <p className={styles.error} role="alert">{state.error}</p>}
          </section>
        </>
      ) : (
        <section className={styles.section}>
          <h3 className={styles.heading}>Replace your current board?</h3>
          <dl className={styles.compare}>
            <dt className={styles.compareTerm}>Now</dt>
            <dd className={styles.compareValue}>{countsLabel(state.current)}</dd>
            <dt className={styles.compareTerm}>{state.fileName}</dt>
            <dd className={styles.compareValue}>{countsLabel(state.incoming)}</dd>
          </dl>
          <p className={styles.danger}>This cannot be undone.</p>
          <div className={styles.actions}>
            <button type="button" ref={cancelRef} onClick={() => setState({ step: 'idle', error: null })}>
              Cancel
            </button>
            <button type="button" className={styles.destructive} onClick={confirmImport}>
              Replace board
            </button>
          </div>
        </section>
      )}
    </Modal>
  );
}
