import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '@/lib/catalog';
import { renderWithProviders } from '@/test/render';
import { CatalogSearch } from '../../CatalogSearch/CatalogSearch';
import { BrowseByAisle } from './BrowseByAisle';

const DAIRY_AISLE = '244cde4d-f9a5-5df8-9f40-5e1f48fd4fcf';
const DAIRY_TINT = 'dairy';
const BAKERY_AISLE = 'bakery-aisle-id';

const aisles = [
  {
    id: DAIRY_AISLE,
    name: 'Dairy & eggs',
    parentCategories: [
      { id: 'dairy-parent', name: 'Dairy' },
      { id: 'eggs-parent', name: 'Eggs' },
    ],
  },
  {
    id: BAKERY_AISLE,
    name: 'Bakery',
    parentCategories: [{ id: 'bakery-parent', name: 'Bakery goods' }],
  },
];

const ingredient = (
  id: string,
  name: string,
  parent = 'dairy-parent',
): CatalogSearchResult => ({
  owner: 'catalog',
  amountScale: 'medium',
  id,
  name,
  defaultUnit: 'g',
  leafCategory: { id: `${id}-leaf`, name: 'Leaf' },
  parentCategory: {
    id: parent,
    name: parent === 'eggs-parent' ? 'Eggs' : 'Dairy',
    aisle: { id: DAIRY_AISLE, name: 'Dairy & eggs' },
  },
  defaults: { expiryDays: 7, location: 'fridge' },
});
const butter = ingredient('butter-id', 'Butter');
const eggs = ingredient('eggs-id', 'Eggs', 'eggs-parent');
const milk = ingredient('milk-id', 'Milk');

/**
 * Serves the Aisle listing at once; each search stays pending until the test
 * answers it with `respond`, keyed `q|aisleId|parentCategoryId` ('' when absent).
 */
function stubCatalog() {
  const pending = new Map<string, (results: CatalogSearchResult[]) => void>();
  const searches: URL[] = [];
  const keyOf = (url: URL) =>
    ['q', 'aisleId', 'parentCategoryId']
      .map((name) => url.searchParams.get(name) ?? '')
      .join('|');
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = new URL(String(input), window.location.origin);
    if (url.pathname === '/api/catalog/aisles') {
      return Promise.resolve(Response.json({ aisles }));
    }
    searches.push(url);
    return new Promise<Response>((resolve) => {
      pending.set(keyOf(url), (results) => resolve(Response.json({ results })));
    });
  });
  return {
    searches,
    last: () => searches.at(-1) as URL,
    respond: async (key: string, results: CatalogSearchResult[]) => {
      await vi.waitFor(() => expect(pending.has(key)).toBe(true));
      pending.get(key)?.(results);
    },
  };
}

function Host({ onSelect }: { onSelect?: (i: CatalogSearchResult) => void }) {
  const [selected, setSelected] = useState<CatalogSearchResult | null>(null);
  return (
    <CatalogSearch
      defaultOpen
      selected={selected}
      onSelect={(result) => {
        setSelected(result);
        onSelect?.(result);
      }}
      onQueryChange={(q) => {
        if (q === '') setSelected(null);
      }}
      emptyState={<BrowseByAisle />}
    />
  );
}

async function openDairy(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Dairy & eggs' }));
}

