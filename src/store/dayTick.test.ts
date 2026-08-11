import { useAppStore } from './store';
import type { Fortnight, PersistedState } from '../domain/types';

const clock = { today: '2026-08-18' };
vi.mock('./clock', () => ({
  todayLocal: () => clock.today,
  nowIso: () => `${clock.today}T12:00:00.000Z`,
}));

function reset() {
  clock.today = '2026-08-18';
  useAppStore.setState({
    schemaVersion: 1, fortnights: [], activeFortnightId: null,
    todos: {}, notes: {}, lastRolloverDay: null,
    viewedFortnightId: null, selectedDay: null,
  });
  useAppStore.getState().initApp();
}

describe('checkDayTick', () => {
  beforeEach(reset);

  it('rolls incomplete todos forward exactly once per day change', () => {
    useAppStore.getState().addTodo({ title: 'a', priority: 'low', scheduledDay: '2026-08-18' });
    clock.today = '2026-08-19';
    useAppStore.getState().checkDayTick();
    const afterFirst = Object.values(useAppStore.getState().todos)[0];
    expect(afterFirst).toMatchObject({ scheduledDay: '2026-08-19', rolledOver: true });
    expect(useAppStore.getState().lastRolloverDay).toBe('2026-08-19');
    expect(useAppStore.getState().selectedDay).toBe('2026-08-19');

    useAppStore.getState().checkDayTick(); // same day again: no-op
    expect(Object.values(useAppStore.getState().todos)[0]).toEqual(afterFirst);
  });

  it('rolls an unresolved blocker note forward, leaves info/resolved notes alone', () => {
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'blocked' });
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'info', text: 'fyi' });
    const notes = Object.values(useAppStore.getState().notes);
    const blocker = notes.find((n) => n.category === 'blocker')!;
    const info = notes.find((n) => n.category === 'info')!;
    useAppStore.getState().resolveBlocker(blocker.id); // start a second, unresolved blocker instead
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'still blocked' });

    clock.today = '2026-08-19';
    useAppStore.getState().checkDayTick();

    const after = useAppStore.getState().notes;
    expect(after[blocker.id]).toMatchObject({ day: '2026-08-18', resolved: true }); // resolved: untouched
    expect(after[info.id]).toMatchObject({ day: '2026-08-18' }); // info: untouched
    const stillBlocked = Object.values(after).find((n) => n.text === 'still blocked')!;
    expect(stillBlocked).toMatchObject({ day: '2026-08-19', rolledOver: true });

    const afterFirst = { ...after };
    useAppStore.getState().checkDayTick(); // same day again: no-op
    expect(useAppStore.getState().notes).toEqual(afterFirst);
  });
});

