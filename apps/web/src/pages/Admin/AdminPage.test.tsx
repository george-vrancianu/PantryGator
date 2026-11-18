import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { Route, Routes } from 'react-router-dom';
import { AdminPage } from './AdminPage';
import { AdminSectionPage } from './AdminSectionPage';

const catalog = {
  aisles: [],
  tagGroups: [
    { id: 'g1', name: 'Cuisine', position: 1, translations: [] },
    {
      id: 'g2',
      name: 'Method',
      position: 2,
      translations: [
        { id: 'gt1', locale: 'ro', kind: 'name', value: 'Metodă' },
      ],
    },
  ],
  tags: [
    {
      id: 'tg1',
      name: 'Italian',
      groupId: 'g1',
      recipeCount: 3,
      translations: [],
    },
    {
      id: 'tg2',
      name: 'Baking',
      groupId: 'g2',
      recipeCount: 0,
      translations: [],
    },
  ],
  allergens: [],
  eatingMoments: [
    {
      id: 'em1',
      name: 'Lunch',
      sortOrder: 1,
      archived: false,
      translations: [],
    },
  ],
  parentCategories: [],
  leafCategories: [],
  ingredients: [],
};

describe('AdminSectionPage Recipes section', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists Recipes, Tag Groups and Catalog Tags, and opens their editors', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        'GET /api/admin/catalog': () => Response.json(catalog),
        'GET /api/admin/recipes': () =>
          Response.json([
            {
              id: 'r1',
              parentId: null,
              title: 'Pizza',
              servings: 4,
              difficulty: null,
              archived: false,
            },
          ]),
      }).fetchMock,
    );
    renderWithProviders(
      <Routes>
        <Route path="admin" element={<AdminPage />} />
        <Route path="admin/:section" element={<AdminSectionPage />} />
      </Routes>,
      { route: '/admin?tab=catalog' },
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /^Tags/ }));
    await user.click(
      screen.getByRole('button', { name: 'Edit Tag Group Cuisine' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Edit Tag Group Cuisine' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));

    const italian = within(
      screen.getByRole('list', { name: 'Cuisine' }),
    ).getByRole('button', { name: 'Edit Catalog Tag Italian' });
    await user.click(italian);
    expect(
      screen.getByRole('heading', { name: 'Edit Catalog Tag Italian' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('link', { name: 'Back' }));

    await user.click(
      await screen.findByRole('button', { name: /^Eating Moments/ }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Edit Eating Moment Lunch' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Edit Eating Moment Lunch' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('link', { name: 'Back' }));

    await user.click(
      await screen.findByRole('button', { name: /^Catalog Recipes/ }),
    );
    expect(
      await screen.findByRole('button', { name: 'Edit Recipe Pizza' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New Base Recipe' }));
    expect(
      screen.getByRole('heading', { name: 'New Base Recipe' }),
    ).toHaveFocus();
  });
});
