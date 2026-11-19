import { describe, expect, it } from 'vitest';
import {
  healthTodos,
  pantryHealth,
  partitionForgotten,
  usualExpiryDate,
  verdictOf,
  withExpiryDates,
  withOnShoppingList,
  type HealthBatch,
  type HealthInput,
} from './health';

const TODAY = '2026-10-15';

let n = 0;
const batch = (overrides: Partial<HealthBatch> = {}): HealthBatch => ({
  id: `b${++n}`,
  ingredientId: `i${n}`,
  location: 'fridge',
  expiryDate: '2027-01-01',
  defaultExpiryDays: null,
  createdAt: '2026-10-10T08:00:00Z',
  ...overrides,
});

const batches = (count: number, overrides: Partial<HealthBatch> = {}) =>
  Array.from({ length: count }, () => batch(overrides));

const input = (overrides: Partial<HealthInput> = {}): HealthInput => ({
  today: TODAY,
  staleThresholdDays: 3,
  batches: batches(10),
  staples: [],
  runningLow: new Set(),
  onShoppingList: new Set(),
  dismissed: new Set(),
  ...overrides,
});

const scored = (i: HealthInput) => {
  const result = pantryHealth(i);
  if (!result.scored) throw new Error('expected a score');
  return result;
};

describe('pantry health score', () => {
  it('gives no score below ten Batches and reports how many there are', () => {
    expect(pantryHealth(input({ batches: batches(9) }))).toEqual({
      scored: false,
      batchCount: 9,
    });
    expect(pantryHealth(input({ batches: batches(10) })).scored).toBe(true);
  });

  it('counts Batches in any state towards the ten, Expired included', () => {
    expect(
      pantryHealth(
        input({ batches: batches(10, { expiryDate: '2026-10-01' }) }),
      ).scored,
    ).toBe(true);
  });

  it('scores a spotless Pantry 100', () => {
    expect(scored(input())).toMatchObject({
      total: 100,
      factors: { fresh: 100, supply: 100, dated: 100, rotation: 100 },
    });
  });

  describe('Fresh', () => {
    it.each([
      ['expired', '2026-10-14', 0],
      ['expiring today', '2026-10-15', 60],
      ['at the Stale Threshold', '2026-10-18', 60],
      ['past the Stale Threshold', '2026-10-19', 100],
    ])('values a Batch %s at %i', (_name, expiryDate, fresh) => {
      const result = scored(
        input({
          batches: [...batches(9, { expiryDate: null }), batch({ expiryDate })],
        }),
      );
      expect(result.factors.fresh).toBe(fresh);
    });

    it('averages over dated Batches only', () => {
      const result = scored(
        input({
          batches: [
            batch({ expiryDate: '2026-10-01' }),
            batch({ expiryDate: '2027-01-01' }),
            ...batches(8, { expiryDate: null }),
          ],
        }),
      );
      expect(result.factors.fresh).toBe(50);
    });
  });

  describe('Supply', () => {
    const staple = (ingredientId: string) => ({ ingredientId });
    const withSupply = (overrides: Partial<HealthInput>) =>
      scored(
        input({
          batches: [batch({ ingredientId: 'milk' }), ...batches(9)],
          ...overrides,
        }),
      ).factors.supply;
    /** Forty stocked Ingredients, the first `low` of them Running low. */
    const forty = (low: number, onList: boolean) => {
      const ids = Array.from({ length: 40 }, (_, i) => `ing${i}`);
      const lowIds = ids.slice(0, low);
      return input({
        batches: ids.map((id) => batch({ ingredientId: id })),
        runningLow: new Set(lowIds),
        onShoppingList: new Set(onList ? lowIds : []),
      });
    };

    it('counts a stocked Ingredient 1', () => {
      expect(withSupply({})).toBe(100);
    });

    it('lowers for a Running low Ingredient that is not a Staple', () => {
      // 10 Ingredients, one Running low off the list: (9 + 0.1) / 10.
      expect(withSupply({ runningLow: new Set(['milk']) })).toBe(91);
    });

    it('counts a Running low Ingredient on the Shopping List 0.8', () => {
      expect(
        withSupply({
          runningLow: new Set(['milk']),
          onShoppingList: new Set(['milk']),
        }),
      ).toBe(98);
    });

    it('counts a Staple that is Running low once', () => {
      expect(
        withSupply({
          staples: [staple('milk')],
          runningLow: new Set(['milk']),
        }),
      ).toBe(91);
    });

    it('counts a missing Staple 0 off the list and 0.5 on it', () => {
      // 10 stocked + the missing Staple.
      expect(withSupply({ staples: [staple('eggs')] })).toBe(91);
      expect(
        withSupply({
          staples: [staple('eggs')],
          onShoppingList: new Set(['eggs']),
        }),
      ).toBe(95);
    });

    it('counts a Staple whose only Batch has expired as missing', () => {
      expect(
        withSupply({
          batches: [
            batch({ ingredientId: 'milk', expiryDate: '2026-10-14' }),
            ...batches(9),
          ],
          staples: [staple('milk')],
        }),
      ).toBe(90);
    });

    it('leaves dismissed missing Staples out', () => {
      expect(
        withSupply({
          staples: [staple('eggs')],
          dismissed: new Set(['eggs']),
        }),
      ).toBe(100);
    });

    it('leaves Unmatched Batches and fully Expired non-Staples out', () => {
      expect(
        withSupply({
          batches: [
            batch({ ingredientId: null }),
            batch({ ingredientId: 'old', expiryDate: '2026-10-01' }),
            ...batches(8),
          ],
          runningLow: new Set(['old']),
        }),
      ).toBe(100);
    });

    it('is left out when there is no Ingredient to judge', () => {
      const result = scored(
        input({
          batches: [
            ...batches(9, { ingredientId: null }),
            batch({ ingredientId: null, expiryDate: null }),
          ],
        }),
      );
      const { fresh, dated, rotation } = result.factors;
      expect(result.factors).not.toHaveProperty('supply');
      expect(dated).toBe(90);
      expect(result.total).toBe(
        Math.round((30 * fresh! + 10 * dated! + 15 * rotation!) / 55),
      );
      expect(result.total).toBeLessThan(100);
    });

    it('scores 40 Running low Ingredients off the list 60', () => {
      const result = scored(forty(40, false));
      expect(result.total).toBe(60);
      expect(result.verdict).toBe('attention');
    });

    it('scores 40 Running low Ingredients on the list 91, the to-do gaining 31', () => {
      const i = forty(40, false);
      expect(scored(withOnShoppingList(i, [...i.runningLow])).total).toBe(91);
      expect(scored(withOnShoppingList(i, [...i.runningLow])).verdict).toBe(
        'good',
      );
      expect(healthTodos(i)).toEqual([
        expect.objectContaining({
          key: 'runningLow',
          factor: 'supply',
          gain: 31,
        }),
      ]);
    });

    it('scores one Running low Ingredient out of 40 at 99', () => {
      expect(scored(forty(1, false)).total).toBe(99);
    });
  });

  describe('Dated', () => {
    it('is the share of Batches with an expiry date', () => {
      const result = scored(
        input({
          batches: [...batches(3, { expiryDate: null }), ...batches(7)],
        }),
      );
      expect(result.factors.dated).toBe(70);
    });
  });

  describe('Rotation and Forgotten', () => {
    const old = (days: number) =>
      new Date(Date.UTC(2026, 9, 15, 12) - days * 86_400_000).toISOString();

    it.each([
      ['fridge', 21],
      ['freezer', 180],
      ['cupboard', 365],
      ['spices', 730],
    ] as const)(
      'forgets an undated %s Batch older than %i days',
      (location, limit) => {
        const rotation = (age: number) =>
          scored(
            input({
              batches: [
                batch({ location, expiryDate: null, createdAt: old(age) }),
                ...batches(9),
              ],
            }),
          ).factors.rotation;
        expect(rotation(limit)).toBe(100);
        expect(rotation(limit + 1)).toBe(90);
      },
    );

    it('never forgets a dated Batch, however old', () => {
      const result = scored(
        input({
          batches: [batch({ createdAt: old(3000) }), ...batches(9)],
        }),
      );
      expect(result.factors.rotation).toBe(100);
    });
  });

  describe('total', () => {
    it('weights Fresh 30, Supply 45, Dated 10 and Rotation 15', () => {
      // Fresh 0, Supply 100, Dated 91 (10 of 11), Rotation 100: 0 + 45 + 9.1 + 15 = 69.
      const fresh0 = scored(
        input({
          batches: [
            ...batches(10, { expiryDate: '2026-10-01' }),
            batch({ expiryDate: null }),
          ],
        }),
      );
      expect(fresh0.factors.fresh).toBe(0);
      expect(fresh0.total).toBe(69);
      // Supply 0 only: ten Unmatched Batches (left out) and one missing Staple.
      const supply0 = scored(
        input({
          batches: batches(10, { ingredientId: null }),
          staples: [{ ingredientId: 'none' }],
        }),
      );
      expect(supply0.factors.supply).toBe(0);
      expect(supply0.total).toBe(55);
    });

    it('weights Dated 10 and Rotation 15', () => {
      // One recent undated Batch: Dated 90 only. 30 + 45 + 9 + 15 = 99.
      expect(
        scored(input({ batches: [batch({ expiryDate: null }), ...batches(9)] }))
          .total,
      ).toBe(99);
      // One undated Batch added 30 days ago (Forgotten in the fridge): Dated 90, Rotation 90.
      // 30 + 45 + 9 + 13.5 = 97.5, rounded to 98.
      const forgotten = scored(
        input({
          batches: [
            batch({
              expiryDate: null,
              createdAt: '2026-09-15T08:00:00Z',
            }),
            ...batches(9),
          ],
        }),
      );
      expect(forgotten.factors.rotation).toBe(90);
      expect(forgotten.total).toBe(98);
    });

    it('leaves Fresh out with no dated Batches and shares its weight', () => {
      const result = scored(
        input({ batches: batches(10, { expiryDate: null }) }),
      );
      expect(result.factors).not.toHaveProperty('fresh');
      expect(result.factors).toEqual({ supply: 100, dated: 0, rotation: 100 });
      // (45 * 100 + 10 * 0 + 15 * 100) / 70 = 85.7
      expect(result.total).toBe(86);
    });

    it('rounds the weighted sum', () => {
      // Dated 95 -> 0.10 * 95 = 9.5 + 90 = 99.5 -> 100.
      const result = scored(
        input({
          batches: [batch({ expiryDate: null }), ...batches(19)],
        }),
      );
      expect(result.factors.dated).toBe(95);
      expect(result.total).toBe(100);
    });
  });

  describe('verdict', () => {
    it.each([
      [100, 'good'],
      [85, 'good'],
      [84, 'some'],
      [65, 'some'],
      [64, 'attention'],
      [0, 'attention'],
    ] as const)('%i is %s', (total, verdict) => {
      expect(verdictOf(total)).toBe(verdict);
    });

    it('is carried on a scored result', () => {
      expect(scored(input()).verdict).toBe('good');
      expect(
        scored(input({ batches: batches(10, { expiryDate: '2026-10-01' }) }))
          .verdict,
      ).toBe('attention');
    });
  });
});

