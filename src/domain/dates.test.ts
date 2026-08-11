import {
  toISODate, parseISODate, addDays, isWorkday, mondayOfWeek,
  previousWorkday, nextWorkday, localDateOf,
  firstOfMonth, firstOfNextMonth, chunkByWeek, formatWeekdayShort, dayOfMonth,
  formatMonthLabel,
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

  it('firstOfMonth returns the 1st of the same month', () => {
    expect(firstOfMonth('2026-08-18')).toBe('2026-08-01');
    expect(firstOfMonth('2026-08-01')).toBe('2026-08-01');
  });

  it('firstOfMonth/firstOfNextMonth cross a year boundary', () => {
    expect(firstOfMonth('2026-12-15')).toBe('2026-12-01');
    expect(firstOfNextMonth('2026-12-15')).toBe('2027-01-01');
  });

  it('dayOfMonth returns the day-of-month number', () => {
    expect(dayOfMonth('2026-08-01')).toBe(1);
    expect(dayOfMonth('2026-08-31')).toBe(31);
  });

  it('formatWeekdayShort formats a short weekday name', () => {
    expect(formatWeekdayShort('2026-08-18')).toBe('Tue'); // Tuesday
    expect(formatWeekdayShort('2026-08-10')).toBe('Mon'); // Monday
  });

  it('formatMonthLabel formats the month name and year', () => {
    expect(formatMonthLabel('2026-08-03')).toBe('August 2026');
    expect(formatMonthLabel('2026-12-31')).toBe('December 2026');
  });

  describe('chunkByWeek', () => {
    it('groups a month of workdays into weekly chunks (August 2026)', () => {
      const aug = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07',
        '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
        '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
        '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
        '2026-08-31'];
      expect(chunkByWeek(aug).map((w) => w.length)).toEqual([5, 5, 5, 5, 1]);
    });

    it('groups a month that starts mid-week into a partial first chunk (September 2026, starts Tuesday)', () => {
      const sep = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
        '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11',
        '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
        '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25',
        '2026-09-28', '2026-09-29', '2026-09-30'];
      expect(chunkByWeek(sep).map((w) => w.length)).toEqual([4, 5, 5, 5, 3]);
    });

    it('groups a legacy 10-day fortnight array into two full weeks', () => {
      const fortnight = [
        '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
        '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
      ];
      expect(chunkByWeek(fortnight).map((w) => w.length)).toEqual([5, 5]);
    });

    it('returns an empty array for an empty input', () => {
      expect(chunkByWeek([])).toEqual([]);
    });
  });
});
