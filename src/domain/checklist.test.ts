import {
  addChecklistItem, removeChecklistItem, setTodoDone, toggleChecklistItem,
} from './checklist';
import { applyRollover } from './rollover';
import { carryOverTodos } from './fortnight';
import type { ChecklistItem, Fortnight, Todo } from './types';

const NOW = '2026-08-18T12:00:00.000Z';
const EARLIER = '2026-08-17T09:00:00.000Z';

function makeTodo(over: Partial<Todo> = {}): Todo {
  return {
    id: 't1', fortnightId: 'f1', title: 'task', priority: 'medium',
    scheduledDay: '2026-08-18', done: false, createdAt: '2026-08-10T09:00:00.000Z',
    rolledOver: false, ...over,
  };
}

function item(id: string, checked = false): ChecklistItem {
  return { id, text: `item ${id}`, checked };
}

describe('toggleChecklistItem', () => {
  it('checks an unchecked item without completing while others remain unchecked', () => {
    const todo = makeTodo({ checklist: [item('a'), item('b')] });
    const res = toggleChecklistItem(todo, 'a', NOW);
    expect(res.checklist![0].checked).toBe(true);
    expect(res.checklist![1].checked).toBe(false);
    expect(res.done).toBe(false);
    expect(res.completedAt).toBeUndefined();
  });

  it('checking the last unchecked item completes the todo and stamps completedAt', () => {
    const todo = makeTodo({ checklist: [item('a', true), item('b')] });
    const res = toggleChecklistItem(todo, 'b', NOW);
    expect(res.done).toBe(true);
    expect(res.completedAt).toBe(NOW);
  });

  it('unchecking any item of a done todo reopens it and clears completedAt', () => {
    const todo = makeTodo({
      done: true, completedAt: EARLIER, checklist: [item('a', true), item('b', true)],
    });
    const res = toggleChecklistItem(todo, 'a', NOW);
    expect(res.done).toBe(false);
    expect(res.completedAt).toBeUndefined();
    expect(res.checklist![0].checked).toBe(false);
    expect(res.checklist![1].checked).toBe(true);
  });

  it('leaves the todo semantically unchanged for an unknown item id', () => {
    const todo = makeTodo({ checklist: [item('a')] });
    const res = toggleChecklistItem(todo, 'nope', NOW);
    expect(res.checklist).toEqual(todo.checklist);
    expect(res.done).toBe(false);
  });

  it('returns the todo as-is when it has no checklist', () => {
    const todo = makeTodo();
    expect(toggleChecklistItem(todo, 'a', NOW)).toBe(todo);
  });

  it('never mutates its input', () => {
    const todo = makeTodo({ checklist: [item('a')] });
    toggleChecklistItem(todo, 'a', NOW);
    expect(todo.checklist![0].checked).toBe(false);
    expect(todo.done).toBe(false);
    expect(todo.completedAt).toBeUndefined();
  });
});

describe('addChecklistItem', () => {
  it('appends the item unchecked, creating the checklist when absent', () => {
    const todo = makeTodo();
    const res = addChecklistItem(todo, { id: 'a', text: 'first' }, NOW);
    expect(res.checklist).toEqual([{ id: 'a', text: 'first', checked: false }]);
    expect(res.done).toBe(false);
  });

  it('adding an item to a completed checklist todo reopens it (the invariant wins)', () => {
    const todo = makeTodo({ done: true, completedAt: EARLIER, checklist: [item('a', true)] });
    const res = addChecklistItem(todo, { id: 'b', text: 'new step' }, NOW);
    expect(res.done).toBe(false);
    expect(res.completedAt).toBeUndefined();
    expect(res.checklist).toHaveLength(2);
    expect(res.checklist![1]).toEqual({ id: 'b', text: 'new step', checked: false });
  });

  it('adding the first item to a done checklist-less todo also reopens it', () => {
    const todo = makeTodo({ done: true, completedAt: EARLIER });
    const res = addChecklistItem(todo, { id: 'a', text: 'first' }, NOW);
    expect(res.done).toBe(false);
    expect(res.completedAt).toBeUndefined();
  });
});

describe('removeChecklistItem', () => {
  it('removing the last unchecked item while the rest are checked auto-completes', () => {
    const todo = makeTodo({ checklist: [item('a', true), item('b', true), item('c')] });
    const res = removeChecklistItem(todo, 'c', NOW);
    expect(res.checklist).toHaveLength(2);
    expect(res.done).toBe(true);
    expect(res.completedAt).toBe(NOW);
  });

  it('removing a checked item does not complete while others are unchecked', () => {
    const todo = makeTodo({ checklist: [item('a', true), item('b')] });
    const res = removeChecklistItem(todo, 'a', NOW);
    expect(res.checklist).toEqual([item('b')]);
    expect(res.done).toBe(false);
  });

  it('removing the final remaining item normalizes checklist to undefined, done untouched (open todo)', () => {
    const todo = makeTodo({ checklist: [item('a')] });
    const res = removeChecklistItem(todo, 'a', NOW);
    expect(res.checklist).toBeUndefined();
    expect(res.done).toBe(false);
    expect(res.completedAt).toBeUndefined();
  });

  it('removing the final remaining item of a DONE todo keeps it done with its original completedAt', () => {
    const todo = makeTodo({ done: true, completedAt: EARLIER, checklist: [item('a', true)] });
    const res = removeChecklistItem(todo, 'a', NOW);
    expect(res.checklist).toBeUndefined();
    expect(res.done).toBe(true);
    expect(res.completedAt).toBe(EARLIER);
  });

  it('returns the todo as-is when it has no checklist', () => {
    const todo = makeTodo();
    expect(removeChecklistItem(todo, 'a', NOW)).toBe(todo);
  });
});