describe('health to-dos', () => {
  const keys = (i: HealthInput) => healthTodos(i).map((todo) => todo.key);

  it('has none for a spotless Pantry', () => {
    expect(healthTodos(input())).toEqual([]);
  });

  it('lists expired Batches oldest first, in the now group', () => {
    const todos = healthTodos(
      input({
        batches: [
          batch({ id: 'a', expiryDate: '2026-10-14' }),
          batch({ id: 'b', expiryDate: '2026-10-01' }),
          ...batches(8),
        ],
      }),
    );
    expect(todos).toEqual([
      {
        key: 'expired',
        group: 'now',
        factor: 'fresh',
        itemIds: ['b', 'a'],
        gain: 0,
      },
    ]);
  });

  it('lists Expiring Soon Batches soonest first, in the week group', () => {
    const todos = healthTodos(
      input({
        batches: [
          batch({ id: 'a', expiryDate: '2026-10-18' }),
          batch({ id: 'b', expiryDate: '2026-10-15' }),
          batch({ id: 'c', expiryDate: '2026-10-19' }),
          ...batches(7),
        ],
      }),
    );
    expect(todos).toEqual([
      {
        key: 'expiringSoon',
        group: 'week',
        factor: 'fresh',
        itemIds: ['b', 'a'],
        gain: 0,
      },
    ]);
  });

  it('lists missing Staples that are not on the list or dismissed', () => {
    const todos = healthTodos(
      input({
        staples: [
          { ingredientId: 'eggs' },
          { ingredientId: 'flour' },
          { ingredientId: 'salt' },
        ],
        onShoppingList: new Set(['flour']),
        dismissed: new Set(['salt']),
      }),
    );
    expect(todos).toEqual([
      {
        key: 'missingStaples',
        group: 'now',
        factor: 'supply',
        itemIds: ['eggs'],
        gain: 1,
      },
    ]);
  });

  it('lists Running low Ingredients that are in stock and not on the list', () => {
    const todos = healthTodos(
      input({
        batches: [
          batch({ ingredientId: 'milk' }),
          batch({ ingredientId: 'rice' }),
          ...batches(8),
        ],
        runningLow: new Set(['milk', 'rice', 'gone']),
        onShoppingList: new Set(['rice']),
      }),
    );
    expect(todos).toEqual([
      {
        key: 'runningLow',
        group: 'week',
        factor: 'supply',
        itemIds: ['milk'],
        gain: 3,
      },
    ]);
  });

  it('lists undated Batches in the tidy group, Forgotten first, most overdue first', () => {
    const ago = (days: number) =>
      new Date(Date.UTC(2026, 9, 15, 12) - days * 86_400_000).toISOString();
    const todos = healthTodos(
      input({
        batches: [
          batch({ id: 'fresh', expiryDate: null, createdAt: ago(1) }),
          batch({ id: 'fridge30', expiryDate: null, createdAt: ago(30) }),
          batch({
            id: 'freezer400',
            location: 'freezer',
            expiryDate: null,
            createdAt: ago(400),
          }),
          ...batches(7),
        ],
      }),
    );
    expect(todos).toEqual([
      {
        key: 'undated',
        group: 'tidy',
        factor: 'dated',
        itemIds: ['freezer400', 'fridge30', 'fresh'],
        gain: 0,
      },
    ]);
  });

  it('orders the to-dos by group: now, then week, then tidy', () => {
    expect(
      keys(
        input({
          batches: [
            batch({ expiryDate: null }),
            batch({ expiryDate: '2026-10-16' }),
            batch({ expiryDate: '2026-10-01' }),
            ...batches(7),
          ],
          staples: [{ ingredientId: 'eggs' }],
        }),
      ),
    ).toEqual(['expired', 'missingStaples', 'expiringSoon', 'undated']);
  });

  it('still lists to-dos below ten Batches', () => {
    expect(
      keys(input({ batches: [batch({ expiryDate: '2026-10-01' })] })),
    ).toEqual(['expired']);
  });
});

