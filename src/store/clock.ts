import type { ISODate, ISODateTime } from '../domain/types';
import { toISODate } from '../domain/dates';

export function todayLocal(): ISODate {
  return toISODate(new Date());
}

export function nowIso(): ISODateTime {
  return new Date().toISOString();
}
