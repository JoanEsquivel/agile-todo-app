export type ISODate = string;      // "YYYY-MM-DD", local calendar date. Sorts lexicographically.
export type ISODateTime = string;  // full ISO 8601 UTC (toISOString) — timestamps only
export type LocalDateTime = string;// "YYYY-MM-DDTHH:mm", no zone — reminders ("9am my time")

export type Priority = 'high' | 'medium' | 'low';
export type NoteCategory = 'blocker' | 'info';

export interface Todo {
  id: string;                 // crypto.randomUUID()
  fortnightId: string;
  title: string;
  description?: string;
  priority: Priority;
  scheduledDay: ISODate;      // must be one of its fortnight's days
  done: boolean;
  completedAt?: ISODateTime;
  createdAt: ISODateTime;     // never changes across rollover/carry-over
  rolledOver: boolean;        // set when auto-moved off a past day; cleared if user reschedules
  reminderAt?: LocalDateTime;
}

export interface Note {
  id: string;
  fortnightId: string;
  day: ISODate;
  category: NoteCategory;
  text: string;
  resolved: boolean;          // only meaningful for 'blocker'; always false for 'info'
  createdAt: ISODateTime;
}

export interface Fortnight {
  id: string;
  startDay: ISODate;          // Monday of week 1
  days: ISODate[];            // exactly 10 workdays, ascending
  createdAt: ISODateTime;
}

export interface PersistedState {
  schemaVersion: number;
  fortnights: Fortnight[];            // chronological; last = active
  activeFortnightId: string | null;
  todos: Record<string, Todo>;
  notes: Record<string, Note>;
  lastRolloverDay: ISODate | null;    // last local day rollover ran (idempotency)
}

// Store = PersistedState + ephemeral UI state (NOT persisted):
// viewedFortnightId, selectedDay, modal flags