describe('partitionForgotten', () => {
  const old = (days: number) =>
    new Date(Date.UTC(2026, 9, 15, 12) - days * 86_400_000).toISOString();

  it('splits Batches into Forgotten and the rest, keeping each group in order', () => {
    const a = batch({ expiryDate: null, createdAt: old(30) });
    const b = batch({ expiryDate: null, createdAt: old(2) });
    const c = batch({ expiryDate: null, createdAt: old(40) });
    const dated = batch({ createdAt: old(3000) });
    expect(partitionForgotten([a, b, c, dated], TODAY)).toEqual({
      forgotten: [a, c],
      rest: [b, dated],
    });
  });

  it('returns two empty groups for no Batches', () => {
    expect(partitionForgotten([], TODAY)).toEqual({ forgotten: [], rest: [] });
  });
});

describe('health to-do gain', () => {
  const gainOf = (i: HealthInput, key: string) =>
    healthTodos(i).find((todo) => todo.key === key)?.gain;

  it('is the score after tossing every expired Batch, minus the score now', () => {
    // 11 of 12 dated Batches in date: Fresh 92, total 98. Without the expired one: 100.
    const i = input({
      batches: [batch({ expiryDate: '2026-10-01' }), ...batches(11)],
    });
    expect(scored(i).total).toBe(98);
    expect(gainOf(i, 'expired')).toBe(2);
  });

  it('is the score after putting every missing Staple on the list, minus the score now', () => {
    // Ten stocked and one missing Staple: Supply 91, total 96. On the list it counts 0.5: Supply 95, total 98.
    const i = input({ staples: [{ ingredientId: 'eggs' }] });
    expect(scored(i).total).toBe(96);
    expect(gainOf(i, 'missingStaples')).toBe(2);
  });

  it('is the simulated difference for Running low too: on the list it counts 0.8, not 1', () => {
    const i = input({
      batches: [batch({ ingredientId: 'milk' }), ...batches(9)],
      staples: [{ ingredientId: 'milk' }],
      runningLow: new Set(['milk']),
    });
    // Supply 91 (9.1 of 10) -> 98 (9.8 of 10): total 96 -> 99.
    expect(gainOf(i, 'runningLow')).toBe(3);
  });

  it('is never shown for Expiring Soon', () => {
    const i = input({
      batches: [batch({ expiryDate: '2026-10-16' }), ...batches(11)],
    });
    expect(gainOf(i, 'expiringSoon')).toBe(0);
  });

  describe('for undated Batches', () => {
    const undated = (count: number, overrides: Partial<HealthBatch> = {}) =>
      batches(count, { expiryDate: null, ...overrides });

    it("is the score after Date all with each Batch's Default Expiry", () => {
      // 4 of 10 undated: Dated 60, total 96. All dated in date: 100.
      const i = input({
        batches: [...batches(6), ...undated(4, { defaultExpiryDays: 30 })],
      });
      expect(scored(i).total).toBe(96);
      expect(gainOf(i, 'undated')).toBe(4);
    });

    it('counts from when the Batch was added, or from today when that date has passed', () => {
      // Added 2026-01-01 with 30 days is long past: dated from today instead, so in date, not Expired.
      const i = input({
        batches: [
          ...batches(6),
          ...undated(4, {
            defaultExpiryDays: 30,
            location: 'cupboard',
            createdAt: '2026-01-01T12:00:00Z',
          }),
        ],
      });
      expect(gainOf(i, 'undated')).toBe(4);
    });

    it('is lower when the resulting dates are Expiring Soon', () => {
      // Two Batches become Expiring Soon (Fresh 0.6 each): total 98 instead of 100.
      const i = input({
        batches: [
          ...batches(6),
          ...undated(2, { defaultExpiryDays: 30 }),
          ...undated(2, { defaultExpiryDays: 2 }),
        ],
      });
      expect(gainOf(i, 'undated')).toBe(2);
    });

    it('skips Batches without a Default Expiry', () => {
      const i = input({
        batches: [
          ...batches(6),
          ...undated(2, { defaultExpiryDays: 30 }),
          ...undated(2),
        ],
      });
      // Dated goes 60 to 80: total 96 to 98.
      expect(gainOf(i, 'undated')).toBe(2);
    });

    it('is hidden when no Batch has a Default Expiry', () => {
      const i = input({ batches: [...batches(9), ...undated(1)] });
      expect(gainOf(i, 'undated')).toBe(0);
    });
  });

  it('is hidden while the Pantry is not scored', () => {
    const i = input({
      batches: [batch({ expiryDate: '2026-10-01' }), ...batches(8)],
      staples: [{ ingredientId: 'eggs' }],
    });
    expect(gainOf(i, 'expired')).toBe(0);
    expect(gainOf(i, 'missingStaples')).toBe(0);
  });
});

