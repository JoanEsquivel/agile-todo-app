import type { PersistedState } from '../domain/types';
import { runMigrations } from './migrations';

function isPomodoroSettings(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (['workMinutes', 'breakMinutes', 'longBreakMinutes'] as const).every(
    (k) => typeof v[k] === 'number' && Number.isFinite(v[k]) && (v[k] as number) > 0,
  );
}

export function validatePersistedState(value: unknown): value is PersistedState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    !(
      typeof v.schemaVersion === 'number' &&
      Array.isArray(v.fortnights) &&
      (v.activeFortnightId === null || typeof v.activeFortnightId === 'string') &&
      typeof v.todos === 'object' && v.todos !== null && !Array.isArray(v.todos) &&
      typeof v.notes === 'object' && v.notes !== null && !Array.isArray(v.notes) &&
      (v.lastRolloverDay === null || typeof v.lastRolloverDay === 'string') &&
      isPomodoroSettings(v.pomodoroSettings)
    )
  ) {
    return false;
  }
  // Referential integrity: activeFortnightId must actually resolve to a
  // fortnight, otherwise downstream lookups (e.g. store.checkDayTick) would
  // crash on a non-null-asserted `undefined`.
  if (v.activeFortnightId !== null) {
    const fortnights = v.fortnights as Array<{ id?: unknown }>;
    if (!fortnights.some((f) => f && typeof f === 'object' && f.id === v.activeFortnightId)) {
      return false;
    }
  }
  return true;
}

export function serializeState(state: PersistedState): string {
  return JSON.stringify(state, null, 2);
}

export function parseBackup(json: string): PersistedState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
  if (typeof raw !== 'object' || raw === null || typeof (raw as { schemaVersion?: unknown }).schemaVersion !== 'number') {
    throw new Error('The selected file is not an Agile Todo backup.');
  }
  const migrated = runMigrations(raw, (raw as { schemaVersion: number }).schemaVersion);
  if (!validatePersistedState(migrated)) {
    throw new Error('The backup file is malformed and cannot be imported.');
  }
  return migrated;
}
