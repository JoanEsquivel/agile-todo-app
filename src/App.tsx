import { useState } from 'react';
import { useAppStore } from './store/store';
import { useDayChangeWatcher } from './hooks/useDayChangeWatcher';
import { useShortcuts } from './hooks/useShortcuts';
import { selectViewedFortnight, selectIsReadOnly } from './store/selectors';
import { formatDayLabel } from './domain/dates';
import { FortnightBoard } from './components/board/FortnightBoard';
import { FortnightTape } from './components/board/FortnightTape';
import { StandupModal } from './components/standup/StandupModal';
import { FortnightNav } from './components/history/FortnightNav';
import { BackupButton } from './components/common/BackupButton';
import { BackupModal } from './components/common/BackupModal';
import { AuthorLinks } from './components/common/AuthorLinks';
import { ThemeToggle } from './components/common/ThemeToggle';
import { Announcer } from './components/common/Announcer';
import { CommandPalette, type CommandAction } from './components/commands/CommandPalette';
import { HelpButton } from './components/help/HelpButton';
import { HelpModal, type HelpTab } from './components/help/HelpModal';
import { PomodoroWidget } from './components/pomodoro/PomodoroWidget';
import { PomodoroModal } from './components/pomodoro/PomodoroModal';
import styles from './App.module.css';

export default function App() {
  useDayChangeWatcher();
  const state = useAppStore();
  const fn = selectViewedFortnight(state);
  const readOnly = selectIsReadOnly(state);
  const setComposeIntent = useAppStore((s) => s.setComposeIntent);
  const [standupOpen, setStandupOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState<HelpTab | null>(null);
  const [pomodoroOpen, setPomodoroOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  useShortcuts({
    onOpenStandup: () => setStandupOpen(true),
    onOpenPalette: () => setPaletteOpen(true),
    onOpenHelp: () => setHelpOpen('shortcuts'),
    onOpenPomodoro: () => setPomodoroOpen(true),
  });

  // Excludes the two compose actions while read-only, same as the N/Shift+N
  // shortcuts refusing to fire there -- offering an action that would just
  // silently no-op (see setComposeIntent's own INV-9 guard) is a dead end,
  // not a choice.
  const paletteActions: CommandAction[] = [
    ...(readOnly ? [] : [
      { id: 'add-todo', label: 'Add todo', run: () => setComposeIntent('todo') },
      { id: 'add-note', label: 'Add note', run: () => setComposeIntent('note') },
    ]),
    { id: 'standup', label: 'Standup', run: () => setStandupOpen(true) },
    // Not board mutation, so no read-only gate — the timer works while
    // viewing a past fortnight.
    { id: 'pomodoro', label: 'Pomodoro timer', run: () => setPomodoroOpen(true) },
    { id: 'backup', label: 'Backup & restore', run: () => setBackupOpen(true) },
    { id: 'help-guide', label: 'Help guide', run: () => setHelpOpen('guide') },
    { id: 'keyboard-shortcuts', label: 'Keyboard shortcuts', run: () => setHelpOpen('shortcuts') },
  ];

  return (
    <div className={styles.app}>
      <Announcer />
      <a className={styles.skipLink} href="#main">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1 className={styles.heading}>Agile Todo</h1>
          {fn && (
            <p className={styles.range}>
              {formatDayLabel(fn.days[0])} – {formatDayLabel(fn.days[fn.days.length - 1])}
            </p>
          )}
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryAction} onClick={() => setStandupOpen(true)}>Standup</button>
          <FortnightNav />
          <BackupButton onClick={() => setBackupOpen(true)} />
          <PomodoroWidget onOpenModal={() => setPomodoroOpen(true)} />
          <HelpButton onClick={() => setHelpOpen('guide')} />
          <ThemeToggle />
          <AuthorLinks />
        </div>
      </header>
      {state.rehydrationError && (
        <p className={styles.banner} role="alert">
          Stored data could not be loaded (it may be from a newer version of the app) and has not
          been modified. Try reloading, or use the Backup button in the header to import a backup.
        </p>
      )}
      {selectIsReadOnly(state) && (
        <p className={styles.bannerMuted} role="status">Viewing a past month (read-only).</p>
      )}
      <FortnightTape />
      <FortnightBoard />
      {standupOpen && <StandupModal onClose={() => setStandupOpen(false)} />}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} actions={paletteActions} />}
      {helpOpen && <HelpModal initialTab={helpOpen} onClose={() => setHelpOpen(null)} />}
      {pomodoroOpen && <PomodoroModal onClose={() => setPomodoroOpen(false)} />}
      {backupOpen && <BackupModal onClose={() => setBackupOpen(false)} />}
    </div>
  );
}
