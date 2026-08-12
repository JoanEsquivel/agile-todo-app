import { summarizeBackup } from './backup';
import type { Fortnight, Note, Todo } from './types';

const todos = (n: number) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`t${i}`, { id: `t${i}` } as Todo]));
const notes = (n: number) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`n${i}`, { id: `n${i}` } as Note]));
const fortnights = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `f${i}` }) as Fortnight);

describe('summarizeBackup', () => {
  it('reports zeros for an empty document', () => {
    expect(summarizeBackup({ todos: {}, notes: {}, fortnights: [] }))
      .toEqual({ todos: 0, notes: 0, months: 0 });
  });

  it('counts todos, notes and months independently', () => {
    // Deliberately three different numbers: a transposition between the
    // fields fails this, whereas equal counts would pass either way.
    expect(summarizeBackup({ todos: todos(7), notes: notes(2), fortnights: fortnights(3) }))
      .toEqual({ todos: 7, notes: 2, months: 3 });
  });

  it('counts keys, not array length, for the record-shaped fields', () => {
    expect(summarizeBackup({ todos: todos(1), notes: {}, fortnights: [] }))
      .toEqual({ todos: 1, notes: 0, months: 0 });
  });
});
