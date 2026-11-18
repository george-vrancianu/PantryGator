import type { LinkReading } from './link-reading.schemas';
import { draftOfReading } from './link-reading-mapping';

const reading = (ids: (string | null)[]): LinkReading => ({
  recipeFound: true,
  sourceLanguage: null,
  title: 'Soup',
  servings: 2,
  prepMinutes: null,
  cookMinutes: null,
  tagIds: [],
  steps: [],
  ingredients: ids.map((ingredientId, i) => ({
    nameAsWritten: `line ${i}`,
    ingredientId,
    matchConfidence: 1,
    quantity: 1,
    unit: 'g',
    originalAmount: null,
    preparation: null,
    optional: false,
  })),
});

describe('draftOfReading line owners', () => {
  const context = {
    ingredientNames: new Map([
      ['cat', 'Salt'],
      ['fam', 'Gran spice'],
    ]),
    ingredientOwners: new Map<string, 'catalog' | 'family'>([
      ['cat', 'catalog'],
      ['fam', 'family'],
    ]),
    matchThreshold: 0.5,
  };

  it('names the owner of a matched Ingredient, null on an Unmatched line', () => {
    const draft = draftOfReading(reading(['cat', 'fam', null]), context);
    expect(draft.lines.map((l) => l.ingredientOwner)).toEqual([
      'catalog',
      'family',
      null,
    ]);
  });
});
