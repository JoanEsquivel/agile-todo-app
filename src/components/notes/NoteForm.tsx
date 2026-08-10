import { useState } from 'react';
import type { ISODate, NoteCategory } from '../../domain/types';
import { useAppStore } from '../../store/store';

export function NoteForm({ day, onClose }: { day: ISODate; onClose: () => void }) {
  const addNote = useAppStore((s) => s.addNote);
  const [text, setText] = useState('');
  const [category, setCategory] = useState<NoteCategory>('info');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    addNote({ day, category, text });
    onClose();
  };

  return (
    <form onSubmit={submit}>
      <label>Text<textarea required value={text} onChange={(e) => setText(e.target.value)} /></label>
      <label>Category
        <select value={category} onChange={(e) => setCategory(e.target.value as NoteCategory)}>
          <option value="info">Info</option>
          <option value="blocker">Blocker</option>
        </select>
      </label>
      <button type="submit">Save note</button>
      <button type="button" onClick={onClose}>Cancel</button>
    </form>
  );
}
