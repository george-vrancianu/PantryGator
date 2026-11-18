import { seedId } from '../../catalog/seed/seed-ids';
import {
  fillPlan,
  slotsEmptiedByAllergies,
  type FillInput,
  type FillRecipe,
  type FillSlot,
} from './plan-fill';
import type { ForecastBatch, ForecastLine } from './plan-forecast';

const EGGS = 'ingredient-eggs';
const FLOUR = 'ingredient-flour';
const MILK = 'ingredient-milk';

const MORNING = seedId.eatingMoment('morning');
const BRUNCH = seedId.eatingMoment('brunch');
const LIGHT_LUNCH = seedId.eatingMoment('light-lunch');
const ALL_MOMENTS = [MORNING, BRUNCH, LIGHT_LUNCH];

const TODAY = '2030-01-10';
const day = (offset: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);

const line = (over: Partial<ForecastLine> = {}): ForecastLine => ({
  ingredientId: EGGS,
  name: null,
  quantity: 4,
  unit: 'pcs',
  optional: false,
  pantryBasic: false,
  ...over,
});
const recipe = (id: string, over: Partial<FillRecipe> = {}): FillRecipe => ({
  id,
  groupId: id,
  servings: 4,
  archived: false,
  lines: [line()],
  moments: [],
  blocksFill: false,
  ...over,
});
const eggs = (quantity: number, over: Partial<ForecastBatch> = {}) => ({
  id: `batch-${quantity}`,
  ingredientId: EGGS,
  name: null,
  quantity,
  unit: 'pcs' as const,
  expiryDate: null,
  ...over,
});
const empty = (offset: number, mealtime: FillSlot['mealtime']): FillSlot => ({
  id: `${offset}-${mealtime}`,
  date: day(offset),
  mealtime,
  recipeId: null,
  servings: 4,
});
const filled = (
  offset: number,
  mealtime: FillSlot['mealtime'],
  recipeId: string,
): FillSlot => ({ ...empty(offset, mealtime), recipeId });

const first: FillInput['tieBreaker'] = (tied) => tied[0];
const last: FillInput['tieBreaker'] = (tied) => tied[tied.length - 1];

function fill(over: Partial<FillInput>) {
  return fillPlan({
    today: TODAY,
    slots: [],
    recipes: [],
    eatingMomentIds: ALL_MOMENTS,
    batches: [eggs(100)],
    shoppingList: [],
    staleThresholdDays: 3,
    onlyWhatIHave: false,
    tieBreaker: first,
    ...over,
  });
}
const placed = (choices: ReturnType<typeof fill>) =>
  choices.map((c) => `${c.slotId}=${c.recipeId}`);

describe('fillPlan: empty slots only', () => {
  it('never overwrites a filled slot and returns choices for empty slots only', () => {
    const choices = fill({
      slots: [filled(0, 'dinner', 'a'), empty(1, 'dinner')],
      recipes: [recipe('a'), recipe('b')],
    });
    expect(placed(choices)).toEqual(['1-dinner=b']);
  });

  it('leaves empty slots on days before today alone', () => {
    const choices = fill({
      slots: [empty(-1, 'dinner'), empty(0, 'dinner')],
      recipes: [recipe('a')],
    });
    expect(placed(choices)).toEqual(['0-dinner=a']);
  });

  it('never places an archived Recipe', () => {
    const choices = fill({
      slots: [empty(0, 'dinner')],
      recipes: [recipe('a', { archived: true })],
    });
    expect(choices).toEqual([]);
  });
});

describe('fillPlan: Allergies', () => {
  it('never places a Recipe that blocks Fill, even as the best ranked', () => {
    const choices = fill({
      slots: [empty(0, 'dinner')],
      recipes: [
        recipe('a', { blocksFill: true }),
        recipe('b', { lines: [line({ quantity: 99 })] }),
      ],
    });
    expect(placed(choices)).toEqual(['0-dinner=b']);
  });

  it('leaves the slot empty when every Recipe blocks Fill', () => {
    const choices = fill({
      slots: [empty(0, 'dinner')],
      recipes: [recipe('a', { blocksFill: true })],
    });
    expect(choices).toEqual([]);
  });

  it('keeps a slot the Member filled with a blocking Recipe', () => {
    const choices = fill({
      slots: [filled(0, 'dinner', 'a'), empty(1, 'dinner')],
      recipes: [recipe('a', { blocksFill: true }), recipe('b')],
    });
    expect(placed(choices)).toEqual(['1-dinner=b']);
  });
});

