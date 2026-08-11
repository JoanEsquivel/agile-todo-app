import { generateMonthDays, effectiveBoardDay, adaptFortnightToMonth, pruneToRetention } from './fortnight';
import type { Fortnight, Note, Todo } from './types';

const fn: Fortnight = {
  id: 'f1',
  startDay: '2026-08-10',
  days: [
    '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
    '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
  ],
  createdAt: '2026-08-10T12:00:00.000Z',
};

describe('effectiveBoardDay', () => {
  it('returns today when today is a fortnight day', () => {
    expect(effectiveBoardDay(fn, '2026-08-13')).toBe('2026-08-13');
  });

  it('weekend mid-fortnight resolves to the upcoming Monday', () => {
    expect(effectiveBoardDay(fn, '2026-08-15')).toBe('2026-08-17');
    expect(effectiveBoardDay(fn, '2026-08-16')).toBe('2026-08-17');
  });

  it('before the fortnight starts, resolves to the first day', () => {
    expect(effectiveBoardDay(fn, '2026-08-07')).toBe('2026-08-10');
  });

  it('after the last day, returns null (expired)', () => {
    expect(effectiveBoardDay(fn, '2026-08-22')).toBeNull();
    expect(effectiveBoardDay(fn, '2026-08-24')).toBeNull();
  });

  describe('with a calendar-month-length fixture (length-agnostic, no code change)', () => {
    const augustMonthDays = generateMonthDays('2026-08-18'); // 2026-08-03 .. 2026-08-31
    const augustMonth: Fortnight = {
      id: 'm-aug',
      startDay: augustMonthDays[0],
      days: augustMonthDays,
      createdAt: '2026-08-01T12:00:00.000Z',
    };
    const mayMonthDays = generateMonthDays('2026-05-15'); // 2026-05-01 .. 2026-05-29
    const mayMonth: Fortnight = {
      id: 'm-may',
      startDay: mayMonthDays[0],
      days: mayMonthDays,
      createdAt: '2026-05-01T12:00:00.000Z',
    };

    it('weekend near month end resolves to the last workday of the month', () => {
      expect(effectiveBoardDay(augustMonth, '2026-08-29')).toBe('2026-08-31');
    });

    it('today after a month that ends on a weekend tail returns null (expired)', () => {
      expect(effectiveBoardDay(mayMonth, '2026-05-30')).toBeNull();
    });

    it('today in the next month returns null (expired)', () => {
      expect(effectiveBoardDay(augustMonth, '2026-09-01')).toBeNull();
    });

    it('today before the month starts (weekend lead-in) resolves to the first day', () => {
      expect(effectiveBoardDay(augustMonth, '2026-08-01')).toBe('2026-08-03');
    });
  });
});

describe('generateMonthDays', () => {
  it('produces every workday of the calendar month containing the anchor, ascending', () => {
    expect(generateMonthDays('2026-08-18')).toEqual([
      '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07',
      '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
      '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
      '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
      '2026-08-31',
    ]);
    const aug = generateMonthDays('2026-08-18');
    expect(aug).toHaveLength(21);
    expect(aug[0]).toBe('2026-08-03');
    expect(aug[aug.length - 1]).toBe('2026-08-31');
  });

  it('a month starting on a weekend begins on the first workday', () => {
    expect(generateMonthDays('2026-08-01')[0]).toBe('2026-08-03'); // Sat Aug 1
    expect(generateMonthDays('2026-11-01')[0]).toBe('2026-11-02'); // Sun Nov 1
  });

  it('a month ending on a weekend ends on the last workday', () => {
    const may = generateMonthDays('2026-05-15');
    expect(may[may.length - 1]).toBe('2026-05-29');
  });

  it('February in a non-leap year has 20 workdays', () => {
    const feb = generateMonthDays('2026-02-10');
    expect(feb).toHaveLength(20);
    expect(feb[0]).toBe('2026-02-02');
    expect(feb[feb.length - 1]).toBe('2026-02-27');
  });

  it('February in a leap year includes Feb 29 and has 21 workdays', () => {
    const feb = generateMonthDays('2028-02-10');
    expect(feb).toHaveLength(21);
    expect(feb).toContain('2028-02-29');
  });

  it('a weekend anchor mid-month no longer anchors to that week\'s Monday (new semantics vs. generateFortnightDays): it still resolves to the whole containing month', () => {
    expect(generateMonthDays('2026-08-16')).toEqual(generateMonthDays('2026-08-18')); // Sun anchor mid-August
  });

  describe('weekend-tail roll-forward (INV-4): anchoring on a weekend AFTER the month\'s last workday rolls to next month, avoiding an instantly-expired period', () => {
    it('Saturday after May\'s last workday (Fri May 29) rolls forward to June', () => {
      const days = generateMonthDays('2026-05-30');
      expect(days[0]).toBe('2026-06-01');
      expect(days.every((d) => d.startsWith('2026-06'))).toBe(true);
    });

    it('a workday still inside the month does not roll, even near month end', () => {
      const days = generateMonthDays('2026-08-31'); // Monday, the last workday of August
      expect(days[0]).toBe('2026-08-03');
      expect(days[days.length - 1]).toBe('2026-08-31');
    });
  });
});

