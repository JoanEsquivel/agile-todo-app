import type { PersistedState } from '../domain/types';
import { DEFAULT_POMODORO_SETTINGS } from '../domain/pomodoro';

export const SCHEMA_VERSION = 2;

export class UnsupportedSchemaError extends Error {}

// One entry per schema bump, keyed by the SOURCE version being migrated from.
const defaultSteps: Record<number, (s: unknown) => unknown> = {
  // v1 -> v2: pomodoroSettings was added to PersistedState.
  1: (s) => ({ ...(s as object), pomodoroSettings: DEFAULT_POMODORO_SETTINGS }),
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
