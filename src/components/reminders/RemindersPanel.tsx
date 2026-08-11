import { useAppStore } from '../../store/store';
import { partitionReminders } from '../../domain/reminders';
import { useNow } from '../../hooks/useNow';
import type { Todo } from '../../domain/types';
import { EmptyState } from '../common/EmptyState';
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
  const viewFortnight = useAppStore((s) => s.viewFortnight);
  const activeFortnightId = useAppStore((s) => s.activeFortnightId);
  const now = useNow();
  const { overdue, upcoming } = partitionReminders(todos, now);
  const empty = overdue.length === 0 && upcoming.length === 0;
  // Reminders always come from active-fortnight todos. If the user is
  // currently viewing a past (read-only) fortnight, selecting the day alone
  // would leave selectedDay pointing outside the viewed fortnight's day
  // range, rendering a broken board. Switch the view back to the active
  // fortnight first.
  const onPick = (t: Todo) => {
    if (activeFortnightId) viewFortnight(activeFortnightId);
    selectDay(t.scheduledDay);
  };
  return (
    <aside className={styles.panel} aria-label="Reminders">
      <h2 className={styles.heading}>Reminders</h2>
      {empty && <EmptyState message="No reminders" />}
      <ReminderList title="Overdue" items={overdue} onPick={onPick} tone="overdue" />
      <ReminderList title="Upcoming" items={upcoming} onPick={onPick} tone="upcoming" />
    </aside>
  );
}
