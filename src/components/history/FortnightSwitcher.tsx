import { useAppStore } from '../../store/store';
import { formatDayLabel } from '../../domain/dates';
import styles from './FortnightSwitcher.module.css';

export function FortnightSwitcher() {
  const fortnights = useAppStore((s) => s.fortnights);
  const activeId = useAppStore((s) => s.activeFortnightId);
  const viewedId = useAppStore((s) => s.viewedFortnightId);
  const viewFortnight = useAppStore((s) => s.viewFortnight);
  if (fortnights.length < 2) return null;

  return (
    <select className={styles.select} aria-label="Fortnight" value={viewedId ?? ''}
      onChange={(e) => viewFortnight(e.target.value)}>
      {[...fortnights].reverse().map((f) => (
        <option key={f.id} value={f.id}>
          {formatDayLabel(f.days[0])} – {formatDayLabel(f.days[f.days.length - 1])}
          {f.id === activeId ? ' (current)' : ''}
        </option>
      ))}
    </select>
  );
}
