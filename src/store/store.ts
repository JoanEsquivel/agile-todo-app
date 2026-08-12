import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  Fortnight, ISODate, LocalDateTime, Note, NoteCategory, PersistedState, Priority, Todo,
} from '../domain/types';
import {
  generateMonthDays, effectiveBoardDay, carryOverTodos, carryOverNotes, pruneToRetention,
} from '../domain/fortnight';
import { applyRollover, applyNoteRollover } from '../domain/rollover';
import {
  setTodoDone,
  addChecklistItem as domainAddChecklistItem,
  toggleChecklistItem as domainToggleChecklistItem,
  removeChecklistItem as domainRemoveChecklistItem,
} from '../domain/checklist';
import {
  DEFAULT_POMODORO_SETTINGS, startRun, pauseRun, resumeRun, completePhase, skipPhase,
  type PomodoroRun,
} from '../domain/pomodoro';
import { formatDayLabel } from '../domain/dates';
import { nowIso, todayLocal } from './clock';
import { createDebouncedStorage } from './persistence';
import { runMigrations, SCHEMA_VERSION } from './migrations';
import { applyThemePreference, type ThemePreference } from './theme';

/** What DayColumn's compose form is currently showing for the selected day, if any. */
export type ComposeIntent = 'todo' | 'note' | null;

export interface AppState extends PersistedState {
  viewedFortnightId: string | null;
  selectedDay: ISODate | null;
  /** Set when zustand's persist rehydration failed (corrupt JSON, unsupported
   *  schema, etc). Never persisted itself — purely an in-memory UI signal. */
  rehydrationError: string | null;
  /** Latest message for the polite live-region announcer. Ephemeral, like
   *  the fields above — never persisted, never added to `partialize`. */
  announcement: string | null;
  /** Ephemeral like the fields above. Guarded by `setComposeIntent`, not
   *  written directly — see INV-9: a compose form must never be openable
   *  while viewing a read-only fortnight, including via this field. */
  composeIntent: ComposeIntent;
  /** Ephemeral mirror of the manual theme preference. The durable copy lives
   *  in its own localStorage key owned by src/store/theme.ts — deliberately
   *  outside the persisted blob (see that file's header), so this never goes
   *  through `partialize`. */
  theme: ThemePreference;
  /** The running timer, ephemeral by decision: a deadline that expired while
   *  the app was closed has no unambiguous resumed state (missed
   *  transitions, stale notifications), so a reload starts fresh. Only
   *  `pomodoroSettings` (on PersistedState) survives. */
  pomodoro: PomodoroRun | null;

  initApp: () => void;
  /** The single month-transition pipeline: same-day no-op, daily rollover,
   *  and (when the active month has ended) automatic generation + pruning. */
  checkDayTick: () => void;
  /** Internal safety valve + shared test fixture. No UI door since the
   *  three-month-window redesign -- generation is automatic in checkDayTick. */
  regenerateFortnight: () => void;
  addTodo: (input: {
    title: string; description?: string; priority: Priority;
    scheduledDay: ISODate; reminderAt?: LocalDateTime;
  }) => void;
  updateTodo: (id: string, patch: Partial<Pick<Todo, 'title' | 'description' | 'priority' | 'reminderAt'>>) => void;
  rescheduleTodo: (id: string, day: ISODate) => void;
  toggleDone: (id: string) => void;
  deleteTodo: (id: string) => void;
  /** Generates the item id (crypto.randomUUID(), same mechanism as addTodo),
   *  trims the text, and silently rejects empty/whitespace-only input. */
  addChecklistItem: (todoId: string, text: string) => void;
  toggleChecklistItem: (todoId: string, itemId: string) => void;
  removeChecklistItem: (todoId: string, itemId: string) => void;
  addNote: (input: { day: ISODate; category: NoteCategory; text: string }) => void;
  updateNote: (id: string, patch: Partial<Pick<Note, 'text' | 'category'>>) => void;
  resolveBlocker: (id: string) => void;
  deleteNote: (id: string) => void;
  selectDay: (day: ISODate) => void;
  viewFortnight: (id: string) => void;
  importState: (state: PersistedState) => void;
  announce: (message: string) => void;
  setComposeIntent: (intent: ComposeIntent) => void;
  setTheme: (theme: ThemePreference) => void;
  startPomodoro: () => void;
  pausePomodoro: () => void;
  resumePomodoro: () => void;
  skipPomodoroPhase: () => void;
  completePomodoroPhase: () => void;
  stopPomodoro: () => void;
  setPomodoroSettings: (patch: Partial<PersistedState['pomodoroSettings']>) => void;
}