describe('fillPlan: ranking (ADR 0007)', () => {
  it('places the best-ranked Recipe when the switch is off, even though it is short', () => {
    const choices = fill({
      slots: [empty(0, 'dinner')],
      batches: [],
      recipes: [
        recipe('two-missing', {
          lines: [line(), line({ ingredientId: FLOUR })],
        }),
        recipe('one-missing'),
      ],
    });
    expect(placed(choices)).toEqual(['0-dinner=one-missing']);
  });

  it('prefers the Recipe with the fewest short or missing lines', () => {
    const choices = fill({
      slots: [empty(0, 'dinner')],
      batches: [eggs(4)],
      tieBreaker: last,
      recipes: [
        recipe('needs-flour', { lines: [line({ ingredientId: FLOUR })] }),
        recipe('makeable'),
      ],
    });
    expect(placed(choices)).toEqual(['0-dinner=makeable']);
  });

  it('prefers a Recipe using an Expiring Soon Batch', () => {
    const choices = fill({
      slots: [empty(0, 'dinner')],
      batches: [
        eggs(4, { expiryDate: day(1) }),
        {
          id: 'milk',
          ingredientId: MILK,
          name: null,
          quantity: 4,
          unit: 'pcs',
          expiryDate: day(30),
        },
      ],
      tieBreaker: first,
      recipes: [
        recipe('milk', { lines: [line({ ingredientId: MILK })] }),
        recipe('eggs'),
      ],
    });
    expect(placed(choices)).toEqual(['0-dinner=eggs']);
  });

  it('ranks against the stock left by the slots before it', () => {
    const choices = fill({
      slots: [filled(0, 'dinner', 'eggs'), empty(1, 'dinner')],
      batches: [eggs(6), { ...eggs(4), id: 'flour', ingredientId: FLOUR }],
      tieBreaker: first,
      recipes: [
        recipe('eggs'),
        recipe('also-eggs', { lines: [line()] }),
        recipe('flour', { lines: [line({ ingredientId: FLOUR })] }),
      ],
    });
    // 6 eggs minus the 4 used on day 0 leaves 2: the egg Recipes are short.
    expect(placed(choices)).toEqual(['1-dinner=flour']);
  });

  it('each choice uses up stock for the slots after it', () => {
    const choices = fill({
      slots: [empty(0, 'dinner'), empty(3, 'dinner')],
      batches: [eggs(4), { ...eggs(4), id: 'flour', ingredientId: FLOUR }],
      tieBreaker: first,
      recipes: [
        recipe('eggs'),
        recipe('flour', { lines: [line({ ingredientId: FLOUR })] }),
      ],
    });
    // The first slot takes the eggs; the second then ranks flour above eggs.
    expect(placed(choices)).toEqual(['0-dinner=eggs', '3-dinner=flour']);
  });

  it('fills slots in forecast order whatever order they come in', () => {
    const choices = fill({
      slots: [empty(1, 'breakfast'), empty(0, 'dinner'), empty(0, 'breakfast')],
      recipes: [recipe('a'), recipe('b'), recipe('c')],
    });
    expect(choices.map((c) => c.slotId)).toEqual([
      '0-breakfast',
      '0-dinner',
      '1-breakfast',
    ]);
  });

  it('puts forward the best member of a Base Recipe group', () => {
    const choices = fill({
      slots: [empty(0, 'dinner')],
      batches: [eggs(4)],
      recipes: [
        recipe('base', {
          groupId: 'g',
          lines: [line({ ingredientId: FLOUR })],
        }),
        recipe('variant', { groupId: 'g' }),
      ],
    });
    expect(placed(choices)).toEqual(['0-dinner=variant']);
  });
});

