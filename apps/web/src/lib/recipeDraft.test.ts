import { describe, expect, it } from 'vitest';
import { suggestionRecipeOf, type RecipeDraft } from './recipeDraft';

const draft = (over: Partial<RecipeDraft> = {}): RecipeDraft => ({
  title: '  Gran stew ',
  servings: '4',
  prepMinutes: '',
  cookMinutes: '',
  difficulty: '',
  tagIds: ['t1'],
  lines: [
    {
      key: 1,
      ingredientId: 'flour',
      name: 'Flour',
      quantity: '250',
      unit: 'g',
      optional: false,
      note: '',
    },
    {
      key: 2,
      ingredientId: '',
      name: ' grandma spice ',
      quantity: '',
      unit: 'g',
      optional: true,
      note: '',
    },
    {
      key: 3,
      ingredientId: '',
      name: '  ',
      quantity: '5',
      unit: 'g',
      optional: false,
      note: '',
    },
  ],
  steps: [
    { key: 1, text: ' Whisk ', timer: '' },
    { key: 2, text: '   ', timer: '' },
  ],
  ...over,
});

const build = (d: RecipeDraft, mode: 'admin' | 'family') =>
  mode === 'admin'
    ? suggestionRecipeOf(d, 'admin')
    : suggestionRecipeOf(d, 'family');

describe.each(['admin', 'family'] as const)(
  'suggestionRecipeOf (%s)',
  (mode) => {
    it('keeps Ingredient lines and named lines, drops lines with neither, and trims text', () => {
      const recipe = build(draft(), mode);
      expect(recipe).toMatchObject({
        title: 'Gran stew',
        servings: 4,
        tagIds: ['t1'],
        lines: [
          {
            ingredientId: 'flour',
            rawName: null,
            quantity: 250,
            unit: 'g',
            optional: false,
          },
          {
            ingredientId: null,
            rawName: 'grandma spice',
            quantity: null,
            unit: null,
            optional: true,
          },
        ],
        steps: [{ text: 'Whisk', timerSeconds: null }],
      });
    });

    it('leaves out a missing Title or invalid Servings', () => {
      const recipe = build(draft({ title: ' ', servings: '2.5' }), mode);
      expect(recipe).not.toHaveProperty('title');
      expect(recipe).not.toHaveProperty('servings');
    });
  },
);

describe('suggestionRecipeOf modes', () => {
  it('sends a null difficulty for the Admin only', () => {
    expect(suggestionRecipeOf(draft(), 'admin')).toHaveProperty(
      'difficulty',
      null,
    );
    expect(suggestionRecipeOf(draft(), 'family')).not.toHaveProperty(
      'difficulty',
    );
  });
});
