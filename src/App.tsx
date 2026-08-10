import { useState } from 'react';
import { useAppStore } from './store/store';
import { selectViewedFortnight, selectFortnightExpired, selectIsReadOnly } from './store/selectors';
import { formatDayLabel } from './domain/dates';
import { FortnightBoard } from './components/board/FortnightBoard';
import { RemindersPanel } from './components/reminders/RemindersPanel';
import { StandupModal } from './components/standup/StandupModal';
import { FortnightSwitcher } from './components/history/FortnightSwitcher';
import { BackupControls } from './components/common/BackupControls';
import styles from './App.module.css';

export default function App() {
  const state = useAppStore();
  const fn = selectViewedFortnight(state);
  const regenerateFortnight = useAppStore((s) => s.regenerateFortnight);
  const [standupOpen, setStandupOpen] = useState(false);
  return (
    <>
      <header className={styles.header}>
        <h1>Agile Todo</h1>
        {fn && <p>{formatDayLabel(fn.days[0])} – {formatDayLabel(fn.days[9])}</p>}
        <button onClick={() => setStandupOpen(true)}>Standup</button>
        <button onClick={() => {
          if (window.confirm('Generate a new fortnight starting this week? Incomplete todos will carry over.')) {
            regenerateFortnight();
          }
        }}>Generate new fortnight</button>
        <FortnightSwitcher />
        <BackupControls />
      </header>
      {selectFortnightExpired(state) && (
        <p role="alert">This fortnight has ended. Generate a new one to continue.</p>
      )}
      {selectIsReadOnly(state) && (
        <p role="status">Viewing a past fortnight (read-only).</p>
      )}
      <FortnightBoard />
      <RemindersPanel />
      {standupOpen && <StandupModal onClose={() => setStandupOpen(false)} />}
    </>
  );
}
