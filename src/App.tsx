import { useState } from 'react';
import { useAppStore } from './store/store';
import { useDayChangeWatcher } from './hooks/useDayChangeWatcher';
import { useShortcuts } from './hooks/useShortcuts';
import { selectViewedFortnight, selectFortnightExpired, selectIsReadOnly } from './store/selectors';
import { formatDayLabel } from './domain/dates';
import { FortnightBoard } from './components/board/FortnightBoard';
import { RemindersPanel } from './components/reminders/RemindersPanel';
import { StandupModal } from './components/standup/StandupModal';
import { FortnightSwitcher } from './components/history/FortnightSwitcher';
import { BackupControls } from './components/common/BackupControls';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { Announcer } from './components/common/Announcer';
import styles from './App.module.css';

export default function App() {
  useDayChangeWatcher();
  const state = useAppStore();
  const fn = selectViewedFortnight(state);
  const regenerateFortnight = useAppStore((s) => s.regenerateFortnight);
  const [standupOpen, setStandupOpen] = useState(false);
  const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false);
  useShortcuts({ onOpenStandup: () => setStandupOpen(true) });
  return (
    <div className={styles.app}>
      <Announcer />
      <a className={styles.skipLink} href="#main">Skip to content</a>
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
          <button onClick={() => setConfirmRegenerateOpen(true)}>Generate new fortnight</button>
          <FortnightSwitcher />
          <BackupControls />
        </div>
      </header>
      {state.rehydrationError && (
        <p className={styles.banner} role="alert">
          Stored data could not be loaded (it may be from a newer version of the app) and has not
          been modified. Try reloading, or import a backup below.
        </p>
      )}
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
      {confirmRegenerateOpen && (
        <ConfirmDialog
          title="Generate new fortnight?"
          message="Incomplete todos carry over automatically. This can't be undone."
          confirmLabel="Generate"
          onConfirm={() => { regenerateFortnight(); setConfirmRegenerateOpen(false); }}
          onCancel={() => setConfirmRegenerateOpen(false)}
        />
      )}
    </div>
  );
}
