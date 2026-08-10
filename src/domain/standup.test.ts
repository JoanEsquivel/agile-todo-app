import { buildStandup, formatStandup } from './standup';
import type { Note, Todo } from './types';

function makeTodo(over: Partial<Todo>): Todo {
  return {
    id: over.id ?? 't1', fortnightId: 'f1', title: over.title ?? 'task', priority: 'medium',
    scheduledDay: '2026-08-18', done: false, createdAt: '2026-08-10T09:00:00.000Z',
    rolledOver: false, ...over,
  };
}
function makeNote(over: Partial<Note>): Note {
  return {
    id: over.id ?? 'n1', fortnightId: 'f1', day: '2026-08-17', category: 'blocker',
    text: over.text ?? 'blocked', resolved: false, createdAt: '2026-08-17T09:00:00.000Z', ...over,
  };
}
// completedAt helper: local wall-clock time on a given day
const doneAt = (y: number, mo: number, d: number) => new Date(y, mo - 1, d, 15, 0).toISOString();

describe('buildStandup', () => {
  it('on Tuesday: yesterday = Monday completions only', () => {
    const todos = {
      mon: makeTodo({ id: 'mon', done: true, completedAt: doneAt(2026, 8, 17) }),
      fri: makeTodo({ id: 'fri', done: true, completedAt: doneAt(2026, 8, 14) }),
    };
    const s = buildStandup(todos, {}, 'f1', '2026-08-18');
    expect(s.yesterday.map((t) => t.id)).toEqual(['mon']);
  });

  it('on Monday: yesterday = Friday plus weekend completions', () => {
    const todos = {
      fri: makeTodo({ id: 'fri', done: true, completedAt: doneAt(2026, 8, 14) }),
      sat: makeTodo({ id: 'sat', done: true, completedAt: doneAt(2026, 8, 15) }),
      thu: makeTodo({ id: 'thu', done: true, completedAt: doneAt(2026, 8, 13) }),
    };
    const s = buildStandup(todos, {}, 'f1', '2026-08-17');
    expect(s.yesterday.map((t) => t.id).sort()).toEqual(['fri', 'sat']);
  });

  it('on Saturday: effective day is Monday, yesterday is Friday', () => {
    const todos = { fri: makeTodo({ id: 'fri', done: true, completedAt: doneAt(2026, 8, 14) }) };
    const s = buildStandup(todos, {}, 'f1', '2026-08-15');
    expect(s.effectiveDay).toBe('2026-08-17');
    expect(s.yesterday.map((t) => t.id)).toEqual(['fri']);
  });

  it('today = todos scheduled on the effective day', () => {
    const todos = {
      a: makeTodo({ id: 'a', scheduledDay: '2026-08-18' }),
      b: makeTodo({ id: 'b', scheduledDay: '2026-08-19' }),
    };
    const s = buildStandup(todos, {}, 'f1', '2026-08-18');
    expect(s.today.map((t) => t.id)).toEqual(['a']);
  });

  it('blockers = unresolved blocker notes of the active fortnight only', () => {
    const notes = {
      open: makeNote({ id: 'open' }),
      resolved: makeNote({ id: 'resolved', resolved: true }),
      info: makeNote({ id: 'info', category: 'info' }),
      old: makeNote({ id: 'old', fortnightId: 'OLD' }),
    };
    const s = buildStandup({}, notes, 'f1', '2026-08-18');
    expect(s.blockers.map((n) => n.id)).toEqual(['open']);
  });
});

describe('formatStandup', () => {
  it('formats sections with bullets and None for empty sections', () => {
    const s = buildStandup(
      { a: makeTodo({ id: 'a', title: 'Ship feature', done: true, completedAt: doneAt(2026, 8, 17) }) },
      {},
      'f1',
      '2026-08-18',
    );
    expect(formatStandup(s)).toBe(
      '*Yesterday*\n- Ship feature\n\n*Today*\n- ~Ship feature~\n\n*Blockers*\n- None',
    );
  });

  it('today includes done todos scheduled on effective day, struck through', () => {
    const todos = {
      a: makeTodo({ id: 'a', title: 'In progress', done: false, scheduledDay: '2026-08-18' }),
      b: makeTodo({ id: 'b', title: 'Completed early', done: true, scheduledDay: '2026-08-18', completedAt: doneAt(2026, 8, 17) }),
    };
    const s = buildStandup(todos, {}, 'f1', '2026-08-18');
    expect(s.today.map((t) => t.id).sort()).toEqual(['a', 'b']);
  });
});
