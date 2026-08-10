import { useRef } from 'react';
import { useAppStore } from '../../store/store';
import { selectDayWorkload, selectViewedFortnight } from '../../store/selectors';
import { formatDayLabel } from '../../domain/dates';
import { effectiveBoardDay } from '../../domain/fortnight';
import type { ISODate } from '../../domain/types';
import { todayLocal } from '../../store/clock';
import { VisuallyHidden } from '../common/VisuallyHidden';
import styles from './FortnightTape.module.css';

// Visual budget, not a data limit — the numeric count next to the bars is
// always exact; this only caps how many individual segments render before a
// very full day would otherwise overflow the little track.
const MAX_SEGMENTS_SHOWN = 4;

/**
 * The fortnight at a glance: each of the 10 workdays as a stacked column of
 * priority-colored segments (one per todo, dimmed when done), split by a
 * real gap at the week boundary, doubling as day navigation. Replaces the
 * old DayStrip's detached chip row.
 *
 * Roving tabindex: exactly one day button is a tab stop (the selected one);
 * arrows/Home/End move focus and selection together. Renders `fn.days`
 * verbatim (always exactly 10 entries) — the week gap is a CSS gap between
 * two groups of 5, never a date computation (INV-4).
 */
export function FortnightTape() {
  const state = useAppStore();
  const fn = selectViewedFortnight(state);
  const dayRefs = useRef<Record<ISODate, HTMLButtonElement | null>>({});
  if (!fn) return null;

  const selected = state.selectedDay ?? fn.days[0];
  const idx = fn.days.indexOf(selected);
  // Read via todayLocal() (INV-2), same as the component this replaces —
  // that's what keeps the module-mocked clock working in tests. Only shown
  // at all while viewing the active fortnight; a past fortnight has no
  // "today" on its own tape.
  const today = state.viewedFortnightId === state.activeFortnightId
    ? effectiveBoardDay(fn, todayLocal())
    : null;
  const workload = selectDayWorkload(state, fn.id);

  const moveTo = (nextIdx: number) => {
    const nextDay = fn.days[nextIdx];
    state.selectDay(nextDay);
    // Programmatic selection doesn't move DOM focus by itself — without
    // this, arrowing past a day would silently strand focus on the button
    // that's about to become tabIndex=-1.
    dayRefs.current[nextDay]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    let nextIdx: number | null = null;
    if (e.key === 'ArrowRight' && idx < fn.days.length - 1) nextIdx = idx + 1;
    else if (e.key === 'ArrowLeft' && idx > 0) nextIdx = idx - 1;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = fn.days.length - 1;
    if (nextIdx === null) return;
    // Also what lets a future global shortcut listener skip re-handling the
    // same key via `if (e.defaultPrevented) return` instead of double-moving.
    e.preventDefault();
    moveTo(nextIdx);
  };

  const renderDay = (day: ISODate) => {
    const segments = workload[day] ?? [];
    const isToday = day === today;
    return (
      <button
        key={day}
        ref={(el) => { dayRefs.current[day] = el; }}
        type="button"
        className={styles.day}
        data-today={isToday ? '' : undefined}
        aria-current={day === selected ? 'date' : undefined}
        tabIndex={day === selected ? 0 : -1}
        onClick={() => state.selectDay(day)}
        onKeyDown={onKeyDown}
      >
        <span className={styles.date}>{formatDayLabel(day)}</span>
        <span className={styles.segments} aria-hidden="true">
          {segments.length === 0
            ? <span className={styles.emptyTick} />
            : segments.slice(0, MAX_SEGMENTS_SHOWN).map((seg) => (
              <span
                key={seg.id}
                className={styles.segment}
                data-priority={seg.priority}
                data-done={seg.done ? '' : undefined}
              />
            ))}
        </span>
        {segments.length > 0 && <span className={styles.count}>{segments.length}</span>}
        {/* The visual playhead dot (CSS, on [data-today]) isn't itself
           perceivable to a screen reader — this is the actual indication. */}
        {isToday && <VisuallyHidden> (today)</VisuallyHidden>}
      </button>
    );
  };

  return (
    <nav className={styles.tape} aria-label="Fortnight days">
      <button
        type="button"
        className={styles.navButton}
        aria-label="Previous day"
        disabled={idx <= 0}
        onClick={() => state.selectDay(fn.days[idx - 1])}
      >
        ‹
      </button>
      <div className={styles.weeks}>
        <div className={styles.week}>{fn.days.slice(0, 5).map(renderDay)}</div>
        <div className={styles.week}>{fn.days.slice(5).map(renderDay)}</div>
      </div>
      <button
        type="button"
        className={styles.navButton}
        aria-label="Next day"
        disabled={idx >= fn.days.length - 1}
        onClick={() => state.selectDay(fn.days[idx + 1])}
      >
        ›
      </button>
    </nav>
  );
}
