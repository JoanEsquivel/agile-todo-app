import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  Fortnight, ISODate, LocalDateTime, Note, NoteCategory, PersistedState, Priority, Todo,
} from '../domain/types';
import { generateFortnightDays, effectiveBoardDay, carryOverTodos } from '../domain/fortnight';
import { applyRollover } from '../domain/rollover';
import { nowIso, todayLocal } from './clock';
import { createDebouncedStorage } from './persistence';
import { runMigrations, SCHEMA_VERSION } from './migrations';

export interface AppState extends PersistedState {
  viewedFortnightId: string | null;
  selectedDay: ISODate | null;
  /** Set when zustand's persist rehydration failed (corrupt JSON, unsupported
   *  schema, etc). Never persisted itself — purely an in-memory UI signal. */
  rehydrationError: string | null;

  initApp: () => void;
  checkDayTick: () => void;          // implemented in Task 12
  regenerateFortnight: () => void;   // implemented in Task 12
  addTodo: (input: {
    title: string; description?: string; priority: Priority;
    scheduledDay: ISODate; reminderAt?: LocalDateTime;
  }) => void;
  updateTodo: (id: string, patch: Partial<Pick<Todo, 'title' | 'description' | 'priority' | 'reminderAt'>>) => void;
  rescheduleTodo: (id: string, day: ISODate) => void;
  toggleDone: (id: string) => void;
  deleteTodo: (id: string) => void;
  addNote: (input: { day: ISODate; category: NoteCategory; text: string }) => void;
  updateNote: (id: string, patch: Partial<Pick<Note, 'text' | 'category'>>) => void;
  resolveBlocker: (id: string) => void;
  deleteNote: (id: string) => void;
  selectDay: (day: ISODate) => void;
  viewFortnight: (id: string) => void;
  importState: (state: PersistedState) => void;
}

function buildFortnight(anchor: ISODate): Fortnight {
  const days = generateFortnightDays(anchor);
  return { id: crypto.randomUUID(), startDay: days[0], days, createdAt: nowIso() };
}

export const appStorage = createDebouncedStorage();

// Captured synchronously during store creation (see the state creator below)
// so `onRehydrateStorage` and the storage guard below, which zustand's persist
// middleware wires up as part of the same synchronous `create()` call for a
// synchronous storage backend, can reach the store without referencing
// `useAppStore` before it's assigned (that would be a TDZ violation).
let setRehydrationError: ((message: string) => void) | null = null;
let getAppState: (() => AppState) | null = null;

