import { afterEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_LOCATION } from '@/lib/catalog';
import { defaultExpiryDate } from '@/lib/pantry';
import { expiryFrom, locationFor, unmark } from './addBatchFields';

afterEach(() => vi.useRealTimers());

describe('locationFor', () => {
  it('lets a preset Location win over the Catalog default', () => {
    expect(locationFor('freezer', 'fridge')).toBe('freezer');
  });

  it('uses the Catalog default when there is no preset', () => {
    expect(locationFor(undefined, 'fridge')).toBe('fridge');
  });

  it('falls back when neither is known', () => {
    expect(locationFor(undefined, null)).toBe(FALLBACK_LOCATION);
    expect(locationFor(undefined, undefined)).toBe(FALLBACK_LOCATION);
  });
});

describe('expiryFrom', () => {
  it('is no date for no Default Expiry', () => {
    expect(expiryFrom(null)).toBeNull();
  });

  it('counts the days from today', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 18, 12) });
    expect(expiryFrom(7)).toBe(defaultExpiryDate(7, new Date()));
  });
});

describe('unmark', () => {
  it('returns a copy without the field, leaving the original', () => {
    const marks: ReadonlySet<'amount' | 'expiry'> = new Set([
      'amount',
      'expiry',
    ]);
    const next = unmark(marks, 'amount');
    expect([...next]).toEqual(['expiry']);
    expect([...marks]).toEqual(['amount', 'expiry']);
  });
});
