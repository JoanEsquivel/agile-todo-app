import { useAppStore } from '../../store/store';
import { formatMonthLabel } from '../../domain/dates';
import styles from './FortnightNav.module.css';

/** Month stepper replacing the old history dropdown: steps through stored
 *  periods in chronological order -- sorted by days[0], because array order
 *  is only append-order and tests deliberately violate it -- bounded by the
 *  retention window. Two legacy periods inside one month are each their own
 *  stop (distinct boards); the header's date range disambiguates them.
 *  Navigation goes through viewFortnight ONLY (INV-9: it refuses nothing
 *  here but clears composeIntent and picks today / first-day as the
 *  selected day -- no second door writes viewedFortnightId). Unlike the
 *  dropdown, this renders even with a single period (both arrows
 *  disabled) so the current month is always labeled. */
export function FortnightNav() {
  const fortnights = useAppStore((s) => s.fortnights);
  const activeId = useAppStore((s) => s.activeFortnightId);
  const viewedId = useAppStore((s) => s.viewedFortnightId);
  const viewFortnight = useAppStore((s) => s.viewFortnight);

  const ordered = [...fortnights].sort((a, b) => a.days[0].localeCompare(b.days[0]));
  const index = ordered.findIndex((f) => f.id === viewedId);
  if (index === -1) return null; // pre-init only: nothing viewed yet

  return (
    <nav className={styles.nav} aria-label="Month navigation">
      <button
        className={styles.arrow}
        aria-label="Previous month"
        disabled={index === 0}
        onClick={() => viewFortnight(ordered[index - 1].id)}
      >
        ‹
      </button>
      <span className={styles.label}>
        {formatMonthLabel(ordered[index].days[0])}
        {ordered[index].id === activeId ? ' (current)' : ''}
      </span>
      <button
        className={styles.arrow}
        aria-label="Next month"
        disabled={index === ordered.length - 1}
        onClick={() => viewFortnight(ordered[index + 1].id)}
      >
        ›
      </button>
    </nav>
  );
}