// zustand's persist middleware calls `storage.setItem` after *every* `set()`
// — including the one `onRehydrateStorage` below makes to report a failure.
// Without this guard, merely recording "rehydration failed" would itself
// schedule a debounced write of the current (empty, never-loaded) in-memory
// state, clobbering the original — possibly still-recoverable — stored bytes
// before the user ever gets to the recovery banner or the Import button.
// Persistence resumes automatically once `importState` loads real data (it
// explicitly clears `rehydrationError`).
const guardedStorage = {
  getItem: (key: string) => appStorage.getItem(key),
  setItem: (key: string, value: string) => {
    if (getAppState?.().rehydrationError) return;
    appStorage.setItem(key, value);
  },
  removeItem: (key: string) => appStorage.removeItem(key),
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      setRehydrationError = (message) => set({ rehydrationError: message });
      getAppState = get;
      return {
        schemaVersion: SCHEMA_VERSION,
        fortnights: [],
        activeFortnightId: null,
        todos: {},
        notes: {},
        lastRolloverDay: null,
        viewedFortnightId: null,
        selectedDay: null,
        rehydrationError: null,

        initApp: () => {
          // A failed rehydration means whatever is in localStorage could not be
          // trusted/parsed. Don't auto-create a fresh fortnight here: that would
          // get persisted on the next debounced write and silently overwrite the
          // user's original (possibly still-recoverable) data. Leave the store at
          // its empty defaults and let the App-level banner point at retry/import.
          if (get().rehydrationError) return;
          const today = todayLocal();
          if (!get().activeFortnightId) {
            const fn = buildFortnight(today);
            set({
              fortnights: [fn],
              activeFortnightId: fn.id,
              viewedFortnightId: fn.id,
              selectedDay: effectiveBoardDay(fn, today),
              lastRolloverDay: today,
            });
          } else {
            get().checkDayTick();
            const s = get();
            let active = s.fortnights.find((f) => f.id === s.activeFortnightId);
            if (!active) {
              // Defense-in-depth: activeFortnightId doesn't resolve to any
              // fortnight (e.g. corrupted state from a future migration bug).
              // Recover instead of crashing the whole app at module scope.
              active = buildFortnight(today);
              set({ fortnights: [...s.fortnights, active], activeFortnightId: active.id });
            }
            set({
              viewedFortnightId: active.id,
              selectedDay: s.selectedDay ?? effectiveBoardDay(active, today) ?? active.days[0],
            });
          }
        },

        checkDayTick: () => {
          const today = todayLocal();
          const s = get();
          if (s.lastRolloverDay === today || !s.activeFortnightId) return;
          const found = s.fortnights.find((f) => f.id === s.activeFortnightId);
          const wasViewingActive = s.viewedFortnightId === s.activeFortnightId;
          const active = found ?? buildFortnight(today);
          const fortnights = found ? s.fortnights : [...s.fortnights, active];
          const { todos } = applyRollover(s.todos, active, today);
          const effective = effectiveBoardDay(active, today);
          set({
            fortnights,
            activeFortnightId: active.id,
            todos,
            lastRolloverDay: today,
            selectedDay: wasViewingActive && effective !== null ? effective : s.selectedDay,
            viewedFortnightId: wasViewingActive ? active.id : s.viewedFortnightId,
          });
        },

        regenerateFortnight: () => {
          const today = todayLocal();
          const s = get();
          const oldId = s.activeFortnightId;
          const fn = buildFortnight(today);
          const todos = oldId ? carryOverTodos(s.todos, oldId, fn, today) : s.todos;
          set({
            fortnights: [...s.fortnights, fn],
            activeFortnightId: fn.id,
            viewedFortnightId: fn.id,
            todos,
            selectedDay: effectiveBoardDay(fn, today),
            lastRolloverDay: today,
          });
        },

        addTodo: (input) => {
          const id = crypto.randomUUID();
          const todo: Todo = {
            id,
            fortnightId: get().activeFortnightId!,
            title: input.title,
            description: input.description,
            priority: input.priority,
            scheduledDay: input.scheduledDay,
            done: false,
            createdAt: nowIso(),
            rolledOver: false,
            reminderAt: input.reminderAt,
          };
          set((s) => ({ todos: { ...s.todos, [id]: todo } }));
        },

        updateTodo: (id, patch) =>
          set((s) => ({ todos: { ...s.todos, [id]: { ...s.todos[id], ...patch } } })),

        rescheduleTodo: (id, day) =>
          set((s) => ({ todos: { ...s.todos, [id]: { ...s.todos[id], scheduledDay: day, rolledOver: false } } })),

        toggleDone: (id) =>
          set((s) => {
            const t = s.todos[id];
            const done = !t.done;
            return { todos: { ...s.todos, [id]: { ...t, done, completedAt: done ? nowIso() : undefined } } };
          }),

        deleteTodo: (id) =>
          set((s) => {
            const { [id]: _removed, ...rest } = s.todos;
            return { todos: rest };
          }),

        addNote: (input) => {
          const id = crypto.randomUUID();
          const note: Note = {
            id,
            fortnightId: get().activeFortnightId!,
            day: input.day,
            category: input.category,
            text: input.text,
            resolved: false,
            createdAt: nowIso(),
          };
          set((s) => ({ notes: { ...s.notes, [id]: note } }));
        },

        updateNote: (id, patch) =>
          set((s) => ({ notes: { ...s.notes, [id]: { ...s.notes[id], ...patch } } })),

        resolveBlocker: (id) =>
          set((s) => ({ notes: { ...s.notes, [id]: { ...s.notes[id], resolved: true } } })),

        deleteNote: (id) =>
          set((s) => {
            const { [id]: _removed, ...rest } = s.notes;
            return { notes: rest };
          }),

        selectDay: (day) => set({ selectedDay: day }),
        viewFortnight: (id) =>
          set((s) => {
            const fn = s.fortnights.find((f) => f.id === id);
            // Defensive no-op: an id that doesn't resolve to a known fortnight
            // (stale caller state) shouldn't crash — just leave the view as-is.
            if (!fn) return {};
            const today = todayLocal();
            return {
              viewedFortnightId: id,
              selectedDay:
                id === s.activeFortnightId ? effectiveBoardDay(fn, today) ?? fn.days[0] : fn.days[0],
            };
          }),

        importState: (state: PersistedState) => {
          const today = todayLocal();
          const active = state.fortnights.find((f) => f.id === state.activeFortnightId) ?? null;
          set({
            schemaVersion: state.schemaVersion,
            fortnights: state.fortnights,
            activeFortnightId: state.activeFortnightId,
            todos: state.todos,
            notes: state.notes,
            lastRolloverDay: state.lastRolloverDay,
            // A successful import supersedes any earlier rehydration failure —
            // this is exactly the "retry/import" recovery path, and clearing
            // the flag here (as part of the same set() call) lets the storage
            // guard above resume normal persistence immediately.
            rehydrationError: null,
            viewedFortnightId: state.activeFortnightId,
            selectedDay: active ? effectiveBoardDay(active, today) ?? active.days[0] : null,
          });
          // Imported incomplete todos scheduled on past days (relative to the
          // backup's own lastRolloverDay) need to be rolled forward immediately,
          // not left stranded until the next full reload. Idempotent, so this is
          // safe even if a tick already happened this session.
          get().checkDayTick();
        },
      };
    },
    {
      name: 'agile-todo-app.v-state',
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => guardedStorage),
      migrate: runMigrations,
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          setRehydrationError?.(error instanceof Error ? error.message : String(error));
        }
      },
      partialize: (s) => ({
        schemaVersion: s.schemaVersion,
        fortnights: s.fortnights,
        activeFortnightId: s.activeFortnightId,
        todos: s.todos,
        notes: s.notes,
        lastRolloverDay: s.lastRolloverDay,
      }),
    },
  ),
);