function buildFortnight(anchor: ISODate): Fortnight {
  const days = generateMonthDays(anchor);
  return { id: crypto.randomUUID(), startDay: days[0], days, createdAt: nowIso() };
}

/** Shared generation body for checkDayTick's automatic month transition,
 *  the internal regenerateFortnight safety valve, and initApp's dangling-id
 *  recovery. Builds the new month from `today`, carries pending todos /
 *  unresolved blockers over (INV-5's carry-over half -- done todos and
 *  resolved blockers stay pinned to their month), prunes history to the
 *  3-month retention window, and stamps lastRolloverDay in the SAME set()
 *  (INV-5: without it, a same-day second tick would run applyRollover over
 *  todos carryOverTodos just placed on future overlap days and yank them
 *  back to today). The view follows the new active month when the user was
 *  on the old active month or on a month that just got pruned; a view
 *  parked on a retained past month is left alone. */
function buildGeneration(s: AppState, today: ISODate): Partial<AppState> {
  const oldId = s.activeFortnightId;
  const fn = buildFortnight(today);
  const carriedTodos = oldId ? carryOverTodos(s.todos, oldId, fn, today) : s.todos;
  const carriedNotes = oldId ? carryOverNotes(s.notes, oldId, fn, today) : s.notes;
  const pruned = pruneToRetention([...s.fortnights, fn], carriedTodos, carriedNotes, today);
  const viewedSurvives =
    s.viewedFortnightId !== null
    && s.viewedFortnightId !== oldId
    && pruned.fortnights.some((f) => f.id === s.viewedFortnightId);
  return {
    fortnights: pruned.fortnights,
    activeFortnightId: fn.id,
    todos: pruned.todos,
    notes: pruned.notes,
    lastRolloverDay: today,
    viewedFortnightId: viewedSurvives ? s.viewedFortnightId : fn.id,
    selectedDay: viewedSurvives ? s.selectedDay : effectiveBoardDay(fn, today),
    // Pruning is silent by product decision, except for this one polite
    // live-region announcement (spec 2026-08-11 §4).
    ...(pruned.fortnights.length < s.fortnights.length + 1
      ? { announcement: 'Oldest month removed from history' }
      : {}),
  };
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
        pomodoroSettings: DEFAULT_POMODORO_SETTINGS,
        viewedFortnightId: null,
        selectedDay: null,
        rehydrationError: null,
        announcement: null,
        composeIntent: null,
        theme: 'system',
        pomodoro: null,

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
            if (!s.fortnights.some((f) => f.id === s.activeFortnightId)) {
              // Defense-in-depth: activeFortnightId doesn't resolve to any
              // fortnight (e.g. corrupted state from a future migration bug).
              // Recover through the same generation pipeline as checkDayTick's
              // expiry branch -- it also rescues todos/notes still keyed to
              // the dangling id (carry-over keys on the old active id) and
              // stamps lastRolloverDay (INV-5).
              set(buildGeneration(s, today));
            }
            const after = get();
            const active = after.fortnights.find((f) => f.id === after.activeFortnightId);
            if (!active) return; // unreachable: buildGeneration installs its month as active
            set({
              viewedFortnightId: active.id,
              selectedDay: after.selectedDay ?? effectiveBoardDay(active, today) ?? active.days[0],
            });
          }
        },

        checkDayTick: () => {
          const today = todayLocal();
          const s = get();
          if (!s.activeFortnightId) return; // first run is initApp's job
          const found = s.fortnights.find((f) => f.id === s.activeFortnightId);
          // Expiry is evaluated BEFORE the lastRolloverDay latch: an
          // imported backup can carry lastRolloverDay === today with an
          // already-expired active month, and with no manual "Generate new
          // month" button left, the latch alone would block generation
          // forever. No loop risk: generateMonthDays rolls weekend-tail
          // anchors forward, so a freshly generated month is never expired
          // and a same-day re-evaluation lands in the latch below instead.
          if (found && effectiveBoardDay(found, today) === null) {
            set(buildGeneration(s, today));
            return;
          }
          if (s.lastRolloverDay === today) return;
          if (!found) {
            // activeFortnightId doesn't resolve to any known fortnight (e.g.
            // corrupted state, a dropped fortnight, an external edit) -- the
            // most likely time to land here is the first tick of a new day.
            // Route through the same generation pipeline as the expiry
            // branch above rather than silently appending a bare fresh month:
            // buildGeneration keys carry-over on the string s.activeFortnightId,
            // not on a resolved Fortnight object, so it still rescues
            // todos/notes tagged with the dangling id even though no
            // fortnight with that id exists in s.fortnights (INV-5).
            set(buildGeneration(s, today));
            return;
          }
          const wasViewingActive = s.viewedFortnightId === s.activeFortnightId;
          const { todos } = applyRollover(s.todos, found, today);
          const { notes } = applyNoteRollover(s.notes, found, today);
          const effective = effectiveBoardDay(found, today);
          set({
            fortnights: s.fortnights,
            activeFortnightId: found.id,
            todos,
            notes,
            lastRolloverDay: today,
            selectedDay: wasViewingActive && effective !== null ? effective : s.selectedDay,
            viewedFortnightId: wasViewingActive ? found.id : s.viewedFortnightId,
          });
        },

        regenerateFortnight: () => {
          set(buildGeneration(get(), todayLocal()));
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
          set((s) => ({ todos: { ...s.todos, [id]: todo }, announcement: `Added todo: ${todo.title}` }));
        },

        updateTodo: (id, patch) =>
          set((s) => ({ todos: { ...s.todos, [id]: { ...s.todos[id], ...patch } } })),

        rescheduleTodo: (id, day) =>
          set((s) => ({ todos: { ...s.todos, [id]: { ...s.todos[id], scheduledDay: day, rolledOver: false } } })),

        toggleDone: (id) =>
          set((s) => ({ todos: { ...s.todos, [id]: setTodoDone(s.todos[id], !s.todos[id].done, nowIso()) } })),

        deleteTodo: (id) =>
          set((s) => {
            const { [id]: removed, ...rest } = s.todos;
            return { todos: rest, announcement: removed ? `Deleted todo: ${removed.title}` : s.announcement };
          }),

        addChecklistItem: (todoId, text) => {
          const trimmed = text.trim();
          if (trimmed === '') return;
          const itemId = crypto.randomUUID();
          set((s) => ({
            todos: {
              ...s.todos,
              [todoId]: domainAddChecklistItem(s.todos[todoId], { id: itemId, text: trimmed }, nowIso()),
            },
          }));
        },

        toggleChecklistItem: (todoId, itemId) =>
          set((s) => ({
            todos: { ...s.todos, [todoId]: domainToggleChecklistItem(s.todos[todoId], itemId, nowIso()) },
          })),

        removeChecklistItem: (todoId, itemId) =>
          set((s) => ({
            todos: { ...s.todos, [todoId]: domainRemoveChecklistItem(s.todos[todoId], itemId, nowIso()) },
          })),

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
          set((s) => ({ notes: { ...s.notes, [id]: note }, announcement: `Added note` }));
        },

        updateNote: (id, patch) =>
          set((s) => ({ notes: { ...s.notes, [id]: { ...s.notes[id], ...patch } } })),

        resolveBlocker: (id) =>
          set((s) => ({ notes: { ...s.notes, [id]: { ...s.notes[id], resolved: true } } })),

        deleteNote: (id) =>
          set((s) => {
            const { [id]: removed, ...rest } = s.notes;
            return { notes: rest, announcement: removed ? `Deleted note` : s.announcement };
          }),

        selectDay: (day) => set({ selectedDay: day, announcement: formatDayLabel(day) }),
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
              // A compose form left open by whichever fortnight was viewed
              // before this switch must not survive into the new one — see
              // INV-9 and the stale-open-form regression this guards against.
              composeIntent: null,
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
            pomodoroSettings: state.pomodoroSettings,
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

        announce: (message) => set({ announcement: message }),

        // Refuses in the reducer, not just in the UI that calls it: opening a
        // compose form (intent !== null) while viewing a read-only fortnight
        // is exactly the door the INV-9 orphan-todo bug shipped through once
        // (a form's own !readOnly gate is trivially bypassable by anything
        // that calls this action directly — a keyboard shortcut, a command
        // palette action). Closing (intent === null) is always allowed.
        setComposeIntent: (intent) =>
          set((s) => (intent !== null && s.viewedFortnightId !== s.activeFortnightId ? {} : { composeIntent: intent })),

        setTheme: (theme) => {
          applyThemePreference(theme);
          set({
            theme,
            announcement:
              theme === 'system' ? 'Theme follows your system setting' : `Theme set to ${theme}`,
          });
        },

        startPomodoro: () =>
          set((s) => ({
            pomodoro: startRun(s.pomodoroSettings, nowIso()),
            announcement: 'Focus session started',
          })),

        pausePomodoro: () =>
          set((s) => (s.pomodoro ? { pomodoro: pauseRun(s.pomodoro, nowIso()) } : {})),

        resumePomodoro: () =>
          set((s) => (s.pomodoro ? { pomodoro: resumeRun(s.pomodoro, nowIso()) } : {})),

        skipPomodoroPhase: () =>
          set((s) => (s.pomodoro ? { pomodoro: skipPhase(s.pomodoro, s.pomodoroSettings, nowIso()) } : {})),

        // Called by the widget when the deadline passes. Idempotent in effect:
        // completing re-arms `endsAt` in the future, so a second tick in the
        // same render window finds remaining time > 0 and does nothing.
        completePomodoroPhase: () =>
          set((s) => {
            if (!s.pomodoro) return {};
            const next = completePhase(s.pomodoro, s.pomodoroSettings, nowIso());
            const announcement =
              next.phase === 'work'
                ? 'Break over — focus session started'
                : next.phase === 'longBreak'
                  ? 'Focus session complete — long break started'
                  : 'Focus session complete — short break started';
            return { pomodoro: next, announcement };
          }),

        stopPomodoro: () => set({ pomodoro: null, announcement: 'Pomodoro stopped' }),

        // Clamps to whole positive minutes; anything non-finite is ignored
        // rather than clobbering a good persisted value.
        setPomodoroSettings: (patch) =>
          set((s) => {
            const next = { ...s.pomodoroSettings };
            for (const key of ['workMinutes', 'breakMinutes', 'longBreakMinutes'] as const) {
              const raw = patch[key];
              if (typeof raw === 'number' && Number.isFinite(raw) && Math.floor(raw) >= 1) {
                next[key] = Math.floor(raw);
              }
            }
            return { pomodoroSettings: next };
          }),
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
        pomodoroSettings: s.pomodoroSettings,
      }),
    },
  ),
);
