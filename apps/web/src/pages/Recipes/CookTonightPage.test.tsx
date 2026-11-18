import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CookTonightCard } from '@/lib/cookTonight';
import { renderWithProviders, stubApi } from '@/test/render';
import { CookTonightPage } from './CookTonightPage';

/*
 * DOM contract these tests assume (the implementation must provide it):
 * - Each section is a `list` named by its heading ("You can make this", "One ingredient short").
 * - Each row is a `listitem` whose text holds the title and pills; the row contains the one
 *   link, to `/recipes/{card.recipe.id}`.
 * - The back button is a link named "Back".
 */

const card = (
  over: Omit<Partial<CookTonightCard>, 'base' | 'recipe'> & {
    base?: Partial<CookTonightCard['base']>;
    recipe?: Partial<CookTonightCard['recipe']>;
  } = {},
): CookTonightCard => ({
  canMake: true,
  missing: null,
  expiringCount: 0,
  otherVariantsCount: 0,
  ...over,
  base: { id: 'o', title: 'Omelette', archived: false, ...over.base },
  recipe: {
    id: over.base?.id ?? 'o',
    title: over.base?.title ?? 'Omelette',
    parentId: null,
    owner: 'catalog',
    familyCopyId: null,
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 15,
    tags: [],
    allergyWarning: null,
    ...over.recipe,
  },
});

const base = (
  id: string,
  title: string,
  over: Parameters<typeof card>[0] = {},
) => card({ ...over, base: { id, title } });

const nearMiss = (id: string, title: string, missing: string) =>
  base(id, title, {
    canMake: false,
    missing: { ingredientId: `i-${missing}`, name: missing },
  });

function setup(
  cards: CookTonightCard[] | ((url: URL) => CookTonightCard[]),
  /** How many cards "Hide Recipes with my Allergies" left out, unless the request shows them. */
  hidden = 0,
) {
  const { fetchMock, calls } = stubApi({
    'GET /api/recipes/cook-tonight': (url) => {
      const shown = url.searchParams.get('showHidden') === 'true';
      return Response.json({
        cards: typeof cards === 'function' ? cards(url) : cards,
        hiddenByAllergiesCount: shown ? 0 : hidden,
      });
    },
  });
  vi.stubGlobal('fetch', fetchMock);
  render();
  return calls;
}

function render() {
  renderWithProviders(
    <Routes>
      <Route path="/recipes" element={<p>recipes page</p>} />
      <Route path="/recipes/cook-tonight" element={<CookTonightPage />} />
      <Route path="/recipes/:id" element={<p>detail page</p>} />
    </Routes>,
    { route: '/recipes/cook-tonight' },
  );
}