describe('adaptFortnightToMonth', () => {
  function makeTodo(overrides: Partial<Todo>): Todo {
    return {
      id: 't1', fortnightId: 'f1', title: 'x', priority: 'low', scheduledDay: '2026-08-18',
      done: false, createdAt: '2026-08-01T00:00:00.000Z', rolledOver: false, ...overrides,
    };
  }
  function makeNote(overrides: Partial<Note>): Note {
    return {
      id: 'n1', fortnightId: 'f1', day: '2026-08-18', category: 'blocker', text: 'blocked',
      resolved: false, createdAt: '2026-08-01T00:00:00.000Z', ...overrides,
    };
  }

  it('reshapes a literal 10-day fortnight into the containing calendar month, keeping id/createdAt and leaving todos/notes intact', () => {
    const active: Fortnight = {
      id: 'f1',
      startDay: '2026-08-17',
      days: [
        '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
        '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
      ],
      createdAt: '2026-08-17T09:00:00.000Z',
    };
    const todo = makeTodo({ id: 't1', fortnightId: 'f1', scheduledDay: '2026-08-19' });
    const note = makeNote({ id: 'n1', fortnightId: 'f1', day: '2026-08-19' });
    const result = adaptFortnightToMonth(active, { t1: todo }, { n1: note }, '2026-08-18');

    expect(result).not.toBeNull();
    expect(result!.fortnight.id).toBe('f1');
    expect(result!.fortnight.createdAt).toBe('2026-08-17T09:00:00.000Z');
    expect(result!.fortnight.startDay).toBe('2026-08-03');
    expect(result!.fortnight.days).toHaveLength(21);
    expect(result!.fortnight.days[0]).toBe('2026-08-03');
    expect(result!.fortnight.days[result!.fortnight.days.length - 1]).toBe('2026-08-31');
    // Both already land inside the reshaped month, so they're untouched.
    expect(result!.todos.t1).toBe(todo);
    expect(result!.notes.n1).toBe(note);
  });

  it('rescues a period whose days no longer include today, as long as it overlaps the current month', () => {
    // Same fixture as effectiveBoardDay's `fn` above: active Aug 10-21, but
    // "today" (Aug 25) has moved past its last day. Still same month though,
    // so the board should continue rather than show as expired.
    const active: Fortnight = { ...fn, id: 'f1' };
    const result = adaptFortnightToMonth(active, {}, {}, '2026-08-25');
    expect(result).not.toBeNull();
    expect(result!.fortnight.id).toBe('f1');
    expect(result!.fortnight.startDay).toBe('2026-08-03');
    expect(result!.fortnight.days[result!.fortnight.days.length - 1]).toBe('2026-08-31');
  });

  it('returns null when the old period does not overlap the current month at all', () => {
    const active: Fortnight = {
      id: 'f1',
      startDay: '2026-06-15',
      days: [
        '2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19',
        '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26',
      ],
      createdAt: '2026-06-15T09:00:00.000Z',
    };
    expect(adaptFortnightToMonth(active, {}, {}, '2026-08-18')).toBeNull();
  });

  it('returns null when the fortnight is already the current calendar month (idempotence)', () => {
    const augustDays = generateMonthDays('2026-08-18');
    const active: Fortnight = {
      id: 'f1', startDay: augustDays[0], days: augustDays, createdAt: '2026-08-01T00:00:00.000Z',
    };
    expect(adaptFortnightToMonth(active, {}, {}, '2026-08-18')).toBeNull();
  });

  describe('crossing a month boundary (active Aug 31 - Sep 11, today Aug 31)', () => {
    const active: Fortnight = {
      id: 'f1',
      startDay: '2026-08-31',
      days: [
        '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
        '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11',
      ],
      createdAt: '2026-08-31T09:00:00.000Z',
    };

    it('relocates a non-done todo that fell outside the month to the effective board day, without marking it rolled over when it was not yet due', () => {
      const todo = makeTodo({ id: 't1', fortnightId: 'f1', scheduledDay: '2026-09-03', done: false, rolledOver: false });
      const result = adaptFortnightToMonth(active, { t1: todo }, {}, '2026-08-31');
      expect(result).not.toBeNull();
      expect(result!.fortnight.days[result!.fortnight.days.length - 1]).toBe('2026-08-31');
      expect(result!.todos.t1.scheduledDay).toBe('2026-08-31');
      expect(result!.todos.t1.rolledOver).toBe(false);
    });

    it('relocates a done todo too, preserving done/completedAt and leaving rolledOver untouched', () => {
      const todo = makeTodo({
        id: 't3', fortnightId: 'f1', scheduledDay: '2026-09-03', done: true,
        completedAt: '2026-08-30T10:00:00.000Z', rolledOver: false,
      });
      const result = adaptFortnightToMonth(active, { t3: todo }, {}, '2026-08-31');
      expect(result).not.toBeNull();
      expect(result!.todos.t3.scheduledDay).toBe('2026-08-31');
      expect(result!.todos.t3.done).toBe(true);
      expect(result!.todos.t3.completedAt).toBe('2026-08-30T10:00:00.000Z');
      expect(result!.todos.t3.rolledOver).toBe(false);
    });

    it('relocates a note whose day fell outside the month', () => {
      const note = makeNote({ id: 'n1', fortnightId: 'f1', day: '2026-09-03' });
      const result = adaptFortnightToMonth(active, {}, { n1: note }, '2026-08-31');
      expect(result).not.toBeNull();
      expect(result!.notes.n1.day).toBe('2026-08-31');
    });

    it('leaves todos and notes belonging to OTHER fortnights untouched, byte for byte', () => {
      const otherTodo = makeTodo({ id: 'o1', fortnightId: 'other', scheduledDay: '2026-09-03' });
      const otherNote = makeNote({ id: 'o2', fortnightId: 'other', day: '2026-09-03' });
      const result = adaptFortnightToMonth(active, { o1: otherTodo }, { o2: otherNote }, '2026-08-31');
      expect(result).not.toBeNull();
      expect(result!.todos.o1).toBe(otherTodo);
      expect(result!.notes.o2).toBe(otherNote);
    });
  });

  describe('crossing into the previous month (active Jul 27 - Aug 7, today Aug 3)', () => {
    // A real, reachable "outside the new month AND in the past" state:
    // days from the tail of the old fortnight that spilled into July are
    // both before today and outside the reshaped (August) month.
    const active: Fortnight = {
      id: 'f1',
      startDay: '2026-07-27',
      days: [
        '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31',
        '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07',
      ],
      createdAt: '2026-07-27T09:00:00.000Z',
    };

    it('marks rolledOver when a non-done todo relocated from a real past day outside the month', () => {
      const todo = makeTodo({ id: 't1', fortnightId: 'f1', scheduledDay: '2026-07-28', done: false, rolledOver: false });
      const result = adaptFortnightToMonth(active, { t1: todo }, {}, '2026-08-03');
      expect(result).not.toBeNull();
      expect(result!.fortnight.days[0]).toBe('2026-08-03');
      expect(result!.todos.t1.scheduledDay).toBe('2026-08-03');
      expect(result!.todos.t1.rolledOver).toBe(true);
    });

    it('leaves rolledOver untouched for a done todo relocated from the same kind of past day (exercises the done branch of the ternary distinctly from the non-done branch)', () => {
      // Without the `t.done` check, the non-done branch's condition
      // (`t.scheduledDay < today`) would ALSO evaluate true here and flip
      // rolledOver to true -- so this only stays false if the done branch is
      // actually taken.
      const todo = makeTodo({
        id: 't2', fortnightId: 'f1', scheduledDay: '2026-07-29', done: true,
        completedAt: '2026-07-29T10:00:00.000Z', rolledOver: false,
      });
      const result = adaptFortnightToMonth(active, { t2: todo }, {}, '2026-08-03');
      expect(result).not.toBeNull();
      expect(result!.todos.t2.scheduledDay).toBe('2026-08-03');
      expect(result!.todos.t2.done).toBe(true);
      expect(result!.todos.t2.completedAt).toBe('2026-07-29T10:00:00.000Z');
      expect(result!.todos.t2.rolledOver).toBe(false);
    });
  });

  it('returns null on a weekend-tail anchor that rolls the new month past the old period entirely', () => {
    const active: Fortnight = {
      id: 'f1',
      startDay: '2026-05-18',
      days: [
        '2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22',
        '2026-05-25', '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29',
      ],
      createdAt: '2026-05-18T09:00:00.000Z',
    };
    // 2026-05-30 is a Saturday after May's last workday, so generateMonthDays
    // rolls forward to June — no overlap with the May-anchored fortnight.
    expect(adaptFortnightToMonth(active, {}, {}, '2026-05-30')).toBeNull();
  });
});

