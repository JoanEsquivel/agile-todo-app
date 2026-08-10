import { carryOverTodos, generateFortnightDays } from './fortnight';
import type { Fortnight, Todo } from './types';

const f2: Fortnight = {
  id: 'f2', startDay: '2026-08-17',
  days: generateFortnightDays('2026-08-19'),
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
