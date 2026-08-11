import { carryOverTodos, generateMonthDays } from './fortnight';
import type { Fortnight, Todo } from './types';

// Literal 10-day fortnight fixture (deliberately NOT generateMonthDays — see
// INV-5/domain notes: this is the living proof the domain still works with
// fortnight-length (not just month-length) periods). Equivalent to what
// generateFortnightDays('2026-08-19') used to produce.
const f2: Fortnight = {
  id: 'f2', startDay: '2026-08-17',
  days: [
    '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
    '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
  ],
  createdAt: '2026-08-19T12:00:00.000Z',
};

function makeTodo(over: Partial<Todo>): Todo {
  return {
    id: over.id ?? 't1', fortnightId: 'f1', title: 'task', priority: 'medium',
    scheduledDay: '2026-08-17', done: false, createdAt: '2026-08-10T09:00:00.000Z',
    rolledOver: false, ...over,
  };
}

describe('carryOverTodos (regenerating on 2026-08-19)', () => {
  it('moves incomplete past todos to the new effective day, flagged rolledOver', () => {
    const todos = { a: makeTodo({ id: 'a', scheduledDay: '2026-08-11' }) };
    const res = carryOverTodos(todos, 'f1', f2, '2026-08-19');
    expect(res.a).toMatchObject({ fortnightId: 'f2', scheduledDay: '2026-08-19', rolledOver: true });
  });

  it('keeps overlapping future days: only the fortnightId changes', () => {
    const todos = { a: makeTodo({ id: 'a', scheduledDay: '2026-08-20' }) };
    const res = carryOverTodos(todos, 'f1', f2, '2026-08-19');
    expect(res.a).toMatchObject({ fortnightId: 'f2', scheduledDay: '2026-08-20', rolledOver: false });
  });

  it('leaves done todos in the old fortnight (history)', () => {
    const todos = { a: makeTodo({ id: 'a', done: true, completedAt: '2026-08-17T15:00:00.000Z' }) };
    const res = carryOverTodos(todos, 'f1', f2, '2026-08-19');
    expect(res.a.fortnightId).toBe('f1');
  });

  it('preserves createdAt and reminderAt across the move', () => {
    const todos = { a: makeTodo({ id: 'a', scheduledDay: '2026-08-11', reminderAt: '2026-08-11T09:00' }) };
    const res = carryOverTodos(todos, 'f1', f2, '2026-08-19');
    expect(res.a.createdAt).toBe('2026-08-10T09:00:00.000Z');
    expect(res.a.reminderAt).toBe('2026-08-11T09:00');
  });

  it('moves overlap-day-before-effective-day to effective day with rolledOver', () => {
    const todos = { a: makeTodo({ id: 'a', scheduledDay: '2026-08-17' }) };
    const res = carryOverTodos(todos, 'f1', f2, '2026-08-19');
    expect(res.a).toMatchObject({ fortnightId: 'f2', scheduledDay: '2026-08-19', rolledOver: true });
  });
});

describe('carryOverTodos (mixed history: 10-day fortnight -> calendar month)', () => {
  // old: a legacy fortnight (10-day literal fixture, `f2` above).
  // new: a calendar-month period covering the same "today" — this is the
  // shape a real regenerate produces once the store switches to
  // generateMonthDays (Task 3). Proves carryOverTodos is agnostic to the
  // target period's length: it only reads newFortnight.days and today.
  const monthFortnight: Fortnight = {
    id: 'm-aug', startDay: '2026-08-03',
    days: generateMonthDays('2026-08-19'),
    createdAt: '2026-08-19T12:00:00.000Z',
  };

  it('a todo scheduled in the future, inside the new month, keeps its scheduledDay', () => {
    const todos = { a: makeTodo({ id: 'a', fortnightId: 'f2', scheduledDay: '2026-08-25' }) };
    const res = carryOverTodos(todos, 'f2', monthFortnight, '2026-08-19');
    expect(res.a).toMatchObject({ fortnightId: 'm-aug', scheduledDay: '2026-08-25', rolledOver: false });
  });

  it('a todo scheduled in the past goes to the effective day, flagged rolledOver', () => {
    const todos = { a: makeTodo({ id: 'a', fortnightId: 'f2', scheduledDay: '2026-08-11' }) };
    const res = carryOverTodos(todos, 'f2', monthFortnight, '2026-08-19');
    expect(res.a).toMatchObject({ fortnightId: 'm-aug', scheduledDay: '2026-08-19', rolledOver: true });
  });
});