describe('pruneToRetention', () => {
  function period(id: string, days: string[]): Fortnight {
    return { id, startDay: days[0], days, createdAt: `${days[0]}T09:00:00.000Z` };
  }
  function todoIn(id: string, fortnightId: string, day: string): Todo {
    return {
      id, fortnightId, title: id, priority: 'low', scheduledDay: day,
      done: true, completedAt: `${day}T15:00:00.000Z`,
      createdAt: `${day}T09:00:00.000Z`, rolledOver: false,
    };
  }
  function noteIn(id: string, fortnightId: string, day: string): Note {
    return {
      id, fortnightId, day, category: 'info', text: id,
      resolved: false, createdAt: `${day}T09:00:00.000Z`,
    };
  }

  // Legacy-style short periods (length-agnostic per INV-4) in distinct months.
  const may = period('p-may', ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08']);
  const june = period('p-jun', ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']);
  const july = period('p-jul', ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10']);
  const august = period('p-aug', generateMonthDays('2026-08-18'));
  const september = period('p-sep', generateMonthDays('2026-09-01'));

  it('keeps the 3 newest calendar months present and drops everything older, todos/notes included', () => {
    const todos = {
      keep: todoIn('keep', 'p-jul', '2026-07-06'),
      dropA: todoIn('dropA', 'p-may', '2026-05-04'),
      dropB: todoIn('dropB', 'p-jun', '2026-06-01'),
    };
    const notes = {
      kept: noteIn('kept', 'p-aug', '2026-08-04'),
      gone: noteIn('gone', 'p-may', '2026-05-05'),
    };
    const result = pruneToRetention([may, june, july, august, september], todos, notes, '2026-09-01');
    expect(result.fortnights.map((f) => f.id)).toEqual(['p-jul', 'p-aug', 'p-sep']);
    expect(Object.keys(result.todos)).toEqual(['keep']);
    expect(Object.keys(result.notes)).toEqual(['kept']);
  });

  it('passes retained todos/notes through byte-identical (same references)', () => {
    const t = todoIn('t', 'p-aug', '2026-08-04');
    const n = noteIn('n', 'p-aug', '2026-08-04');
    const result = pruneToRetention([may, july, august, september], { t }, { n }, '2026-09-01');
    expect(result.todos.t).toBe(t);
    expect(result.notes.n).toBe(n);
  });

  it('is a no-op returning the same references when nothing falls outside the window', () => {
    const fortnights = [july, august, september];
    const todos = { t: todoIn('t', 'p-jul', '2026-07-06') };
    const notes = {};
    const result = pruneToRetention(fortnights, todos, notes, '2026-09-01');
    expect(result.fortnights).toBe(fortnights);
    expect(result.todos).toBe(todos);
    expect(result.notes).toBe(notes);
  });

  it('two legacy periods inside one calendar month occupy ONE retention slot: both survive together', () => {
    const julyB = period('p-jul-b', ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24']);
    const result = pruneToRetention([june, july, julyB, august, september], {}, {}, '2026-09-01');
    expect(result.fortnights.map((f) => f.id)).toEqual(['p-jul', 'p-jul-b', 'p-aug', 'p-sep']);
  });

  it('a legacy period in month−3 drops even when the total count is small', () => {
    // June is month−3 relative to September: exactly one month past the window.
    const result = pruneToRetention([june, july, august, september], {}, {}, '2026-09-01');
    expect(result.fortnights.map((f) => f.id)).toEqual(['p-jul', 'p-aug', 'p-sep']);
  });

  it('never drops the active fortnight: weekend-tail generation puts the active month AFTER month(today)', () => {
    // Sat 2026-10-31 falls after October's last workday (Fri Oct 30), so the
    // freshly generated active month is November while today is still October.
    const september2 = period('p-sep2', generateMonthDays('2026-09-01'));
    const october = period('p-oct', generateMonthDays('2026-10-15'));
    const november = period('p-nov', generateMonthDays('2026-10-31')); // rolls forward to November
    const result = pruneToRetention([august, september2, october, november], {}, {}, '2026-10-31');
    expect(result.fortnights.map((f) => f.id)).toEqual(['p-aug', 'p-sep2', 'p-oct', 'p-nov']);
  });

  it('a months-long gap keeps the last actually-used months -- no eviction by empty ghost months', () => {
    // Away from August to November: the months present are Jun/Jul/Aug + the
    // new Nov. The 3 newest months PRESENT are Jul/Aug/Nov -- June drops,
    // real history stays (approved gap decision, spec §2).
    const november = period('p-nov', generateMonthDays('2026-11-16'));
    const result = pruneToRetention([june, july, august, november], {}, {}, '2026-11-16');
    expect(result.fortnights.map((f) => f.id)).toEqual(['p-jul', 'p-aug', 'p-nov']);
  });

  it('a legacy period spanning two months is keyed by the month it ends in (intersects rule)', () => {
    const spanning = period('p-span', [
      '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31',
      '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07',
    ]);
    const october = period('p-oct', generateMonthDays('2026-10-01'));
    // Window at Oct (months present: Aug/Sep/Oct) reaches back to August, and
    // the spanning period's tail is in August -- it survives.
    const kept = pruneToRetention([spanning, august, september, october], {}, {}, '2026-10-01');
    expect(kept.fortnights.map((f) => f.id)).toEqual(['p-span', 'p-aug', 'p-sep', 'p-oct']);
    // Once November arrives the window is Sep/Oct/Nov -- it drops.
    const november = period('p-nov', generateMonthDays('2026-11-02'));
    const dropped = pruneToRetention([spanning, august, september, october, november], {}, {}, '2026-11-02');
    expect(dropped.fortnights.map((f) => f.id)).toEqual(['p-sep', 'p-oct', 'p-nov']);
  });

  it('is tolerant of many months (imported archive): keeps the newest 3, throws nothing', () => {
    const feb = period('p-feb', ['2026-02-02', '2026-02-03', '2026-02-04', '2026-02-05', '2026-02-06']);
    const mar = period('p-mar', ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06']);
    const apr = period('p-apr', ['2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10']);
    const result = pruneToRetention([feb, mar, apr, may, june, july, august, september], {}, {}, '2026-09-01');
    expect(result.fortnights.map((f) => f.id)).toEqual(['p-jul', 'p-aug', 'p-sep']);
  });
});
