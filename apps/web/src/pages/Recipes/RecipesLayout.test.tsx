import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderInAppLayout, stubApi } from '../../test/render';
import { RecipeDraftsPage } from './RecipeDraftsPage';
import { RecipesPage } from './RecipesPage';

/** The Recipes area draws its header through `Screen`: the top bar region, not the scrolling sheet. */
describe('Recipes pages in the layout', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('puts the Recipes title and Add button in the top bar, not in the sheet', async () => {
    const { fetchMock } = stubApi({
      'GET /api/recipes': () => Response.json([]),
      'GET /api/recipes/filters': () => Response.json({}),
      'GET /api/recipes/tags': () => Response.json([]),
      'GET /api/cook-tonight': () => Response.json({ cards: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderInAppLayout(<RecipesPage />, '/recipes');
    const topBar = document.querySelector<HTMLElement>(
      '[data-region="top-bar"]',
    )!;
    expect(
      await within(topBar).findByRole('heading', { name: 'Recipes' }),
    ).toBeInTheDocument();
    expect(
      within(topBar).getByRole('button', { name: 'Add a Recipe' }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('sheet-content')).queryByRole('heading', {
        level: 1,
      }),
    ).toBeNull();
  });

  it('puts Cook tonight in the header, not in the sheet', async () => {
    const recipe = {
      id: 'o',
      title: 'Omelette',
      parentId: null,
      copiedFromId: null,
      base: null,
      tags: [],
      variantCount: 0,
      owner: 'family',
      difficulty: null,
      totalMinutes: 10,
    };
    const { fetchMock } = stubApi({
      'GET /api/recipes': () =>
        Response.json({ recipes: [recipe], hiddenByAllergiesCount: 0 }),
      'GET /api/recipes/filters': () => Response.json({ tags: [] }),
      'GET /api/recipes/cook-tonight': () =>
        Response.json({
          cards: [
            {
              canMake: true,
              expiringCount: 0,
              base: { id: 'o', title: 'Omelette' },
              recipe: { id: 'o', title: 'Omelette' },
            },
          ],
          hiddenByAllergiesCount: 0,
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderInAppLayout(<RecipesPage />, '/recipes');
    const header = document.querySelector<HTMLElement>(
      '[data-region="header"]',
    )!;
    const link = await within(header).findByRole('link', {
      name: /^Cook tonight/,
    });
    expect(link).toHaveAttribute('href', '/recipes/cook-tonight');
    expect(link).toHaveTextContent('1 Recipe you can make');
    expect(
      within(link).getByRole('img', { name: 'Gator, cooking' }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('sheet-content')).queryByRole('link', {
        name: /^Cook tonight/,
      }),
    ).toBeNull();
  });

  it('puts a sub-screen Back link in the top bar', async () => {
    const { fetchMock } = stubApi({
      'GET /api/recipe-drafts': () => Response.json([]),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderInAppLayout(<RecipeDraftsPage />, '/recipes/drafts');
    const topBar = document.querySelector<HTMLElement>(
      '[data-region="top-bar"]',
    )!;
    expect(
      await within(topBar).findByRole('link', { name: 'Back' }),
    ).toHaveAttribute('href', '/recipes');
  });
});