describe('fillPlan: the tie-breaker', () => {
  const tied = [recipe('a'), recipe('b'), recipe('c')];

  it('decides between equally ranked Recipes', () => {
    const slots = [empty(0, 'dinner')];
    expect(placed(fill({ slots, recipes: tied, tieBreaker: first }))).toEqual([
      '0-dinner=a',
    ]);
    expect(placed(fill({ slots, recipes: tied, tieBreaker: last }))).toEqual([
      '0-dinner=c',
    ]);
  });

  it('is only asked about the best-ranked ties', () => {
    const asked: number[] = [];
    fill({
      slots: [empty(0, 'dinner')],
      batches: [eggs(4)],
      recipes: [
        recipe('a'),
        recipe('b'),
        recipe('c', { lines: [line({ ingredientId: FLOUR })] }),
      ],
      tieBreaker: (options) => {
        asked.push(options.length);
        return options[0];
      },
    });
    expect(asked).toEqual([2]);
  });
});

describe('fillPlan: Mealtimes and Eating Moments', () => {
  const good = (momentId: string) => ({
    momentId,
    polarity: 'good_for' as const,
  });
  const avoid = (momentId: string) => ({
    momentId,
    polarity: 'avoid' as const,
  });
  const short = { lines: [line({ ingredientId: FLOUR })] };

  it('has Breakfast prefer Good for Morning, ahead of a better-ranked Recipe', () => {
    const choices = fill({
      slots: [empty(0, 'breakfast')],
      recipes: [
        recipe('plain'),
        recipe('morning', { ...short, moments: [good(MORNING)] }),
      ],
    });
    expect(placed(choices)).toEqual(['0-breakfast=morning']);
  });

  it('has Breakfast prefer Good for Brunch too', () => {
    const choices = fill({
      slots: [empty(0, 'breakfast')],
      recipes: [
        recipe('plain'),
        recipe('brunch', { ...short, moments: [good(BRUNCH)] }),
      ],
    });
    expect(placed(choices)).toEqual(['0-breakfast=brunch']);
  });

  it('has Lunch prefer Good for Light lunch', () => {
    const choices = fill({
      slots: [empty(0, 'lunch')],
      recipes: [
        recipe('plain'),
        recipe('light', { ...short, moments: [good(LIGHT_LUNCH)] }),
        recipe('morning', { moments: [good(MORNING)] }),
      ],
    });
    expect(placed(choices)).toEqual(['0-lunch=light']);
  });

  it('gives Dinner no preference', () => {
    const choices = fill({
      slots: [empty(0, 'dinner')],
      recipes: [
        recipe('light', { ...short, moments: [good(LIGHT_LUNCH)] }),
        recipe('plain'),
      ],
    });
    expect(placed(choices)).toEqual(['0-dinner=plain']);
  });

  it('still ranks by ADR 0007 among the preferred Recipes', () => {
    const choices = fill({
      slots: [empty(0, 'breakfast')],
      recipes: [
        recipe('worse', { ...short, moments: [good(MORNING)] }),
        recipe('better', { moments: [good(BRUNCH)] }),
      ],
    });
    expect(placed(choices)).toEqual(['0-breakfast=better']);
  });

  it('falls back to the rest when nothing is preferred', () => {
    const choices = fill({
      slots: [empty(0, 'breakfast')],
      recipes: [recipe('plain')],
    });
    expect(placed(choices)).toEqual(['0-breakfast=plain']);
  });

  it('never places a Recipe marked Avoid for the Mealtime, even as the only one', () => {
    const choices = fill({
      slots: [empty(0, 'breakfast'), empty(0, 'lunch'), empty(0, 'dinner')],
      recipes: [
        recipe('picky', { moments: [avoid(BRUNCH), avoid(LIGHT_LUNCH)] }),
      ],
    });
    expect(placed(choices)).toEqual(['0-dinner=picky']);
  });

  it("never places a Recipe marked Avoid for either of Breakfast's moments", () => {
    const choices = fill({
      slots: [empty(0, 'breakfast')],
      recipes: [recipe('mixed', { moments: [good(MORNING), avoid(BRUNCH)] })],
    });
    expect(choices).toEqual([]);
  });

  it('gives a Mealtime no preference when its mapped moments are not found', () => {
    const choices = fill({
      eatingMomentIds: [],
      slots: [empty(0, 'breakfast')],
      recipes: [
        recipe('worse', { ...short, moments: [good(MORNING)] }),
        recipe('better'),
      ],
    });
    expect(placed(choices)).toEqual(['0-breakfast=better']);
  });

  it('prefers by the moment that is found when only one of Morning and Brunch is', () => {
    const choices = fill({
      eatingMomentIds: [BRUNCH],
      slots: [empty(0, 'breakfast')],
      recipes: [
        recipe('morning', { ...short, moments: [good(MORNING)] }),
        recipe('brunch', { ...short, moments: [good(BRUNCH)] }),
        recipe('plain'),
      ],
    });
    expect(placed(choices)).toEqual(['0-breakfast=brunch']);
  });
});

