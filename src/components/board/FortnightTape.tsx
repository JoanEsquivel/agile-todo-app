import { useRef } from 'react';
import { useAppStore } from '../../store/store';
import { selectDayWorkload, selectViewedFortnight } from '../../store/selectors';
import { formatDayLabel, chunkByWeek, formatWeekdayShort, dayOfMonth } from '../../domain/dates';
import { effectiveBoardDay } from '../../domain/fortnight';
import type { ISODate } from '../../domain/types';
import { todayLocal } from '../../store/clock';
import styles from './FortnightTape.module.css';

// Visual budget, not a data limit — the numeric count next to the bars is
// always exact; this only caps how many individual segments render before a
// very full day would otherwise overflow the little track.
const MAX_SEGMENTS_SHOWN = 4;

/**
 * The board period at a glance: every scheduled workday as a stacked column
 * of priority-colored segments (one per todo, dimmed when done), chunked
 * into weeks, doubling as day navigation. Replaces the old DayStrip's
 * detached chip row.
 *
 * Length-agnostic: renders whatever `fn.days` contains — nothing here
 * assumes a fixed count. The typical case is now a ~21-day calendar month
 * (the active period); a 10-workday fortnight only shows up when browsing
 * legacy history. The week boundaries come from `chunkByWeek` (a real
 * calendar computation, INV-4), not a fixed split.
 *
 * Roving tabindex: exactly one day button is a tab stop (the selected one);
 * arrows/Home/End move focus and selection together.
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
        aria-label={isToday ? `${formatDayLabel(day)} (today)` : formatDayLabel(day)}
        tabIndex={day === selected ? 0 : -1}
        onClick={() => state.selectDay(day)}
        onKeyDown={onKeyDown}
      >
        <span className={styles.date}>
          <span className={styles.dow}>{formatWeekdayShort(day)}</span>{' '}
          <span className={styles.dom}>{dayOfMonth(day)}</span>
        </span>
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
      </button>
    );
  };

  return (
    <nav className={styles.tape} aria-label="Month days">
      <div className={styles.weeks}>
        {chunkByWeek(fn.days).map((week) => (
          <div key={week[0]} className={styles.week}>{week.map(renderDay)}</div>
        ))}
      </div>
      {today && (
        <div className={styles.progress}>
          <span className={styles.progressLabel}>
            Day {fn.days.indexOf(today) + 1} of {fn.days.length}
          </span>
          <span className={styles.progressTrack} aria-hidden="true">
            <span
              className={styles.progressFill}
              style={{ inlineSize: `${((fn.days.indexOf(today) + 1) / fn.days.length) * 100}%` }}
            />
          </span>
        </div>
      )}
    </nav>
  );
}
