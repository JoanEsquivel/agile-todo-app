import { useState } from 'react';
import { useAppStore } from './store/store';
import { useDayChangeWatcher } from './hooks/useDayChangeWatcher';
import { selectViewedFortnight, selectFortnightExpired, selectIsReadOnly } from './store/selectors';
import { formatDayLabel } from './domain/dates';
import { FortnightBoard } from './components/board/FortnightBoard';
import { RemindersPanel } from './components/reminders/RemindersPanel';
import { StandupModal } from './components/standup/StandupModal';
import { FortnightSwitcher } from './components/history/FortnightSwitcher';
import { BackupControls } from './components/common/BackupControls';
import styles from './App.module.css';

export default function App() {
  useDayChangeWatcher();
  const state = useAppStore();
  const fn = selectViewedFortnight(state);
  const regenerateFortnight = useAppStore((s) => s.regenerateFortnight);
  const [standupOpen, setStandupOpen] = useState(false);
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1 className={styles.heading}>Agile Todo</h1>
          {fn && (
            <p className={styles.range}>
              {formatDayLabel(fn.days[0])} – {formatDayLabel(fn.days[9])}
            </p>
          )}
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryAction} onClick={() => setStandupOpen(true)}>Standup</button>
          <button onClick={() => {
            if (window.confirm('Generate a new fortnight starting this week? Incomplete todos will carry over.')) {
              regenerateFortnight();
            }
          }}>Generate new fortnight</button>
          <FortnightSwitcher />
          <BackupControls />
        </div>
      </header>
      {selectFortnightExpired(state) && (
        <p className={styles.banner} role="alert">This fortnight has ended. Generate a new one to continue.</p>
      )}
      {selectIsReadOnly(state) && (
        <p className={styles.bannerMuted} role="status">Viewing a past fortnight (read-only).</p>
      )}
      <div className={styles.layout}>
        <FortnightBoard />
        <RemindersPanel />
      </div>
      {standupOpen && <StandupModal onClose={() => setStandupOpen(false)} />}
    </div>
  );
}
