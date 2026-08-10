import { useState } from 'react';
import { useAppStore } from '../../store/store';
import { selectIsReadOnly, selectTodosForDay, selectViewedFortnight } from '../../store/selectors';
import { formatDayLabel } from '../../domain/dates';
import { EmptyState } from '../common/EmptyState';
import { TodoItem } from '../todos/TodoItem';
import { TodoForm } from '../todos/TodoForm';
import styles from './DayColumn.module.css';

export function DayColumn() {
  const state = useAppStore();
  const fn = selectViewedFortnight(state);
  const [adding, setAdding] = useState(false);
  if (!fn) return null;
  const day = state.selectedDay ?? fn.days[0];
  const readOnly = selectIsReadOnly(state);
  const todos = selectTodosForDay(state, fn.id, day);

  return (
    <div className={styles.column}>
      <h2>{formatDayLabel(day)}</h2>
      <section aria-label="Todos">
        {!readOnly && !adding && <button onClick={() => setAdding(true)}>Add todo</button>}
        {adding && <TodoForm day={day} days={fn.days} onClose={() => setAdding(false)} />}
        {todos.length === 0
          ? <EmptyState message="No todos for this day" />
          : <ul>{todos.map((t) => <TodoItem key={t.id} todo={t} readOnly={readOnly} />)}</ul>}
      </section>
      <section aria-label="Notes">
        <EmptyState message="No notes for this day" />
      </section>
    </div>
  );
}
