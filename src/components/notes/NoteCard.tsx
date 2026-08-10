import type { Note } from '../../domain/types';
import { useAppStore } from '../../store/store';
import styles from './NoteCard.module.css';

export function NoteCard({ note, readOnly }: { note: Note; readOnly: boolean }) {
  const resolveBlocker = useAppStore((s) => s.resolveBlocker);
  const deleteNote = useAppStore((s) => s.deleteNote);
  return (
    <li className={styles.card} data-resolved={note.resolved ? '' : undefined}>
      <span className={styles.text} data-category={note.category}>{note.text}</span>
      <div className={styles.actions}>
        {note.category === 'blocker' && (
          note.resolved
            ? <span className={styles.resolvedBadge}>Resolved</span>
            : !readOnly && (
              <button className={styles.actionButton} onClick={() => resolveBlocker(note.id)} aria-label={`Resolve blocker: ${note.text}`}>
                Resolve
              </button>
            )
        )}
        {!readOnly && (
          <button className={styles.actionButton} onClick={() => deleteNote(note.id)} aria-label={`Delete note: ${note.text}`}>Delete</button>
        )}
      </div>
    </li>
  );
}
