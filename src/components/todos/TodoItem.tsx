import { useState } from 'react';
import type { Todo } from '../../domain/types';
import { useAppStore } from '../../store/store';
import { selectViewedFortnight } from '../../store/selectors';
import { PriorityBadge } from '../common/PriorityBadge';
import { TodoForm } from './TodoForm';
import { useNow } from '../../hooks/useNow';
import styles from './TodoItem.module.css';

export function TodoItem({ todo, readOnly }: { todo: Todo; readOnly: boolean }) {
  const [editing, setEditing] = useState(false);
  const toggleDone = useAppStore((s) => s.toggleDone);
  const deleteTodo = useAppStore((s) => s.deleteTodo);
  const fn = useAppStore(selectViewedFortnight);
  const now = useNow();
  const overdue = !todo.done && todo.reminderAt !== undefined && new Date(todo.reminderAt) <= now;

  if (editing && fn) {
    return <TodoForm day={todo.scheduledDay} days={fn.days} todo={todo} onClose={() => setEditing(false)} />;
  }
  return (
    <li className={styles.item} data-done={todo.done ? '' : undefined}>
      <div className={styles.row}>
        <input className={styles.checkbox} type="checkbox" aria-label={todo.title} checked={todo.done}
          disabled={readOnly} onChange={() => toggleDone(todo.id)} />
        <div className={styles.body}>
          <div className={styles.titleRow}>
            <span className={styles.title}>{todo.title}</span>
            <PriorityBadge priority={todo.priority} />
            {overdue && <span className={styles.overdueBadge} data-overdue="">Overdue</span>}
            {todo.rolledOver && <span className={styles.rolloverBadge}>Rolled over</span>}
          </div>
          {todo.description && <p className={styles.description}>{todo.description}</p>}
        </div>
      </div>
      {!readOnly && (
        <div className={styles.actions}>
          <button className={styles.actionButton} onClick={() => setEditing(true)}>Edit</button>
          <button className={styles.actionButton} onClick={() => deleteTodo(todo.id)}>Delete</button>
        </div>
      )}
    </li>
  );
}