describe('setTodoDone', () => {
  it('completes a checklist-less todo exactly like the manual toggle (stamps completedAt)', () => {
    const res = setTodoDone(makeTodo(), true, NOW);
    expect(res.done).toBe(true);
    expect(res.completedAt).toBe(NOW);
  });

  it('reopening a checklist-less todo clears completedAt', () => {
    const todo = makeTodo({ done: true, completedAt: EARLIER });
    const res = setTodoDone(todo, false, NOW);
    expect(res.done).toBe(false);
    expect(res.completedAt).toBeUndefined();
  });

  it('completing checks every checklist item', () => {
    const todo = makeTodo({ checklist: [item('a'), item('b', true), item('c')] });
    const res = setTodoDone(todo, true, NOW);
    expect(res.done).toBe(true);
    expect(res.completedAt).toBe(NOW);
    expect(res.checklist!.every((i) => i.checked)).toBe(true);
  });

  it('reopening unchecks every checklist item', () => {
    const todo = makeTodo({
      done: true, completedAt: EARLIER, checklist: [item('a', true), item('b', true)],
    });
    const res = setTodoDone(todo, false, NOW);
    expect(res.done).toBe(false);
    expect(res.completedAt).toBeUndefined();
    expect(res.checklist!.every((i) => !i.checked)).toBe(true);
  });

  it('setting done=true on an already-done todo preserves the original completedAt', () => {
    const todo = makeTodo({ done: true, completedAt: EARLIER });
    const res = setTodoDone(todo, true, NOW);
    expect(res.done).toBe(true);
    expect(res.completedAt).toBe(EARLIER);
  });

  it('never mutates its input', () => {
    const todo = makeTodo({ checklist: [item('a')] });
    setTodoDone(todo, true, NOW);
    expect(todo.done).toBe(false);
    expect(todo.checklist![0].checked).toBe(false);
  });
});

describe('checklist auto-completion vs rollover/carry-over (INV-5 consequence, spec §2)', () => {
  // Literal 10-day fortnight fixture (deliberately NOT generateMonthDays —
  // same living-proof convention as rollover.test.ts / carryOver.test.ts).
  const f1: Fortnight = {
    id: 'f1', startDay: '2026-08-10',
    days: [
      '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
      '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
    ],
    createdAt: '2026-08-10T12:00:00.000Z',
  };

  /** A todo completed BY ITS CHECKLIST (never a manual toggle): checking the
   *  last unchecked item is what flips done. */
  function autoCompleted(id: string): Todo {
    const base = makeTodo({
      id, scheduledDay: '2026-08-10', checklist: [item('c1', true), item('c2', false)],
    });
    const completed = toggleChecklistItem(base, 'c2', NOW);
    expect(completed.done).toBe(true); // sanity: completion came from the checklist
    return completed;
  }

  it('applyRollover skips a checklist-auto-completed todo, exactly like a manually completed one', () => {
    const todos = {
      a: autoCompleted('a'),
      control: makeTodo({ id: 'control', scheduledDay: '2026-08-10' }),
    };
    const res = applyRollover(todos, f1, '2026-08-12');
    expect(res.todos.control.scheduledDay).toBe('2026-08-12'); // the run itself did move things
    expect(res.todos.a.scheduledDay).toBe('2026-08-10');       // ...but not the completed todo
    expect(res.todos.a.rolledOver).toBe(false);
    expect(res.todos.a.checklist).toEqual([item('c1', true), item('c2', true)]);
  });

  it('carryOverTodos leaves a checklist-auto-completed todo pinned to its old fortnight', () => {
    const f2: Fortnight = {
      id: 'f2', startDay: '2026-08-17',
      days: [
        '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
        '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
      ],
      createdAt: '2026-08-19T12:00:00.000Z',
    };
    const todos = {
      a: autoCompleted('a'),
      control: makeTodo({ id: 'control', scheduledDay: '2026-08-11' }),
    };
    const res = carryOverTodos(todos, 'f1', f2, '2026-08-19');
    expect(res.control.fortnightId).toBe('f2'); // the run itself did migrate things
    expect(res.a.fortnightId).toBe('f1');       // ...but the completed todo stays in history
    expect(res.a.scheduledDay).toBe('2026-08-10');
    expect(res.a.checklist).toEqual([item('c1', true), item('c2', true)]); // rides along untouched
  });
});
