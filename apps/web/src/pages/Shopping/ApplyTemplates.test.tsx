import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShoppingList } from '@/lib/shopping';
import type { Template, TemplateLine } from '@/lib/shoppingTemplates';
import { renderWithProviders, stubApi } from '@/test/render';
import { ShoppingPage } from './ShoppingPage';

const produce = { id: 'a1', name: 'Fruit & veg', sortOrder: 1 };
const dairy = { id: 'a4', name: 'Dairy & eggs', sortOrder: 4 };

const line = (
  id: string,
  name: string,
  overrides: Partial<TemplateLine> = {},
): TemplateLine => ({
  id,
  ingredientId: `${id}-ingredient`,
  name,
  quantity: null,
  unit: null,
  unmatched: false,
  inPantry: false,
  aisle: produce,
  ...overrides,
});

const taco: Template = {
  id: 't1',
  name: 'Taco night',
  lines: [
    line('milk', 'Milk', { quantity: 1, unit: 'l', inPantry: true }),
    line('tomato', 'Tomato', { quantity: 3 }),
    line('flour', 'Flour', { quantity: 200, unit: 'g', aisle: dairy }),
    line('saffron', 'Saffron', {
      ingredientId: null,
      unmatched: true,
      aisle: null,
    }),
  ],
};
const bake: Template = {
  id: 't2',
  name: 'Baking',
  lines: [
    line('flour2', 'Flour', { quantity: 1, unit: 'kg', aisle: dairy }),
    line('flour3', 'Flour', { quantity: 5, unit: 'g', aisle: dairy }),
    line('sugar', 'Sugar', { quantity: 2 }),
  ],
};
const empty: Template = { id: 't3', name: 'Empty one', lines: [] };
// Ingredient ids are per line id in these fixtures; make Flour one Ingredient.
for (const l of bake.lines) {
  if (l.name === 'Flour') l.ingredientId = 'flour-ingredient';
}

const summaries = [
  {
    id: 't1',
    name: 'Taco night',
    lineCount: 4,
    previewNames: ['Milk', 'Tomato', 'Flour', 'Saffron'],
  },
  { id: 't2', name: 'Baking', lineCount: 3, previewNames: ['Flour', 'Sugar'] },
  { id: 't3', name: 'Empty one', lineCount: 0, previewNames: [] },
];

const trolley: ShoppingList = {
  id: 'l1',
  groups: [
    {
      aisle: produce,
      items: [
        {
          id: 'i1',
          ingredientId: 'tomato-ingredient',
          name: 'Tomato',
          quantity: 250,
          unit: 'g',
          checked: true,
          unmatched: false,
        },
      ],
    },
  ],
  summary: { remaining: 0, checked: 1 },
};

// Bread is on no template, so it changes nothing in the sheet; it leaves the top bar's Import showing.
const bread: ShoppingList = {
  id: 'l1',
  groups: [
    {
      aisle: produce,
      items: [
        {
          id: 'i9',
          ingredientId: 'bread-ingredient',
          name: 'Bread',
          quantity: null,
          unit: null,
          checked: false,
          unmatched: false,
        },
      ],
    },
  ],
  summary: { remaining: 1, checked: 0 },
};

