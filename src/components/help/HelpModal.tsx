import { useId, useState } from 'react';
import { Modal } from '../common/Modal';
import { DonateButton } from '../common/DonateButton';
import { VisitorBadge } from './VisitorBadge';
import styles from './HelpModal.module.css';

export type HelpTab = 'guide' | 'shortcuts';

// Guide copy is spec-final (docs/superpowers/specs/2026-08-11-help-modal-design.md §4,
// amended by docs/superpowers/specs/2026-08-11-visitor-count-badge-design.md §6):
// every claim must stay verifiable app behavior.
const GUIDE_SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: 'Monthly board',
    body: 'The board shows the workdays (Mon–Fri) of the current month. Move between days with ← →, or press T to jump to today.',
  },
  {
    title: 'Automatic rollover',
    body: 'When a new day starts, unfinished todos move forward to today and are marked as rolled over. Completed todos stay on the day you finished them.',
  },
  {
    title: 'Month history',
    body: 'When a month ends, the next one is generated automatically. Use the ‹ › stepper to revisit the two previous months — past months are read-only.',
  },
  {
    title: 'Todos & priorities',
    body: 'Press N to add a todo to the selected day, with high, medium or low priority. Click the checkbox to mark it done.',
  },
  {
    title: 'Checklists',
    body: 'Use a todo\'s Add checklist action to break it into sub-items, then expand its counter (e.g. 2/5) to add, check off or remove them. When every item is checked the todo completes itself; unchecking an item reopens it. Checking the todo itself checks or clears the whole list.',
  },
  {
    title: 'Reorder & re-prioritize',
    body: 'Drag a todo by its handle to reorder it within its priority group, or drop it in another group to change its priority. Incomplete todos that roll over to today line up after the ones you already arranged.',
  },
  {
    title: 'Notes: blockers & info',
    body: 'Press Shift+N to add a note. Unresolved blockers follow you from day to day and appear in the standup until you resolve them; info notes stay where you put them.',
  },
  {
    title: 'Standup',
    body: 'Press S for a summary of yesterday, today and open blockers, ready to copy for your standup.',
  },
  {
    title: 'Pomodoro',
    body: 'The header timer runs focus and break sessions; press P to configure durations. Settings are saved between visits.',
  },
  {
    title: 'Backup & theme',
    body: 'Export downloads your whole board as a JSON file; Import restores it. The sun/moon button switches between light, dark and system theme.',
  },
  {
    title: 'Privacy & analytics',
    body: 'The app collects anonymous, cookie-free visit counts — no personal data, no cookies. The badge in the footer below links to the public analytics dashboard.',
  },
];

// Migrated verbatim from the deleted ShortcutsOverlay, except the `?` row
// ("Show this overlay" → "Open this help").
const SHORTCUTS: Array<{ combo: string[]; description: string }> = [
  { combo: ['⌘', 'K'], description: 'Command palette (also Ctrl+K)' },
  { combo: ['?'], description: 'Open this help' },
  { combo: ['←', '→'], description: 'Previous / next day' },
  { combo: ['Home'], description: 'First day of the month' },
  { combo: ['End'], description: 'Last day of the month' },
  { combo: ['T'], description: 'Jump to today' },
  { combo: ['N'], description: 'New todo' },
  { combo: ['⇧', 'N'], description: 'New note' },
  { combo: ['S'], description: 'Standup' },
  { combo: ['P'], description: 'Pomodoro timer' },
  { combo: ['Space'], description: 'Grab or drop the focused todo handle' },
  { combo: ['↑', '↓'], description: 'Move a grabbed todo (crossing a group changes its priority)' },
  { combo: ['Esc'], description: 'Cancel a grab' },
  { combo: ['Esc'], description: 'Close the open form or dialog' },
];

const TABS: Array<{ id: HelpTab; label: string }> = [
  { id: 'guide', label: 'Guide' },
  { id: 'shortcuts', label: 'Shortcuts' },
];

export function HelpModal({ initialTab, onClose }: { initialTab: HelpTab; onClose: () => void }) {
  const [tab, setTab] = useState<HelpTab>(initialTab);
  const baseId = useId();

  // With two tabs, either arrow key means "the other one". The global ←/→
  // day-navigation shortcuts can't collide: useShortcuts bails while any
  // [role=dialog] is mounted.
  const onTablistKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next: HelpTab = tab === 'guide' ? 'shortcuts' : 'guide';
    setTab(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  };

  return (
    <Modal title="Help" onClose={onClose}>
      <div className={styles.tabs} role="tablist" aria-label="Help sections" onKeyDown={onTablistKeyDown}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            id={`${baseId}-tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`${baseId}-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={styles.tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'guide' ? (
        <div
          id={`${baseId}-panel-guide`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-guide`}
          className={styles.panel}
        >
          <dl className={styles.guide}>
            {GUIDE_SECTIONS.map((s) => (
              <div key={s.title}>
                <dt className={styles.guideTitle}>{s.title}</dt>
                <dd className={styles.guideBody}>{s.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <div
          id={`${baseId}-panel-shortcuts`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-shortcuts`}
          className={styles.panel}
        >
          <ul className={styles.list}>
            {SHORTCUTS.map((s) => (
              <li key={s.description} className={styles.row}>
                <span className={styles.combo}>
                  {s.combo.map((k, i) => (
                    <kbd key={i} className={styles.key}>{k}</kbd>
                  ))}
                </span>
                <span className={styles.description}>{s.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={styles.supportFooter}>
        <p className={styles.supportText}>Enjoying the app? Support its development!</p>
        <div className={styles.supportActions}>
          <VisitorBadge />
          <DonateButton />
        </div>
      </div>
    </Modal>
  );
}
