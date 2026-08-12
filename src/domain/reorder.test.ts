import type { Todo } from './types';
import {
  appendToDay, bandPosition, movedOrder, moveTarget, normalizeBand, reorderTodo,
} from './reorder';

const FN = 'fn-1';
const DAY = '2026-08-18';

let seq = 0;
function mkTodo(partial: Partial<Todo> & { id: string }): Todo {
  seq += 1;
  return {
    fortnightId: FN, title: partial.id, priority: 'medium', scheduledDay: DAY,
    done: false, createdAt: `2026-08-10T00:00:${String(seq).padStart(2, '0')}.000Z`,
    rolledOver: false, ...partial,
  };
}

function record(...todos: Todo[]): Record<string, Todo> {
  return Object.fromEntries(todos.map((t) => [t.id, t]));
}

function bandTitles(todos: Record<string, Todo>, priority: Todo['priority']): string[] {
  return Object.values(todos)
    .filter((t) => t.priority === priority && !t.done && t.scheduledDay === DAY)
    .sort((a, b) =>
      (a.sortIndex ?? Number.MAX_SAFE_INTEGER) - (b.sortIndex ?? Number.MAX_SAFE_INTEGER)
      || a.createdAt.localeCompare(b.createdAt))
    .map((t) => t.id);
}

describe('normalizeBand', () => {
  it('materializes contiguous indices for legacy (index-less) todos in createdAt order', () => {
    const todos = record(mkTodo({ id: 'a' }), mkTodo({ id: 'b' }), mkTodo({ id: 'c' }));
    const out = normalizeBand(todos, FN, DAY, 'medium');
    expect(out['a'].sortIndex).toBe(0);
    expect(out['b'].sortIndex).toBe(1);
    expect(out['c'].sortIndex).toBe(2);
  });

  it('returns the input record unchanged when indices are already contiguous', () => {
    const todos = record(mkTodo({ id: 'a', sortIndex: 0 }), mkTodo({ id: 'b', sortIndex: 1 }));
    expect(normalizeBand(todos, FN, DAY, 'medium')).toBe(todos);
  });

  it('ignores done todos and other days/priorities/fortnights', () => {
    const todos = record(
      mkTodo({ id: 'a' }),
      mkTodo({ id: 'done', done: true }),
      mkTodo({ id: 'other-day', scheduledDay: '2026-08-19' }),
      mkTodo({ id: 'other-prio', priority: 'high' }),
      mkTodo({ id: 'other-fn', fortnightId: 'fn-2' }),
    );
    const out = normalizeBand(todos, FN, DAY, 'medium');
    expect(out['a'].sortIndex).toBe(0);
    for (const id of ['done', 'other-day', 'other-prio', 'other-fn']) {
      expect(out[id].sortIndex).toBeUndefined();
    }
  });
});

describe('reorderTodo', () => {
  it('reorders within a band', () => {
    const todos = record(mkTodo({ id: 'a' }), mkTodo({ id: 'b' }), mkTodo({ id: 'c' }));
    const out = reorderTodo(todos, 'c', 'medium', 0);
    expect(bandTitles(out, 'medium')).toEqual(['c', 'a', 'b']);
  });

  it('cross-band move writes priority and re-indexes both bands contiguously', () => {
    const todos = record(
      mkTodo({ id: 'h1', priority: 'high' }), mkTodo({ id: 'h2', priority: 'high' }),
      mkTodo({ id: 'm1' }), mkTodo({ id: 'm2' }),
    );
    const out = reorderTodo(todos, 'h1', 'medium', 1);
    expect(out['h1'].priority).toBe('medium');
    expect(bandTitles(out, 'medium')).toEqual(['m1', 'h1', 'm2']);
    expect(bandTitles(out, 'high')).toEqual(['h2']);
    expect(out['h2'].sortIndex).toBe(0); // source band re-indexed
    expect(out['m2'].sortIndex).toBe(2);
  });

  it('clamps the target index at both ends', () => {
    const todos = record(mkTodo({ id: 'a' }), mkTodo({ id: 'b' }));
    expect(bandTitles(reorderTodo(todos, 'a', 'medium', 99), 'medium')).toEqual(['b', 'a']);
    expect(bandTitles(reorderTodo(todos, 'b', 'medium', -5), 'medium')).toEqual(['b', 'a']);
  });

  it('is a no-op for done and unknown ids', () => {
    const todos = record(mkTodo({ id: 'a', done: true }), mkTodo({ id: 'b' }));
    expect(reorderTodo(todos, 'a', 'high', 0)).toBe(todos);
    expect(reorderTodo(todos, 'ghost', 'high', 0)).toBe(todos);
  });

  it('mixes legacy index-less todos safely (normalizes before inserting)', () => {
    const todos = record(mkTodo({ id: 'old1' }), mkTodo({ id: 'old2' }), mkTodo({ id: 'old3' }));
    const out = reorderTodo(todos, 'old3', 'medium', 1);
    expect(bandTitles(out, 'medium')).toEqual(['old1', 'old3', 'old2']);
    expect(out['old1'].sortIndex).toBe(0);
    expect(out['old2'].sortIndex).toBe(2);
  });
});

