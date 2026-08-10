import { useAppStore } from '../../store/store';
import { partitionReminders } from '../../domain/reminders';
import { useNow } from '../../hooks/useNow';
import type { Todo } from '../../domain/types';

function ReminderList({ title, items, onPick }: { title: string; items: Todo[]; onPick: (t: Todo) => void }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3>{title}</h3>
      <ul>
        {items.map((t) => (
          <li key={t.id}>
            <button onClick={() => onPick(t)}>
              {t.title} — {t.reminderAt!.replace('T', ' ')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RemindersPanel() {
  const todos = useAppStore((s) => s.todos);
  const selectDay = useAppStore((s) => s.selectDay);
  const now = useNow();
  const { overdue, upcoming } = partitionReminders(todos, now);
  if (overdue.length === 0 && upcoming.length === 0) return null;
  return (
    <aside aria-label="Reminders">
      <h2>Reminders</h2>
      <ReminderList title="Overdue" items={overdue} onPick={(t) => selectDay(t.scheduledDay)} />
      <ReminderList title="Upcoming" items={upcoming} onPick={(t) => selectDay(t.scheduledDay)} />
    </aside>
  );
}
