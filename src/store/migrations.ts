import type { PersistedState } from '../domain/types';
import { DEFAULT_POMODORO_SETTINGS } from '../domain/pomodoro';
import { adaptFortnightToMonth } from '../domain/fortnight';
import { todayLocal } from './clock';

export const SCHEMA_VERSION = 3;

export class UnsupportedSchemaError extends Error {}

// One entry per schema bump, keyed by the SOURCE version being migrated from.
const defaultSteps: Record<number, (s: unknown) => unknown> = {
  // v1 -> v2: pomodoroSettings was added to PersistedState.
  1: (s) => ({ ...(s as object), pomodoroSettings: DEFAULT_POMODORO_SETTINGS }),
  // v2 -> v3: the fortnight design became a calendar month. Reshape the
  // ACTIVE fortnight in place (same id); past fortnights are history and
  // stay 10-day, which is exactly why domain code must stay length-agnostic.
  // Reads the clock here (store layer, not domain) so `adaptFortnightToMonth`
  // itself stays pure — INV-2 allows reading time via clock.ts outside the
  // domain layer. Does NOT touch lastRolloverDay: the checkDayTick that runs
  // afterwards (initApp / importState) does the day's rollover normally over
  // the already-adapted period — no double migration, because neither this
  // step nor applyRollover ever writes fortnightId (INV-5), and the
  // relocation below leaves orphans exactly where applyRollover would have
  // put them (effectiveBoardDay).
  2: (s) => {
    const state = s as PersistedState;
    // Guard against malformed pre-v3 backups (missing/non-array `fortnights`)
    // reaching `.find` before `validatePersistedState` gets a chance to
    // report a readable "malformed backup" error — parseBackup runs
    // migrations on unvalidated raw JSON (exportImport.ts), so a corrupt v1/
    // v2 backup must fall through to validation rather than throw a raw
    // TypeError the UI would surface verbatim.
    if (!Array.isArray(state?.fortnights)) return s;
    const active = state.fortnights.find((f) => f.id === state.activeFortnightId);
    if (!active) return s;
    const adapted = adaptFortnightToMonth(active, state.todos, state.notes, todayLocal());
    if (!adapted) return s;
    return {
      ...state,
      fortnights: state.fortnights.map((f) => (f.id === adapted.fortnight.id ? adapted.fortnight : f)),
      todos: adapted.todos,
      notes: adapted.notes,
    };
  },
};

export function runMigrations(
  state: unknown,
  fromVersion: number,
  steps: Record<number, (s: unknown) => unknown> = defaultSteps,
): PersistedState {
  if (fromVersion > SCHEMA_VERSION) {
    throw new UnsupportedSchemaError(
      `Backup uses schema v${fromVersion}, but this app supports up to v${SCHEMA_VERSION}. Update the app first.`,
    );
  }
  let s = state;
  for (let v = fromVersion; v < SCHEMA_VERSION; v++) {
    const step = steps[v];
    if (!step) throw new UnsupportedSchemaError(`No migration defined from schema v${v}`);
    s = step(s);
  }
  return { ...(s as PersistedState), schemaVersion: SCHEMA_VERSION };
}
