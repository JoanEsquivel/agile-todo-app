import { create } from 'zustand';
import type {
  Fortnight, ISODate, LocalDateTime, Note, NoteCategory, PersistedState, Priority, Todo,
} from '../domain/types';
import { generateFortnightDays, effectiveBoardDay, carryOverTodos } from '../domain/fortnight';
import { applyRollover } from '../domain/rollover';
import { nowIso, todayLocal } from './clock';
import { SCHEMA_VERSION } from './migrations';

export interface AppState extends PersistedState {
  viewedFortnightId: string | null;
  selectedDay: ISODate | null;

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
}

function buildFortnight(anchor: ISODate): Fortnight {
  const days = generateFortnightDays(anchor);
  return { id: crypto.randomUUID(), startDay: days[0], days, createdAt: nowIso() };
}

export const useAppStore = create<AppState>()((set, get) => ({
  schemaVersion: SCHEMA_VERSION,
  fortnights: [],
  activeFortnightId: null,
  todos: {},
  notes: {},
  lastRolloverDay: null,
  viewedFortnightId: null,
  selectedDay: null,

  initApp: () => {
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
      const active = s.fortnights.find((f) => f.id === s.activeFortnightId)!;
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
    const active = s.fortnights.find((f) => f.id === s.activeFortnightId)!;
    const { todos } = applyRollover(s.todos, active, today);
    const effective = effectiveBoardDay(active, today);
    set({
      todos,
      lastRolloverDay: today,
      selectedDay:
        s.viewedFortnightId === s.activeFortnightId && effective !== null
          ? effective
          : s.selectedDay,
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
      const fn = s.fortnights.find((f) => f.id === id)!;
      const today = todayLocal();
      return {
        viewedFortnightId: id,
        selectedDay:
          id === s.activeFortnightId ? effectiveBoardDay(fn, today) ?? fn.days[0] : fn.days[0],
      };
    }),
}));
