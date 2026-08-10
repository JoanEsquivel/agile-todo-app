import { useAppStore } from '../../store/store';
import { selectViewedFortnight } from '../../store/selectors';
import { formatDayLabel } from '../../domain/dates';
import { EmptyState } from '../common/EmptyState';
import styles from './DayColumn.module.css';

export function DayColumn() {
  const state = useAppStore();
  const fn = selectViewedFortnight(state);
  if (!fn) return null;
  const day = state.selectedDay ?? fn.days[0];

  return (
    <div className={styles.column}>
      <h2>{formatDayLabel(day)}</h2>
      <section aria-label="Todos">
        <EmptyState message="No todos for this day" />
      </section>
      <section aria-label="Notes">
        <EmptyState message="No notes for this day" />
      </section>
    </div>
  );
}
