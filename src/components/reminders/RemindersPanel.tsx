import { useAppStore } from '../../store/store';
import { partitionReminders } from '../../domain/reminders';
import { useNow } from '../../hooks/useNow';
import type { Todo } from '../../domain/types';
import styles from './RemindersPanel.module.css';

function ReminderList({ title, items, onPick, tone }: {
  title: string; items: Todo[]; onPick: (t: Todo) => void; tone: 'overdue' | 'upcoming';
}) {
  if (items.length === 0) return null;
  return (
    <section className={styles.group}>
      <h3 className={styles.groupLabel}>{title}</h3>
      <ul className={styles.list}>
        {items.map((t) => (
          <li key={t.id}>
            <button
              className={tone === 'overdue' ? styles.overdueButton : styles.upcomingButton}
              onClick={() => onPick(t)}
            >
              <span className={styles.reminderTitle}>{t.title}</span>
              <span className={styles.reminderTime}>{t.reminderAt!.replace('T', ' ')}</span>
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
    <aside className={styles.panel} aria-label="Reminders">
      <h2 className={styles.heading}>Reminders</h2>
      <ReminderList title="Overdue" items={overdue} onPick={(t) => selectDay(t.scheduledDay)} tone="overdue" />
      <ReminderList title="Upcoming" items={upcoming} onPick={(t) => selectDay(t.scheduledDay)} tone="upcoming" />
    </aside>
  );
}
