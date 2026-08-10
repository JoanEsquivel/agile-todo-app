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
    <nav
      className={styles.strip}
      aria-label="Fortnight days"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' && idx < fn.days.length - 1) state.selectDay(fn.days[idx + 1]);
        if (e.key === 'ArrowLeft' && idx > 0) state.selectDay(fn.days[idx - 1]);
      }}
    >
      <button className={styles.navButton} aria-label="Previous day" disabled={idx <= 0}
        onClick={() => state.selectDay(fn.days[idx - 1])}>‹</button>
      {fn.days.map((day) => {
        const count = selectTodosForDay(state, fn.id, day).length;
        return (
          <button key={day}
            className={styles.chip}
            data-today={day === today ? '' : undefined}
            aria-current={day === selected ? 'date' : undefined}
            onClick={() => state.selectDay(day)}>
            <span className={styles.chipDate}>{formatDayLabel(day)}</span>
            {count > 0 && <span className={styles.chipCount}>{` (${count})`}</span>}
          </button>
        );
      })}
      <button className={styles.navButton} aria-label="Next day" disabled={idx >= fn.days.length - 1}
        onClick={() => state.selectDay(fn.days[idx + 1])}>›</button>
    </nav>
  );
}