describe('regenerateFortnight', () => {
  beforeEach(reset);

  it('appends a new active fortnight and carries incomplete todos over', () => {
    useAppStore.getState().addTodo({ title: 'pending', priority: 'high', scheduledDay: '2026-08-18' });
    useAppStore.getState().addTodo({ title: 'shipped', priority: 'low', scheduledDay: '2026-08-18' });
    const shipped = Object.values(useAppStore.getState().todos).find((t) => t.title === 'shipped')!;
    useAppStore.getState().toggleDone(shipped.id);

    // The active period (Aug 3-31, the calendar month) is still active; force
    // a regenerate mid-flight. Regenerating within the same month produces a
    // second period with the SAME days but a new id -- permitted (INV-5); the
    // switcher tells them apart with "(current)".
    clock.today = '2026-08-25';
    const oldId = useAppStore.getState().activeFortnightId!;
    useAppStore.getState().regenerateFortnight();

    const s = useAppStore.getState();
    expect(s.fortnights).toHaveLength(2);
    expect(s.activeFortnightId).not.toBe(oldId);
    expect(s.viewedFortnightId).toBe(s.activeFortnightId);
    const pending = Object.values(s.todos).find((t) => t.title === 'pending')!;
    expect(pending.fortnightId).toBe(s.activeFortnightId);
    expect(pending.scheduledDay).toBe('2026-08-25');
    expect(pending.rolledOver).toBe(true);
    expect(Object.values(s.todos).find((t) => t.title === 'shipped')!.fortnightId).toBe(oldId);
  });

  it('carries an unresolved blocker note over, leaves a resolved one behind', () => {
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'open blocker' });
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'closed blocker' });
    const closed = Object.values(useAppStore.getState().notes).find((n) => n.text === 'closed blocker')!;
    useAppStore.getState().resolveBlocker(closed.id);

    clock.today = '2026-08-25';
    const oldId = useAppStore.getState().activeFortnightId!;
    useAppStore.getState().regenerateFortnight();

    const s = useAppStore.getState();
    const open = Object.values(s.notes).find((n) => n.text === 'open blocker')!;
    expect(open.fortnightId).toBe(s.activeFortnightId);
    expect(open.day).toBe('2026-08-25');
    expect(open.rolledOver).toBe(true);
    expect(Object.values(s.notes).find((n) => n.text === 'closed blocker')!.fortnightId).toBe(oldId);
    expect(s.lastRolloverDay).toBe('2026-08-25');
  });
});