describe('fillPlan: variety', () => {
  const only = (id: string, groupId = id) => recipe(id, { groupId });

  it('does not repeat a Base Recipe group on the same day', () => {
    const choices = fill({
      slots: [empty(0, 'lunch'), empty(0, 'dinner')],
      recipes: [only('a'), only('b')],
    });
    expect(placed(choices)).toEqual(['0-lunch=a', '0-dinner=b']);
  });

  it('counts a Variant as its Base Recipe group', () => {
    const choices = fill({
      slots: [empty(0, 'lunch'), empty(0, 'dinner')],
      recipes: [only('base', 'g'), only('variant', 'g')],
    });
    expect(placed(choices)).toEqual(['0-lunch=base']);
  });

  it('allows a repeat 3 days later but not within 2 days', () => {
    const slots = [
      empty(0, 'dinner'),
      empty(1, 'dinner'),
      empty(2, 'dinner'),
      empty(3, 'dinner'),
    ];
    const choices = fill({ slots, recipes: [only('a')] });
    expect(placed(choices)).toEqual(['0-dinner=a', '3-dinner=a']);
  });

  it('counts the slots the Member filled, before and after', () => {
    const choices = fill({
      slots: [
        filled(0, 'dinner', 'a'),
        empty(2, 'dinner'),
        empty(5, 'dinner'),
        filled(7, 'dinner', 'a'),
      ],
      recipes: [only('a'), only('b')],
    });
    expect(placed(choices)).toEqual(['2-dinner=b', '5-dinner=b']);
  });

  it('counts a Member pick on a day before today', () => {
    const choices = fill({
      slots: [filled(-1, 'dinner', 'a'), empty(0, 'dinner')],
      recipes: [only('a'), only('b')],
    });
    expect(placed(choices)).toEqual(['0-dinner=b']);
  });

  it('leaves the slot empty when nothing passes', () => {
    const choices = fill({
      slots: [filled(0, 'dinner', 'a'), empty(1, 'dinner')],
      recipes: [only('a')],
    });
    expect(choices).toEqual([]);
  });
});

