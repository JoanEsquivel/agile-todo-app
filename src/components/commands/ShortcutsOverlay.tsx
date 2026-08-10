import { Modal } from '../common/Modal';
import styles from './ShortcutsOverlay.module.css';

const SHORTCUTS: Array<{ combo: string[]; description: string }> = [
  { combo: ['⌘', 'K'], description: 'Command palette (also Ctrl+K)' },
  { combo: ['?'], description: 'Show this overlay' },
  { combo: ['←', '→'], description: 'Previous / next day' },
  { combo: ['Home'], description: 'First day of the fortnight' },
  { combo: ['End'], description: 'Last day of the fortnight' },
  { combo: ['T'], description: 'Jump to today' },
  { combo: ['N'], description: 'New todo' },
  { combo: ['⇧', 'N'], description: 'New note' },
  { combo: ['S'], description: 'Standup' },
  { combo: ['Esc'], description: 'Close the open form or dialog' },
];

export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <ul className={styles.list}>
        {SHORTCUTS.map((s) => (
          <li key={s.description} className={styles.row}>
            <span className={styles.combo}>
              {s.combo.map((k, i) => <kbd key={i} className={styles.key}>{k}</kbd>)}
            </span>
            <span className={styles.description}>{s.description}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