describe('usual expiry date', () => {
  const dated = (overrides: Partial<HealthBatch>) => batch(overrides);

  it('is the day the Batch was added plus its Default Expiry', () => {
    expect(
      usualExpiryDate(
        dated({ createdAt: '2026-10-10T12:00:00Z', defaultExpiryDays: 30 }),
        TODAY,
      ),
    ).toBe('2026-11-09');
  });

  it('is today plus the Default Expiry once that date has passed', () => {
    expect(
      usualExpiryDate(
        dated({ createdAt: '2026-01-01T12:00:00Z', defaultExpiryDays: 30 }),
        TODAY,
      ),
    ).toBe('2026-11-14');
  });

  it('is today for a Batch whose usual date is today', () => {
    expect(
      usualExpiryDate(
        dated({ createdAt: '2026-10-05T12:00:00Z', defaultExpiryDays: 10 }),
        TODAY,
      ),
    ).toBe('2026-10-15');
  });

  it('is null without a Default Expiry', () => {
    expect(usualExpiryDate(dated({}), TODAY)).toBeNull();
  });
});

describe('withExpiryDates', () => {
  const dated = [
    batch({ id: 'a', expiryDate: '2026-11-01' }),
    batch({ id: 'b', expiryDate: null }),
    batch({ id: 'c', expiryDate: '2026-12-01' }),
  ];

  it.each([
    [
      'sets a date',
      new Map([['b', '2026-11-20']]),
      ['2026-11-01', '2026-11-20', '2026-12-01'],
    ],
    [
      'sets a null entry to no date',
      new Map([['a', null]]),
      [null, null, '2026-12-01'],
    ],
    [
      'leaves Batches without an entry as they are',
      new Map(),
      ['2026-11-01', null, '2026-12-01'],
    ],
  ])('%s', (_name, dates, expected) => {
    const after = withExpiryDates(input({ batches: dated }), dates);
    expect(after.batches.map((b) => b.expiryDate)).toEqual(expected);
  });
});
