import { useId, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../store/store';
import { selectViewedFortnight } from '../../store/selectors';
import { formatDayLabel } from '../../domain/dates';
import { Modal } from '../common/Modal';
import styles from './CommandPalette.module.css';

export interface CommandAction {
  id: string;
  label: string;
  run: () => void;
}

interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

/**
 * Filterable, arrow-navigable jump list: run an action, jump to a day in
 * the viewed fortnight, or jump to a todo by title. Day/todo navigation
 * works regardless of read-only mode (it isn't a mutation); `actions` is
 * whatever the caller decides is currently available -- App.tsx already
 * excludes Add todo/Add note from the list while viewing a read-only
 * fortnight, the same way the N/Shift+N shortcuts refuse to fire there.
 */
export function CommandPalette({ onClose, actions }: { onClose: () => void; actions: CommandAction[] }) {
  const state = useAppStore();
  const selectDay = useAppStore((s) => s.selectDay);
  const fn = selectViewedFortnight(state);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const actionItems: PaletteItem[] = actions.map((a) => ({
      id: `action:${a.id}`, label: a.label, hint: 'Action', run: () => { a.run(); onClose(); },
    }));
    const dayItems: PaletteItem[] = (fn?.days ?? []).map((day) => ({
      id: `day:${day}`, label: `Go to ${formatDayLabel(day)}`, hint: 'Day', run: () => { selectDay(day); onClose(); },
    }));
    // Todos only join the list once there's a query -- listing every todo in
    // the fortnight by default would bury the always-useful actions and days.
    const todoItems: PaletteItem[] = q.length === 0 || !fn ? [] : Object.values(state.todos)
      .filter((t) => t.fortnightId === fn.id && t.title.toLowerCase().includes(q))
      .map((t) => ({
        id: `todo:${t.id}`, label: t.title, hint: formatDayLabel(t.scheduledDay),
        run: () => { selectDay(t.scheduledDay); onClose(); },
      }));

    const candidates = [...actionItems, ...dayItems, ...todoItems];
    if (q.length === 0) return candidates;
    return candidates.filter((item) => item.label.toLowerCase().includes(q));
  }, [actions, fn, query, selectDay, state.todos, onClose]);

  const activeIndex = items.length === 0 ? -1 : Math.min(highlight, items.length - 1);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[activeIndex]?.run();
    }
  };

  return (
    <Modal title="Command palette" onClose={onClose} initialFocusRef={inputRef}>
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? items[activeIndex].id : undefined}
        placeholder="Jump to a day, a todo, or run an action…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
        onKeyDown={onKeyDown}
      />
      <ul id={listboxId} role="listbox" aria-label="Results" className={styles.list}>
        {items.length === 0 && <li className={styles.empty}>No matches</li>}
        {items.map((item, idx) => (
          <li
            key={item.id}
            id={item.id}
            role="option"
            aria-selected={idx === activeIndex}
            className={styles.item}
            data-active={idx === activeIndex ? '' : undefined}
            onMouseEnter={() => setHighlight(idx)}
            onClick={item.run}
          >
            <span className={styles.itemLabel}>{item.label}</span>
            <span className={styles.itemHint}>{item.hint}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
