import { useState } from 'react';
import type { ISODate, Priority, Todo } from '../../domain/types';
import { formatDayLabel } from '../../domain/dates';
import { useAppStore } from '../../store/store';
import styles from './TodoForm.module.css';

interface Props { day: ISODate; days: ISODate[]; onClose: () => void; todo?: Todo; id?: string }

export function TodoForm({ day, days, onClose, todo, id }: Props) {
  const addTodo = useAppStore((s) => s.addTodo);
  const updateTodo = useAppStore((s) => s.updateTodo);
  const rescheduleTodo = useAppStore((s) => s.rescheduleTodo);
  const [title, setTitle] = useState(todo?.title ?? '');
  const [description, setDescription] = useState(todo?.description ?? '');
  const [priority, setPriority] = useState<Priority>(todo?.priority ?? 'medium');
  const [scheduledDay, setScheduledDay] = useState<ISODate>(todo?.scheduledDay ?? day);
  const [reminderAt, setReminderAt] = useState(todo?.reminderAt ?? '');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const reminder = reminderAt === '' ? undefined : reminderAt;
    if (todo) {
      updateTodo(todo.id, { title, description: description || undefined, priority, reminderAt: reminder });
      if (scheduledDay !== todo.scheduledDay) rescheduleTodo(todo.id, scheduledDay);
    } else {
      addTodo({ title, description: description || undefined, priority, scheduledDay, reminderAt: reminder });
    }
    onClose();
  };

  return (
    <form id={id} className={styles.form} onSubmit={submit}>
      <label className={styles.field}>Title
        {/* Autofocus is deliberate here, not a default left in place: opening
           this form (add or edit) is always a user-initiated action, and
           without it focus was falling through to <body> — see INV-9's
           form-open focus-management requirement. */}
        <input className={styles.input} required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className={styles.field}>Description
        <textarea className={styles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className={styles.fieldRow}>
        <label className={styles.field}>Priority
          <select className={styles.input} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className={styles.field}>Day
          <select className={styles.input} value={scheduledDay} onChange={(e) => setScheduledDay(e.target.value)}>
            {days.map((d) => <option key={d} value={d}>{formatDayLabel(d)}</option>)}
          </select>
        </label>
      </div>
      <label className={styles.field}>Reminder
        <input className={styles.input} type="datetime-local" value={reminderAt} onChange={(e) => setReminderAt(e.target.value)} />
      </label>
      <div className={styles.actions}>
        <button className={styles.saveButton} type="submit">Save</button>
        <button type="button" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}
