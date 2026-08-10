import type { PersistedState } from '../domain/types';

export const SCHEMA_VERSION = 1;

export class UnsupportedSchemaError extends Error {}

// Add an entry per schema bump, e.g. { 1: (s) => ({ ...s, newField: default }) }
const defaultSteps: Record<number, (s: unknown) => unknown> = {};

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
