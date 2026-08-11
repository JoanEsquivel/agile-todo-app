import { useRef, useEffect } from 'react';
import { useAppStore } from '../../store/store';
import { selectDayWorkload, selectViewedFortnight } from '../../store/selectors';
import { formatDayLabel, chunkByWeek, formatWeekdayShort, dayOfMonth } from '../../domain/dates';
import { effectiveBoardDay } from '../../domain/fortnight';
import type { ISODate } from '../../domain/types';
import { todayLocal } from '../../store/clock';
import styles from './FortnightTape.module.css';

function weekRangeLabel(week: ISODate[]): string {
  return week.length === 1
    ? String(dayOfMonth(week[0]))
    : `${dayOfMonth(week[0])}–${dayOfMonth(week[week.length - 1])}`;
}

/**
 * The board period at a glance, as an accordion: the week containing the
 * selected day expands to full-width day chips; every other week folds to
 * one compact range button. Which week is expanded is derived from
 * `selectedDay` alone -- there's no separate "expanded week" state to keep
 * in sync.
 *
 * Length-agnostic: renders whatever `fn.days` contains — nothing here
 * assumes a fixed count. The typical case is now a ~21-day calendar month
 * (the active period); a 10-workday fortnight only shows up when browsing
 * legacy history. The week boundaries come from `chunkByWeek` (a real
 * calendar computation, INV-4), not a fixed split.
 *
 * Roving tabindex: exactly one control (a day chip or a folded week) is a
 * tab stop; arrows/Home/End move focus and selection together across the
 * whole month, even across a week boundary -- see the `pendingFocus`
 * effect below for why that can't be a synchronous `.focus()` call.
 */
export function FortnightTape() {
  const state = useAppStore();
  const fn = selectViewedFortnight(state);
  const dayRefs = useRef<Record<ISODate, HTMLButtonElement | null>>({});
  // A day button crossed into via arrow keys or a folded-week click may not
  // exist in the DOM yet at event time (its week isn't expanded until this
  // render commits), and the button that had focus may be about to unmount
  // (its week is folding). A synchronous `.focus()` can't reach a node that
  // doesn't exist yet, so we record the target and focus it in an effect
  // that runs after the commit that mounts it.
  const pendingFocus = useRef<ISODate | null>(null);

  useEffect(() => {
    if (pendingFocus.current) {
      dayRefs.current[pendingFocus.current]?.focus();
      pendingFocus.current = null;
    }
  });

  if (!fn) return null;

  const selected = state.selectedDay && fn.days.includes(state.selectedDay)
    ? state.selectedDay
    : fn.days[0];
  const idx = fn.days.indexOf(selected);
  // Read via todayLocal() (INV-2), same as the component this replaces —
  // that's what keeps the module-mocked clock working in tests. Only shown
  // at all while viewing the active fortnight; a past fortnight has no
  // "today" on its own tape.
  const today = state.viewedFortnightId === state.activeFortnightId
    ? effectiveBoardDay(fn, todayLocal())
    : null;
  const workload = selectDayWorkload(state, fn.id);
  const pendingFor = (day: ISODate) => (workload[day] ?? []).filter((s) => !s.done).length;

  const moveTo = (nextIdx: number) => {
    const nextDay = fn.days[nextIdx];
    pendingFocus.current = nextDay;
    state.selectDay(nextDay);
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
    const pending = pendingFor(day);
    const isToday = day === today;
    return (
      <button
        key={day}
        ref={(el) => { dayRefs.current[day] = el; }}
        type="button"
        className={styles.day}
        data-today={isToday ? '' : undefined}
        aria-current={day === selected ? 'date' : undefined}
        // WCAG 2.5.3 Label in Name: the visible text is "Tue 18" (the dow +
        // dom spans below) -- it must be a literal prefix/substring of the
        // accessible name, not replaced by it. The pending count and today
        // status are appended rather than substituted.
        aria-label={`${formatWeekdayShort(day)} ${dayOfMonth(day)} — ${formatDayLabel(day)}${
          pending > 0 ? `, ${pending} pending` : ''
        }${isToday ? ' (today)' : ''}`}
        tabIndex={day === selected ? 0 : -1}
        onClick={() => state.selectDay(day)}
        onKeyDown={onKeyDown}
      >
        <span className={styles.date}>
          <span className={styles.dow}>{formatWeekdayShort(day)}</span>
          <span className={styles.dom}>{dayOfMonth(day)}</span>
        </span>
        {pending > 0 && <span className={styles.pending}>{pending}</span>}
      </button>
    );
  };

  const renderFoldedWeek = (week: ISODate[]) => {
    const weekHasToday = today !== null && week.includes(today);
    const weekPending = week.reduce((sum, d) => sum + pendingFor(d), 0);
    const range = weekRangeLabel(week);
    return (
      <button
        key={week[0]}
        type="button"
        className={styles.foldedWeek}
        data-today={weekHasToday ? '' : undefined}
        // Reachable only by crossing into it via arrow keys (which expands
        // it, moving the tab stop onto a day chip) or a click -- never a
        // second tab stop of its own.
        tabIndex={-1}
        aria-label={`${range} — Week of ${formatDayLabel(week[0])}${
          weekPending > 0 ? `, ${weekPending} pending` : ''
        }${weekHasToday ? ' (includes today)' : ''}`}
        onClick={() => {
          pendingFocus.current = week[0];
          state.selectDay(week[0]);
        }}
      >
        <span className={styles.range}>{range}</span>
        {weekPending > 0 && <span className={styles.pending}>{weekPending}</span>}
      </button>
    );
  };

  return (
    <nav className={styles.tape} aria-label="Month days">
      <div className={styles.weeks}>
        {chunkByWeek(fn.days).map((week) => (
          week.includes(selected)
            ? <div key={week[0]} className={styles.week}>{week.map(renderDay)}</div>
            : renderFoldedWeek(week)
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
