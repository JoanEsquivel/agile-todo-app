import type { PersistedState } from './types';

/** Counts shown in the import confirmation, for the current board and for
 *  the backup about to replace it. */
export type BackupSummary = { todos: number; notes: number; months: number };

/** `Pick` rather than `PersistedState` so the live store state (a structural
 *  superset) can be passed without a cast. `months` counts fortnights --
 *  the type keeps its legacy name, the user-facing word is "month". */
export function summarizeBackup(
  state: Pick<PersistedState, 'todos' | 'notes' | 'fortnights'>,
): BackupSummary {
  return {
    todos: Object.keys(state.todos).length,
    notes: Object.keys(state.notes).length,
    months: state.fortnights.length,
  };
}
