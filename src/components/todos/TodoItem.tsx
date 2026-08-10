import { useState } from 'react';
import type { Todo } from '../../domain/types';
import { useAppStore } from '../../store/store';
import { selectViewedFortnight } from '../../store/selectors';
import { PriorityBadge } from '../common/PriorityBadge';
import { TodoForm } from './TodoForm';
import { useNow } from '../../hooks/useNow';

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
    <li data-done={todo.done ? '' : undefined}>
      <input type="checkbox" aria-label={todo.title} checked={todo.done}
        disabled={readOnly} onChange={() => toggleDone(todo.id)} />
      <span>{todo.title}</span>
      <PriorityBadge priority={todo.priority} />
      {overdue && <span data-overdue="">Overdue</span>}
      {todo.rolledOver && <span>Rolled over</span>}
      {todo.description && <p>{todo.description}</p>}
      {!readOnly && (
        <>
          <button onClick={() => setEditing(true)}>Edit</button>
          <button onClick={() => deleteTodo(todo.id)}>Delete</button>
        </>
      )}
    </li>
  );
}
