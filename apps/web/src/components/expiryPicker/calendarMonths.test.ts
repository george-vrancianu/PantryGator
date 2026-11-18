import { describe, expect, it } from 'vitest';
import { fromIso } from '@/lib/pantry';
import { calendarMonths } from './calendarMonths';

const today = new Date(2026, 9, 14, 15, 30); // 14 Oct 2026, local

const keys = (months: { key: string }[]) => months.map((m) => m.key);

describe('calendarMonths', () => {
  it('runs from one month before today through twelve after', () => {
    const months = keys(calendarMonths(today, null));
    expect(months[0]).toBe('2026-09');
    expect(months.at(-1)).toBe('2027-10');
    expect(months).toHaveLength(14);
  });

  it('extends to a value within ten years of today', () => {
    expect(keys(calendarMonths(today, '2029-03-05')).at(-1)).toBe('2029-03');
    expect(keys(calendarMonths(today, '2024-03-05'))[0]).toBe('2024-03');
  });

  it('does not extend to a value more than ten years from today', () => {
    expect(calendarMonths(today, '9999-12-31')).toHaveLength(14);
    expect(calendarMonths(today, '0024-05-01')).toHaveLength(14);
  });

  it('extends to the Usual date, so tapping Usual lands on a rendered month', () => {
    const months = keys(calendarMonths(today, null, '2028-04-14'));
    expect(months.at(-1)).toBe('2028-04');
  });

  it('does not extend to a Usual date more than ten years away', () => {
    expect(calendarMonths(today, null, '2999-01-01')).toHaveLength(14);
  });
});

describe('fromIso', () => {
  it('keeps years 0 to 99 as written', () => {
    expect(fromIso('0024-05-01').getFullYear()).toBe(24);
  });
});