function stub(
  routes: Record<string, () => Response> = {},
  list: ShoppingList = bread,
  templates: Template[] = [taco, bake, empty],
) {
  const { fetchMock, calls } = stubApi({
    'GET /api/shopping-list': () => Response.json(list),
    'GET /api/shopping-list/suggestions': () =>
      Response.json({ expired: [], usedUp: [], staples: [], runningLow: [] }),
    'GET /api/shopping-templates': () =>
      Response.json({
        templates: summaries.filter((s) =>
          templates.some((t) => t.id === s.id),
        ),
      }),
    ...Object.fromEntries(
      templates.map((t) => [
        `GET /api/shopping-templates/${t.id}`,
        () => Response.json(t),
      ]),
    ),
    ...routes,
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls };
}

const openImport = async (user = userEvent.setup()) => {
  await user.click(await screen.findByRole('button', { name: 'Import' }));
  return screen.findByRole('dialog', { name: 'Import' });
};

describe('Import sheet', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens from the top-bar Import button and closes without importing', async () => {
    const user = userEvent.setup();
    const { calls } = stub();
    renderWithProviders(<ShoppingPage />);

    const pill = await screen.findByRole('button', {
      name: 'Import',
    });
    expect(pill).toHaveTextContent('Import');
    const dialog = await openImport(user);
    expect(
      within(dialog).getByText(
        'Tick whole templates, or open one to choose lines. You can mix several.',
      ),
    ).toBeVisible();
    expect(
      await within(dialog).findByRole('heading', {
        name: 'Your templates · 3',
      }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('link', { name: 'Manage' }),
    ).toHaveAttribute('href', '/shopping/templates');

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      calls.some((c) => c.key === 'POST /api/shopping-list/items/bulk'),
    ).toBe(false);
  });

  it('keeps the top-bar Import on an empty list, beside the Import tile', async () => {
    stub(undefined, {
      id: 'l1',
      groups: [],
      summary: { remaining: 0, checked: 0 },
    });
    renderWithProviders(<ShoppingPage />);

    expect(
      await screen.findByRole('button', { name: /Import a template/ }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Import' })).toBeVisible();
  });

  it('keeps the top-bar Import on an empty list without templates, which has no Import tile', async () => {
    stub(
      undefined,
      { id: 'l1', groups: [], summary: { remaining: 0, checked: 0 } },
      [],
    );
    renderWithProviders(<ShoppingPage />);

    expect(await screen.findByRole('button', { name: 'Import' })).toBeVisible();
  });

  it('says there are no templates yet and keeps the button disabled', async () => {
    const user = userEvent.setup();
    stub({}, undefined, []);
    renderWithProviders(<ShoppingPage />);

    const dialog = await openImport(user);

    expect(
      await within(dialog).findByText(
        'No templates yet. Save your list as one from the end of the list.',
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: 'Pick a template' }),
    ).toBeDisabled();
  });

  it('ticks and unticks whole templates, fetching details only for ticked ones', async () => {
    const user = userEvent.setup();
    const { calls } = stub();
    renderWithProviders(<ShoppingPage />);
    const dialog = await openImport(user);

    const box = await within(dialog).findByRole('checkbox', {
      name: 'Import Taco night',
    });
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(dialog).toHaveTextContent('4 items · Milk, Tomato, Flour');
    const detailCalls = () =>
      calls.filter((c) => /\/api\/shopping-templates\/t\d/.test(c.key));
    expect(detailCalls()).toHaveLength(0);

    await user.click(box);

    // Milk is In Pantry, so the default leaves it unticked: mixed.
    await waitFor(() => expect(box).toHaveAttribute('aria-checked', 'mixed'));
    expect(dialog).toHaveTextContent('3 of 4 selected');
    expect(detailCalls().map((c) => c.key)).toEqual([
      'GET /api/shopping-templates/t1',
    ]);
    expect(
      within(dialog).getByRole('button', { name: 'Import 3 items' }),
    ).toBeEnabled();

    await user.click(box);
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(dialog).toHaveTextContent('4 items · Milk, Tomato, Flour');
    expect(
      within(dialog).getByRole('button', { name: 'Pick a template' }),
    ).toBeDisabled();
  });

  it('shows a ticked template with nothing to import as mixed, importing nothing', async () => {
    const user = userEvent.setup();
    stub();
    renderWithProviders(<ShoppingPage />);
    const dialog = await openImport(user);

    const box = await within(dialog).findByRole('checkbox', {
      name: 'Import Empty one',
    });
    await user.click(box);

    await waitFor(() => expect(box).toHaveAttribute('aria-checked', 'mixed'));
    expect(dialog).toHaveTextContent('0 of 0 selected');
    expect(
      within(dialog).getByRole('button', { name: 'Pick a template' }),
    ).toBeDisabled();
  });

  it('starts In trolley lines unticked too', async () => {
    const user = userEvent.setup();
    stub({}, trolley);
    renderWithProviders(<ShoppingPage />);
    const dialog = await openImport(user);

    await user.click(
      await within(dialog).findByRole('checkbox', {
        name: 'Import Taco night',
      }),
    );

    // Milk (In Pantry) and Tomato (In trolley) start unticked.
    expect(
      await within(dialog).findByRole('button', { name: 'Import 2 items' }),
    ).toBeEnabled();
    expect(dialog).toHaveTextContent('2 of 4 selected');
  });

  it('counts distinct items across templates, ignoring units, and names the repeats', async () => {
    const user = userEvent.setup();
    stub();
    renderWithProviders(<ShoppingPage />);
    const dialog = await openImport(user);

    await user.click(
      await within(dialog).findByRole('checkbox', {
        name: 'Import Taco night',
      }),
    );
    await user.click(
      await within(dialog).findByRole('checkbox', { name: 'Import Baking' }),
    );

    // Tomato, Flour, Saffron and Sugar; Flour is ticked three times.
    expect(
      await within(dialog).findByRole('button', { name: 'Import 4 items' }),
    ).toBeEnabled();
    expect(dialog).toHaveTextContent(
      'From Taco night, Baking · 2 repeats combined',
    );
    expect(
      within(dialog).getByRole('checkbox', { name: 'Import Baking' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('puts focus back on the Import button when the tile that opened the sheet goes away', async () => {
    const user = userEvent.setup();
    let current: ShoppingList = {
      id: 'l1',
      groups: [],
      summary: { remaining: 0, checked: 0 },
    };
    stub({
      'GET /api/shopping-list': () => Response.json(current),
      'POST /api/shopping-list/items/bulk': () => {
        current = {
          ...trolley,
          summary: { remaining: 1, checked: 0 },
        };
        return Response.json(current);
      },
    });
    renderWithProviders(<ShoppingPage />);
    await user.click(
      await screen.findByRole('button', { name: /Import a template/ }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Import' });
    await user.click(
      await within(dialog).findByRole('checkbox', { name: 'Import Baking' }),
    );
    await user.click(
      await within(dialog).findByRole('button', { name: /^Import \d+ items/ }),
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Import' })).toHaveFocus(),
    );
    expect(
      screen.queryByRole('button', { name: /Import a template/ }),
    ).toBeNull();
  });

  it('imports the ticked lines as they are in one call, then closes with a toast and focus on the button', async () => {
    const user = userEvent.setup();
    const { calls } = stub({
      'POST /api/shopping-list/items/bulk': () => Response.json(bread),
    });
    renderWithProviders(<ShoppingPage />);
    const dialog = await openImport(user);
    await user.click(
      await within(dialog).findByRole('checkbox', {
        name: 'Import Taco night',
      }),
    );
    await user.click(
      await within(dialog).findByRole('checkbox', { name: 'Import Baking' }),
    );

    await user.click(
      await within(dialog).findByRole('button', { name: 'Import 4 items' }),
    );

    const toast = await screen.findByText('Imported 4 items from 2 templates');
    expect(toast.closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const bulk = calls.filter(
      (c) => c.key === 'POST /api/shopping-list/items/bulk',
    );
    expect(bulk).toHaveLength(1);
    expect(bulk[0]?.body).toEqual({
      items: [
        { ingredientId: 'tomato-ingredient', quantity: 3 },
        { ingredientId: 'flour-ingredient', quantity: 200, unit: 'g' },
        { name: 'Saffron' },
        { ingredientId: 'flour-ingredient', quantity: 1, unit: 'kg' },
        { ingredientId: 'flour-ingredient', quantity: 5, unit: 'g' },
        { ingredientId: 'sugar-ingredient', quantity: 2 },
      ],
    });
    // The list and the suggestions refresh.
    await waitFor(() =>
      expect(
        calls.filter((c) => c.key === 'GET /api/shopping-list').length,
      ).toBeGreaterThan(1),
    );
    await waitFor(() =>
      expect(
        calls.filter((c) => c.key === 'GET /api/shopping-list/suggestions')
          .length,
      ).toBeGreaterThan(1),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Import' })).toHaveFocus(),
    );
  });

  it('names the template in the toast when importing from one', async () => {
    const user = userEvent.setup();
    stub({
      'POST /api/shopping-list/items/bulk': () =>
        Response.json({
          id: 'l1',
          groups: [],
          summary: { remaining: 0, checked: 0 },
        }),
    });
    renderWithProviders(<ShoppingPage />);
    const dialog = await openImport(user);
    await user.click(
      await within(dialog).findByRole('checkbox', {
        name: 'Import Taco night',
      }),
    );

    await user.click(
      await within(dialog).findByRole('button', { name: 'Import 3 items' }),
    );

    expect(
      await screen.findByText('Imported 3 items from Taco night'),
    ).toBeVisible();
  });

  it('keeps Import disabled while a ticked template is still loading', async () => {
    const user = userEvent.setup();
    let release: (response: Response) => void = () => {};
    const { calls } = stub({
      'GET /api/shopping-templates/t2': () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }) as unknown as Response,
      'POST /api/shopping-list/items/bulk': () =>
        Response.json({
          id: 'l1',
          groups: [],
          summary: { remaining: 0, checked: 0 },
        }),
    });
    renderWithProviders(<ShoppingPage />);
    const dialog = await openImport(user);
    await user.click(
      await within(dialog).findByRole('checkbox', {
        name: 'Import Taco night',
      }),
    );
    await user.click(
      await within(dialog).findByRole('checkbox', { name: 'Import Baking' }),
    );

    // Baking's lines are still on their way: nothing can be imported yet.
    expect(
      within(dialog).getByRole('button', { name: /^Import \d+ items?$/ }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole('checkbox', { name: 'Import Baking' }),
    ).toHaveAttribute('aria-busy', 'true');

    release(Response.json(bake));
    await user.click(
      await within(dialog).findByRole('button', { name: 'Import 4 items' }),
    );
    const bulk = calls.filter(
      (c) => c.key === 'POST /api/shopping-list/items/bulk',
    );
    expect(bulk).toHaveLength(1);
    expect(bulk[0]?.body).toMatchObject({
      items: expect.arrayContaining([
        { ingredientId: 'sugar-ingredient', quantity: 2 },
      ]),
    });
  });

  it('counts Unmatched names that differ by case or Danish spelling as one item', async () => {
    const user = userEvent.setup();
    const beets = (id: string, name: string): TemplateLine =>
      line(id, name, { ingredientId: null, unmatched: true, aisle: null });
    const onList: ShoppingList = {
      id: 'l1',
      groups: [
        {
          aisle: produce,
          items: [
            {
              id: 'i9',
              ingredientId: null,
              name: 'roedbeder',
              quantity: null,
              unit: null,
              checked: false,
              unmatched: true,
            },
          ],
        },
      ],
      summary: { remaining: 1, checked: 0 },
    };
    const { calls } = stub(
      {
        'POST /api/shopping-list/items/bulk': () =>
          Response.json({
            id: 'l1',
            groups: [],
            summary: { remaining: 0, checked: 0 },
          }),
      },
      onList,
      [
        { id: 't1', name: 'Taco night', lines: [beets('b1', 'Rødbeder')] },
        { id: 't2', name: 'Baking', lines: [beets('b2', 'ROEDBEDER')] },
      ],
    );
    renderWithProviders(<ShoppingPage />);
    const dialog = await openImport(user);
    await user.click(
      await within(dialog).findByRole('button', { name: /^Taco night/ }),
    );
    const lines = await within(dialog).findByRole('group', {
      name: 'Taco night',
    });
    expect(
      await within(lines).findByRole('checkbox', {
        name: /^Rødbeder.*On list · adds up/,
      }),
    ).toBeVisible();

    await user.click(
      await within(dialog).findByRole('checkbox', {
        name: 'Import Taco night',
      }),
    );
    await user.click(
      await within(dialog).findByRole('checkbox', { name: 'Import Baking' }),
    );

    const button = await within(dialog).findByRole('button', {
      name: 'Import 1 item',
    });
    expect(dialog).toHaveTextContent('1 repeat combined');
    await user.click(button);
    await waitFor(() =>
      expect(
        calls.filter((c) => c.key === 'POST /api/shopping-list/items/bulk'),
      ).toHaveLength(1),
    );
    expect(
      calls.find((c) => c.key === 'POST /api/shopping-list/items/bulk')?.body,
    ).toEqual({ items: [{ name: 'Rødbeder' }, { name: 'ROEDBEDER' }] });
  });

  it('reads Importing while the request runs', async () => {
    const user = userEvent.setup();
    stub({
      'POST /api/shopping-list/items/bulk': () =>
        new Promise<Response>(() => {}) as unknown as Response,
    });
    renderWithProviders(<ShoppingPage />);
    const dialog = await openImport(user);
    await user.click(
      await within(dialog).findByRole('checkbox', {
        name: 'Import Taco night',
      }),
    );
    await user.click(
      await within(dialog).findByRole('button', { name: 'Import 3 items' }),
    );

    expect(
      await within(dialog).findByRole('button', { name: 'Importing' }),
    ).toBeDisabled();
  });

  it('disables the button over 100 ticked lines', async () => {
    const user = userEvent.setup();
    const big: Template = {
      id: 't9',
      name: 'Big shop',
      lines: Array.from({ length: 101 }, (_, i) => line(`l${i}`, `Item ${i}`)),
    };
    stub({
      'GET /api/shopping-templates': () =>
        Response.json({
          templates: [
            { id: 't9', name: 'Big shop', lineCount: 101, previewNames: [] },
          ],
        }),
      'GET /api/shopping-templates/t9': () => Response.json(big),
    });
    renderWithProviders(<ShoppingPage />);
    const dialog = await openImport(user);

    await user.click(
      await within(dialog).findByRole('checkbox', { name: 'Import Big shop' }),
    );

    expect(
      await within(dialog).findByText('Up to 100 items at a time'),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: 'Import 101 items' }),
    ).toBeDisabled();
  });

  it('shows an error at the top and keeps the selection', async () => {
    const user = userEvent.setup();
    stub({
      'POST /api/shopping-list/items/bulk': () =>
        Response.json({ code: 'internal_error', params: {} }, { status: 500 }),
    });
    renderWithProviders(<ShoppingPage />);
    const dialog = await openImport(user);
    const box = await within(dialog).findByRole('checkbox', {
      name: 'Import Taco night',
    });
    await user.click(box);
    await user.click(
      await within(dialog).findByRole('button', { name: 'Import 3 items' }),
    );

    expect(await within(dialog).findByRole('alert')).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Import' })).toBeVisible();
    expect(box).toHaveAttribute('aria-checked', 'mixed');
    expect(
      within(dialog).getByRole('button', { name: 'Import 3 items' }),
    ).toBeEnabled();
  });

  it('starts fresh when reopened', async () => {
    const user = userEvent.setup();
    stub();
    renderWithProviders(<ShoppingPage />);
    let dialog = await openImport(user);
    await user.click(
      await within(dialog).findByRole('checkbox', {
        name: 'Import Taco night',
      }),
    );
    await within(dialog).findByRole('button', { name: 'Import 3 items' });

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    dialog = await openImport(user);

    expect(
      await within(dialog).findByRole('checkbox', {
        name: 'Import Taco night',
      }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(
      within(dialog).getByRole('button', { name: 'Pick a template' }),
    ).toBeDisabled();
  });

  it('shows a failed detail fetch, clears it on reopen, and includes the template on a retry', async () => {
    const user = userEvent.setup();
    let fail = true;
    stub({
      'GET /api/shopping-templates/t1': () =>
        fail
          ? Response.json(
              { code: 'internal_error', params: {} },
              { status: 500 },
            )
          : Response.json(taco),
    });
    renderWithProviders(<ShoppingPage />);
    let dialog = await openImport(user);
    const box = await within(dialog).findByRole('checkbox', {
      name: 'Import Taco night',
    });
    await user.click(box);
    expect(await within(dialog).findByRole('alert')).toBeVisible();
    expect(box).toHaveAttribute('aria-checked', 'false');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    dialog = await openImport(user);
    await within(dialog).findByRole('checkbox', { name: 'Import Taco night' });
    expect(within(dialog).queryByRole('alert')).toBeNull();

    fail = false;
    const again = within(dialog).getByRole('checkbox', {
      name: 'Import Taco night',
    });
    await user.click(again);
    await waitFor(() => expect(again).toHaveAttribute('aria-checked', 'mixed'));
  });
});

describe('Import sheet: picking lines', () => {
  afterEach(() => vi.unstubAllGlobals());

  const withOnList: ShoppingList = {
    id: 'l1',
    groups: [
      {
        aisle: produce,
        items: [
          ...(trolley.groups[0]?.items ?? []),
          {
            id: 'i2',
            ingredientId: 'sugar-ingredient',
            name: 'Sugar',
            quantity: 1,
            unit: null,
            checked: false,
            unmatched: false,
          },
        ],
      },
    ],
    summary: { remaining: 1, checked: 1 },
  };

  const opener = (dialog: HTMLElement, name: string) =>
    within(dialog).findByRole('button', { name: new RegExp(`^${name}`) });

  it('opens and closes rows, several at once, fetching details on open', async () => {
    const user = userEvent.setup();
    const { calls } = stub();
    renderWithProviders(<ShoppingPage />);
    const dialog = await openImport(user);

    const taco = await opener(dialog, 'Taco night');
    expect(taco).toHaveAttribute('aria-expanded', 'false');
    await user.click(taco);
    expect(taco).toHaveAttribute('aria-expanded', 'true');
    const bakeButton = await opener(dialog, 'Baking');
    await user.click(bakeButton);

    const tacoLines = await within(dialog).findByRole('group', {
      name: 'Taco night',
    });
    expect(taco).toHaveAttribute('aria-controls', tacoLines.id);
    expect(
      within(tacoLines)
        .getAllByRole('checkbox')
        .map((c) => c.textContent),
    ).toEqual([
      expect.stringContaining('Milk'),
      expect.stringContaining('Tomato'),
      expect.stringContaining('Flour'),
      expect.stringContaining('Saffron'),
    ]);
    expect(
      await within(dialog).findByRole('group', { name: 'Baking' }),
    ).toBeVisible();
    expect(
      calls
        .filter((c) => /\/api\/shopping-templates\/t\d/.test(c.key))
        .map((c) => c.key)
        .sort(),
    ).toEqual([
      'GET /api/shopping-templates/t1',
      'GET /api/shopping-templates/t2',
    ]);
    // Opening alone includes nothing.
    expect(
      within(dialog).getByRole('checkbox', { name: 'Import Taco night' }),
    ).toHaveAttribute('aria-checked', 'false');

    await user.click(taco);
    expect(taco).toHaveAttribute('aria-expanded', 'false');
    expect(
      within(dialog).queryByRole('group', { name: 'Taco night' }),
    ).toBeNull();
    expect(bakeButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('tags lines In Pantry, In trolley and On list · adds up', async () => {
    const user = userEvent.setup();
    stub({}, withOnList);
    renderWithProviders(<ShoppingPage />);
    const dialog = await openImport(user);
    await user.click(await opener(dialog, 'Taco night'));
    await user.click(await opener(dialog, 'Baking'));

    const tacoLines = await within(dialog).findByRole('group', {
      name: 'Taco night',
    });
    expect(
      within(tacoLines).getByRole('checkbox', { name: /^Milk.*In Pantry/ }),
    ).toBeVisible();
    expect(
      within(tacoLines).getByRole('checkbox', { name: /^Tomato.*In trolley/ }),
    ).toBeVisible();
    const bakeLines = await within(dialog).findByRole('group', {
      name: 'Baking',
    });
    expect(
      within(bakeLines).getByRole('checkbox', {
        name: /^Sugar.*On list · adds up/,
      }),
    ).toBeVisible();
  });

  it('includes the template on a line tap, and removes it when the last line is unticked', async () => {
    const user = userEvent.setup();
    stub({}, trolley);
    renderWithProviders(<ShoppingPage />);
    const dialog = await openImport(user);
    await user.click(await opener(dialog, 'Taco night'));
    const lines = await within(dialog).findByRole('group', {
      name: 'Taco night',
    });
    const milk = within(lines).getByRole('checkbox', { name: /^Milk/ });
    expect(milk).toHaveAttribute('aria-checked', 'false');

    // Tapping a line that defaults to unticked ticks it on top of the defaults.
    await user.click(milk);

    const box = within(dialog).getByRole('checkbox', {
      name: 'Import Taco night',
    });
    expect(box).toHaveAttribute('aria-checked', 'mixed');
    expect(milk).toHaveAttribute('aria-checked', 'true');
    expect(
      within(lines).getByRole('checkbox', { name: /^Tomato/ }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(dialog).toHaveTextContent('3 of 4 selected');
    expect(
      within(dialog).getByRole('button', { name: 'Import 3 items' }),
    ).toBeEnabled();

    await user.click(within(lines).getByRole('checkbox', { name: /^Flour/ }));
    await user.click(within(lines).getByRole('checkbox', { name: /^Saffron/ }));
    await user.click(milk);

    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(
      within(dialog).getByRole('button', { name: 'Pick a template' }),
    ).toBeDisabled();
  });

  it('clears the whole template when a mixed checkbox is tapped', async () => {
    const user = userEvent.setup();
    stub();
    renderWithProviders(<ShoppingPage />);
    const dialog = await openImport(user);
    await user.click(await opener(dialog, 'Taco night'));
    const lines = await within(dialog).findByRole('group', {
      name: 'Taco night',
    });
    await user.click(within(lines).getByRole('checkbox', { name: /^Tomato/ }));
    const box = within(dialog).getByRole('checkbox', {
      name: 'Import Taco night',
    });
    expect(box).toHaveAttribute('aria-checked', 'mixed');

    await user.click(box);

    expect(box).toHaveAttribute('aria-checked', 'false');
    for (const l of within(lines).getAllByRole('checkbox')) {
      expect(l).toHaveAttribute('aria-checked', 'false');
    }
  });

  it('sends lines hand-picked from several open templates in one bulk request', async () => {
    const user = userEvent.setup();
    const { calls } = stub({
      'POST /api/shopping-list/items/bulk': () =>
        Response.json({
          id: 'l1',
          groups: [],
          summary: { remaining: 0, checked: 0 },
        }),
    });
    renderWithProviders(<ShoppingPage />);
    const dialog = await openImport(user);
    await user.click(await opener(dialog, 'Taco night'));
    await user.click(await opener(dialog, 'Baking'));
    const tacoLines = await within(dialog).findByRole('group', {
      name: 'Taco night',
    });
    const bakeLines = await within(dialog).findByRole('group', {
      name: 'Baking',
    });
    await user.click(
      within(tacoLines).getByRole('checkbox', { name: /^Saffron/ }),
    );
    await user.click(
      within(bakeLines).getByRole('checkbox', { name: /^Sugar/ }),
    );

    expect(dialog).toHaveTextContent('From Taco night, Baking');
    await user.click(
      await within(dialog).findByRole('button', {
        name: 'Import 4 items',
      }),
    );

    await waitFor(() =>
      expect(
        calls.filter((c) => c.key === 'POST /api/shopping-list/items/bulk'),
      ).toHaveLength(1),
    );
    const body = calls.find(
      (c) => c.key === 'POST /api/shopping-list/items/bulk',
    )?.body as { items: unknown[] };
    expect(body.items).toEqual([
      { ingredientId: 'tomato-ingredient', quantity: 3 },
      { ingredientId: 'flour-ingredient', quantity: 200, unit: 'g' },
      { name: 'Saffron' },
      { ingredientId: 'flour-ingredient', quantity: 1, unit: 'kg' },
      { ingredientId: 'flour-ingredient', quantity: 5, unit: 'g' },
      { ingredientId: 'sugar-ingredient', quantity: 2 },
    ]);
  });

  it('shows an alert in an opened row whose lines fail to load, and a tick retries', async () => {
    const user = userEvent.setup();
    let fail = true;
    stub({
      'GET /api/shopping-templates/t1': () =>
        fail
          ? Response.json(
              { code: 'internal_error', params: {} },
              { status: 500 },
            )
          : Response.json(taco),
    });
    renderWithProviders(<ShoppingPage />);
    const dialog = await openImport(user);
    await user.click(await opener(dialog, 'Taco night'));

    expect(await within(dialog).findByRole('alert')).toBeVisible();
    expect(within(dialog).queryByRole('status')).toBeNull();

    fail = false;
    const box = within(dialog).getByRole('checkbox', {
      name: 'Import Taco night',
    });
    await user.click(box);
    await waitFor(() => expect(box).toHaveAttribute('aria-checked', 'mixed'));
    expect(
      await within(dialog).findByRole('checkbox', { name: /^Tomato/ }),
    ).toBeVisible();
  });
});
