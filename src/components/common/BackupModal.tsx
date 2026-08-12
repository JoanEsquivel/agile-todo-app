import { useState } from 'react';
import { appStorage, useAppStore } from '../../store/store';
import { parseBackup, serializeState } from '../../store/exportImport';
import { todayLocal } from '../../store/clock';
import { Modal } from './Modal';
import styles from './BackupModal.module.css';

export function BackupModal({ onClose }: { onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);

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
      const state = parseBackup(await file.text());
      useAppStore.getState().importState(state);
      appStorage.flush();
      setError(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    }
  };

  return (
    <Modal title="Backup" onClose={onClose}>
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
        {error && <p className={styles.error} role="alert">{error}</p>}
      </section>
    </Modal>
  );
}