describe('automatic month generation (checkDayTick expiry branch)', () => {
  beforeEach(reset);

  function pastPeriod(id: string, days: string[]): Fortnight {
    return { id, startDay: days[0], days, createdAt: `${days[0]}T09:00:00.000Z` };
  }
  const mayDays = ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08'];
  const juneDays = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'];
  const julyDays = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'];
  const aprilDays = ['2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10'];

  it('auto-generates the next month on the first tick after the active month ends, carrying pending work', () => {
    useAppStore.getState().addTodo({ title: 'pending', priority: 'high', scheduledDay: '2026-08-18' });
    useAppStore.getState().addTodo({ title: 'shipped', priority: 'low', scheduledDay: '2026-08-18' });
    const shipped = Object.values(useAppStore.getState().todos).find((t) => t.title === 'shipped')!;
    useAppStore.getState().toggleDone(shipped.id);
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'open blocker' });
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'closed blocker' });
    const closed = Object.values(useAppStore.getState().notes).find((n) => n.text === 'closed blocker')!;
    useAppStore.getState().resolveBlocker(closed.id);
    const oldId = useAppStore.getState().activeFortnightId!;

    clock.today = '2026-09-01';
    useAppStore.getState().checkDayTick();

    const s = useAppStore.getState();
    expect(s.fortnights).toHaveLength(2);
    expect(s.activeFortnightId).not.toBe(oldId);
    const active = s.fortnights.find((f) => f.id === s.activeFortnightId)!;
    expect(active.days[0]).toBe('2026-09-01');
    expect(s.viewedFortnightId).toBe(s.activeFortnightId);
    expect(s.selectedDay).toBe('2026-09-01');
    const pending = Object.values(s.todos).find((t) => t.title === 'pending')!;
    expect(pending).toMatchObject({ fortnightId: s.activeFortnightId, scheduledDay: '2026-09-01', rolledOver: true });
    expect(Object.values(s.todos).find((t) => t.title === 'shipped')!.fortnightId).toBe(oldId);
    const open = Object.values(s.notes).find((n) => n.text === 'open blocker')!;
    expect(open).toMatchObject({ fortnightId: s.activeFortnightId, day: '2026-09-01', rolledOver: true });
    expect(Object.values(s.notes).find((n) => n.text === 'closed blocker')!.fortnightId).toBe(oldId);
  });

  it('the generating tick stamps lastRolloverDay; a same-day second tick moves nothing (the INV-5 hazard)', () => {
    useAppStore.getState().addTodo({ title: 'pending', priority: 'low', scheduledDay: '2026-08-18' });
    clock.today = '2026-09-01';
    useAppStore.getState().checkDayTick();
    const s1 = useAppStore.getState();
    expect(s1.fortnights).toHaveLength(2); // generation happened...
    expect(s1.lastRolloverDay).toBe('2026-09-01'); // ...and stamped the latch in the same set()

    const snapshot = {
      fortnights: s1.fortnights, activeFortnightId: s1.activeFortnightId,
      todos: s1.todos, notes: s1.notes, lastRolloverDay: s1.lastRolloverDay,
      viewedFortnightId: s1.viewedFortnightId, selectedDay: s1.selectedDay,
    };
    useAppStore.getState().checkDayTick(); // interval + focus + visibilitychange can all fire same-day
    const s2 = useAppStore.getState();
    expect({
      fortnights: s2.fortnights, activeFortnightId: s2.activeFortnightId,
      todos: s2.todos, notes: s2.notes, lastRolloverDay: s2.lastRolloverDay,
      viewedFortnightId: s2.viewedFortnightId, selectedDay: s2.selectedDay,
    }).toEqual(snapshot);
  });

  it('does not generate twice even with the latch stripped (idempotence rests on a fresh month never being expired)', () => {
    clock.today = '2026-09-01';
    useAppStore.getState().checkDayTick();
    const generated = useAppStore.getState().activeFortnightId;
    useAppStore.setState({ lastRolloverDay: null }); // strip the latch entirely
    useAppStore.getState().checkDayTick();
    const s = useAppStore.getState();
    expect(s.activeFortnightId).toBe(generated);
    expect(s.fortnights).toHaveLength(2);
  });

  it('generates even when lastRolloverDay is already today, if the active month has expired (imported-backup case)', () => {
    // Replace the active month's days with an entirely-past July range,
    // keeping its id, then pretend rollover already ran today.
    const activeId = useAppStore.getState().activeFortnightId!;
    useAppStore.setState({
      fortnights: useAppStore.getState().fortnights.map((f) =>
        f.id === activeId ? { ...f, startDay: julyDays[0], days: julyDays } : f,
      ),
      lastRolloverDay: '2026-08-18',
    });
    useAppStore.getState().checkDayTick();
    const s = useAppStore.getState();
    expect(s.fortnights).toHaveLength(2);
    expect(s.activeFortnightId).not.toBe(activeId);
  });

  it('a months-long gap generates exactly one new month and keeps the last actually-used months (no ghost months)', () => {
    useAppStore.getState().addTodo({ title: 'pending', priority: 'low', scheduledDay: '2026-08-18' });
    clock.today = '2026-11-16';
    useAppStore.getState().checkDayTick();
    const s = useAppStore.getState();
    expect(s.fortnights).toHaveLength(2); // August + November -- no September/October ghosts
    expect(s.fortnights.map((f) => f.days[0].slice(0, 7))).toEqual(['2026-08', '2026-11']);
    const pending = Object.values(s.todos).find((t) => t.title === 'pending')!;
    expect(pending).toMatchObject({ fortnightId: s.activeFortnightId, scheduledDay: '2026-11-16', rolledOver: true });
  });

  it('re-points the view when the viewed month is pruned, instead of blanking the app', () => {
    const active = useAppStore.getState().fortnights[0];
    const may = pastPeriod('p-may', mayDays);
    const june = pastPeriod('p-jun', juneDays);
    const july = pastPeriod('p-jul', julyDays);
    useAppStore.setState({
      fortnights: [may, june, july, active],
      todos: {
        old: {
          id: 'old', fortnightId: 'p-may', title: 'ancient', priority: 'low',
          scheduledDay: '2026-05-04', done: true, completedAt: '2026-05-04T15:00:00.000Z',
          createdAt: '2026-05-04T09:00:00.000Z', rolledOver: false,
        },
      },
    });
    useAppStore.getState().viewFortnight('p-may'); // parked on the oldest month

    clock.today = '2026-09-01';
    useAppStore.getState().checkDayTick();

    const s = useAppStore.getState();
    // September generated; retained months are Jul/Aug/Sep -- May and June pruned.
    expect(s.fortnights.map((f) => f.id)).toEqual(['p-jul', active.id, s.activeFortnightId]);
    expect(s.todos.old).toBeUndefined();
    expect(s.viewedFortnightId).toBe(s.activeFortnightId);
    expect(s.selectedDay).toBe('2026-09-01');
    expect(s.announcement).toContain('removed from history');
  });

  it('keeps the view parked on a RETAINED past month across auto-generation', () => {
    const active = useAppStore.getState().fortnights[0];
    const july = pastPeriod('p-jul', julyDays);
    useAppStore.setState({ fortnights: [july, active] });
    useAppStore.getState().viewFortnight('p-jul');

    clock.today = '2026-09-01';
    useAppStore.getState().checkDayTick();

    const s = useAppStore.getState();
    expect(s.activeFortnightId).not.toBe(active.id); // generation happened
    expect(s.viewedFortnightId).toBe('p-jul');        // view untouched
    expect(s.selectedDay).toBe('2026-07-06');         // still parked where the user was
  });

  it('importState with more than 3 months of history does not prune (pruning only runs at generation)', () => {
    const s0 = useAppStore.getState();
    const active = s0.fortnights[0];
    const snapshot: PersistedState = {
      schemaVersion: s0.schemaVersion,
      fortnights: [
        pastPeriod('p-apr', aprilDays), pastPeriod('p-may', mayDays),
        pastPeriod('p-jun', juneDays), pastPeriod('p-jul', julyDays), active,
      ],
      activeFortnightId: active.id,
      todos: {}, notes: {},
      lastRolloverDay: '2026-08-18',
      pomodoroSettings: s0.pomodoroSettings,
    };
    useAppStore.getState().importState(snapshot);
    expect(useAppStore.getState().fortnights).toHaveLength(5);
  });

  it('importState with an expired active month and lastRolloverDay === today generates immediately (expiry beats the latch)', () => {
    const s0 = useAppStore.getState();
    const snapshot: PersistedState = {
      schemaVersion: s0.schemaVersion,
      fortnights: [pastPeriod('p-jul', julyDays)],
      activeFortnightId: 'p-jul',
      todos: {
        stuck: {
          id: 'stuck', fortnightId: 'p-jul', title: 'stranded', priority: 'low',
          scheduledDay: '2026-07-10', done: false,
          createdAt: '2026-07-06T09:00:00.000Z', rolledOver: false,
        },
      },
      notes: {},
      lastRolloverDay: '2026-08-18', // === mocked today: the latch alone would block forever
      pomodoroSettings: s0.pomodoroSettings,
    };
    useAppStore.getState().importState(snapshot);
    const s = useAppStore.getState();
    expect(s.fortnights).toHaveLength(2);
    expect(s.activeFortnightId).not.toBe('p-jul');
    const stuck = Object.values(s.todos).find((t) => t.title === 'stranded')!;
    expect(stuck).toMatchObject({ fortnightId: s.activeFortnightId, scheduledDay: '2026-08-18', rolledOver: true });
  });

  it('recovers via buildGeneration when activeFortnightId is dangling (no matching fortnight), rescuing todos tagged with it', () => {
    // Corrupted-state simulation: activeFortnightId points at nothing, but a
    // real fortnight from before the corruption is still sitting in history,
    // and a pending todo is still tagged with the now-dangling id -- exactly
    // the shape a "new day, stale/corrupted localStorage" app open produces.
    const historical = useAppStore.getState().fortnights[0];
    useAppStore.setState({
      activeFortnightId: 'dangling-id',
      lastRolloverDay: '2026-08-17', // past day: the latch does not block
      todos: {
        orphan: {
          id: 'orphan', fortnightId: 'dangling-id', title: 'orphaned', priority: 'low',
          scheduledDay: '2026-08-10', done: false,
          createdAt: '2026-08-10T09:00:00.000Z', rolledOver: false,
        },
      },
    });

    useAppStore.getState().checkDayTick();

    const s = useAppStore.getState();
    // A new month was generated through buildGeneration and installed active
    // -- not a bare buildFortnight append with no rescue.
    expect(s.activeFortnightId).not.toBe('dangling-id');
    const active = s.fortnights.find((f) => f.id === s.activeFortnightId);
    expect(active).toBeDefined();
    expect(s.lastRolloverDay).toBe('2026-08-18');
    // The orphaned todo was rescued: re-keyed off the new month and landed
    // on today's effective board day (it was scheduled in the past).
    const orphan = s.todos.orphan;
    expect(orphan).toMatchObject({ fortnightId: s.activeFortnightId, scheduledDay: '2026-08-18', rolledOver: true });
    // The pre-existing real fortnight is retained, not dropped -- only 2
    // months exist total, well within the 3-month retention window.
    expect(s.fortnights.some((f) => f.id === historical.id)).toBe(true);
    expect(s.fortnights).toHaveLength(2);
  });

  it('importing an expired backup generates immediately and prunes imported history to the window (spec §4, deliberate)', () => {
    // A 5-month archive whose active month (July) is already expired at the
    // mocked "today" (Sept 1). importState's trailing checkDayTick() call
    // hits the expiry branch immediately, so the imported history is pruned
    // to the retention window on the SAME tick that generates September --
    // spec §4 explicitly accepts this ("acceptable and now explicit +
    // tested, not accidental"), rather than waiting for the next boundary.
    const s0 = useAppStore.getState();
    const marchDays = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06'];
    const snapshot: PersistedState = {
      schemaVersion: s0.schemaVersion,
      fortnights: [
        pastPeriod('p-mar', marchDays), pastPeriod('p-apr', aprilDays),
        pastPeriod('p-may', mayDays), pastPeriod('p-jun', juneDays), pastPeriod('p-jul', julyDays),
      ],
      activeFortnightId: 'p-jul',
      todos: {
        ancient: {
          id: 'ancient', fortnightId: 'p-mar', title: 'ancient', priority: 'low',
          scheduledDay: '2026-03-02', done: true, completedAt: '2026-03-02T15:00:00.000Z',
          createdAt: '2026-03-02T09:00:00.000Z', rolledOver: false,
        },
        stuck: {
          id: 'stuck', fortnightId: 'p-jul', title: 'stranded', priority: 'low',
          scheduledDay: '2026-07-10', done: false,
          createdAt: '2026-07-06T09:00:00.000Z', rolledOver: false,
        },
      },
      notes: {},
      lastRolloverDay: '2026-08-18',
      pomodoroSettings: s0.pomodoroSettings,
    };

    clock.today = '2026-09-01';
    useAppStore.getState().importState(snapshot);

    const s = useAppStore.getState();
    // Only the 3 newest calendar months present survive: the freshly
    // generated September (active) plus July and June -- March, April, May
    // (older than the window) are pruned even though they were just imported.
    expect(s.fortnights.map((f) => f.id)).toEqual(['p-jun', 'p-jul', s.activeFortnightId]);
    expect(s.activeFortnightId).not.toBe('p-jul');
    const active = s.fortnights.find((f) => f.id === s.activeFortnightId)!;
    expect(active.days[0]).toBe('2026-09-01');
    expect(s.todos.ancient).toBeUndefined(); // pruned along with p-mar
    const stranded = Object.values(s.todos).find((t) => t.title === 'stranded')!;
    expect(stranded).toMatchObject({ fortnightId: s.activeFortnightId, scheduledDay: '2026-09-01', rolledOver: true });
    expect(s.viewedFortnightId).toBe(s.activeFortnightId);
    expect(s.selectedDay).toBe('2026-09-01');
    expect(s.announcement).toContain('removed from history');
  });
});
