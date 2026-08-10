import { partitionReminders } from './reminders';
import type { Todo } from './types';

function makeTodo(over: Partial<Todo>): Todo {
  return {
    id: over.id ?? 't1', fortnightId: 'f1', title: 'task', priority: 'medium',
    scheduledDay: '2026-08-18', done: false, createdAt: '2026-08-10T09:00:00.000Z',
    rolledOver: false, ...over,
  };
}

describe('partitionReminders', () => {
  const now = new Date(2026, 7, 18, 12, 0); // Aug 18, 12:00 local

  it('splits into overdue (<= now) and upcoming (> now), sorted by time', () => {
    const todos = {
      late2: makeTodo({ id: 'late2', reminderAt: '2026-08-18T11:00' }),
      late1: makeTodo({ id: 'late1', reminderAt: '2026-08-17T09:00' }),
      soon: makeTodo({ id: 'soon', reminderAt: '2026-08-18T15:00' }),
    };
    const res = partitionReminders(todos, now);
    expect(res.overdue.map((t) => t.id)).toEqual(['late1', 'late2']);
    expect(res.upcoming.map((t) => t.id)).toEqual(['soon']);
  });

  it('excludes done todos and todos without reminders', () => {
    const todos = {
      done: makeTodo({ id: 'done', done: true, reminderAt: '2026-08-17T09:00' }),
      plain: makeTodo({ id: 'plain' }),
    };
    const res = partitionReminders(todos, now);
    expect(res.overdue).toEqual([]);
    expect(res.upcoming).toEqual([]);
  });
});
