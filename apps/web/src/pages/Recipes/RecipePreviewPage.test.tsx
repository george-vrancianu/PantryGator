import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '@/components/layout/AppLayout/AppLayout';
import { dockStateFor } from '@/lib/dockState';
import type { RecipeDetail } from '@/lib/recipes';
import { renderWithProviders, stubApi } from '@/test/render';
import { RecipePreviewPage } from './RecipeDetailPage';

/*
 * DOM contract: the preview is the detail page with Back only in the header (no gear, no menu),
 * a `navigation` named "Actions for this Recipe" in the Dock's place, and a `note` ending each tab.
 */

const soup: RecipeDetail = {
  id: 'soup',
  parentId: null,
  owner: 'catalog',
  title: 'Soup',
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 20,
  difficulty: 'easy',
  tags: [],
  archived: false,
  lines: [
    {
      id: 'l1',
      ingredientId: 'water',
      ingredientName: 'Water',
      quantity: 1,
      unit: 'ml',
      optional: false,
      note: null,
    },
  ],
  steps: [{ id: 's1', text: 'Boil it', timerSeconds: null }],
  tips: [],
  base: null,
  variants: [
    {
      id: 'spicy',
      title: 'Spicy soup',
      tags: [],
      owner: 'catalog',
      familyCopyId: null,
    },
    {
      id: 'mine',
      title: 'My soup',
      tags: [],
      owner: 'family',
      familyCopyId: null,
    },
  ],
  familyCopyId: null,
  copiedFrom: null,
  diff: null,
  guidance: { nutritionNote: null, pairings: [], eatingMoments: [] },
  allergens: { items: [], uncheckedCount: 0 },
  allergyWarning: null,
  sourceLink: null,
  sourceLanguage: null,
};

const spicy: RecipeDetail = {
  ...soup,
  id: 'spicy',
  parentId: 'soup',
  title: 'Spicy soup',
  base: { id: 'soup', title: 'Soup', archived: false, familyCopyId: null },
  variants: [],
};

