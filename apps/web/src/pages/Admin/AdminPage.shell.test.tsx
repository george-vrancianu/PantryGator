import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { AdminPage } from './AdminPage';
import { AdminSectionPage } from './AdminSectionPage';

const catalog = {
  aisles: [
    { id: 'a1', name: 'Produce', sortOrder: 1, translations: [] },
    { id: 'a2', name: 'Dairy', sortOrder: 2, translations: [] },
  ],
  tagGroups: [{ id: 'g1', name: 'Cuisine', position: 1, translations: [] }],
  tags: [
    {
      id: 't1',
      name: 'Italian',
      groupId: 'g1',
      recipeCount: 1,
      translations: [],
    },
    { id: 't2', name: 'Thai', groupId: 'g1', recipeCount: 0, translations: [] },
    {
      id: 't3',
      name: 'Greek',
      groupId: 'g1',
      recipeCount: 0,
      translations: [],
    },
  ],
  allergens: [
    {
      id: 'al1',
      name: 'Milk',
      sortOrder: 1,
      archived: false,
      translations: [],
    },
  ],
  eatingMoments: [],
  parentCategories: [
    {
      id: 'p1',
      name: 'Dairy',
      aisleId: 'a2',
      defaultExpiryDays: null,
      defaultLocation: null,
      translations: [],
    },
  ],
  leafCategories: [
    {
      id: 'l1',
      name: 'Milk',
      parentId: 'p1',
      isOther: false,
      defaultExpiryDays: null,
      defaultLocation: null,
      translations: [],
    },
    {
      id: 'l2',
      name: 'Cheese',
      parentId: 'p1',
      isOther: false,
      defaultExpiryDays: null,
      defaultLocation: null,
      translations: [],
    },
  ],
  ingredients: [
    {
      id: 'i1',
      name: 'Whole milk',
      leafCategoryId: 'l1',
      defaultUnit: 'l',
      pantryBasic: false,
      allergenIds: ['al1'],
      allergensReviewPending: false,
      translations: [],
    },
    {
      id: 'i2',
      name: 'Feta',
      leafCategoryId: 'l2',
      defaultUnit: 'g',
      pantryBasic: false,
      allergenIds: [],
      allergensReviewPending: true,
      translations: [],
    },
  ],
};

function Where() {
  const { pathname, search } = useLocation();
  return <output aria-label="location">{pathname + search}</output>;
}

const open = (route: string, extra: Parameters<typeof stubApi>[0] = {}) => {
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
          {
            id: 'r2',
            parentId: 'r1',
            title: 'Pizza v2',
            servings: 4,
            difficulty: null,
            archived: true,
          },
        ]),
      'GET /api/admin/unmatched': () =>
        Response.json({ items: [], nextCursor: null }),
      'GET /api/admin/promo-codes': () =>
        Response.json({ entries: [], nextCursor: null }),
      ...extra,
    }).fetchMock,
  );
  renderWithProviders(
    <>
      <Where />
      <Routes>
        <Route path="admin" element={<AdminPage />} />
        <Route path="admin/:section" element={<AdminSectionPage />} />
      </Routes>
    </>,
    { route },
  );
  return userEvent.setup();
};

const location = () => screen.getByLabelText('location').textContent;

describe('AdminPage shell', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens on To review and shows the review queue', async () => {
    open('/admin');
    expect(
      await screen.findByRole('heading', { name: 'Waiting for review' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'To review' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows the queue total on the To review tab, named with the count, and hides it at 0', async () => {
    open('/admin', {
      'GET /api/admin/unmatched': () =>
        Response.json({ entries: [], nextCursor: null, total: 6 }),
      'GET /api/admin/family-ingredients': () =>
        Response.json({ groups: [], nextCursor: null, total: 3 }),
      'GET /api/admin/family-synonyms': () =>
        Response.json({ candidates: [], nextCursor: null, total: 2 }),
    });
    const tab = await screen.findByRole('button', {
      name: 'To review, 11 waiting',
    });
    expect(tab).toHaveTextContent('To review11');
    expect(screen.getByRole('button', { name: 'Catalog' })).toBeVisible();
  });

  it('shows no badge while nothing waits', async () => {
    open('/admin');
    const tab = await screen.findByRole('button', { name: 'To review' });
    expect(tab).toHaveTextContent(/^To review$/);
  });

  it('opens the tab named in the URL and writes the tab on switching', async () => {
    const user = open('/admin?tab=codes');
    expect(
      await screen.findByRole('button', { name: 'Generate' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Catalog' }));
    expect(location()).toBe('/admin?tab=catalog');
    expect(
      await screen.findByRole('button', { name: /^Ingredients/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'To review' }));
    expect(location()).toBe('/admin?tab=review');
  });

  it('falls back to To review for an unknown tab', async () => {
    open('/admin?tab=nope');
    expect(
      await screen.findByRole('heading', { name: 'Waiting for review' }),
    ).toBeInTheDocument();
  });
});

describe('Catalog index', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows each section with its live count', async () => {
    open('/admin?tab=catalog');
    const row = async (name: RegExp) =>
      await screen.findByRole('button', { name });
    expect(await row(/^Ingredients.*2 · 1 unchecked/)).toBeInTheDocument();
    expect(await row(/^Allergens.*1/)).toBeInTheDocument();
    expect(await row(/^Aisles.*2 in shop order/)).toBeInTheDocument();
    expect(await row(/^Categories.*1 parent · 2 leaves/)).toBeInTheDocument();
    expect(await row(/^Catalog Recipes.*2 · 1 archived/)).toBeInTheDocument();
    expect(await row(/^Tags.*3 in 1 Tag Groups/)).toBeInTheDocument();
    expect(await row(/^Eating Moments.*0/)).toBeInTheDocument();
  });

  it('opens a section page and Back returns to the Catalog tab', async () => {
    const user = open('/admin?tab=catalog');
    await user.click(await screen.findByRole('button', { name: /^Aisles/ }));
    expect(location()).toBe('/admin/aisles');
    expect(await screen.findByText('Produce')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back' }));
    expect(location()).toBe('/admin?tab=catalog');
  });

  it('shows the Ingredient filter and retired Allergens on their pages', async () => {
    const user = open('/admin?tab=catalog');
    await user.click(
      await screen.findByRole('button', { name: /^Ingredients/ }),
    );
    expect(await screen.findByText('Whole milk')).toBeInTheDocument();
    const list = screen.getByText('Feta');
    expect(
      within(list.closest('section') ?? document.body).getByRole('textbox'),
    ).toBeInTheDocument();
  });

  it('renders an unknown section as the Catalog tab', async () => {
    open('/admin/nope');
    expect(
      await screen.findByRole('button', { name: /^Aisles/ }),
    ).toBeInTheDocument();
  });
});
