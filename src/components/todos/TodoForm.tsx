import { useState } from 'react';
import type { ISODate, Priority, Todo } from '../../domain/types';
import { formatDayLabel } from '../../domain/dates';
import { useAppStore } from '../../store/store';

interface Props { day: ISODate; days: ISODate[]; onClose: () => void; todo?: Todo }

export function TodoForm({ day, days, onClose, todo }: Props) {
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
    <form onSubmit={submit}>
      <label>Title<input required value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <label>Priority
        <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </label>
      <label>Day
        <select value={scheduledDay} onChange={(e) => setScheduledDay(e.target.value)}>
          {days.map((d) => <option key={d} value={d}>{formatDayLabel(d)}</option>)}
        </select>
      </label>
      <label>Reminder
        <input type="datetime-local" value={reminderAt} onChange={(e) => setReminderAt(e.target.value)} />
      </label>
      <button type="submit">Save</button>
      <button type="button" onClick={onClose}>Cancel</button>
    </form>
  );
}
