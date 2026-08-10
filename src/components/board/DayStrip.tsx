import { useAppStore } from '../../store/store';
import { selectViewedFortnight, selectTodosForDay } from '../../store/selectors';
import { effectiveBoardDay } from '../../domain/fortnight';
import { formatDayLabel } from '../../domain/dates';
import { todayLocal } from '../../store/clock';
import styles from './DayStrip.module.css';

export function DayStrip() {
  const state = useAppStore();
  const fn = selectViewedFortnight(state);
  if (!fn) return null;
  const selected = state.selectedDay ?? fn.days[0];
  const idx = fn.days.indexOf(selected);
  const today = state.viewedFortnightId === state.activeFortnightId
    ? effectiveBoardDay(fn, todayLocal())
    : null;

  return (
    <nav className={styles.strip} aria-label="Fortnight days">
      <button aria-label="Previous day" disabled={idx <= 0}
        onClick={() => state.selectDay(fn.days[idx - 1])}>‹</button>
      {fn.days.map((day) => {
        const count = selectTodosForDay(state, fn.id, day).length;
        return (
          <button key={day}
            data-today={day === today ? '' : undefined}
            aria-current={day === selected ? 'date' : undefined}
            onClick={() => state.selectDay(day)}>
            {formatDayLabel(day)}{count > 0 ? ` (${count})` : ''}
          </button>
        );
      })}
      <button aria-label="Next day" disabled={idx >= fn.days.length - 1}
        onClick={() => state.selectDay(fn.days[idx + 1])}>›</button>
    </nav>
  );
}
