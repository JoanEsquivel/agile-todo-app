import { applyRollover, applyNoteRollover } from './rollover';
import type { Fortnight, Note, Todo } from './types';

// Literal 10-day fortnight fixture (deliberately NOT generateMonthDays — see
// INV-5/domain notes: this is the living proof the domain still works with
// fortnight-length (not just month-length) periods).
const fn: Fortnight = {
  id: 'f1', startDay: '2026-08-10',
  days: [
    '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
    '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
  ],
  createdAt: '2026-08-10T12:00:00.000Z',
};

function makeTodo(over: Partial<Todo>): Todo {
  return {
    id: over.id ?? 't1', fortnightId: 'f1', title: 'task', priority: 'medium',
    scheduledDay: '2026-08-10', done: false, createdAt: '2026-08-10T09:00:00.000Z',
    rolledOver: false, ...over,
  };
}

describe('applyRollover', () => {
  it('moves past incomplete todos to today and flags them', () => {
    const todos = { a: makeTodo({ id: 'a', scheduledDay: '2026-08-10' }) };
    const res = applyRollover(todos, fn, '2026-08-12');
    expect(res.changed).toBe(true);
    expect(res.todos.a.scheduledDay).toBe('2026-08-12');
    expect(res.todos.a.rolledOver).toBe(true);
  });

  it('leaves done, today, and future todos untouched', () => {
    const todos = {
      done: makeTodo({ id: 'done', scheduledDay: '2026-08-10', done: true }),
      today: makeTodo({ id: 'today', scheduledDay: '2026-08-12' }),
      future: makeTodo({ id: 'future', scheduledDay: '2026-08-20' }),
    };
    const res = applyRollover(todos, fn, '2026-08-12');
    expect(res.changed).toBe(false);
    expect(res.todos).toEqual(todos);
  });

  it('ignores todos from other fortnights', () => {
    const todos = { x: makeTodo({ id: 'x', fortnightId: 'OLD', scheduledDay: '2026-08-10' }) };
    expect(applyRollover(todos, fn, '2026-08-12').changed).toBe(false);
  });

  it('on a weekend, rolls to the upcoming Monday', () => {
    const todos = { a: makeTodo({ id: 'a', scheduledDay: '2026-08-13' }) };
    const res = applyRollover(todos, fn, '2026-08-15'); // Saturday
    expect(res.todos.a.scheduledDay).toBe('2026-08-17');
  });

  it('no-ops when the fortnight is expired', () => {
    const todos = { a: makeTodo({ id: 'a', scheduledDay: '2026-08-13' }) };
    const res = applyRollover(todos, fn, '2026-08-24');
    expect(res.changed).toBe(false);
    expect(res.todos.a.scheduledDay).toBe('2026-08-13');
  });

  it('preserves createdAt and reminderAt', () => {
    const todos = { a: makeTodo({ id: 'a', reminderAt: '2026-08-10T09:00' }) };
    const res = applyRollover(todos, fn, '2026-08-12');
    expect(res.todos.a.createdAt).toBe('2026-08-10T09:00:00.000Z');
    expect(res.todos.a.reminderAt).toBe('2026-08-10T09:00');
  });
});

function makeNote(over: Partial<Note>): Note {
  return {
    id: over.id ?? 'n1', fortnightId: 'f1', day: '2026-08-10', category: 'blocker',
    text: 'blocked', resolved: false, createdAt: '2026-08-10T09:00:00.000Z', ...over,
  };
}

describe('applyNoteRollover', () => {
  it('moves an unresolved past-day blocker to today and flags it rolled over', () => {
    const notes = { a: makeNote({ id: 'a', day: '2026-08-10' }) };
    const res = applyNoteRollover(notes, fn, '2026-08-12');
    expect(res.changed).toBe(true);
    expect(res.notes.a.day).toBe('2026-08-12');
    expect(res.notes.a.rolledOver).toBe(true);
    expect(res.notes.a.fortnightId).toBe('f1');
  });

  it('leaves an info note untouched even if its day is in the past', () => {
    const notes = { a: makeNote({ id: 'a', day: '2026-08-10', category: 'info' }) };
    const res = applyNoteRollover(notes, fn, '2026-08-12');
    expect(res.changed).toBe(false);
    expect(res.notes).toEqual(notes);
  });

  it('leaves a resolved blocker untouched even if its day is in the past', () => {
    const notes = { a: makeNote({ id: 'a', day: '2026-08-10', resolved: true }) };
    const res = applyNoteRollover(notes, fn, '2026-08-12');
    expect(res.changed).toBe(false);
    expect(res.notes).toEqual(notes);
  });

  it('leaves a blocker scheduled today or in the future untouched', () => {
    const notes = { a: makeNote({ id: 'a', day: '2026-08-12' }) };
    const res = applyNoteRollover(notes, fn, '2026-08-12');
    expect(res.changed).toBe(false);
    expect(res.notes).toEqual(notes);
  });

  it('ignores blockers from other fortnights', () => {
    const notes = { a: makeNote({ id: 'a', fortnightId: 'OLD', day: '2026-08-10' }) };
    expect(applyNoteRollover(notes, fn, '2026-08-12').changed).toBe(false);
  });

  it('no-ops when the fortnight is expired', () => {
    const notes = { a: makeNote({ id: 'a', day: '2026-08-13' }) };
    const res = applyNoteRollover(notes, fn, '2026-08-24');
    expect(res.changed).toBe(false);
    expect(res.notes.a.day).toBe('2026-08-13');
  });

  it('on a weekend, rolls to the upcoming Monday', () => {
    const notes = { a: makeNote({ id: 'a', day: '2026-08-13' }) };
    const res = applyNoteRollover(notes, fn, '2026-08-15'); // Saturday
    expect(res.notes.a.day).toBe('2026-08-17');
  });
});
