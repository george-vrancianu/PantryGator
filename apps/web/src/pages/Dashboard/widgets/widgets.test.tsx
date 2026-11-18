import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Batch } from '@/lib/pantry';
import type { ShoppingItem, ShoppingList } from '@/lib/shopping';
import { useCookTonight } from '@/lib/cookTonight';
import { localIso } from '@/lib/pantry';
import { renderWithProviders, stubApi } from '@/test/render';
import { stubMotion } from '@/test/viewport';
import { BudgetWidget, NutritionWidget } from './PlaceholderWidgets';
import { PantryStockWidget } from './PantryStockWidget';
import { ShoppingWidget } from './ShoppingWidget';
import { CookTonightWidget } from './CookTonightWidget';
import { UseSoonWidget } from './UseSoonWidget';
import type { CookTonightCard } from '@/lib/cookTonight';

const isoIn = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const batch = (overrides: Partial<Batch> & { id: string }): Batch => ({
  name: 'Item',
  ingredientId: 'ing',
  unmatched: false,
  aisle: null,
  amountScale: null,
  defaultUnit: null,
  defaultExpiryDays: null,
  quantity: null,
  unit: null,
  location: 'fridge',
  expiryDate: null,
  productDescription: null,
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const item = (overrides: Partial<ShoppingItem> & { id: string }) => ({
  ingredientId: null,
  name: 'Item',
  quantity: null,
  unit: null,
  checked: false,
  unmatched: false,
  ...overrides,
});

function shoppingList(items: ShoppingItem[]): ShoppingList {
  const checked = items.filter((i) => i.checked).length;
  return {
    id: 'l1',
    groups: [{ aisle: { id: 'a', name: 'Aisle', sortOrder: 1 }, items }],
    summary: { remaining: items.length - checked, checked },
  };
}

/** The Family Recipe list the wide/tall Cook Tonight Widget asks for: one Recipe, so the Family isn't empty. */
const hasRecipes = {
  'GET /api/recipes': () =>
    Response.json({ recipes: [{ id: 'listed' }], hiddenByAllergiesCount: 0 }),
};

function stub(routes: Record<string, () => Response>) {
  const { fetchMock } = stubApi(routes);
  vi.stubGlobal('fetch', fetchMock);
}

afterEach(() => vi.unstubAllGlobals());

describe('UseSoonWidget', () => {
  it('lists the three soonest-expiring Batches with their ExpiryTags, Expired ones first', async () => {
    stub({
      'GET /api/settings/family': () =>
        Response.json({ staleThresholdDays: 3, expiryOverrides: [] }),
      'GET /api/pantry': () =>
        Response.json({
          batches: [
            batch({ id: '1', name: 'Feta', expiryDate: isoIn(6) }),
            batch({ id: '2', name: 'Yogurt', expiryDate: isoIn(0) }),
            batch({ id: '3', name: 'Orzo' }),
            batch({ id: '4', name: 'Spinach', expiryDate: isoIn(1) }),
            batch({ id: '5', name: 'Bread', expiryDate: isoIn(-4) }),
          ],
        }),
    });

    renderWithProviders(<UseSoonWidget size="wide" columns={2} />);

    const region = await screen.findByRole('region', { name: 'Use soon' });
    const rows = await within(region).findAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'BreadExpired',
      'YogurtToday',
      'SpinachTomorrow',
    ]);
    expect(
      within(region).getByRole('link', { name: 'See all' }),
    ).toHaveAttribute('href', '/pantry');
  });

  it('keeps See all and each row at 44 pt', async () => {
    stub({
      'GET /api/settings/family': () =>
        Response.json({ staleThresholdDays: 3, expiryOverrides: [] }),
      'GET /api/pantry': () =>
        Response.json({
          batches: [batch({ id: '1', name: 'Feta', expiryDate: isoIn(6) })],
        }),
    });

    renderWithProviders(<UseSoonWidget size="wide" columns={2} />);

    const region = await screen.findByRole('region', { name: 'Use soon' });
    const row = await within(region).findByRole('listitem');
    expect(getComputedStyle(row).height).toBe('44px');
    expect(
      getComputedStyle(within(region).getByRole('link', { name: 'See all' }))
        .minHeight,
    ).toBe('44px');
  });

  it('counts days left within the Stale Threshold and plain days after it', async () => {
    stub({
      'GET /api/settings/family': () =>
        Response.json({ staleThresholdDays: 7, expiryOverrides: [] }),
      'GET /api/pantry': () =>
        Response.json({
          batches: [
            batch({ id: '1', name: 'Feta', expiryDate: isoIn(5) }),
            batch({ id: '2', name: 'Ham', expiryDate: isoIn(7) }),
            batch({ id: '3', name: 'Butter', expiryDate: isoIn(12) }),
          ],
        }),
    });

    renderWithProviders(<UseSoonWidget size="wide" columns={2} />);

    const region = await screen.findByRole('region', { name: 'Use soon' });
    await waitFor(() =>
      expect(
        within(region)
          .getAllByRole('listitem')
          .map((row) => row.textContent),
      ).toEqual([
        'Feta5 d left5 days left',
        'Ham7 d left7 days left',
        'Butter12 d12 days',
      ]),
    );
  });

  it('says so when no Batch has an expiry date', async () => {
    stub({
      'GET /api/pantry': () =>
        Response.json({ batches: [batch({ id: '1', name: 'Orzo' })] }),
    });

    renderWithProviders(<UseSoonWidget size="wide" columns={2} />);

    expect(
      await screen.findByText(
        'Nothing with an expiry date in your Pantry yet.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a translated error when the Pantry cannot be loaded', async () => {
    stub({
      'GET /api/pantry': () =>
        Response.json(
          { code: 'internal_server_error', params: {} },
          { status: 500 },
        ),
    });

    renderWithProviders(<UseSoonWidget size="wide" columns={2} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong on our side',
    );
  });
});

describe('ShoppingWidget', () => {
  it('shows the unchecked count, the first names and links to Shopping', async () => {
    stub({
      'GET /api/shopping-list': () =>
        Response.json(
          shoppingList([
            item({ id: '1', name: 'Lemons' }),
            item({ id: '2', name: 'Milk', checked: true }),
            item({ id: '3', name: 'Dill' }),
            item({ id: '4', name: 'Feta' }),
            item({ id: '5', name: 'Bread' }),
          ]),
        ),
    });

    renderWithProviders(<ShoppingWidget size="small" columns={2} />);

    const link = await screen.findByRole('link', { name: 'Shopping' });
    expect(link).toHaveAttribute('href', '/shopping');
    expect(link).toHaveTextContent('4');
    expect(link).toHaveTextContent('items to buy');
    expect(link).toHaveTextContent('Lemons, Dill, Feta…');
    expect(link).not.toHaveTextContent('Milk');
  });

  it('shows an empty list', async () => {
    stub({ 'GET /api/shopping-list': () => Response.json(shoppingList([])) });

    renderWithProviders(<ShoppingWidget size="small" columns={2} />);

    expect(await screen.findByText('Your list is empty')).toBeInTheDocument();
  });

  it('speaks Romanian', async () => {
    stub({
      'GET /api/shopping-list': () =>
        Response.json(shoppingList([item({ id: '1', name: 'Lămâi' })])),
    });

    renderWithProviders(<ShoppingWidget size="small" columns={2} />, {
      locale: 'ro',
    });

    expect(
      await screen.findByRole('link', { name: 'Cumpărături' }),
    ).toHaveTextContent('produs de cumpărat');
  });
});

describe('PantryStockWidget', () => {
  it('shows the total and a stacked bar by Location, and links to the Pantry', async () => {
    stub({
      'GET /api/pantry': () =>
        Response.json({
          batches: [
            batch({ id: '1', location: 'fridge' }),
            batch({ id: '2', location: 'fridge' }),
            batch({ id: '3', location: 'freezer' }),
            batch({ id: '4', location: 'cupboard' }),
          ],
        }),
    });

    renderWithProviders(<PantryStockWidget size="small" columns={2} />);

    const link = await screen.findByRole('link', { name: 'Pantry' });
    expect(link).toHaveAttribute('href', '/pantry');
    expect(link).toHaveTextContent('4');
    expect(link).toHaveTextContent('items in stock');
    expect(
      within(link).getByRole('img', {
        name: 'Fridge 2, Freezer 1, Cupboard 1',
      }),
    ).toBeInTheDocument();
  });

  it('draws one bar segment per Location that holds something', async () => {
    stub({
      'GET /api/pantry': () =>
        Response.json({
          batches: [
            batch({ id: '1', location: 'fridge' }),
            batch({ id: '2', location: 'cupboard' }),
            batch({ id: '3', location: 'cupboard' }),
          ],
        }),
    });

    renderWithProviders(<PantryStockWidget size="small" columns={2} />);

    const bar = await screen.findByRole('img', { name: /Fridge 1/ });
    expect(bar.children).toHaveLength(2);
    expect(getComputedStyle(bar).height).toBe('4px');
  });

  it('shows zero for an empty Pantry', async () => {
    stub({ 'GET /api/pantry': () => Response.json({ batches: [] }) });

    renderWithProviders(<PantryStockWidget size="small" columns={2} />);

    expect(
      await screen.findByRole('link', { name: 'Pantry' }),
    ).toHaveTextContent('0');
  });
});

describe.each([
  ['Budget', BudgetWidget, 'Buget'],
  ['Nutrition', NutritionWidget, 'Nutriție'],
])('%s placeholder', (name, Widget, roName) => {
  it('is marked as coming soon in English', () => {
    renderWithProviders(<Widget size="small" columns={2} />);

    const region = screen.getByRole('region', { name });
    expect(within(region).getByText('Coming soon')).toBeInTheDocument();
  });

  it('is marked as coming soon in Romanian', () => {
    renderWithProviders(<Widget size="small" columns={2} />, { locale: 'ro' });

    const region = screen.getByRole('region', { name: roName });
    expect(within(region).getByText('În curând')).toBeInTheDocument();
  });
});

describe('CookTonightWidget', () => {
  const card = (
    id: string,
    overrides: Partial<CookTonightCard> = {},
  ): CookTonightCard => ({
    base: { id: `b-${id}`, title: `Base ${id}`, archived: false },
    recipe: {
      id,
      title: `Recipe ${id}`,
      parentId: null,
      owner: 'catalog',
      familyCopyId: null,
      servings: 2,
      prepMinutes: null,
      cookMinutes: null,
      tags: [],
      allergyWarning: null,
    },
    canMake: true,
    missing: null,
    expiringCount: 0,
    otherVariantsCount: 0,
    ...overrides,
  });
  const cookTonight = (cards: CookTonightCard[]) => ({
    ...hasRecipes,
    'GET /api/recipes/cook-tonight': () => Response.json({ cards }),
  });

  it('links a Catalog card to the Family copy, else to the Explore preview', async () => {
    const withCopy = card('r1');
    withCopy.recipe.familyCopyId = 'copy-1';
    stub(cookTonight([withCopy, card('r2')]));

    renderWithProviders(<CookTonightWidget size="wide" columns={2} />);

    expect(
      await screen.findByRole('link', { name: /Recipe r1/ }),
    ).toHaveAttribute('href', '/recipes/copy-1');
    expect(screen.getByRole('link', { name: /Recipe r2/ })).toHaveAttribute(
      'href',
      '/recipes/explore/r2',
    );
  });

  it('shows up to two Tag chips and "+N" on a card, with every Tag in the link name', async () => {
    const tagged = card('r1');
    tagged.recipe.tags = ['Dinner', 'Vegan', 'Italian'].map((name, i) => ({
      id: `t${i}`,
      name,
      kind: 'catalog' as const,
      groupId: `g${i}`,
      groupName: 'Group',
      groupOrder: i + 1,
    }));
    stub(cookTonight([tagged]));

    renderWithProviders(<CookTonightWidget size="small" columns={2} />);

    const link = await screen.findByRole('link', { name: /Recipe r1/ });
    expect(link).toHaveAccessibleName(
      expect.stringContaining('Tags: Dinner, Vegan, Italian'),
    );
    expect(within(link).getByText('+1')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows one card linking to the Recipe, with the other Variants count and time', async () => {
    stub(
      cookTonight([
        card('r1', {
          otherVariantsCount: 2,
          recipe: {
            id: 'r1',
            title: 'Spicy Pasta',
            parentId: 'b-r1',
            owner: 'family',
            familyCopyId: null,
            servings: 2,
            prepMinutes: 10,
            cookMinutes: 20,
            tags: [],
            allergyWarning: null,
          },
        }),
      ]),
    );

    renderWithProviders(<CookTonightWidget size="small" columns={2} />);

    const region = await screen.findByRole('region', { name: 'Cook tonight' });
    const link = await within(region).findByRole('link', {
      name: /Spicy Pasta/,
    });
    expect(link).toHaveAttribute('href', '/recipes/r1');
    expect(within(link).getByText('Variant of Base r1')).toBeInTheDocument();
    expect(
      within(link).getByText('30 min · +2 other Variants you can make'),
    ).toBeInTheDocument();
    expect(
      within(region).getByRole('link', { name: 'See all' }),
    ).toHaveAttribute('href', '/recipes');
  });

  it('labels a near miss with the missing Ingredient', async () => {
    stub(
      cookTonight([
        card('r1', {
          canMake: false,
          missing: { ingredientId: 'i1', name: 'Saffron' },
        }),
      ]),
    );

    renderWithProviders(<CookTonightWidget size="wide" columns={2} />);

    expect(await screen.findByText('Missing: Saffron')).toBeInTheDocument();
  });

  it('titles a card by the archived base and shows the Variant as secondary', async () => {
    stub(
      cookTonight([
        card('r1', {
          base: { id: 'b1', title: 'Old Stew', archived: true },
          recipe: {
            id: 'r1',
            title: 'Vegan Stew',
            parentId: 'b1',
            owner: 'family',
            familyCopyId: null,
            servings: 2,
            prepMinutes: null,
            cookMinutes: null,
            tags: [],
            allergyWarning: null,
          },
        }),
      ]),
    );

    renderWithProviders(<CookTonightWidget size="wide" columns={2} />);

    const link = await screen.findByRole('link', { name: /Old Stew/ });
    expect(link).toHaveAttribute('href', '/recipes/r1');
    expect(within(link).getByText('Vegan Stew')).toBeInTheDocument();
    expect(within(link).queryByText(/Variant of/)).not.toBeInTheDocument();
  });

  it.each([
    ['small', 2, 1],
    ['wide', 2, 2],
    ['tall', 2, 2],
    ['tall', 3, 2],
    ['tall', 4, 3],
  ] as const)(
    'shows as many cards as a %s Widget at %i columns allows',
    async (size, columns, shown) => {
      stub(cookTonight([card('1'), card('2'), card('3'), card('4')]));

      renderWithProviders(<CookTonightWidget size={size} columns={columns} />);

      expect(
        await screen.findAllByRole('link', { name: /^Recipe / }),
      ).toHaveLength(shown);
    },
  );

  it('shows the expiring hint only when something expiring is used', async () => {
    stub(cookTonight([card('1', { expiringCount: 2 }), card('2')]));

    renderWithProviders(<CookTonightWidget size="wide" columns={2} />);

    expect(
      await screen.findByText('uses 2 Expiring Soon items'),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Expiring Soon/)).toHaveLength(1);
  });

  it('shows no extra lines for a base Recipe with nothing else to say', async () => {
    stub(cookTonight([card('1')]));

    renderWithProviders(<CookTonightWidget size="wide" columns={2} />);

    const link = await screen.findByRole('link', { name: 'Recipe 1' });
    expect(link).toHaveTextContent(/^Recipe 1$/);
  });

  it('names the link by all of its parts', async () => {
    stub(
      cookTonight([
        card('1', {
          otherVariantsCount: 1,
          missing: { ingredientId: null, name: 'Saffron' },
          recipe: {
            id: '1',
            title: 'Paella',
            parentId: 'b-1',
            owner: 'family',
            familyCopyId: null,
            servings: 2,
            prepMinutes: 5,
            cookMinutes: null,
            tags: [],
            allergyWarning: null,
          },
        }),
      ]),
    );

    renderWithProviders(<CookTonightWidget size="wide" columns={2} />);

    expect(
      await screen.findByRole('link', {
        name: 'Paella, Variant of Base 1, Missing: Saffron, 5 min · +1 other Variant you can make',
      }),
    ).toBeInTheDocument();
  });

  it('shows an error when the cards fail to load', async () => {
    stub({
      'GET /api/recipes/cook-tonight': () =>
        Response.json({ message: 'boom' }, { status: 500 }),
    });

    renderWithProviders(<CookTonightWidget size="wide" columns={2} />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Cook tonight, / })).toBeNull();
  });

  it('speaks Romanian plurals', async () => {
    stub(
      cookTonight([
        card('1', { otherVariantsCount: 1, expiringCount: 1 }),
        card('2', { otherVariantsCount: 3, expiringCount: 3 }),
        card('3', { otherVariantsCount: 20, expiringCount: 20 }),
      ]),
    );

    renderWithProviders(<CookTonightWidget size="tall" columns={4} />, {
      locale: 'ro',
    });

    expect(
      await screen.findByText(/\+1 altă variantă pe care o poți găti/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/\+3 alte variante pe care le poți găti/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/folosește 1 ingredient care expiră curând/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/folosește 3 ingrediente care expiră curând/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/\+20 de alte variante pe care le poți găti/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/folosește 20 de ingrediente care expiră curând/),
    ).toBeInTheDocument();
  });

  it('says how many Recipes are hidden by Allergies and brings them back on Show', async () => {
    const { fetchMock, calls } = stubApi({
      ...hasRecipes,
      'GET /api/recipes/cook-tonight': (url) =>
        url.searchParams.get('showHidden') === 'true'
          ? Response.json({
              cards: [card('r1'), card('r2')],
              hiddenByAllergiesCount: 0,
            })
          : Response.json({ cards: [card('r1')], hiddenByAllergiesCount: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<CookTonightWidget size="wide" columns={2} />);

    expect(
      await screen.findByText('1 Recipe hidden by your Allergies'),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(
      await screen.findAllByRole('link', { name: /Base 2|r2/ }),
    ).not.toHaveLength(0);
    expect(screen.queryByText(/^\d+ Recipes? hidden/)).toBeNull();
    const lastCookTonight = calls
      .filter((call) => call.key === 'GET /api/recipes/cook-tonight')
      .at(-1)!;
    expect(new URLSearchParams(lastCookTonight.search).get('showHidden')).toBe(
      'true',
    );
  });

  it('says so in the small Widget when nothing can be made tonight', async () => {
    stub(cookTonight([]));

    renderWithProviders(<CookTonightWidget size="small" columns={2} />);

    expect(
      await screen.findByText(
        /Nothing you can make from your Recipes right now/,
      ),
    ).toBeInTheDocument();
  });

  it('links the small Widget to Explore when there is nothing to cook', async () => {
    stub(cookTonight([]));

    renderWithProviders(<CookTonightWidget size="small" columns={2} />);

    expect(
      await screen.findByRole('link', { name: 'Explore Recipes' }),
    ).toHaveAttribute('href', '/recipes/explore');
  });

  it('shows only the hidden-by-Allergies note, not the empty line and Explore link, when Allergies hid every card', async () => {
    stub({
      ...hasRecipes,
      'GET /api/recipes/cook-tonight': () =>
        Response.json({ cards: [], hiddenByAllergiesCount: 2 }),
    });

    renderWithProviders(<CookTonightWidget size="small" columns={2} />);

    expect(
      await screen.findByText('2 Recipes hidden by your Allergies'),
    ).toBeVisible();
    expect(screen.queryByText(/Nothing you can make/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Explore Recipes' })).toBeNull();
  });

  it('asks the API for today', async () => {
    const { fetchMock, calls } = stubApi(cookTonight([]));
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<CookTonightWidget size="small" columns={2} />);

    await screen.findByText(/Nothing you can make/);
    const search = new URLSearchParams(calls[0]?.search);
    expect(calls[0]?.key).toBe('GET /api/recipes/cook-tonight');
    expect(search.get('today')).toBe(isoIn(0));
    expect(search.get('scope')).toBe('family');
  });

  it('shows an allergen indicator on a card, named in the link', async () => {
    stub(
      cookTonight([
        card('r1', {
          recipe: {
            ...card('r1').recipe,
            title: 'Pesto Pasta',
            allergyWarning: {
              severity: 'soft',
              allergens: [
                {
                  id: 'a-nut',
                  name: 'Tree nuts',
                  tier: 'yours',
                  severity: 'soft',
                  owners: [{ kind: 'own' }],
                },
              ],
              uncheckedCount: 0,
            },
          },
        }),
        card('r2'),
      ]),
    );

    renderWithProviders(<CookTonightWidget size="small" columns={2} />);

    const region = await screen.findByRole('region', { name: 'Cook tonight' });
    const link = await within(region).findByRole('link', {
      name: /Pesto Pasta/,
    });
    expect(link).toHaveAccessibleName(/Optional: contains Tree nuts/);
    expect(
      within(link).getByRole('img', { name: 'Optional: contains Tree nuts' }),
    ).toHaveAttribute('data-severity', 'soft');
    expect(within(region).getAllByRole('img')).toHaveLength(1);
  });
});

describe("CookTonightWidget as Gator's bubble panel", () => {
  afterEach(() => vi.useRealTimers());

  const FLOP = 'Gator, disappointed, with the cooking tools dropped';
  const card = (id: string, overrides: Partial<CookTonightCard> = {}) =>
    ({
      base: { id: `b-${id}`, title: `Base ${id}`, archived: false },
      recipe: {
        id,
        title: `Recipe ${id}`,
        parentId: null,
        owner: 'family',
        familyCopyId: null,
        servings: 2,
        prepMinutes: null,
        cookMinutes: null,
        tags: [],
        allergyWarning: null,
      },
      canMake: true,
      missing: null,
      expiringCount: 0,
      otherVariantsCount: 0,
      ...overrides,
    }) satisfies CookTonightCard;
  const near = (id: string) =>
    card(id, { canMake: false, missing: { ingredientId: 'i', name: 'Salt' } });
  const stubCards = (cards: CookTonightCard[], hidden = 0) =>
    stub({
      ...hasRecipes,
      'GET /api/recipes/cook-tonight': () =>
        Response.json({ cards, hiddenByAllergiesCount: hidden }),
    });
  function Where() {
    return <p>at {useLocation().pathname}</p>;
  }
  function renderAt(size: 'small' | 'wide' | 'tall', columns: 2 | 4 = 2) {
    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={<CookTonightWidget size={size} columns={columns} />}
        />
        <Route path="*" element={<Where />} />
      </Routes>,
    );
  }

  describe.each(['wide', 'tall'] as const)('%s', (size) => {
    const columns = size === 'tall' ? 4 : 2;

    it('has no header row and no See all, yet the Widget is still named Cook tonight', async () => {
      stubCards([card('1')]);
      renderAt(size, columns);

      const region = await screen.findByRole('region', {
        name: 'Cook tonight',
      });
      expect(
        within(region).queryByRole('link', { name: 'See all' }),
      ).toBeNull();
      // The title is only the panel's own; a header row would make it appear twice.
      const panel = await within(region).findByRole('link', {
        name: /^Cook tonight, /,
      });
      expect(within(region).getAllByText('Cook tonight')).toHaveLength(1);
      expect(within(panel).getByText('Cook tonight')).toBeInTheDocument();
    });

    it('says how many Recipes can be made, how many use what expires soon, and leads to Cook Tonight', async () => {
      stubCards([card('1', { expiringCount: 1 }), card('2')]);
      renderAt(size, columns);

      const panel = await screen.findByRole('link', {
        name: /^Cook tonight, /,
      });
      expect(panel).toHaveAccessibleName(
        'Cook tonight, 2 Recipes you can make, 1 uses what expires soon',
      );
      expect(panel).toHaveAttribute('href', '/recipes/cook-tonight');
      expect(within(panel).getByRole('img')).toHaveAttribute(
        'data-mood',
        'chef',
      );
    });

    it('says how many Recipes are one ingredient short, with the disappointed chef, and leads to Cook Tonight', async () => {
      stubCards([near('1'), near('2')]);
      renderAt(size, columns);

      const panel = await screen.findByRole('link', {
        name: /^Cook tonight, /,
      });
      expect(panel).toHaveAccessibleName(
        'Cook tonight, Nothing to cook yet, 2 Recipes are one ingredient short',
      );
      expect(panel).toHaveAttribute('href', '/recipes/cook-tonight');
      expect(within(panel).getByRole('img', { name: FLOP })).toHaveAttribute(
        'data-mood',
        'chef-flop',
      );
    });

    it('leads to the Pantry and shows no cards when nothing is cookable', async () => {
      stubCards([]);
      renderAt(size, columns);

      const panel = await screen.findByRole('link', {
        name: /^Cook tonight, /,
      });
      expect(panel).toHaveAttribute('href', '/pantry');
      expect(within(panel).getByRole('img', { name: FLOP })).toBeVisible();
      const region = screen.getByRole('region', { name: 'Cook tonight' });
      expect(within(region).getAllByRole('link')).toHaveLength(1);
    });

    it('puts the Hidden by Allergies note between the panel and the cards', async () => {
      stubCards([card('1')], 2);
      renderAt(size, columns);

      const panel = await screen.findByRole('link', {
        name: /^Cook tonight, /,
      });
      const note = screen.getByText('2 Recipes hidden by your Allergies');
      const cardLink = screen.getByRole('link', { name: 'Recipe 1' });
      expect(
        panel.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        note.compareDocumentPosition(cardLink) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("plays Gator's Tap and opens Cook Tonight 500ms later", async () => {
      stubMotion(false);
      vi.useFakeTimers({ shouldAdvanceTime: true });
      stubCards([card('1')]);
      renderAt(size, columns);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      const panel = await screen.findByRole('link', {
        name: /^Cook tonight, /,
      });
      await user.click(panel);
      expect(within(panel).getByRole('img')).toHaveAttribute(
        'data-motion',
        'tap',
      );
      await act(() => vi.advanceTimersByTimeAsync(400));
      expect(screen.queryByText(/^at /)).toBeNull();
      await act(() => vi.advanceTimersByTimeAsync(100));
      expect(screen.getByText('at /recipes/cook-tonight')).toBeInTheDocument();
    });

    it('opens the Pantry after the Tap when nothing is cookable', async () => {
      stubMotion(false);
      vi.useFakeTimers({ shouldAdvanceTime: true });
      stubCards([]);
      renderAt(size, columns);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      await user.click(
        await screen.findByRole('link', { name: /^Cook tonight, / }),
      );
      expect(screen.queryByText(/^at /)).toBeNull();
      await act(() => vi.advanceTimersByTimeAsync(500));
      expect(screen.getByText('at /pantry')).toBeInTheDocument();
    });

    it('opens at once with reduced motion', async () => {
      stubMotion(true);
      stubCards([card('1')]);
      renderAt(size, columns);

      await userEvent.click(
        await screen.findByRole('link', { name: /^Cook tonight, / }),
      );
      expect(screen.getByText('at /recipes/cook-tonight')).toBeInTheDocument();
    });
  });

  it('shows up to 3 cards under the panel when tall', async () => {
    stubCards([card('1'), card('2'), card('3'), card('4')]);
    renderAt('tall', 4);
    expect(
      await screen.findAllByRole('link', { name: /^Recipe / }),
    ).toHaveLength(3);
  });

  it('leaves the small Widget as it was: header row, See all, no panel', async () => {
    stubCards([card('1'), card('2')]);
    renderAt('small');

    const region = await screen.findByRole('region', { name: 'Cook tonight' });
    expect(
      await within(region).findByRole('link', { name: 'See all' }),
    ).toHaveAttribute('href', '/recipes');
    expect(
      within(region).getAllByRole('link', { name: /^Recipe / }),
    ).toHaveLength(1);
    expect(within(region).queryByRole('img')).toBeNull();
  });
});

describe('CookTonightWidget for a Family with no Recipes', () => {
  afterEach(() => vi.useRealTimers());

  const cookTonightRoute = (hidden = 0) => ({
    'GET /api/recipes/cook-tonight': () =>
      Response.json({ cards: [], hiddenByAllergiesCount: hidden }),
  });
  const recipeList = (recipes: unknown[], hidden: number) => ({
    'GET /api/recipes': () =>
      Response.json({ recipes, hiddenByAllergiesCount: hidden }),
  });
  function Where() {
    return <p>at {useLocation().pathname}</p>;
  }
  /** Shares Cook Tonight's query with the Widget, so it shows once that answer is in. */
  function CookTonightProbe() {
    // oxlint-disable-next-line react/purity -- same key as the Widget's own call; the test day never rolls over
    const { data } = useCookTonight(localIso(new Date()), false, 'family');
    return data ? <p>ct ready</p> : null;
  }
  function renderAt(
    size: 'small' | 'wide' | 'tall' = 'wide',
    probe?: ReactNode,
  ) {
    renderWithProviders(
      <>
        {probe}
        <Routes>
          <Route
            path="/"
            element={
              <CookTonightWidget
                size={size}
                columns={size === 'tall' ? 4 : 2}
              />
            }
          />
          <Route path="*" element={<Where />} />
        </Routes>
      </>,
    );
  }
  const POT = /My pot's empty!/;

  it("shows Gator's empty-pot line and the four ways to a first Recipe", async () => {
    stub({ ...cookTonightRoute(), ...recipeList([], 0) });
    renderAt();

    expect(await screen.findByText(POT)).toBeInTheDocument();
    const region = screen.getByRole('region', { name: 'Cook tonight' });
    expect(
      within(region).getByRole('link', { name: 'Explore Recipes' }),
    ).toHaveAttribute('href', '/recipes/explore');
    expect(
      within(region).getByRole('link', { name: 'From a link' }),
    ).toHaveAttribute('href', '/recipes/from-link');
    expect(
      within(region).getByRole('link', { name: 'From text' }),
    ).toHaveAttribute('href', '/recipes/from-text');
    expect(
      within(region).getByRole('link', { name: 'New Recipe' }),
    ).toHaveAttribute('href', '/recipes/new');
    expect(screen.queryByText(/Nothing to cook from your Pantry/)).toBeNull();
  });

  it('prefetches the starters the empty Recipes page will show', async () => {
    const { fetchMock, calls } = stubApi({
      ...cookTonightRoute(),
      ...recipeList([], 0),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAt();

    await screen.findByText(POT);
    await waitFor(() => {
      const scopes = (key: string) =>
        calls
          .filter((c) => c.key === key)
          .map((c) => new URLSearchParams(c.search).get('scope'));
      expect(scopes('GET /api/recipes')).toContain('catalog');
      expect(scopes('GET /api/recipes/cook-tonight')).toContain('catalog');
    });
  });

  it('does not prefetch starters for a Family that has Recipes', async () => {
    const { fetchMock, calls } = stubApi({
      ...cookTonightRoute(),
      ...recipeList([{ id: 'listed' }], 0),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAt();

    // The panel shows once both the Family list and Cook Tonight have loaded.
    expect(
      await screen.findByText(/Nothing to cook from your Pantry/),
    ).toBeInTheDocument();
    expect(
      calls.some(
        (c) => new URLSearchParams(c.search).get('scope') === 'catalog',
      ),
    ).toBe(false);
  });

  it('shows the same on a tall Widget', async () => {
    stub({ ...cookTonightRoute(), ...recipeList([], 0) });
    renderAt('tall');
    expect(await screen.findByText(POT)).toBeInTheDocument();
  });

  it('makes the panel no link, with Gator a button that plays his Tap', async () => {
    stubMotion(false);
    stub({ ...cookTonightRoute(), ...recipeList([], 0) });
    renderAt();
    const user = userEvent.setup();

    await screen.findByText(POT);
    const region = screen.getByRole('region', { name: 'Cook tonight' });
    // Only the four text links; the panel itself is not one.
    expect(within(region).getAllByRole('link')).toHaveLength(4);
    const gator = within(region).getByRole('button', {
      name: /Gator the chef/,
    });
    await user.click(gator);
    expect(gator.querySelector('img')).toHaveAttribute('data-motion', 'tap');
    expect(screen.queryByText(/^at /)).toBeNull();
  });

  it('shows the Nothing state and the Hidden by Allergies note when every Recipe is hidden', async () => {
    stub({ ...cookTonightRoute(2), ...recipeList([], 2) });
    renderAt();

    const panel = await screen.findByRole('link', { name: /^Cook tonight, / });
    expect(panel).toHaveAttribute('href', '/pantry');
    expect(
      screen.getByText('2 Recipes hidden by your Allergies'),
    ).toBeInTheDocument();
    expect(screen.queryByText(POT)).toBeNull();
  });

  it('leaves the small Widget as it was, without asking for the Recipe list', async () => {
    const { fetchMock, calls } = stubApi({
      ...cookTonightRoute(),
      ...recipeList([], 0),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAt('small');

    const region = await screen.findByRole('region', { name: 'Cook tonight' });
    expect(
      await within(region).findByText(/Nothing you can make/),
    ).toBeInTheDocument();
    expect(screen.queryByText(POT)).toBeNull();
    expect(calls.map((call) => call.key)).not.toContain('GET /api/recipes');
  });

  it('shows neither the empty pot nor Nothing while the Recipe list loads', async () => {
    const { fetchMock, calls } = stubApi({
      ...cookTonightRoute(),
      'GET /api/recipes': () => new Promise<Response>(() => {}),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAt('wide', <CookTonightProbe />);

    // Cook Tonight has answered (empty); only the Recipe list is still pending.
    await screen.findByText('ct ready');
    expect(calls.map((call) => call.key)).toContain('GET /api/recipes');
    const region = screen.getByRole('region', { name: 'Cook tonight' });
    expect(
      within(region).getByRole('progressbar', { name: 'Loading' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(POT)).toBeNull();
    expect(screen.queryByRole('link', { name: /^Cook tonight, / })).toBeNull();
  });

  it('shows an error, neither the empty pot nor Nothing, when the Recipe list fails', async () => {
    stub({
      ...cookTonightRoute(),
      'GET /api/recipes': () =>
        Response.json({ message: 'boom' }, { status: 500 }),
    });
    renderAt();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(POT)).toBeNull();
    expect(screen.queryByRole('link', { name: /^Cook tonight, / })).toBeNull();
  });
});
