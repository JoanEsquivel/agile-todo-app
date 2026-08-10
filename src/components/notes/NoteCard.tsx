import type { Note } from '../../domain/types';
import { useAppStore } from '../../store/store';

export function NoteCard({ note, readOnly }: { note: Note; readOnly: boolean }) {
  const resolveBlocker = useAppStore((s) => s.resolveBlocker);
  const deleteNote = useAppStore((s) => s.deleteNote);
  return (
    <li>
      <span data-category={note.category}>{note.text}</span>
      {note.category === 'blocker' && (
        note.resolved
          ? <span>Resolved</span>
          : !readOnly && <button onClick={() => resolveBlocker(note.id)}>Resolve</button>
      )}
      {!readOnly && <button onClick={() => deleteNote(note.id)} aria-label={`Delete note: ${note.text}`}>Delete</button>}
    </li>
  );
}
