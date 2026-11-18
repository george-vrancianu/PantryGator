import {
  MAX_LINKABLE_RECIPES,
  capLinkableRecipes,
} from './guidance-suggestion-context';

const row = (n: number, minutesAgo: number) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  title: `Recipe ${n}`,
  updatedAt: new Date(Date.UTC(2026, 0, 1) - minutesAgo * 60_000),
});

describe('capLinkableRecipes', () => {
  it('keeps everything under the cap, most recently updated first', () => {
    const rows = [row(1, 30), row(2, 10), row(3, 20)];
    expect(capLinkableRecipes(rows).map((r) => r.title)).toEqual([
      'Recipe 2',
      'Recipe 3',
      'Recipe 1',
    ]);
  });

  it('cuts a longer list to the cap, keeping the most recent', () => {
    const rows = Array.from({ length: MAX_LINKABLE_RECIPES + 5 }, (_, i) =>
      row(i, i),
    );
    const capped = capLinkableRecipes([...rows].reverse());
    expect(capped).toHaveLength(MAX_LINKABLE_RECIPES);
    expect(capped[0].title).toBe('Recipe 0');
    expect(capped.at(-1)?.title).toBe(`Recipe ${MAX_LINKABLE_RECIPES - 1}`);
  });

  it('breaks ties by id, whatever the input order', () => {
    const a = row(1, 5);
    const b = row(2, 5);
    expect(capLinkableRecipes([b, a])).toEqual([a, b]);
    expect(capLinkableRecipes([a, b])).toEqual([a, b]);
  });
});