const section = (name: string) => screen.findByRole('list', { name });
const rowTitles = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map((row) => within(row).getByRole('link').textContent);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CookTonightPage', () => {
  it('is titled "Cook tonight", with a back button to Recipes', async () => {
    setup([base('o', 'Omelette')]);
    expect(
      await screen.findByRole('heading', { name: 'Cook tonight' }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('link', { name: 'Back' }));
    expect(await screen.findByText('recipes page')).toBeInTheDocument();
  });

  it('lists the Can Make cards expiring first, then in rank', async () => {
    setup([
      base('a', 'Pancakes'),
      base('b', 'Stew', { expiringCount: 2 }),
      nearMiss('c', 'Curry', 'Coconut milk'),
      base('d', 'Toast'),
      base('e', 'Soup', { expiringCount: 1 }),
    ]);
    const list = await section('You can make this');
    expect(rowTitles(list)).toEqual([
      expect.stringContaining('Stew'),
      expect.stringContaining('Soup'),
      expect.stringContaining('Pancakes'),
      expect.stringContaining('Toast'),
    ]);
    expect(within(list).queryByText(/Curry/)).toBeNull();
  });

  it('lists near misses after the Can Make cards, in rank, each naming its missing Ingredient', async () => {
    setup([
      nearMiss('c', 'Curry', 'Coconut milk'),
      base('a', 'Pancakes', { expiringCount: 1 }),
      nearMiss('d', 'Dal', 'Lentils'),
    ]);
    const list = await section('One ingredient short');
    expect(rowTitles(list)).toEqual([
      expect.stringContaining('Curry'),
      expect.stringContaining('Dal'),
    ]);
    const [curry, dal] = within(list).getAllByRole('listitem');
    expect(curry).toHaveTextContent('Missing Coconut milk');
    expect(dal).toHaveTextContent('Missing Lentils');
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['You can make this', 'One ingredient short']);
  });

  it('leaves out a section with no cards, heading included', async () => {
    setup([nearMiss('c', 'Curry', 'Coconut milk')]);
    await section('One ingredient short');
    expect(screen.queryByText('You can make this')).toBeNull();
  });

  it('leaves out the near-miss section when nothing is one ingredient short', async () => {
    setup([base('a', 'Pancakes')]);
    await section('You can make this');
    expect(screen.queryByText('One ingredient short')).toBeNull();
  });

  it('shows the best match’s Tags on a row: two chips, "+N", every Tag named', async () => {
    const tag = (id: string, name: string, order: number) => ({
      id,
      name,
      kind: 'catalog' as const,
      groupId: `g${order}`,
      groupName: 'Group',
      groupOrder: order,
    });
    setup([
      base('a', 'Pancakes', {
        recipe: {
          tags: [
            tag('1', 'Breakfast', 1),
            tag('2', 'Vegetarian', 2),
            tag('3', 'French', 3),
          ],
        },
      }),
    ]);
    const [row] = within(await section('You can make this')).getAllByRole(
      'listitem',
    );
    expect(
      within(row).getByRole('group', {
        name: 'Tags: Breakfast, Vegetarian, French',
      }),
    ).toHaveTextContent('BreakfastVegetarian+1');
  });

  it('shows the Can Make and expiring pills on a row', async () => {
    setup([base('a', 'Pancakes', { expiringCount: 2 })]);
    const [row] = within(await section('You can make this')).getAllByRole(
      'listitem',
    );
    expect(row).toHaveTextContent('Can Make');
    expect(row).toHaveTextContent('2 expiring');
  });

  it('names the Variant a Base Recipe can make, and opens that Variant', async () => {
    setup([
      base('o', 'Omelette', {
        recipe: { id: 'f', title: 'Frittata', parentId: 'o', owner: 'family' },
      }),
    ]);
    const [row] = within(await section('You can make this')).getAllByRole(
      'listitem',
    );
    expect(row).toHaveTextContent('Omelette');
    expect(row).toHaveTextContent('Can Make Frittata');
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/recipes/f');
    await userEvent.click(within(row).getByRole('link'));
    expect(await screen.findByText('detail page')).toBeInTheDocument();
  });

  it('names the Variant a near miss opens, with the Ingredient it lacks', async () => {
    setup([
      base('o', 'Omelette', {
        canMake: false,
        missing: { ingredientId: 'i-chives', name: 'Chives' },
        recipe: { id: 'f', title: 'Frittata', parentId: 'o', owner: 'family' },
      }),
    ]);
    const link = await screen.findByRole('link', {
      name: /Omelette.*Missing Chives for Frittata/,
    });
    expect(link).toHaveAttribute('href', '/recipes/f');
  });

  it('opens a Catalog card as the Family copy, else the Explore preview', async () => {
    setup([
      base('o', 'Omelette', { recipe: { familyCopyId: 'copy-o' } }),
      base('s', 'Soup'),
    ]);
    expect(
      await screen.findByRole('link', { name: /Omelette/ }),
    ).toHaveAttribute('href', '/recipes/copy-o');
    expect(screen.getByRole('link', { name: /Soup/ })).toHaveAttribute(
      'href',
      '/recipes/explore/s',
    );
  });

  it('shows a spinner while the cards load', async () => {
    let answer: (response: Response) => void = () => {};
    const { fetchMock } = stubApi({
      'GET /api/recipes/cook-tonight': () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render();
    expect(
      await screen.findByRole('progressbar', { name: 'Loading' }),
    ).toBeVisible();
    answer(
      Response.json({
        cards: [base('a', 'Pancakes')],
        hiddenByAllergiesCount: 0,
      }),
    );
    await section('You can make this');
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows the translated API error when the cards fail to load', async () => {
    const { fetchMock } = stubApi({
      'GET /api/recipes/cook-tonight': () =>
        Response.json({ code: 'forbidden', params: {} }, { status: 403 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have access to this.',
    );
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('notes the Recipes hidden by Allergies, and Show asks for them too', async () => {
    const calls = setup(
      (url) =>
        url.searchParams.get('showHidden') === 'true'
          ? [base('a', 'Pancakes'), base('p', 'Peanut stew')]
          : [base('a', 'Pancakes')],
      2,
    );
    expect(
      await screen.findByText('2 Recipes hidden by your Allergies'),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));
    const list = await section('You can make this');
    expect(await within(list).findByText(/Peanut stew/)).toBeVisible();
    expect(screen.queryByText(/^\d+ Recipes? hidden/)).toBeNull();
    expect(
      calls.some(
        (call) =>
          call.key === 'GET /api/recipes/cook-tonight' &&
          new URLSearchParams(call.search).get('showHidden') === 'true',
      ),
    ).toBe(true);
  });

  it('Hide puts the Recipes hidden by Allergies away again', async () => {
    setup(
      (url) =>
        url.searchParams.get('showHidden') === 'true'
          ? [base('a', 'Pancakes'), base('p', 'Peanut stew')]
          : [base('a', 'Pancakes')],
      2,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Show' }));
    const list = await section('You can make this');
    expect(await within(list).findByText(/Peanut stew/)).toBeVisible();
    expect(
      screen.getByText('Showing Recipes hidden by your Allergies'),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(
      await screen.findByText('2 Recipes hidden by your Allergies'),
    ).toBeVisible();
    expect(screen.queryByText(/Peanut stew/)).toBeNull();
  });

  it('asks for the Family scope only', async () => {
    const calls = setup([base('a', 'Pancakes')]);
    await section('You can make this');
    const asked = calls.filter(
      (c) => c.key === 'GET /api/recipes/cook-tonight',
    );
    expect(asked.length).toBeGreaterThan(0);
    for (const call of asked) {
      expect(new URLSearchParams(call.search).get('scope')).toBe('family');
    }
  });

  it('has no Allergies note when nothing is hidden', async () => {
    setup([base('a', 'Pancakes')]);
    await section('You can make this');
    expect(screen.queryByText(/hidden by your Allergies/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show' })).toBeNull();
  });
});
