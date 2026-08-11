import { useState } from 'react';
import { useAppStore } from './store/store';
import { useDayChangeWatcher } from './hooks/useDayChangeWatcher';
import { useShortcuts } from './hooks/useShortcuts';
import { selectViewedFortnight, selectFortnightExpired, selectIsReadOnly } from './store/selectors';
import { formatDayLabel } from './domain/dates';
import { FortnightBoard } from './components/board/FortnightBoard';
import { FortnightTape } from './components/board/FortnightTape';
import { StandupModal } from './components/standup/StandupModal';
import { FortnightSwitcher } from './components/history/FortnightSwitcher';
import { BackupControls } from './components/common/BackupControls';
import { AuthorLinks } from './components/common/AuthorLinks';
import { ThemeToggle } from './components/common/ThemeToggle';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { Announcer } from './components/common/Announcer';
import { CommandPalette, type CommandAction } from './components/commands/CommandPalette';
import { ShortcutsOverlay } from './components/commands/ShortcutsOverlay';
import { PomodoroWidget } from './components/pomodoro/PomodoroWidget';
import { PomodoroModal } from './components/pomodoro/PomodoroModal';
import styles from './App.module.css';

export default function App() {
  useDayChangeWatcher();
  const state = useAppStore();
  const fn = selectViewedFortnight(state);
  const readOnly = selectIsReadOnly(state);
  const regenerateFortnight = useAppStore((s) => s.regenerateFortnight);
  const setComposeIntent = useAppStore((s) => s.setComposeIntent);
  const [standupOpen, setStandupOpen] = useState(false);
  const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pomodoroOpen, setPomodoroOpen] = useState(false);
  useShortcuts({
    onOpenStandup: () => setStandupOpen(true),
    onOpenPalette: () => setPaletteOpen(true),
    onOpenShortcutsOverlay: () => setShortcutsOpen(true),
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
    { id: 'generate-fortnight', label: 'Generate new fortnight', run: () => setConfirmRegenerateOpen(true) },
    { id: 'keyboard-shortcuts', label: 'Keyboard shortcuts', run: () => setShortcutsOpen(true) },
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
          <button onClick={() => setConfirmRegenerateOpen(true)}>Generate new fortnight</button>
          <FortnightSwitcher />
          <BackupControls />
          <PomodoroWidget onOpenModal={() => setPomodoroOpen(true)} />
          <ThemeToggle />
          <AuthorLinks />
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
      <FortnightTape />
      <FortnightBoard />
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
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} actions={paletteActions} />}
      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
      {pomodoroOpen && <PomodoroModal onClose={() => setPomodoroOpen(false)} />}
    </div>
  );
}
