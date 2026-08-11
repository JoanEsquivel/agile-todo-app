import { generateMonthDays, effectiveBoardDay } from './fortnight';
import type { Fortnight } from './types';

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
