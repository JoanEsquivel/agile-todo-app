import {
  toISODate, parseISODate, addDays, isWorkday, mondayOfWeek,
  previousWorkday, nextWorkday, localDateOf,
} from './dates';

describe('dates', () => {
  it('toISODate uses local date fields', () => {
    expect(toISODate(new Date(2026, 7, 10))).toBe('2026-08-10');
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('parseISODate round-trips at local midnight', () => {
    const d = parseISODate('2026-08-10');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 7, 10, 0]);
  });

  it('addDays crosses month boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31');
  });

  it('isWorkday is true Mon-Fri, false Sat/Sun', () => {
    expect(isWorkday('2026-08-10')).toBe(true);  // Monday
    expect(isWorkday('2026-08-14')).toBe(true);  // Friday
    expect(isWorkday('2026-08-15')).toBe(false); // Saturday
    expect(isWorkday('2026-08-16')).toBe(false); // Sunday
  });

  it('mondayOfWeek: weeks start Monday, Sunday belongs to the preceding Monday', () => {
    expect(mondayOfWeek('2026-08-12')).toBe('2026-08-10'); // Wednesday
    expect(mondayOfWeek('2026-08-10')).toBe('2026-08-10'); // Monday itself
    expect(mondayOfWeek('2026-08-15')).toBe('2026-08-10'); // Saturday
    expect(mondayOfWeek('2026-08-16')).toBe('2026-08-10'); // Sunday -> preceding Monday
  });

  it('previous/nextWorkday skip weekends', () => {
    expect(previousWorkday('2026-08-17')).toBe('2026-08-14'); // Mon -> Fri
    expect(previousWorkday('2026-08-12')).toBe('2026-08-11');
    expect(nextWorkday('2026-08-14')).toBe('2026-08-17');     // Fri -> Mon
    expect(nextWorkday('2026-08-15')).toBe('2026-08-17');     // Sat -> Mon
  });

  it('localDateOf converts a UTC timestamp to the local calendar day', () => {
    const ts = new Date(2026, 7, 10, 23, 30).toISOString(); // 23:30 local
    expect(localDateOf(ts)).toBe('2026-08-10');
  });
});
