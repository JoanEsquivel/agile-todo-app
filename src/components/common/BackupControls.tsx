import { useState } from 'react';
import { appStorage, useAppStore } from '../../store/store';
import { parseBackup, serializeState } from '../../store/exportImport';
import { todayLocal } from '../../store/clock';

export function BackupControls() {
  const [error, setError] = useState<string | null>(null);

  const exportBackup = () => {
    const s = useAppStore.getState();
    const json = serializeState({
      schemaVersion: s.schemaVersion, fortnights: s.fortnights,
      activeFortnightId: s.activeFortnightId, todos: s.todos, notes: s.notes,
      lastRolloverDay: s.lastRolloverDay,
    });
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `agile-todo-app-backup-${todayLocal()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const state = parseBackup(await file.text());
      useAppStore.getState().importState(state);
      appStorage.flush();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    }
  };

  return (
    <div>
      <button onClick={exportBackup}>Export backup</button>
      <label>Import backup
        <input type="file" accept="application/json" onChange={importBackup} />
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