describe('Browse by aisle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows one chip per Aisle, with its tint swatch and name, under a Browse by aisle heading', async () => {
    stubCatalog();
    renderWithProviders(<Host />);

    expect(await screen.findByText('Browse by aisle')).toBeVisible();
    const dairy = await screen.findByRole('button', { name: 'Dairy & eggs' });
    expect(screen.getByRole('button', { name: 'Bakery' })).toBeVisible();
    expect(within(dairy).getByTestId('aisle-swatch')).toHaveAttribute(
      'data-tint',
      DAIRY_TINT,
    );
  });

  it('opens an Aisle in the same list: header, Leave button and skeletons while loading, then the rows', async () => {
    const catalog = stubCatalog();
    renderWithProviders(<Host />);
    const user = userEvent.setup();

    await openDairy(user);

    expect(await screen.findByText('Dairy & eggs')).toBeVisible();
    expect(screen.getByText('loading…')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Leave Dairy & eggs' }),
    ).toBeVisible();
    expect(await screen.findAllByTestId('search-skeleton')).toHaveLength(4);
    expect(catalog.last().searchParams.get('aisleId')).toBe(DAIRY_AISLE);
    expect(catalog.last().searchParams.get('q')).toBe('');

    await catalog.respond(`|${DAIRY_AISLE}|`, [butter, eggs, milk]);

    expect(await screen.findAllByRole('option')).toHaveLength(3);
    expect(screen.getByText('3 ingredients, A to Z')).toBeVisible();
    expect(screen.queryByText('loading…')).not.toBeInTheDocument();
    expect(screen.queryByTestId('search-skeleton')).not.toBeInTheDocument();
  });

  it('shows Parent Category chips only when the Aisle has more than one, and narrows by one', async () => {
    const catalog = stubCatalog();
    renderWithProviders(<Host />);
    const user = userEvent.setup();

    await openDairy(user);
    await catalog.respond(`|${DAIRY_AISLE}|`, [butter, eggs, milk]);
    const eggsChip = await screen.findByRole('button', { name: 'Eggs' });
    expect(screen.getByRole('button', { name: 'Dairy' })).toBeVisible();

    await user.click(eggsChip);
    expect(catalog.last().searchParams.get('parentCategoryId')).toBe(
      'eggs-parent',
    );
    expect(catalog.last().searchParams.get('aisleId')).toBe(DAIRY_AISLE);
    await catalog.respond(`|${DAIRY_AISLE}|eggs-parent`, [eggs]);
    expect(await screen.findByText('1 ingredient, A to Z')).toBeVisible();
  });

  it('shows no Parent Category chips for an Aisle with a single Parent Category', async () => {
    const catalog = stubCatalog();
    renderWithProviders(<Host />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Bakery' }));
    await catalog.respond(`|${BAKERY_AISLE}|`, []);

    expect(
      await screen.findByRole('button', { name: 'Leave Bakery' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Bakery goods' }),
    ).not.toBeInTheDocument();
  });

  it('filters within the Aisle as the Member types', async () => {
    const catalog = stubCatalog();
    renderWithProviders(<Host />);
    const user = userEvent.setup();

    await openDairy(user);
    await catalog.respond(`|${DAIRY_AISLE}|`, [butter, eggs, milk]);
    await screen.findAllByRole('option');
    await user.click(screen.getByRole('combobox'));
    await user.paste('mil');

    await vi.waitFor(() =>
      expect(catalog.last().searchParams.get('q')).toBe('mil'),
    );
    expect(catalog.last().searchParams.get('aisleId')).toBe(DAIRY_AISLE);
    await catalog.respond(`mil|${DAIRY_AISLE}|`, [milk]);
    expect(await screen.findByText('matching “mil”')).toBeVisible();
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('returns to plain search with the same text when × is pressed', async () => {
    const catalog = stubCatalog();
    renderWithProviders(<Host />);
    const user = userEvent.setup();

    await openDairy(user);
    await catalog.respond(`|${DAIRY_AISLE}|`, [butter]);
    await user.click(screen.getByRole('combobox'));
    await user.paste('mil');
    await catalog.respond(`mil|${DAIRY_AISLE}|`, [milk]);
    await screen.findByText('matching “mil”');

    await user.click(
      screen.getByRole('button', { name: 'Leave Dairy & eggs' }),
    );

    expect(screen.getByRole('combobox')).toHaveValue('mil');
    expect(screen.queryByText('matching “mil”')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Leave Dairy & eggs' }),
    ).not.toBeInTheDocument();
    await vi.waitFor(() => {
      const url = catalog.last();
      expect(url.searchParams.get('q')).toBe('mil');
      expect(url.searchParams.has('aisleId')).toBe(false);
    });
    await catalog.respond('mil||', [milk, ingredient('mil-2', 'Millet')]);
    expect(await screen.findAllByRole('option')).toHaveLength(2);
  });

  it('selects through the search when a row is picked, showing the token and clearing the Aisle', async () => {
    const catalog = stubCatalog();
    const onSelect = vi.fn();
    renderWithProviders(<Host onSelect={onSelect} />);
    const user = userEvent.setup();

    await openDairy(user);
    await catalog.respond(`|${DAIRY_AISLE}|`, [butter, eggs, milk]);
    await user.click(await screen.findByRole('option', { name: /Milk/ }));

    expect(onSelect).toHaveBeenCalledWith(milk);
    expect(
      screen.getByRole('combobox', {
        name: 'Ingredient: Milk. Press Backspace to change',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Leave Dairy & eggs' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/A to Z/)).not.toBeInTheDocument();
  });

  it('starts from the chips again after the Aisle is cleared by a pick and the token removed', async () => {
    const catalog = stubCatalog();
    renderWithProviders(<Host />);
    const user = userEvent.setup();

    await openDairy(user);
    await catalog.respond(`|${DAIRY_AISLE}|`, [milk]);
    await user.click(await screen.findByRole('option', { name: /Milk/ }));
    await user.click(screen.getByRole('button', { name: 'Change ingredient' }));

    expect(await screen.findByRole('button', { name: 'Bakery' })).toBeVisible();
    expect(screen.queryByText(/A to Z/)).not.toBeInTheDocument();
  });

  it('says to try another Aisle or clear the Aisle when nothing in it matches', async () => {
    const catalog = stubCatalog();
    renderWithProviders(<Host />);
    const user = userEvent.setup();

    await openDairy(user);
    await catalog.respond(`|${DAIRY_AISLE}|`, [butter]);
    await user.click(screen.getByRole('combobox'));
    await user.paste('zzz');
    await catalog.respond(`zzz|${DAIRY_AISLE}|`, []);

    expect(await screen.findByText('No match for “zzz”')).toBeVisible();
    expect(
      screen.getByText('Try another aisle or clear the aisle.'),
    ).toBeVisible();
    expect(
      screen.queryByText('Check the spelling or try a shorter word.'),
    ).not.toBeInTheDocument();
  });

  it('keeps the plain no-match hint outside an Aisle', async () => {
    const catalog = stubCatalog();
    renderWithProviders(<Host />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('combobox'));
    await user.paste('zzz');
    await catalog.respond('zzz||', []);

    expect(
      await screen.findByText('Check the spelling or try a shorter word.'),
    ).toBeVisible();
    expect(
      screen.queryByText('Try another aisle or clear the aisle.'),
    ).not.toBeInTheDocument();
  });

  it('sends scope=shared on the Aisle searches of a shared-scope search', async () => {
    const catalog = stubCatalog();
    renderWithProviders(
      <CatalogSearch
        defaultOpen
        scope="shared"
        onSelect={() => {}}
        emptyState={<BrowseByAisle />}
      />,
    );
    const user = userEvent.setup();

    await openDairy(user);

    expect(catalog.last().searchParams.get('scope')).toBe('shared');
    expect(catalog.last().searchParams.get('aisleId')).toBe(DAIRY_AISLE);
  });
});

describe('Browse by aisle: keyboard, announcements and leaving (#267 review r1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps focus in the field when a chip is opened from the keyboard, so the arrows reach the rows', async () => {
    const catalog = stubCatalog();
    renderWithProviders(<Host />);
    const user = userEvent.setup();

    (await screen.findByRole('button', { name: 'Dairy & eggs' })).focus();
    await user.keyboard('{Enter}');
    await catalog.respond(`|${DAIRY_AISLE}|`, [butter, eggs, milk]);
    await screen.findAllByRole('option');

    expect(screen.getByRole('combobox')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    const [first] = screen.getAllByRole('option');
    expect(first).toHaveAttribute('aria-selected', 'true');
  });

  it('announces the aisle search while loading and the count once loaded, with no text typed', async () => {
    const catalog = stubCatalog();
    renderWithProviders(<Host />);
    const user = userEvent.setup();

    await openDairy(user);
    await vi.waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Searching'),
    );
    await catalog.respond(`|${DAIRY_AISLE}|`, [butter, eggs, milk]);
    await vi.waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('3 results'),
    );
  });

  it('closes the list on Escape and drops the aisle on a second Escape', async () => {
    const catalog = stubCatalog();
    renderWithProviders(<Host />);
    const user = userEvent.setup();

    await openDairy(user);
    await catalog.respond(`|${DAIRY_AISLE}|`, [butter]);
    await screen.findAllByRole('option');
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('button', { name: 'Leave Dairy & eggs' }),
    ).toBeNull();
    await user.keyboard('{Escape}');

    // Focus leaves and returns: the empty state is back, not the old aisle.
    await user.tab();
    await user.tab({ shift: true });
    expect(screen.getByRole('combobox')).toHaveFocus();
    expect(await screen.findByRole('button', { name: 'Bakery' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Leave Dairy & eggs' }),
    ).not.toBeInTheDocument();
  });

  it('leaves the aisle when the field’s clear × is pressed', async () => {
    const catalog = stubCatalog();
    renderWithProviders(<Host />);
    const user = userEvent.setup();

    await openDairy(user);
    await catalog.respond(`|${DAIRY_AISLE}|`, [butter]);
    await screen.findAllByRole('option');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(await screen.findByRole('button', { name: 'Bakery' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Leave Dairy & eggs' }),
    ).not.toBeInTheDocument();
  });

  it('does not claim to be loading after the aisle search failed', async () => {
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.origin);
      return Promise.resolve(
        url.pathname === '/api/catalog/aisles'
          ? Response.json({ aisles })
          : new Response('{}', { status: 500 }),
      );
    });
    renderWithProviders(<Host />);
    const user = userEvent.setup();

    await openDairy(user);

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByText('loading…')).not.toBeInTheDocument();
  });
});