describe('fillPlan: only what I have', () => {
  it('places only Recipes the forecast says can be made', () => {
    const choices = fill({
      onlyWhatIHave: true,
      slots: [empty(0, 'dinner')],
      batches: [eggs(4)],
      recipes: [
        recipe('flour', { lines: [line({ ingredientId: FLOUR })] }),
        recipe('too-many', { lines: [line({ quantity: 6 })] }),
        recipe('eggs'),
      ],
    });
    expect(placed(choices)).toEqual(['0-dinner=eggs']);
  });

  it('leaves the slot empty when nothing can be made', () => {
    const choices = fill({
      onlyWhatIHave: true,
      slots: [empty(0, 'dinner')],
      batches: [],
      recipes: [recipe('eggs')],
    });
    expect(choices).toEqual([]);
  });

  it('ignores Pantry Basic and optional lines', () => {
    const choices = fill({
      onlyWhatIHave: true,
      slots: [empty(0, 'dinner')],
      batches: [],
      recipes: [
        recipe('easy', {
          lines: [
            line({ ingredientId: 'salt', pantryBasic: true }),
            line({ ingredientId: FLOUR, optional: true }),
          ],
        }),
      ],
    });
    expect(placed(choices)).toEqual(['0-dinner=easy']);
  });

  it('never turns a covered slot into a short one', () => {
    const choices = fill({
      onlyWhatIHave: true,
      slots: [filled(1, 'dinner', 'eggs-4'), empty(0, 'dinner')],
      batches: [eggs(6)],
      tieBreaker: last,
      recipes: [
        recipe('eggs-4'),
        // Fine on its own day, but would leave day 1 with 2 of 4 eggs.
        recipe('eggs-4-too', { groupId: 'other' }),
        recipe('eggs-2', { lines: [line({ quantity: 2 })] }),
      ],
    });
    expect(placed(choices)).toEqual(['0-dinner=eggs-2']);
  });

  it('does not let the Shopping List stand in for stock: a covered pick stays covered', () => {
    const choices = fill({
      onlyWhatIHave: true,
      slots: [filled(1, 'dinner', 'eggs-4'), empty(0, 'dinner')],
      batches: [eggs(6)],
      shoppingList: [{ ingredientId: EGGS, name: null }],
      tieBreaker: last,
      recipes: [
        recipe('eggs-4'),
        recipe('eggs-4-too', { groupId: 'other' }),
        recipe('eggs-2', { lines: [line({ quantity: 2 })] }),
      ],
    });
    expect(placed(choices)).toEqual(['0-dinner=eggs-2']);
  });

  it('keeps the Member picks covered across several choices', () => {
    const choices = fill({
      onlyWhatIHave: true,
      slots: [empty(0, 'dinner'), empty(3, 'dinner'), filled(6, 'dinner', 'm')],
      batches: [eggs(8)],
      recipes: [
        recipe('m'),
        recipe('a', { lines: [line({ quantity: 4 })] }),
        recipe('b', { lines: [line({ quantity: 4 })] }),
      ],
    });
    // 4 eggs are kept for day 6, so only one of the two empty slots can be filled.
    expect(choices).toHaveLength(1);
  });

  it('applies neither check when the switch is off', () => {
    const choices = fill({
      onlyWhatIHave: false,
      slots: [filled(1, 'dinner', 'm'), empty(0, 'dinner')],
      batches: [eggs(6)],
      recipes: [recipe('m'), recipe('a', { groupId: 'other' })],
    });
    expect(placed(choices)).toEqual(['0-dinner=a']);
  });
});

describe('slotsEmptiedByAllergies', () => {
  const base = {
    today: TODAY,
    eatingMomentIds: ALL_MOMENTS,
    shoppingList: [],
    staleThresholdDays: 3,
    onlyWhatIHave: true,
  };

  it('counts the slot a blocked Recipe would have filled', () => {
    expect(
      slotsEmptiedByAllergies({
        ...base,
        slots: [empty(0, 'dinner')],
        batches: [eggs(100)],
        recipes: [recipe('a', { blocksFill: true })],
      }),
    ).toBe(1);
  });

  it('is 0 when a safe Recipe fills the slot', () => {
    expect(
      slotsEmptiedByAllergies({
        ...base,
        slots: [empty(0, 'dinner')],
        batches: [eggs(100)],
        recipes: [recipe('a', { blocksFill: true }), recipe('b')],
      }),
    ).toBe(0);
  });

  it('is 0 when the blocked Recipe is no use anyway and tied safe Recipes could be picked in an order that fills fewer slots', () => {
    // 4 eggs: a and b take 2 each and fill both days, z takes all 4 and fills one. Picking
    // a or z first changes the count, so the answer must not depend on a tie-break.
    const two = (id: string) => recipe(id, { lines: [line({ quantity: 2 })] });
    const input = {
      ...base,
      slots: [empty(0, 'dinner'), empty(1, 'dinner')],
      batches: [eggs(4)],
      recipes: [
        two('a'),
        two('b'),
        recipe('z'),
        // Milk is not in the Pantry, so this Recipe could not be placed under the switch.
        recipe('m', {
          blocksFill: true,
          lines: [line({ ingredientId: MILK })],
        }),
      ],
    };
    expect(fillPlan({ ...input, tieBreaker: first })).toHaveLength(2);
    expect(fillPlan({ ...input, tieBreaker: last })).toHaveLength(1);
    expect(slotsEmptiedByAllergies(input)).toBe(0);
  });
});
