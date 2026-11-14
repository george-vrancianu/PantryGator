// PROTOTYPE smoke test (throwaway): each variant mounts with a Pantry and Recipes, and a round shows Ideas.
import { screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '../../../test/render';
import { RecipeIdeasPrototypePage } from './RecipeIdeasPrototypePage';

const batch = (id: string, name: string, expiryDate: string | null) => ({
  id,
  name,
  ingredientId: id,
  unmatched: false,
  aisle: { id: 'a1', name: 'Produce', sortOrder: 1 },
  amountScale: null,
  defaultUnit: null,
  quantity: null,
  unit: null,
  location: 'fridge',
  expiryDate,
  defaultExpiryDays: null,
  productDescription: null,
  createdAt: '2026-01-01',
});
const today = new Date();
const iso = (d: number) => {
  const x = new Date(today);
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
};

describe.each(['A', 'B', 'C'])('variant %s', (variant) => {
  it('mounts and runs a round', async () => {
    const { fetchMock } = stubApi({
      'GET /api/pantry': () =>
        Response.json({
          batches: [
            batch('i1', 'Spinach', iso(1)),
            batch('i2', 'Eggs', iso(20)),
            batch('i3', 'Old milk', iso(-2)),
          ],
          runningLow: [],
        }),
      'GET /api/recipes': () =>
        Response.json({
          recipes: [
            {
              id: 'r1',
              title: 'Omelette',
              parentId: null,
              base: null,
              tags: [],
              variantCount: 0,
              servings: 2,
              prepMinutes: null,
              cookMinutes: null,
              difficulty: null,
              owner: 'catalog',
              familyCopyId: null,
              copiedFromId: null,
              allergyWarning: null,
            },
          ],
          hiddenByAllergiesCount: 0,
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    Element.prototype.scrollIntoView = () => {};
    renderWithProviders(<RecipeIdeasPrototypePage />, {
      route: `/recipes/ideas-prototype?variant=${variant}&from=recipe`,
    });
    if (variant !== 'B')
      expect((await screen.findAllByText(/Spinach/)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Old milk')).toBeNull();
    expect((await screen.findAllByText(/Omelette/)).length).toBeGreaterThan(0);
    fireEvent.click(
      screen.getAllByRole('button', { name: /^(Get Ideas|Ask)/ })[0],
    );
    expect(
      (
        await screen.findAllByRole(
          'button',
          { name: /Write it/ },
          { timeout: 3000 },
        )
      ).length,
    ).toBeGreaterThanOrEqual(6);
  });
});