describe('appendToDay', () => {
  it('appends moved todos after existing band members, preserving given order', () => {
    const todos = record(
      mkTodo({ id: 'm1', sortIndex: 0 }), mkTodo({ id: 'm2', sortIndex: 1 }),
      mkTodo({ id: 'in1' }), mkTodo({ id: 'in2' }),
    );
    const out = appendToDay(todos, ['in2', 'in1'], FN, DAY);
    expect(bandTitles(out, 'medium')).toEqual(['m1', 'm2', 'in2', 'in1']);
    expect(out['in2'].sortIndex).toBe(2);
    expect(out['in1'].sortIndex).toBe(3);
  });

  it('groups moved todos into their own priority bands', () => {
    const todos = record(
      mkTodo({ id: 'h-here', priority: 'high', sortIndex: 0 }),
      mkTodo({ id: 'h-in', priority: 'high' }),
      mkTodo({ id: 'l-in', priority: 'low' }),
    );
    const out = appendToDay(todos, ['h-in', 'l-in'], FN, DAY);
    expect(bandTitles(out, 'high')).toEqual(['h-here', 'h-in']);
    expect(out['l-in'].sortIndex).toBe(0); // alone in its (previously empty) band
  });

  it('normalizes a legacy index-less destination band before appending (incoming stays behind)', () => {
    const todos = record(mkTodo({ id: 'legacy1' }), mkTodo({ id: 'legacy2' }), mkTodo({ id: 'in' }));
    const out = appendToDay(todos, ['in'], FN, DAY);
    expect(bandTitles(out, 'medium')).toEqual(['legacy1', 'legacy2', 'in']);
    expect(out['legacy1'].sortIndex).toBe(0);
    expect(out['in'].sortIndex).toBe(2);
  });
});

describe('movedOrder', () => {
  it('sorts by source day, then sortIndex (absent last), then createdAt', () => {
    const a = mkTodo({ id: 'a', scheduledDay: '2026-08-14', sortIndex: 1 });
    const b = mkTodo({ id: 'b', scheduledDay: '2026-08-17', sortIndex: 0 });
    const c = mkTodo({ id: 'c', scheduledDay: '2026-08-17' });
    const d = mkTodo({ id: 'd', scheduledDay: '2026-08-17', sortIndex: 2 });
    expect([d, c, b, a].sort(movedOrder).map((t) => t.id)).toEqual(['a', 'b', 'd', 'c']);
  });
});

describe('bandPosition / moveTarget', () => {
  const todos = record(
    mkTodo({ id: 'h1', priority: 'high', sortIndex: 0 }),
    mkTodo({ id: 'm1', sortIndex: 0 }), mkTodo({ id: 'm2', sortIndex: 1 }),
    mkTodo({ id: 'done-l', priority: 'low', done: true }),
  );

  it('bandPosition reports index and band size; null for done/unknown', () => {
    expect(bandPosition(todos, 'm2')).toEqual({ priority: 'medium', index: 1, size: 2 });
    expect(bandPosition(todos, 'done-l')).toBeNull();
    expect(bandPosition(todos, 'ghost')).toBeNull();
  });

  it('moveTarget steps within the band', () => {
    expect(moveTarget(todos, 'm2', -1)).toEqual({ priority: 'medium', index: 0 });
    expect(moveTarget(todos, 'm1', 1)).toEqual({ priority: 'medium', index: 1 });
  });

  it('moveTarget crosses band boundaries (up: end of previous; down: start of next)', () => {
    expect(moveTarget(todos, 'm1', -1)).toEqual({ priority: 'high', index: 1 });
    expect(moveTarget(todos, 'm2', 1)).toEqual({ priority: 'low', index: 0 });
    expect(moveTarget(todos, 'h1', 1)).toEqual({ priority: 'medium', index: 0 });
  });

  it('moveTarget is null at the very top and bottom (low band is empty of pending)', () => {
    expect(moveTarget(todos, 'h1', -1)).toBeNull();
    const atBottom = record(mkTodo({ id: 'l1', priority: 'low', sortIndex: 0 }));
    expect(moveTarget(atBottom, 'l1', 1)).toBeNull();
  });
});
