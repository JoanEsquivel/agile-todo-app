import { generateFortnightDays, effectiveBoardDay } from './fortnight';
import type { Fortnight } from './types';

const fn: Fortnight = {
  id: 'f1',
  startDay: '2026-08-10',
  days: generateFortnightDays('2026-08-10'),
  createdAt: '2026-08-10T12:00:00.000Z',
};

describe('generateFortnightDays', () => {
  it('produces 10 ascending workdays from the anchor week Monday', () => {
    expect(generateFortnightDays('2026-08-12')).toEqual([
      '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
      '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
    ]);
  });

  it('anchored on a weekend, still starts on that week Monday (Sunday -> preceding Monday)', () => {
    expect(generateFortnightDays('2026-08-16')[0]).toBe('2026-08-10');
    expect(generateFortnightDays('2026-08-15')[0]).toBe('2026-08-10');
  });
});

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
});
