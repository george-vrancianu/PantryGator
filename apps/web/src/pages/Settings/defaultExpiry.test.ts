import { describe, expect, it } from 'vitest';
import type { CategoryOptions } from '@/lib/settings';
import {
  DEFAULT_START_DAYS,
  groupCategories,
  lookupCategory,
  startingDays,
} from './defaultExpiry';

const options: CategoryOptions = {
  parents: [
    {
      id: 'p-dairy',
      name: 'Dairy',
      catalogDays: 7,
      leaves: [
        { id: 'l-milk', name: 'Milk', catalogDays: 5 },
        { id: 'l-cheese', name: 'Hard cheese', catalogDays: null },
      ],
    },
    {
      id: 'p-produce',
      name: 'Produce',
      catalogDays: null,
      leaves: [{ id: 'l-leafy', name: 'Leafy greens', catalogDays: null }],
    },
  ],
};

describe('startingDays', () => {
  it('starts at the existing override first', () => {
    expect(startingDays(21, 5)).toBe(21);
  });

  it('else at the Catalog default', () => {
    expect(startingDays(undefined, 5)).toBe(5);
    expect(startingDays(null, 5)).toBe(5);
  });

  it('else at seven days', () => {
    expect(DEFAULT_START_DAYS).toBe(7);
    expect(startingDays(undefined, undefined)).toBe(7);
    expect(startingDays(undefined, null)).toBe(7);
  });
});

describe('lookupCategory', () => {
  it('finds a leaf with its parent and Catalog default', () => {
    expect(lookupCategory(options, 'l-milk')).toEqual({
      id: 'l-milk',
      name: 'Milk',
      parentName: 'Dairy',
      wholeParent: false,
      catalogDays: 5,
    });
  });

  it('marks a parent as a whole-aisle override', () => {
    expect(lookupCategory(options, 'p-dairy')).toEqual({
      id: 'p-dairy',
      name: 'Dairy',
      parentName: 'Dairy',
      wholeParent: true,
      catalogDays: 7,
    });
  });

  it('treats a missing Catalog default as null', () => {
    expect(lookupCategory(options, 'l-cheese')?.catalogDays).toBeNull();
  });

  it('returns null when options have not loaded or the id is unknown', () => {
    expect(lookupCategory(undefined, 'l-milk')).toBeNull();
    expect(lookupCategory(options, 'nope')).toBeNull();
  });
});

describe('groupCategories', () => {
  it('lists "All {parent}" first in each group, then its leaves', () => {
    const groups = groupCategories(options, '', {});
    expect(groups.map((group) => group.parent.name)).toEqual([
      'Dairy',
      'Produce',
    ]);
    expect(groups[0].rows.map((row) => [row.id, row.wholeParent])).toEqual([
      ['p-dairy', true],
      ['l-milk', false],
      ['l-cheese', false],
    ]);
  });

  it('shows the override beside a category, else the Catalog default', () => {
    const groups = groupCategories(options, '', { 'l-milk': 9 });
    const rows = groups[0].rows;
    expect(rows.find((row) => row.id === 'l-milk')?.override).toBe(9);
    expect(rows.find((row) => row.id === 'l-cheese')?.override).toBeNull();
  });

  it('filters by category name, keeping only the matching leaf', () => {
    const groups = groupCategories(options, 'chee', {});
    expect(groups.map((group) => group.parent.name)).toEqual(['Dairy']);
    expect(groups[0].rows.map((row) => row.id)).toEqual(['l-cheese']);
  });

  it('filters by parent name, keeping the whole parent group', () => {
    const groups = groupCategories(options, 'produ', {});
    expect(groups.map((group) => group.parent.name)).toEqual(['Produce']);
    expect(groups[0].rows.map((row) => row.id)).toEqual([
      'p-produce',
      'l-leafy',
    ]);
  });

  it('ignores case and accents', () => {
    const groups = groupCategories(options, 'HÉLÉ', {});
    expect(groups).toEqual([]);
    expect(groupCategories(options, 'LEAFY', {})[0].rows[0].id).toBe('l-leafy');
  });

  it('returns no groups when nothing matches', () => {
    expect(groupCategories(options, 'zzz', {})).toEqual([]);
  });

  it('returns no groups when options are missing', () => {
    expect(groupCategories(undefined, '', {})).toEqual([]);
  });
});
