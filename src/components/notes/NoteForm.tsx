import { useState } from 'react';
import type { ISODate, NoteCategory } from '../../domain/types';
import { useAppStore } from '../../store/store';
import styles from './NoteForm.module.css';

export function NoteForm({ day, onClose, id }: { day: ISODate; onClose: () => void; id?: string }) {
  const addNote = useAppStore((s) => s.addNote);
  const [text, setText] = useState('');
  const [category, setCategory] = useState<NoteCategory>('info');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    addNote({ day, category, text });
    onClose();
  };

  return (
    <form
      id={id}
      className={styles.form}
      onSubmit={submit}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}
    >
      <label className={styles.field}>Text
        <textarea className={styles.textarea} required autoFocus value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <label className={styles.field}>Category
        <select className={styles.input} value={category} onChange={(e) => setCategory(e.target.value as NoteCategory)}>
          <option value="info">Info</option>
          <option value="blocker">Blocker</option>
        </select>
      </label>
      <div className={styles.actions}>
        <button className={styles.saveButton} type="submit">Save note</button>
        <button type="button" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}
