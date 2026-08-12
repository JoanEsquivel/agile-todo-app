import { useState } from 'react';
import type { Todo } from '../../domain/types';
import { useAppStore } from '../../store/store';
import { selectViewedFortnight } from '../../store/selectors';
import { PriorityBadge } from '../common/PriorityBadge';
import { TodoForm } from './TodoForm';
import { useNow } from '../../hooks/useNow';
import styles from './TodoItem.module.css';

export interface ReorderProps {
  handleProps: React.HTMLAttributes<HTMLButtonElement>;
  itemRef: (el: HTMLElement | null) => void;
  dragging: boolean;
  dragOffset: number;
}

export function TodoItem({ todo, readOnly, reorder }: {
  todo: Todo; readOnly: boolean; reorder?: ReorderProps;
}) {
  const [editing, setEditing] = useState(false);
  // Ephemeral by spec: collapsed by default, dies with the card, never persisted.
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const toggleDone = useAppStore((s) => s.toggleDone);
  const deleteTodo = useAppStore((s) => s.deleteTodo);
  const addChecklistItem = useAppStore((s) => s.addChecklistItem);
  const toggleChecklistItem = useAppStore((s) => s.toggleChecklistItem);
  const removeChecklistItem = useAppStore((s) => s.removeChecklistItem);
  const fn = useAppStore(selectViewedFortnight);
  const now = useNow();
  const overdue = !todo.done && todo.reminderAt !== undefined && new Date(todo.reminderAt) <= now;

  const checklist = todo.checklist ?? [];
  const hasChecklist = checklist.length > 0;
  const checkedCount = checklist.filter((i) => i.checked).length;
  const progress = `${checkedCount}/${checklist.length}`;

  if (editing && fn) {
    return <TodoForm day={todo.scheduledDay} days={fn.days} todo={todo} onClose={() => setEditing(false)} />;
  }

  const submitNewItem = (e: React.FormEvent) => {
    e.preventDefault();
    addChecklistItem(todo.id, newItemText); // store trims and rejects empty text
    setNewItemText('');
  };

  return (
    <li
      ref={reorder?.itemRef}
      className={reorder?.dragging ? `${styles.item} ${styles.itemDragging}` : styles.item}
      style={reorder?.dragging ? { transform: `translateY(${reorder.dragOffset}px)` } : undefined}
      data-done={todo.done ? '' : undefined}
    >
      <div className={styles.row}>
        {!readOnly && !todo.done && reorder && (
          <button
            type="button"
            className={styles.handle}
            aria-label={`Reorder todo: ${todo.title}`}
            {...reorder.handleProps}
          >
            <span aria-hidden="true">⋮⋮</span>
          </button>
        )}
        <input className={styles.checkbox} type="checkbox" aria-label={todo.title} checked={todo.done}
          disabled={readOnly} onChange={() => toggleDone(todo.id)} />
        <div className={styles.body}>
          <div className={styles.titleRow}>
            <span className={styles.title}>{todo.title}</span>
            <PriorityBadge priority={todo.priority} />
            {hasChecklist && (
              // Disclosure, not mutation — rendered in read-only mode too.
              // WCAG 2.5.3: the visible "2/5" stays a literal substring of
              // the accessible name.
              <button
                className={styles.progressToggle}
                aria-expanded={checklistOpen}
                aria-label={`${progress} checklist items done`}
                onClick={() => setChecklistOpen((open) => !open)}
              >
                {progress}
              </button>
            )}
            {overdue && <span className={styles.overdueBadge}>Overdue</span>}
            {todo.rolledOver && <span className={styles.rolloverBadge}>Rolled over</span>}
          </div>
          {todo.description && <p className={styles.description}>{todo.description}</p>}
        </div>
      </div>
      {checklistOpen && (hasChecklist || !readOnly) && (
        <div className={styles.checklist}>
          {hasChecklist && (
            <ul className={styles.checklistItems}>
              {checklist.map((item) => (
                <li key={item.id} className={styles.checklistItem}>
                  <label className={styles.checklistLabel}>
                    <input className={styles.checkbox} type="checkbox" checked={item.checked}
                      disabled={readOnly} onChange={() => toggleChecklistItem(todo.id, item.id)} />
                    <span className={styles.checklistText}>{item.text}</span>
                  </label>
                  {!readOnly && (
                    <button className={styles.actionButton} aria-label={`Remove ${item.text}`}
                      onClick={() => removeChecklistItem(todo.id, item.id)}>Remove</button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!readOnly && (
            // INV-9 rule 1: the mutating element itself is gated on
            // !readOnly, not just the buttons that reveal it. Typing here is
            // safe with the global shortcuts: they all bail while focus is
            // in a text-entry control.
            <form className={styles.checklistAdd} onSubmit={submitNewItem}>
              <input
                className={styles.checklistInput}
                aria-label="Add checklist item"
                value={newItemText}
                // Focus lands here only through the "Add checklist" door
                // (no checklist yet); a counter-expand never steals focus.
                autoFocus={!hasChecklist}
                onChange={(e) => setNewItemText(e.target.value)}
              />
              <button className={styles.actionButton} type="submit"
                aria-label={`Add checklist item to todo: ${todo.title}`}>Add</button>
            </form>
          )}
        </div>
      )}
      {!readOnly && (
        <div className={styles.actions}>
          {!hasChecklist && (
            <button className={styles.actionButton} aria-expanded={checklistOpen}
              onClick={() => setChecklistOpen((open) => !open)}
              aria-label={`Add checklist to todo: ${todo.title}`}>Add checklist</button>
          )}
          <button className={styles.actionButton} onClick={() => setEditing(true)} aria-label={`Edit todo: ${todo.title}`}>Edit</button>
          <button className={styles.actionButton} onClick={() => deleteTodo(todo.id)} aria-label={`Delete todo: ${todo.title}`}>Delete</button>
        </div>
      )}
    </li>
  );
}