function setup(
  detail: RecipeDetail,
  extra: Parameters<typeof stubApi>[0] = {},
) {
  const { fetchMock, calls } = stubApi({
    [`GET /api/recipes/${detail.id}`]: () => Response.json(detail),
    [`GET /api/recipes/${detail.id}/pantry-match`]: () =>
      Response.json({
        servings: 2,
        lines: [],
        makeable: true,
        shortOrMissingCount: 0,
      }),
    ...extra,
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/recipes/explore/:id" element={<RecipePreviewPage />} />
      </Route>
    </Routes>,
    { route: `/recipes/explore/${detail.id}` },
  );
  return calls;
}

describe('RecipePreviewPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows a Catalog Recipe read-only: Back only, the Catalog eyebrow and the note', async () => {
    setup(soup);
    expect(
      await screen.findByRole('heading', { level: 1, name: /Soup/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Explore · Catalog Recipe')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back/ })).toHaveAttribute(
      'href',
      '/recipes/explore',
    );
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Edit/ })).toBeNull();
    expect(screen.getByRole('note')).toHaveTextContent(
      "You're previewing a Catalog Recipe.",
    );
    expect(screen.getByRole('list', { name: 'Ingredients' })).toBeVisible();
  });

  it('hides the Dock and shows the action bar instead', async () => {
    setup(soup);
    const bar = await screen.findByRole('navigation', {
      name: 'Actions for this Recipe',
    });
    expect(
      within(bar).getByRole('link', { name: 'Make a Variant' }),
    ).toHaveAttribute('href', '/recipes/soup/variant/new');
    expect(
      within(bar).getByRole('button', { name: 'Add to Family' }),
    ).toBeEnabled();
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(dockStateFor('/recipes/explore/soup').visible).toBe(false);
    expect(dockStateFor('/recipes/explore').visible).toBe(true);
  });

  it('on a Catalog Variant, links to the Base preview and makes the Variant from the Variant', async () => {
    setup(spicy);
    expect(
      await screen.findByRole('link', { name: /Variant of Soup/ }),
    ).toHaveAttribute('href', '/recipes/explore/soup');
    expect(screen.queryByText('Explore · Catalog Recipe')).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Make a Variant' }),
    ).toHaveAttribute('href', '/recipes/spicy/variant/new');
  });

  it('adds to the family: the bar turns into In your Recipes and the pill follows the title', async () => {
    const user = userEvent.setup();
    let copy: string | null = null;
    setup(soup, {
      'GET /api/recipes/soup': () =>
        Response.json({ ...soup, familyCopyId: copy }),
      'POST /api/recipes/soup/copy': () => {
        copy = 'copy-1';
        return Response.json({ id: 'copy-1', created: true });
      },
    });
    await user.click(
      await screen.findByRole('button', { name: 'Add to Family' }),
    );
    const open = await screen.findByRole('link', {
      name: 'Soup is in your Recipes. Open it',
    });
    expect(open).toHaveAttribute('href', '/recipes/copy-1');
    expect(copy).toBe('copy-1');
    // The tag sits in the header's lineage row, beside the title.
    expect(
      within(
        screen.getByRole('heading', { level: 1 }).parentElement!,
      ).getByText('In your Recipes'),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeVisible();
  });

  it('starts as In your Recipes when the Family already has a copy', async () => {
    setup({ ...soup, familyCopyId: 'copy-9' });
    expect(
      await screen.findByRole('link', {
        name: 'Soup is in your Recipes. Open it',
      }),
    ).toHaveAttribute('href', '/recipes/copy-9');
  });

  it('lists Catalog Variants only on About, each with an add button opening its preview', async () => {
    const user = userEvent.setup();
    setup(soup);
    await user.click(await screen.findByRole('tab', { name: /About/ }));
    const section = (
      await screen.findByRole('heading', { name: 'Variants' })
    ).closest('section')!;
    expect(
      within(section).getByRole('link', { name: 'Spicy soup' }),
    ).toHaveAttribute('href', '/recipes/explore/spicy');
    expect(within(section).queryByText('My soup')).toBeNull();
    expect(
      within(section).getByRole('button', {
        name: 'Add Spicy soup to your Recipes',
      }),
    ).toBeVisible();
    expect(screen.getByRole('note')).toBeVisible();
  });

  it('keeps the Servings stepper, the add-missing button and the per-line add, and ends Steps with the note', async () => {
    const user = userEvent.setup();
    setup(soup, {
      'GET /api/recipes/soup/pantry-match': () =>
        Response.json({
          servings: 2,
          canMake: false,
          shortOrMissingCount: 1,
          expiringCoveredCount: 0,
          coverageRatio: 0,
          lines: [
            {
              lineId: 'l1',
              ingredientId: 'water',
              name: 'Water',
              status: 'missing',
              optional: false,
              pantryBasic: false,
              quantity: 1,
              unit: 'ml',
              shortfall: null,
              usesExpiringSoon: false,
              onShoppingList: false,
            },
          ],
        }),
    });
    expect(
      await screen.findByRole('button', { name: 'More Servings' }),
    ).toBeVisible();
    expect(
      await screen.findByRole('button', {
        name: 'Add 1 missing to Shopping List',
      }),
    ).toBeVisible();
    await user.click(await screen.findByRole('button', { name: /Water/ }));
    expect(
      await screen.findByRole('button', { name: 'Add Water to Shopping List' }),
    ).toBeVisible();
    await user.click(screen.getByRole('tab', { name: /Steps/ }));
    expect(await screen.findByText('Boil it')).toBeVisible();
    expect(screen.getByRole('note')).toBeVisible();
  });

  it('opens a Family Recipe as itself', async () => {
    const { fetchMock } = stubApi({
      'GET /api/recipes/mine': () =>
        Response.json({ ...soup, id: 'mine', owner: 'family' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/recipes/explore/:id" element={<RecipePreviewPage />} />
        <Route path="/recipes/:id" element={<p>Detail page</p>} />
      </Routes>,
      { route: '/recipes/explore/mine' },
    );
    await waitFor(() =>
      expect(screen.getByText('Detail page')).toBeInTheDocument(),
    );
  });
});
