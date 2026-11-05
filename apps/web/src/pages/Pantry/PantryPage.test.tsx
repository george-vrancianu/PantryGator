import { focusManager } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '../../lib/catalog';
import { defaultExpiryDate, type Batch } from '../../lib/pantry';
import {
  calendarDay,
  calendarDays,
  quickPick,
  quickPickTiles,
  sheetButton,
} from '../../test/expirySheet';
import {
  locationToggle,
  pickLocation,
  pressedLocation,
} from '../../test/location';
import { renderWithProviders, stubApi } from '../../test/render';
import { trackScrolling } from '../../test/scroll';
import { stubMotion, stubViewport } from '../../test/viewport';
import { typeNote } from '../../test/addBatch';
import { PantryPage } from './PantryPage';

const inDays = (days: number) => defaultExpiryDate(days, new Date());

function batch(overrides: Partial<Batch>): Batch {
  return {
    id: crypto.randomUUID(),
    name: 'Milk',
    ingredientId: 'milk-id',
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
    createdAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

const parmesan: CatalogSearchResult = {
  owner: 'catalog',
  amountScale: 'medium',
  id: 'parmesan-id',
  name: 'Parmesan',
  defaultUnit: 'g',
  leafCategory: { id: 'hard-cheese', name: 'Hard cheese' },
  parentCategory: {
    id: 'dairy',
    name: 'Dairy',
    aisle: { id: 'aisle', name: 'Dairy & eggs' },
  },
  defaults: { expiryDays: 30, location: 'fridge' },
};

/** Chips are 60 px wide and the row 300 px: four fit, so the first four by priority show. */
function mockChipRow() {
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(60);
}

/** The Usual Amount chips shown in a group, by their accessible names. */
const chipLabels = (group: HTMLElement) =>
  within(group)
    .getAllByRole('button')
    .map((chip) => chip.getAttribute('aria-label'));

/** Location sits after the amount field, on its own row: their shared container stacks them, so neither is squeezed. */
function expectLocationBelowAmount(amount: HTMLElement, location: HTMLElement) {
  expect(
    amount.compareDocumentPosition(location) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  let shared = amount.parentElement!;
  while (!shared.contains(location)) shared = shared.parentElement!;
  expect(getComputedStyle(shared).flexDirection).toBe('column');
}

/** The Family Settings response, with the Stale Threshold the tags are coloured by. */
const familySettings = (staleThresholdDays: number) => () =>
  Response.json({ staleThresholdDays, expiryOverrides: [] });

type Stocked = CatalogSearchResult & {
  lastStockedAt: string;
  inPantry: boolean;
};

function stubPantry(
  batches: Batch[],
  search: CatalogSearchResult[] = [],
  recentlyStocked: Stocked[] = [],
) {
  const { fetchMock, calls } = stubApi({
    'GET /api/pantry/recently-stocked': () =>
      Response.json({ ingredients: recentlyStocked }),
    'GET /api/pantry': () => Response.json({ batches }),
    'GET /api/settings/family': familySettings(3),
    'GET /api/catalog/search': () => Response.json({ results: search }),
    'POST /api/pantry/batches': () => Response.json(batch({})),
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

describe('PantryPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('groups Batches by Location in the order given, with name, amount, description and ExpiryTag', async () => {
    stubPantry([
      batch({
        name: 'Yogurt',
        ingredientId: 'yogurt-id',
        location: 'fridge',
        quantity: 500,
        unit: 'g',
        productDescription: 'Greek, opened',
        expiryDate: inDays(0),
      }),
      batch({
        name: 'Spinach',
        ingredientId: 'spinach-id',
        location: 'fridge',
        expiryDate: inDays(2),
      }),
      batch({
        name: 'Zorblax paste',
        location: 'cupboard',
        unmatched: true,
        ingredientId: null,
      }),
    ]);
    renderWithProviders(<PantryPage />);

    const fridge = await screen.findByRole('region', { name: 'Fridge · 2' });
    const rows = within(fridge).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Yogurt' + '500 g · Greek, opened' + 'Today',
      'Spinach' + '2 d left' + '2 days left',
    ]);

    const cupboard = screen.getByRole('region', { name: 'Cupboard · 1' });
    expect(within(cupboard).getByText('Unmatched')).toBeInTheDocument();
    expect(within(cupboard).getByText('Zorblax paste')).toBeInTheDocument();
  });

  describe('expiry tags', () => {
    const ladder = () => [
      batch({ name: 'Bread', ingredientId: 'bread', expiryDate: inDays(-2) }),
      batch({ name: 'Yogurt', ingredientId: 'yogurt', expiryDate: inDays(0) }),
      batch({
        name: 'Spinach',
        ingredientId: 'spinach',
        expiryDate: inDays(1),
      }),
      batch({ name: 'Feta', ingredientId: 'feta', expiryDate: inDays(3) }),
      batch({ name: 'Ham', ingredientId: 'ham', expiryDate: inDays(4) }),
      batch({ name: 'Butter', ingredientId: 'butter', expiryDate: inDays(9) }),
      batch({ name: 'Mustard', ingredientId: 'mustard', expiryDate: null }),
    ];
    const rowTexts = () =>
      within(screen.getByRole('region', { name: /^Fridge/ }))
        .getAllByRole('listitem')
        .map((row) => row.textContent);

    it('counts the days left on each roll-up row, by the Stale Threshold, with nothing for no expiry', async () => {
      stubPantry(ladder());
      renderWithProviders(<PantryPage />);

      await screen.findByRole('region', { name: 'Fridge · 7' });
      await waitFor(() =>
        expect(rowTexts()).toEqual([
          'Bread' + 'Expired',
          'Yogurt' + 'Today',
          'Spinach' + 'Tomorrow',
          'Feta' + '3 d left' + '3 days left',
          'Ham' + '4 d' + '4 days',
          'Butter' + '9 d' + '9 days',
          'Mustard',
        ]),
      );
      // The Expired tag leads with an alert icon.
      expect(screen.getByText('Expired').querySelector('svg')).not.toBeNull();
    });

    it('re-colours the tags when the Stale Threshold changes, with no other change', async () => {
      let threshold = 3;
      const { fetchMock } = stubApi({
        'GET /api/pantry': () => Response.json({ batches: ladder() }),
        'GET /api/settings/family': () => familySettings(threshold)(),
      });
      vi.stubGlobal('fetch', fetchMock);
      renderWithProviders(<PantryPage />);
      await screen.findByText('4 d');

      threshold = 1;
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await waitFor(() =>
        expect(rowTexts()).toEqual([
          'Bread' + 'Expired',
          'Yogurt' + 'Today',
          'Spinach' + 'Tomorrow',
          'Feta' + '3 d' + '3 days',
          'Ham' + '4 d' + '4 days',
          'Butter' + '9 d' + '9 days',
          'Mustard',
        ]),
      );

      threshold = 7;
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await waitFor(() =>
        expect(rowTexts()).toEqual([
          'Bread' + 'Expired',
          'Yogurt' + 'Today',
          'Spinach' + 'Tomorrow',
          'Feta' + '3 d left' + '3 days left',
          'Ham' + '4 d left' + '4 days left',
          'Butter' + '9 d' + '9 days',
          'Mustard',
        ]),
      );
    });

    it('shows the full date and tag in Batch detail, with the year only when it is not this year', async () => {
      // Wednesday 14 October 2026. Only `Date` is faked, so the test cannot straddle midnight or New Year.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 14, 15, 30));
      const user = userEvent.setup();
      stubPantry([
        batch({ id: 'a', quantity: 1, unit: 'l', expiryDate: inDays(0) }),
        batch({ id: 'b', quantity: 2, unit: 'l', expiryDate: '2031-06-09' }),
        batch({ id: 'c', quantity: 3, unit: 'l', expiryDate: null }),
      ]);
      renderWithProviders(<PantryPage />);
      await user.click(await screen.findByRole('button', { name: /^Milk/ }));

      const [todays, later, undated] = within(
        screen.getByRole('group', { name: 'Milk, 3 batches' }),
      ).getAllByRole('group');
      expect(todays).toHaveTextContent(/^11 L · Wed, Oct 14Today/);
      expect(later).toHaveTextContent(/^22 L · Mon, Jun 9, 2031\d+ d(?! left)/);
      expect(undated).toHaveTextContent(/^33 L · no dateNo expiry/);
    });

    it('moves its tags on to the new day when the page is shown again after midnight', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 14, 23, 50));
      const user = userEvent.setup();
      stubPantry([
        batch({ id: 'a', quantity: 1, unit: 'l', expiryDate: '2026-10-15' }),
      ]);
      renderWithProviders(<PantryPage />);
      await user.click(await screen.findByRole('button', { name: /^Milk/ }));
      const batches = screen.getByRole('group', { name: 'Milk, 1 batch' });
      expect(batches).toHaveTextContent('Tomorrow');

      vi.setSystemTime(new Date(2026, 9, 15, 7, 0));
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(batches).toHaveTextContent('Today');
    });
  });

  describe('Ingredient Icons', () => {
    const DAIRY_AISLE_ID = '244cde4d-f9a5-5df8-9f40-5e1f48fd4fcf';
    const dairy = { id: DAIRY_AISLE_ID, name: 'Dairy & eggs', sortOrder: 4 };
    const PARMESAN_SEED_ID = '7d85ad5c-dbd3-527e-ad69-23c2eb53ae6e';
    const iconOf = (name: string) =>
      screen
        .getByText(name)
        .closest('li')
        ?.querySelector<SVGElement>('[data-ingredient-icon]');

    it('shows a mapped Ingredient its icon, tinted by its Aisle', async () => {
      stubPantry([
        batch({
          name: 'Parmesan',
          ingredientId: PARMESAN_SEED_ID,
          aisle: dairy,
        }),
      ]);
      renderWithProviders(<PantryPage />);
      await screen.findByText('Parmesan');
      expect(iconOf('Parmesan')).toHaveAttribute(
        'data-ingredient-icon',
        'parmesan',
      );
      expect(iconOf('Parmesan')).toHaveAttribute(
        'data-ingredient-tint',
        'dairy',
      );
      expect(iconOf('Parmesan')).toHaveAttribute('aria-hidden', 'true');
    });

    it('shows an unmapped Ingredient the Default Icon, tinted by its Aisle', async () => {
      stubPantry([
        batch({ name: 'Zorblax', ingredientId: 'zorblax-id', aisle: dairy }),
      ]);
      renderWithProviders(<PantryPage />);
      await screen.findByText('Zorblax');
      expect(iconOf('Zorblax')).toHaveAttribute(
        'data-ingredient-icon',
        'default',
      );
      expect(iconOf('Zorblax')).toHaveAttribute(
        'data-ingredient-tint',
        'dairy',
      );
    });

    it('tints an Aisle without a tint neutral', async () => {
      stubPantry([
        batch({
          name: 'Parmesan',
          ingredientId: PARMESAN_SEED_ID,
          aisle: { id: 'admin-aisle-id', name: 'Custom', sortOrder: 99 },
        }),
      ]);
      renderWithProviders(<PantryPage />);
      await screen.findByText('Parmesan');
      expect(iconOf('Parmesan')).toHaveAttribute(
        'data-ingredient-icon',
        'parmesan',
      );
      expect(iconOf('Parmesan')).toHaveAttribute(
        'data-ingredient-tint',
        'neutral',
      );
    });

    it('shows an Unmatched Batch the Default Icon with the neutral tint', async () => {
      stubPantry([
        batch({
          name: 'Zorblax paste',
          ingredientId: null,
          unmatched: true,
          aisle: null,
        }),
      ]);
      renderWithProviders(<PantryPage />);
      await screen.findByText('Zorblax paste');
      expect(iconOf('Zorblax paste')).toHaveAttribute(
        'data-ingredient-icon',
        'default',
      );
      expect(iconOf('Zorblax paste')).toHaveAttribute(
        'data-ingredient-tint',
        'neutral',
      );
    });
  });

  it('shows the Empty Pantry with no Batches (see EmptyPantry.test.tsx)', async () => {
    stubPantry([]);
    renderWithProviders(<PantryPage />);
    expect(await screen.findByText('Nothing in here yet')).toBeInTheDocument();
  });

  it('adds a Batch from the Catalog with pre-filled Location and expiry', async () => {
    const user = userEvent.setup();
    const calls = stubPantry([], [parmesan]);
    renderWithProviders(<PantryPage />);

    await user.click(await screen.findByRole('button', { name: 'Add batch' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'parm',
    );
    const option = await screen.findByRole('option', { name: /Parmesan/ });
    // The Pantry search keeps the unit chip.
    expect(option).toHaveAccessibleName(
      'Parmesan, Hard cheese · Dairy & eggs, g',
    );
    await user.click(option);

    // The pick shows as the selected token.
    expect(
      screen.getByRole('combobox', {
        name: 'Ingredient: Parmesan. Press Backspace to change',
      }),
    ).toBeInTheDocument();
    expect(pressedLocation()).toBe('Fridge');
    expect(screen.getByText(/in 30 days/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unit: g' })).toBeInTheDocument();

    expectLocationBelowAmount(
      screen.getByRole('textbox', { name: /Amount of Parmesan/ }),
      screen.getByLabelText('Location'),
    );

    await pickLocation(user, 'Freezer');
    await user.clear(
      screen.getByRole('textbox', { name: /Amount of Parmesan/ }),
    );
    await user.type(
      screen.getByRole('textbox', { name: /Amount of Parmesan/ }),
      '200',
    );
    await typeNote(user, 'Grana Padano 200g');
    await user.click(
      screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    );

    const post = calls.find((call) => call.key === 'POST /api/pantry/batches');
    expect(post?.body).toEqual({
      ingredientId: 'parmesan-id',
      quantity: 200,
      unit: 'g',
      location: 'freezer',
      expiryDate: inDays(30),
      productDescription: 'Grana Padano 200g',
    });
    // The sheet stays open after a save; Done goes back to the list, with focus on the Add button.
    await user.click(await screen.findByRole('button', { name: 'Done' }));
    const addButton = await screen.findByRole('button', { name: 'Add batch' });
    expect(addButton).toHaveFocus();
  });

  it('offers the usual amounts for the Ingredient picked from the Catalog, scaled by its Amount Scale', async () => {
    mockChipRow();
    const user = userEvent.setup();
    stubPantry([], [{ ...parmesan, amountScale: 'large' }]);
    renderWithProviders(<PantryPage />);

    await user.click(await screen.findByRole('button', { name: 'Add batch' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'parm',
    );
    await user.click(await screen.findByRole('option', { name: /Parmesan/ }));
    await user.clear(
      screen.getByRole('textbox', { name: /Amount of Parmesan/ }),
    );
    await user.type(
      screen.getByRole('textbox', { name: /Amount of Parmesan/ }),
      '2',
    );

    expect(
      chipLabels(
        screen.getByRole('group', { name: 'Usual amounts for Parmesan' }),
      ),
    ).toEqual(['500 g', '1,000 g', '2,000 g', '5,000 g']);
  });

  it('takes a typed unit with the amount and offers no "no unit" option', async () => {
    const user = userEvent.setup();
    const calls = stubPantry([], [parmesan]);
    renderWithProviders(<PantryPage />);

    await user.click(await screen.findByRole('button', { name: 'Add batch' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'parm',
    );
    await user.click(await screen.findByRole('option', { name: /Parmesan/ }));
    const amount = screen.getByRole('textbox', { name: /Amount of Parmesan/ });
    await user.clear(amount);
    await user.type(amount, '1.5 kg');

    expect(amount).toHaveValue('1.5');
    await user.click(screen.getByRole('button', { name: 'Unit: kg' }));
    // Every unit is offered, and never "No unit": a Batch amount needs one.
    expect(
      within(screen.getByRole('menu', { name: 'Units' }))
        .getAllByRole('menuitemradio')
        .map((entry) => entry.textContent),
    ).toEqual(['g', 'kg', 'ml', 'L', 'pcs']);
    await user.keyboard('{Escape}');

    await user.type(amount, '{Enter}');
    await waitFor(() =>
      expect(
        calls.find((call) => call.key === 'POST /api/pantry/batches')?.body,
      ).toMatchObject({ quantity: 1.5, unit: 'kg' }),
    );
  });

  it('takes a decimal comma and a typed unit once the Ingredient is picked', async () => {
    const user = userEvent.setup();
    const calls = stubPantry([], [parmesan]);
    renderWithProviders(<PantryPage />);

    await user.click(await screen.findByRole('button', { name: 'Add batch' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'parm',
    );
    await user.click(await screen.findByRole('option', { name: /Parmesan/ }));
    await user.clear(
      screen.getByRole('textbox', { name: /Amount of Parmesan/ }),
    );
    await user.type(
      screen.getByRole('textbox', { name: /Amount of Parmesan/ }),
      '1,5 kg',
    );

    expect(
      screen.getByRole('button', { name: 'Unit: kg' }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    );
    await waitFor(() =>
      expect(
        calls.find((call) => call.key === 'POST /api/pantry/batches')?.body,
      ).toMatchObject({ quantity: 1.5, unit: 'kg' }),
    );
  });

  it('keeps the unit of a picked Ingredient when its name is edited after an amount', async () => {
    const user = userEvent.setup();
    const eggs: CatalogSearchResult = {
      ...parmesan,
      id: 'eggs-id',
      name: 'Eggs',
      defaultUnit: 'pcs',
      amountScale: 'medium',
    };
    const calls = stubPantry([], [eggs]);
    renderWithProviders(<PantryPage />);

    await user.click(await screen.findByRole('button', { name: 'Add batch' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'egg',
    );
    await user.click(await screen.findByRole('option', { name: /Eggs/ }));
    await user.clear(screen.getByRole('textbox', { name: /Amount of Eggs/ }));
    await user.type(
      screen.getByRole('textbox', { name: /Amount of Eggs/ }),
      '6',
    );
    await user.click(screen.getByRole('button', { name: 'Change ingredient' }));
    const search = screen.getByRole('combobox', { name: 'Search ingredients' });
    await user.type(search, 'Eggs x');
    await user.click(
      await screen.findByRole('option', { name: /Use “Eggs x” as typed/ }),
    );
    // The form is hidden while the name is edited; the unit it had still applies.
    expect(
      screen.getByRole('button', { name: 'Unit: pcs' }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    );
    await waitFor(() =>
      expect(
        calls.find((call) => call.key === 'POST /api/pantry/batches')?.body,
      ).toMatchObject({ rawName: 'Eggs x', quantity: 6, unit: 'pcs' }),
    );
  });

  it("takes the next Ingredient's own unit when the name is retyped after a pick", async () => {
    const user = userEvent.setup();
    const eggs: CatalogSearchResult = {
      ...parmesan,
      id: 'eggs-id',
      name: 'Eggs',
      defaultUnit: 'pcs',
      amountScale: 'medium',
    };
    const calls = stubPantry([], [eggs, parmesan]);
    renderWithProviders(<PantryPage />);

    await user.click(await screen.findByRole('button', { name: 'Add batch' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'egg',
    );
    await user.click(await screen.findByRole('option', { name: /Eggs/ }));
    await user.clear(screen.getByRole('textbox', { name: /Amount of Eggs/ }));
    await user.type(
      screen.getByRole('textbox', { name: /Amount of Eggs/ }),
      '6',
    );
    await user.click(screen.getByRole('button', { name: 'Change ingredient' }));
    const search = screen.getByRole('combobox', { name: 'Search ingredients' });
    await user.type(search, 'parm');
    await user.click(await screen.findByRole('option', { name: /Parmesan/ }));

    // The frozen pieces of Eggs do not carry over: Parmesan opens on its own grams.
    expect(screen.getByRole('button', { name: 'Unit: g' })).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    );
    await waitFor(() =>
      expect(
        calls.find((call) => call.key === 'POST /api/pantry/batches')?.body,
      ).toMatchObject({ ingredientId: 'parmesan-id', quantity: 6, unit: 'g' }),
    );
  });

  it('keeps a unit the Member chose from the chip when another Ingredient is picked', async () => {
    const user = userEvent.setup();
    const eggs: CatalogSearchResult = {
      ...parmesan,
      id: 'eggs-id',
      name: 'Eggs',
      defaultUnit: 'pcs',
      amountScale: 'medium',
    };
    const calls = stubPantry([], [parmesan, eggs]);
    renderWithProviders(<PantryPage />);

    await user.click(await screen.findByRole('button', { name: 'Add batch' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'parm',
    );
    await user.click(await screen.findByRole('option', { name: /Parmesan/ }));
    await user.clear(
      screen.getByRole('textbox', { name: /Amount of Parmesan/ }),
    );
    await user.type(
      screen.getByRole('textbox', { name: /Amount of Parmesan/ }),
      '2',
    );
    await user.click(screen.getByRole('button', { name: 'Unit: g' }));
    await user.click(
      within(screen.getByRole('menu', { name: 'Units' })).getByRole(
        'menuitemradio',
        { name: 'kg' },
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Change ingredient' }));
    const search = screen.getByRole('combobox', { name: 'Search ingredients' });
    await user.type(search, 'egg');
    await user.click(await screen.findByRole('option', { name: /Eggs/ }));

    expect(
      screen.getByRole('button', { name: 'Unit: kg' }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    );
    await waitFor(() =>
      expect(
        calls.find((call) => call.key === 'POST /api/pantry/batches')?.body,
      ).toMatchObject({ ingredientId: 'eggs-id', unit: 'kg' }),
    );
  });

  it('sets the unit from the chip, converting the amount to it', async () => {
    const user = userEvent.setup();
    const calls = stubPantry([], [parmesan]);
    renderWithProviders(<PantryPage />);

    await user.click(await screen.findByRole('button', { name: 'Add batch' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'parm',
    );
    await user.click(await screen.findByRole('option', { name: /Parmesan/ }));
    await user.clear(
      screen.getByRole('textbox', { name: /Amount of Parmesan/ }),
    );
    await user.type(
      screen.getByRole('textbox', { name: /Amount of Parmesan/ }),
      '2',
    );
    await user.click(screen.getByRole('button', { name: 'Unit: g' }));
    await user.click(
      within(screen.getByRole('menu', { name: 'Units' })).getByRole(
        'menuitemradio',
        { name: 'kg' },
      ),
    );
    expect(
      screen.getByRole('button', { name: 'Unit: kg' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    );
    // 2 g is the same amount as 0.002 kg, so the number is rescaled with the unit.
    await waitFor(() =>
      expect(
        calls.find((call) => call.key === 'POST /api/pantry/batches')?.body,
      ).toMatchObject({ quantity: 0.002, unit: 'kg' }),
    );
  });

  it('explains an invalid quantity and returns focus to Add after Close', async () => {
    const user = userEvent.setup();
    stubPantry([], [parmesan]);
    renderWithProviders(<PantryPage />);

    await user.click(await screen.findByRole('button', { name: 'Add batch' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'parm',
    );
    await user.click(await screen.findByRole('option', { name: /Parmesan/ }));
    const amount = screen.getByRole('textbox', {
      name: /Amount of Parmesan/,
    });
    // Half-typed amounts ("500 " on the way to "500 g") are not flagged while typing.
    await user.type(amount, '500 ');
    expect(amount).not.toHaveAttribute('aria-invalid');
    await user.clear(amount);
    await user.type(amount, '1.2345');
    expect(amount).not.toHaveAttribute('aria-invalid');
    // Out of the amount field (past its unit and Usual Amount chips).
    const fridge = within(locationToggle()).getByRole('button', {
      name: /^Fridge/,
    });
    await user.click(fridge);
    expect(fridge).toHaveFocus();
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByText(/from 0.001 to 1,000,000, with up to 3 decimals/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(
      await screen.findByRole('button', { name: 'Add batch' }),
    ).toHaveFocus();
  });

  it('saves a typed name with no Catalog match as an Unmatched Batch via Use as typed', async () => {
    const user = userEvent.setup();
    const calls = stubPantry([], []);
    renderWithProviders(<PantryPage />);

    await user.click(await screen.findByRole('button', { name: 'Add batch' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'Zorblax paste',
    );
    expect(
      screen.queryByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    ).toBeNull();

    const useTyped = await screen.findByRole('option', {
      name: /Use “Zorblax paste” as typed/,
    });
    expect(useTyped).toHaveTextContent(
      'Not in the catalog · saved as an unmatched item',
    );
    await user.click(useTyped);
    expect(
      screen.getByText(/saved as Unmatched and flagged/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    );

    const post = calls.find((call) => call.key === 'POST /api/pantry/batches');
    expect(post?.body).toEqual({
      rawName: 'Zorblax paste',
      location: 'cupboard',
      expiryDate: null,
      quantity: null,
      unit: null,
      productDescription: null,
    });
    expect(post?.body).not.toHaveProperty('ingredientId');
  });

  it('saves Use as typed from the keyboard when nothing matches', async () => {
    const user = userEvent.setup();
    const calls = stubPantry([], []);
    renderWithProviders(<PantryPage />);

    await user.click(await screen.findByRole('button', { name: 'Add batch' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'Zorblax paste',
    );
    await screen.findByRole('option', { name: /Use “Zorblax paste” as typed/ });
    // "Add to your catalog" is the first option when nothing matches (#270); Use as typed is second.
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await user.click(
      screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    );

    expect(
      calls.find((call) => call.key === 'POST /api/pantry/batches')?.body,
    ).toMatchObject({ rawName: 'Zorblax paste' });
  });

  describe('the Add batch form without the old Unmatched controls', () => {
    it('has no separate use-as-typed button and no "pick an ingredient" line', async () => {
      const user = userEvent.setup();
      stubPantry([], []);
      renderWithProviders(<PantryPage />);

      await user.click(
        await screen.findByRole('button', { name: 'Add batch' }),
      );
      expect(screen.queryByText(/Pick an ingredient/i)).toBeNull();

      await user.type(
        screen.getByRole('combobox', { name: 'Search ingredients' }),
        'Zorblax paste',
      );
      await screen.findByRole('option', {
        name: /Use “Zorblax paste” as typed/,
      });
      expect(
        screen.queryByRole('button', {
          name: /Add "Zorblax paste" as Unmatched/,
        }),
      ).toBeNull();
      expect(screen.queryByText(/Pick an ingredient/i)).toBeNull();
    });

    it('shows the fields only once something is picked or typed', async () => {
      const user = userEvent.setup();
      stubPantry([], [parmesan]);
      renderWithProviders(<PantryPage />);
      await user.click(
        await screen.findByRole('button', { name: 'Add batch' }),
      );
      const fieldsShown = () => ({
        amount: screen.queryByRole('textbox', { name: /^Amount/ }),
        location: screen.queryByRole('group', { name: 'Location' }),
        expires: screen.queryByRole('group', { name: 'Expires' }),
        description: screen.queryByLabelText('Note · optional'),
      });

      expect(fieldsShown()).toEqual({
        amount: null,
        location: null,
        expires: null,
        description: null,
      });
      expect(screen.getByRole('button', { name: 'Close' })).toBeVisible();
      // The footer button waits for a pick; there is no Cancel.
      expect(
        screen.queryByRole('button', { name: /^Add (?!.*to your catalog)/ }),
      ).toBeNull();
      expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

      await user.type(
        screen.getByRole('combobox', { name: 'Search ingredients' }),
        'parm',
      );
      await user.click(await screen.findByRole('option', { name: /Parmesan/ }));
      expect(fieldsShown().amount).toBeVisible();
      expect(fieldsShown().location).toBeVisible();
      expect(fieldsShown().expires).toBeVisible();
      // The note is folded for a typed pick.
      expect(fieldsShown().description).toBeNull();
      expect(screen.getByRole('button', { name: /Add a note/ })).toBeVisible();
    });

    it('shows the fields after Use as typed', async () => {
      const user = userEvent.setup();
      stubPantry([], []);
      renderWithProviders(<PantryPage />);
      await user.click(
        await screen.findByRole('button', { name: 'Add batch' }),
      );
      await user.type(
        screen.getByRole('combobox', { name: 'Search ingredients' }),
        'Zorblax paste',
      );
      await user.click(
        await screen.findByRole('option', {
          name: /Use “Zorblax paste” as typed/,
        }),
      );

      expect(
        screen.getByRole('textbox', { name: /Amount of Zorblax paste/ }),
      ).toBeVisible();
      expect(locationToggle()).toBeVisible();
      expect(screen.getByRole('button', { name: /Add a note/ })).toBeVisible();
    });
  });

  describe('the expiry picker in Add batch', () => {
    // Wednesday 14 October 2026, mid-afternoon. Only `Date` is faked, so timers and transitions run as usual.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 14, 15, 30));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    /** Open Add batch and pick Parmesan (Default Expiry 30 days, Fridge). */
    async function addParmesan(user: ReturnType<typeof userEvent.setup>) {
      const calls = stubPantry([], [parmesan]);
      renderWithProviders(<PantryPage />);
      await user.click(
        await screen.findByRole('button', { name: 'Add batch' }),
      );
      await user.type(
        screen.getByRole('combobox', { name: 'Search ingredients' }),
        'parm',
      );
      await user.click(await screen.findByRole('option', { name: /Parmesan/ }));
      return calls;
    }

    async function save(
      user: ReturnType<typeof userEvent.setup>,
      calls: ReturnType<typeof stubPantry>,
    ) {
      await user.click(
        screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
      );
      await waitFor(() =>
        expect(
          calls.find((call) => call.key === 'POST /api/pantry/batches'),
        ).toBeDefined(),
      );
      return calls.find((call) => call.key === 'POST /api/pantry/batches')
        ?.body as { expiryDate: string | null };
    }

    it('shows the Default Expiry as the selected Usual chip, with the resolved date under the chips', async () => {
      const user = userEvent.setup();
      await addParmesan(user);

      const chips = screen.getByRole('group', { name: 'Expires' });
      expect(
        within(chips).getByRole('button', { name: 'Usual · 1 mo' }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(
        within(chips).getByRole('button', { name: 'Calendar' }),
      ).toHaveAttribute('aria-haspopup', 'dialog');
      expect(screen.getByText(/Fri, Nov 13 · in 30 days/)).toHaveTextContent(
        'Fri, Nov 13 · in 30 days · usual for Parmesan',
      );
    });

    it("opens a sheet titled with the form's context, and a tapped day is saved as that ISO date", async () => {
      const user = userEvent.setup();
      const calls = await addParmesan(user);
      await user.clear(
        screen.getByRole('textbox', { name: /Amount of Parmesan/ }),
      );
      await user.type(
        screen.getByRole('textbox', { name: /Amount of Parmesan/ }),
        '200',
      );

      await user.click(screen.getByRole('button', { name: 'Calendar' }));
      const sheet = await screen.findByRole('dialog', { name: 'Expires' });
      expect(
        within(sheet).getByRole('heading', { name: 'Expires' }),
      ).toBeInTheDocument();
      expect(sheet).toHaveTextContent('Parmesan · 200 g · Fridge');
      expect(within(sheet).getByRole('status')).toHaveTextContent(
        'Fri, Nov 13in 30 days30 d',
      );

      await user.click(calendarDay(sheet, 'Friday, November 20, 2026'));
      expect(within(sheet).getByRole('status')).toHaveTextContent(
        'Fri, Nov 20in 37 days37 d',
      );
      expect(calendarDay(sheet, 'Friday, November 20, 2026')).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      await user.click(sheetButton(sheet, 'Done'));
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Expires' }),
        ).not.toBeInTheDocument(),
      );
      expect(
        screen.getByText(/Fri, Nov 20 · in 37 days/),
      ).not.toHaveTextContent('usual for');
      expect(screen.getByRole('button', { name: /^Calendar/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      expect((await save(user, calls)).expiryDate).toBe('2026-11-20');
    });

    it('clears the pre-filled expiry when the name is marked Unmatched', async () => {
      const user = userEvent.setup();
      const calls = await addParmesan(user);
      const search = screen.getByRole('combobox', {
        name: 'Ingredient: Parmesan. Press Backspace to change',
      });
      await user.clear(search);
      await user.type(search, 'Parmigiano');
      await user.click(
        await screen.findByRole('option', {
          name: /Use “Parmigiano” as typed/,
        }),
      );

      expect(screen.getByText('No expiry date')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'No date' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect((await save(user, calls)).expiryDate).toBeNull();
    });

    /**
     * The sheet focuses a tile once its open transition ends, which can take a while on a busy machine. The tile is
     * looked up once: polling a role query here would slow the very transition it waits for.
     */
    const focusLandsOn = (element: HTMLElement) =>
      waitFor(() => expect(element).toHaveFocus(), { timeout: 5000 });

    async function openSheet(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: /^Calendar/ }));
      return screen.findByRole('dialog', { name: 'Expires' });
    }

    it('lets a past day be picked, and the readout tag follows expiryTagFor', async () => {
      const user = userEvent.setup();
      const calls = await addParmesan(user);
      const sheet = await openSheet(user);
      const readout = within(sheet).getByRole('status');
      const pick = (name: string) => user.click(calendarDay(sheet, name));

      // Stale Threshold 3: Today, Tomorrow, "N d left" up to 3, then "N d".
      await pick('Wednesday, October 14, 2026');
      expect(readout).toHaveTextContent('Wed, Oct 14todayToday');
      await pick('Thursday, October 15, 2026');
      expect(readout).toHaveTextContent('Thu, Oct 15tomorrowTomorrow');
      await pick('Saturday, October 17, 2026');
      expect(readout).toHaveTextContent('Sat, Oct 17in 3 days3 d left');
      await pick('Sunday, October 18, 2026');
      expect(readout).toHaveTextContent('Sun, Oct 18in 4 days4 d');
      await pick('Thursday, September 24, 2026');
      expect(readout).toHaveTextContent('Thu, Sep 2420 days agoExpired');

      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Expires' }),
        ).not.toBeInTheDocument(),
      );
      expect((await save(user, calls)).expiryDate).toBe('2026-09-24');
    });

    it('"No expiry" saves null, and the scrim keeps the choice', async () => {
      const user = userEvent.setup();
      const calls = await addParmesan(user);
      const sheet = await openSheet(user);
      const noExpiry = sheetButton(sheet, 'No expiry');
      expect(noExpiry).toHaveAttribute('aria-pressed', 'false');

      await user.click(noExpiry);
      expect(noExpiry).toHaveAttribute('aria-pressed', 'true');
      expect(within(sheet).getByRole('status')).toHaveTextContent(
        'No expiry dateNo expiry',
      );

      await user.click(
        [...document.querySelectorAll('.MuiBackdrop-root')].at(-1) as Element,
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Expires' }),
        ).not.toBeInTheDocument(),
      );
      expect(screen.getByText('No expiry date')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'No date' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect((await save(user, calls)).expiryDate).toBeNull();
    });

    /** The quick-pick tiles, as "accessible name: pressed". */
    const quickPicks = (sheet: HTMLElement) =>
      quickPickTiles(sheet).map(
        (tile) =>
          `${tile.getAttribute('aria-label')}: ${tile.getAttribute('aria-pressed')}`,
      );

    it('shows the pre-filled Default Expiry as the Usual quick pick, selected, ahead of 3 d to 1 mo', async () => {
      const user = userEvent.setup();
      await addParmesan(user);
      const sheet = await openSheet(user);

      // Parmesan's Default Expiry is 30 days, the same as 1 mo: only Usual lights up.
      expect(quickPicks(sheet)).toEqual([
        'Usual, 30 days, Friday, November 13: true',
        '3 days, Saturday, October 17: false',
        '5 days, Monday, October 19: false',
        '1 week, Wednesday, October 21: false',
        '2 weeks, Wednesday, October 28: false',
        '1 month, Friday, November 13: false',
      ]);
      const usual = quickPick(sheet, /^Usual/);
      expect(usual).toHaveTextContent('30d');
      expect(usual).toHaveTextContent('Usual · Nov 13');
      const week = quickPick(sheet, /^1 week/);
      expect(week).toHaveTextContent('1wk');
      expect(week).toHaveTextContent('Oct 21');
    });

    it('saves today + n for each quick pick (1 mo is 30 days) and scrolls the calendar smoothly to its month', async () => {
      const scrolling = trackScrolling();
      const user = userEvent.setup();
      const calls = await addParmesan(user);
      const sheet = await openSheet(user);
      const calendar = within(sheet).getByRole('group', { name: 'Calendar' });
      const readout = within(sheet).getByRole('status');
      const shown = () => {
        const last = scrolling.scrolledTo(calendar);
        return [last?.child?.querySelector('h3')?.textContent, last?.behavior];
      };

      await user.click(quickPick(sheet, /^3 days,/));
      expect(readout).toHaveTextContent('Sat, Oct 17in 3 days');
      expect(shown()).toEqual(['October 2026', 'smooth']);
      await user.click(quickPick(sheet, /^5 days,/));
      expect(readout).toHaveTextContent('Mon, Oct 19in 5 days');
      await user.click(quickPick(sheet, /^1 week,/));
      expect(readout).toHaveTextContent('Wed, Oct 21in 7 days');
      await user.click(quickPick(sheet, /^1 month,/));
      expect(readout).toHaveTextContent('Fri, Nov 13in 30 days');
      expect(shown()).toEqual(['November 2026', 'smooth']);
      await user.click(quickPick(sheet, /^2 weeks,/));
      expect(readout).toHaveTextContent('Wed, Oct 28in 14 days');
      expect(shown()).toEqual(['October 2026', 'smooth']);
      expect(quickPick(sheet, /^2 weeks,/)).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(quickPick(sheet, /^Usual,/)).toHaveAttribute(
        'aria-pressed',
        'false',
      );

      await user.click(sheetButton(sheet, 'Done'));
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Expires' }),
        ).not.toBeInTheDocument(),
      );
      expect((await save(user, calls)).expiryDate).toBe('2026-10-28');
    });

    it('leaves every quick pick unselected for a calendar day that matches none', async () => {
      const user = userEvent.setup();
      await addParmesan(user);
      const sheet = await openSheet(user);

      await user.click(calendarDay(sheet, 'Thursday, October 22, 2026'));
      expect(quickPicks(sheet).every((tile) => tile.endsWith(': false'))).toBe(
        true,
      );
      // A calendar day 3 days out does light up 3 d.
      await user.click(calendarDay(sheet, 'Saturday, October 17, 2026'));
      expect(quickPick(sheet, /^3 days,/)).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('has no Usual tile for an Unmatched name', async () => {
      const user = userEvent.setup();
      await addParmesan(user);
      const search = screen.getByRole('combobox', {
        name: 'Ingredient: Parmesan. Press Backspace to change',
      });
      await user.clear(search);
      await user.type(search, 'Parmigiano');
      await user.click(
        await screen.findByRole('option', {
          name: /Use “Parmigiano” as typed/,
        }),
      );
      const sheet = await openSheet(user);

      expect(quickPicks(sheet)).toEqual([
        '3 days, Saturday, October 17: false',
        '5 days, Monday, October 19: false',
        '1 week, Wednesday, October 21: false',
        '2 weeks, Wednesday, October 28: false',
        '1 month, Friday, November 13: false',
      ]);
    });

    it('has no Usual tile for an Ingredient without a Default Expiry', async () => {
      const user = userEvent.setup();
      stubPantry(
        [],
        [
          {
            ...parmesan,
            id: 'salt-id',
            name: 'Salt',
            defaults: { expiryDays: null, location: 'spices' },
          },
        ],
      );
      renderWithProviders(<PantryPage />);
      await user.click(
        await screen.findByRole('button', { name: 'Add batch' }),
      );
      await user.type(
        screen.getByRole('combobox', { name: 'Search ingredients' }),
        'salt',
      );
      await user.click(await screen.findByRole('option', { name: /Salt/ }));
      const sheet = await openSheet(user);

      expect(
        within(
          within(sheet).getByRole('group', { name: 'Quick picks' }),
        ).queryByRole('button', { name: /^Usual/ }),
      ).not.toBeInTheDocument();
      expect(quickPicks(sheet)).toHaveLength(5);
    });

    it('jumps to the quick pick month instantly under reduced motion', async () => {
      stubMotion(true);
      const scrolling = trackScrolling();
      const user = userEvent.setup();
      await addParmesan(user);
      const sheet = await openSheet(user);
      const calendar = within(sheet).getByRole('group', { name: 'Calendar' });

      await user.click(quickPick(sheet, /^3 days,/));
      const last = scrolling.scrolledTo(calendar);
      expect(last?.child?.querySelector('h3')).toHaveTextContent(
        'October 2026',
      );
      expect(last?.behavior).toBe('auto');
    });

    it('renders 14 Monday-first months, marks today, and tints today + Stale Threshold as the Expiring Soon band', async () => {
      const user = userEvent.setup();
      await addParmesan(user);
      const sheet = await openSheet(user);
      const calendar = within(sheet).getByRole('group', { name: 'Calendar' });

      expect(
        within(calendar)
          .getAllByRole('heading')
          .map((heading) => heading.textContent),
      ).toEqual([
        'September 2026',
        'October 2026',
        'November 2026',
        'December 2026',
        'January 2027',
        'February 2027',
        'March 2027',
        'April 2027',
        'May 2027',
        'June 2027',
        'July 2027',
        'August 2027',
        'September 2027',
        'October 2027',
      ]);

      // 1 October 2026 is a Thursday: three blank cells, then the 1st.
      const october = within(calendar).getByRole('grid', {
        name: 'October 2026',
      });
      const [firstWeek] = within(october).getAllByRole('row');
      expect(
        within(firstWeek)
          .getAllByRole('gridcell')
          .map((cell) => cell.textContent),
      ).toEqual(['', '', '', '1', '2', '3', '4']);
      expect(
        within(firstWeek).getByRole('button', { name: /^Thursday/ }),
      ).toHaveTextContent('1');

      expect(
        within(calendar).getByRole('button', { current: 'date' }),
      ).toHaveAccessibleName('Wednesday, October 14, 2026');

      // Stale Threshold 3: today through 17 October, four days.
      const band = calendarDays(sheet).filter((day) =>
        day.hasAttribute('aria-describedby'),
      );
      expect(band.map((day) => day.textContent)).toEqual([
        '14',
        '15',
        '16',
        '17',
      ]);
      for (const day of band)
        expect(day).toHaveAccessibleDescription('Within 3 days');
    });

    it("opens straight on the value's month (today's when empty) and stays put when a day is tapped", async () => {
      const scrolling = trackScrolling();
      const user = userEvent.setup();
      await addParmesan(user);
      const monthShown = (sheet: HTMLElement) => {
        const calendar = within(sheet).getByRole('group', { name: 'Calendar' });
        const shown = scrolling.scrolledTo(calendar);
        return [
          shown?.child?.querySelector('h3')?.textContent,
          shown?.behavior,
          scrolling.scrollsOf(calendar).length,
        ];
      };

      let sheet = await openSheet(user);
      expect(monthShown(sheet)).toEqual(['November 2026', 'auto', 1]);

      await user.click(calendarDay(sheet, 'Wednesday, December 2, 2026'));
      expect(monthShown(sheet)).toEqual(['November 2026', 'auto', 1]);

      await user.click(sheetButton(sheet, 'Done'));
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Expires' }),
        ).not.toBeInTheDocument(),
      );
      sheet = await openSheet(user);
      expect(monthShown(sheet)).toEqual(['December 2026', 'auto', 1]);

      await user.click(sheetButton(sheet, 'No expiry'));
      await user.click(sheetButton(sheet, 'Done'));
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Expires' }),
        ).not.toBeInTheDocument(),
      );
      sheet = await openSheet(user);
      expect(monthShown(sheet)).toEqual(['October 2026', 'auto', 1]);
    });

    it('brings this month back into view from "Today", smoothly unless motion is reduced', async () => {
      const scrolling = trackScrolling();
      const user = userEvent.setup();
      await addParmesan(user);
      const sheet = await openSheet(user);
      const calendar = within(sheet).getByRole('group', { name: 'Calendar' });
      const shown = () => {
        const last = scrolling.scrolledTo(calendar);
        return [last?.child?.querySelector('h3')?.textContent, last?.behavior];
      };
      // The sheet opens on November, the month of Parmesan's Default Expiry.
      expect(shown()).toEqual(['November 2026', 'auto']);

      await user.click(sheetButton(sheet, 'Today'));
      expect(shown()).toEqual(['October 2026', 'smooth']);
      // Today only scrolls; the value is unchanged.
      expect(within(sheet).getByRole('status')).toHaveTextContent(
        'Fri, Nov 13in 30 days',
      );
    });

    it('extends the calendar to a value 18 months out, opens on its month, and lets it be re-selected', async () => {
      const scrolling = trackScrolling();
      const user = userEvent.setup();
      // A tin keeps for 548 days, so the pre-filled expiry is 14 April 2028.
      const calls = stubPantry(
        [],
        [
          {
            ...parmesan,
            id: 'tomatoes-id',
            name: 'Chopped tomatoes',
            defaults: { expiryDays: 548, location: 'cupboard' },
          },
        ],
      );
      renderWithProviders(<PantryPage />);
      await user.click(
        await screen.findByRole('button', { name: 'Add batch' }),
      );
      await user.type(
        screen.getByRole('combobox', { name: 'Search ingredients' }),
        'tomat',
      );
      await user.click(
        await screen.findByRole('option', { name: /Chopped tomatoes/ }),
      );
      const sheet = await openSheet(user);
      const calendar = within(sheet).getByRole('group', { name: 'Calendar' });
      const headings = within(calendar)
        .getAllByRole('heading')
        .map((heading) => heading.textContent);

      expect(headings).toHaveLength(20);
      expect(headings[0]).toBe('September 2026');
      expect(headings.at(-1)).toBe('April 2028');
      expect(
        scrolling.scrolledTo(calendar)?.child?.querySelector('h3'),
      ).toHaveTextContent('April 2028');
      const day = calendarDay(sheet, 'Friday, April 14, 2028');
      expect(day).toHaveAttribute('aria-pressed', 'true');

      // Move away with a quick pick, then pick the far day again.
      await user.click(quickPick(sheet, /^3 days,/));
      expect(day).toHaveAttribute('aria-pressed', 'false');
      await user.click(day);
      expect(day).toHaveAttribute('aria-pressed', 'true');
      expect(within(sheet).getByRole('status')).toHaveTextContent(
        'Fri, Apr 14, 2028',
      );

      await user.click(sheetButton(sheet, 'Done'));
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Expires' }),
        ).not.toBeInTheDocument(),
      );
      expect((await save(user, calls)).expiryDate).toBe('2028-04-14');
    });

    it('renders the Usual date even when the sheet opened without a value, so tapping Usual shows it selected', async () => {
      const user = userEvent.setup();
      stubPantry(
        [],
        [
          {
            ...parmesan,
            id: 'tomatoes-id',
            name: 'Chopped tomatoes',
            defaults: { expiryDays: 548, location: 'cupboard' },
          },
        ],
      );
      renderWithProviders(<PantryPage />);
      await user.click(
        await screen.findByRole('button', { name: 'Add batch' }),
      );
      await user.type(
        screen.getByRole('combobox', { name: 'Search ingredients' }),
        'tomat',
      );
      await user.click(
        await screen.findByRole('option', { name: /Chopped tomatoes/ }),
      );
      let sheet = await openSheet(user);
      await user.click(sheetButton(sheet, 'No expiry'));
      await user.click(sheetButton(sheet, 'Done'));
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Expires' }),
        ).not.toBeInTheDocument(),
      );

      sheet = await openSheet(user);
      await user.click(quickPick(sheet, /^Usual,/));
      expect(calendarDay(sheet, 'Friday, April 14, 2028')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('focuses the selected quick pick on open (the first when none is selected) and returns focus to the summary row on close', async () => {
      const user = userEvent.setup();
      await addParmesan(user);

      let sheet = await openSheet(user);
      await focusLandsOn(quickPick(sheet, /^Usual,/));
      await user.click(quickPick(sheet, /^2 weeks,/));
      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Expires' }),
        ).not.toBeInTheDocument(),
      );
      expect(screen.getByRole('button', { name: 'Calendar' })).toHaveFocus();

      sheet = await openSheet(user);
      await focusLandsOn(quickPick(sheet, /^2 weeks,/));
      // A day that matches no quick pick: focus goes to the first tile next time.
      await user.click(calendarDay(sheet, 'Thursday, October 22, 2026'));
      await user.click(sheetButton(sheet, 'Done'));
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Expires' }),
        ).not.toBeInTheDocument(),
      );
      expect(screen.getByRole('button', { name: /^Calendar/ })).toHaveFocus();

      sheet = await openSheet(user);
      await focusLandsOn(quickPick(sheet, /^Usual,/));
    });

    it('returns focus to the summary row when the sheet was opened without focusing it', async () => {
      const user = userEvent.setup();
      await addParmesan(user);
      const row = screen.getByRole('button', { name: 'Calendar' });
      // A touch tap on some browsers (Safari) doesn't focus the button it opens from.
      fireEvent.click(row);
      const sheet = await screen.findByRole('dialog', { name: 'Expires' });
      await user.click(sheetButton(sheet, 'Done'));
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Expires' }),
        ).not.toBeInTheDocument(),
      );
      expect(row).toHaveFocus();
    });

    it('moves between days with the arrow keys within a month, and by a month with Page Up/Down', async () => {
      const user = userEvent.setup();
      const calls = await addParmesan(user);
      const sheet = await openSheet(user);
      const focused = () => document.activeElement?.getAttribute('aria-label');

      // The calendar is one Tab stop, on the selected day.
      await focusLandsOn(quickPick(sheet, /^Usual,/));
      act(() => quickPick(sheet, /^1 month,/).focus());
      await user.tab();
      expect(focused()).toBe('Friday, November 13, 2026');
      await user.tab();
      expect(sheetButton(sheet, 'Today')).toHaveFocus();
      await user.tab({ shift: true });
      expect(focused()).toBe('Friday, November 13, 2026');

      await user.keyboard('{ArrowRight}');
      expect(focused()).toBe('Saturday, November 14, 2026');
      await user.keyboard('{ArrowDown}');
      expect(focused()).toBe('Saturday, November 21, 2026');
      await user.keyboard('{ArrowLeft}');
      expect(focused()).toBe('Friday, November 20, 2026');
      await user.keyboard('{ArrowUp}');
      expect(focused()).toBe('Friday, November 13, 2026');
      await user.keyboard('{PageDown}');
      expect(focused()).toBe('Sunday, December 13, 2026');
      await user.keyboard('{PageUp}{PageUp}');
      expect(focused()).toBe('Tuesday, October 13, 2026');

      // Arrows stay within the month.
      await user.keyboard('{ArrowUp}{ArrowUp}');
      expect(focused()).toBe('Tuesday, October 6, 2026');
      await user.keyboard('{ArrowLeft>6/}');
      expect(focused()).toBe('Thursday, October 1, 2026');
      // Page Down lands on the same day, or the month's last day when it is shorter.
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
      expect(focused()).toBe('Thursday, October 29, 2026');
      await user.keyboard('{ArrowRight}{ArrowRight}{ArrowDown}');
      expect(focused()).toBe('Saturday, October 31, 2026');
      await user.keyboard('{PageDown}');
      expect(focused()).toBe('Monday, November 30, 2026');

      // Focus alone doesn't pick; Enter does.
      expect(within(sheet).getByRole('status')).toHaveTextContent(
        'Fri, Nov 13',
      );
      await user.keyboard('{Enter}');
      expect(within(sheet).getByRole('status')).toHaveTextContent(
        'Mon, Nov 30',
      );
      await user.click(sheetButton(sheet, 'Done'));
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Expires' }),
        ).not.toBeInTheDocument(),
      );
      expect((await save(user, calls)).expiryDate).toBe('2026-11-30');
    });

    it('does not read the dashed "No expiry" tag after "No expiry date" in the readout', async () => {
      const user = userEvent.setup();
      await addParmesan(user);
      const sheet = await openSheet(user);
      await user.click(sheetButton(sheet, 'No expiry'));

      const readout = within(sheet).getByRole('status');
      expect(readout).toHaveTextContent('No expiry date');
      expect(within(readout).getByText('No expiry')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
    });

    it('keeps the calendar tab stop on the day last focused, and Home/End go to the start and end of the week within the month', async () => {
      const user = userEvent.setup();
      await addParmesan(user);
      const sheet = await openSheet(user);
      const focused = () => document.activeElement?.getAttribute('aria-label');
      await focusLandsOn(quickPick(sheet, /^Usual,/));
      act(() => quickPick(sheet, /^1 month,/).focus());
      await user.tab();
      expect(focused()).toBe('Friday, November 13, 2026');

      await user.keyboard('{ArrowRight}');
      await user.tab();
      expect(sheetButton(sheet, 'Today')).toHaveFocus();
      await user.tab({ shift: true });
      expect(focused()).toBe('Saturday, November 14, 2026');

      // Weeks run Monday to Sunday.
      await user.keyboard('{Home}');
      expect(focused()).toBe('Monday, November 9, 2026');
      await user.keyboard('{End}');
      expect(focused()).toBe('Sunday, November 15, 2026');

      // The first and last weeks of a month are cut at the month's edge.
      await user.keyboard('{PageUp}{ArrowLeft>14/}');
      expect(focused()).toBe('Thursday, October 1, 2026');
      await user.keyboard('{Home}');
      expect(focused()).toBe('Thursday, October 1, 2026');
      await user.keyboard('{ArrowRight>30/}');
      expect(focused()).toBe('Saturday, October 31, 2026');
      await user.keyboard('{End}');
      expect(focused()).toBe('Saturday, October 31, 2026');
    });

    it('labels each day with its full date in the UI locale, and reports only the selected day as pressed', async () => {
      const user = userEvent.setup();
      stubPantry([], [parmesan]);
      const { i18n } = renderWithProviders(<PantryPage />);
      await user.click(
        await screen.findByRole('button', { name: 'Add batch' }),
      );
      await user.type(
        screen.getByRole('combobox', { name: 'Search ingredients' }),
        'parm',
      );
      await user.click(await screen.findByRole('option', { name: /Parmesan/ }));
      const sheet = await openSheet(user);

      const pressed = calendarDays(sheet).filter(
        (day) => day.getAttribute('aria-pressed') === 'true',
      );
      expect(pressed.map((day) => day.getAttribute('aria-label'))).toEqual([
        'Friday, November 13, 2026',
      ]);

      await act(() => i18n.changeLanguage('ro'));
      expect(
        calendarDay(sheet, 'vineri, 13 noiembrie 2026', 'noiembrie 2026'),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(
        calendarDay(sheet, 'sâmbătă, 14 noiembrie 2026', 'noiembrie 2026'),
      ).toHaveAttribute('aria-pressed', 'false');
    });

    it('jumps back to this month from "Today" under reduced motion', async () => {
      stubMotion(true);
      const scrolling = trackScrolling();
      const user = userEvent.setup();
      await addParmesan(user);
      const sheet = await openSheet(user);
      const calendar = within(sheet).getByRole('group', { name: 'Calendar' });

      await user.click(sheetButton(sheet, 'Today'));
      const last = scrolling.scrolledTo(calendar);
      expect(last?.child?.querySelector('h3')).toHaveTextContent(
        'October 2026',
      );
      expect(last?.behavior).toBe('auto');
    });
  });

  describe('managing the Pantry', () => {
    it("opens a Batch with no stored unit on its Ingredient's unit", async () => {
      const user = userEvent.setup();
      stubManaged([
        batch({
          id: 'eggs-1',
          name: 'Eggs',
          ingredientId: 'eggs-id',
          defaultUnit: 'pcs',
          amountScale: 'medium',
          quantity: null,
          unit: null,
          expiryDate: inDays(5),
        }),
      ]);
      renderWithProviders(<PantryPage />);

      await user.click(await screen.findByRole('button', { name: /^Eggs/ }));
      await openEditor(user, batchRows('Eggs')[0]);
      const form = screen.getByRole('form', { name: 'Edit Eggs batch' });

      expect(
        within(form).getByRole('button', { name: 'Unit: pcs' }),
      ).toBeInTheDocument();
    });

    const stock = () => [
      batch({
        id: 'milk-1',
        name: 'Milk',
        quantity: 1,
        unit: 'l',
        expiryDate: inDays(5),
      }),
      batch({
        id: 'milk-2',
        name: 'Milk',
        quantity: 0.5,
        unit: 'l',
        productDescription: 'Opened',
        expiryDate: inDays(2),
      }),
      batch({
        id: 'cheese',
        name: 'Parmesan',
        ingredientId: 'parmesan-id',
        location: 'freezer',
        productDescription: 'Grana Padano 200g',
        expiryDate: inDays(40),
      }),
      batch({
        id: 'rice',
        name: 'Rice',
        ingredientId: 'rice-id',
        location: 'cupboard',
      }),
    ];

    /** The Batch rows of an expanded roll-up, in order. */
    const batchRows = (name = 'Milk') =>
      within(
        screen.getByRole('group', { name: new RegExp(`^${name}, \\d+ batch`) }),
      ).getAllByRole('group');
    /** The keyboard path to the editor sheet: focus the row, press Enter. */
    async function openEditor(
      user: ReturnType<typeof userEvent.setup>,
      row = batchRows()[0],
    ) {
      act(() => row.focus());
      await user.keyboard('{Enter}');
      return screen.findByRole('form', { name: /^Edit .* batch$/ });
    }
    /** The keyboard path to removing: focus the row, Delete, then the Remove button. */
    async function removeBatch(
      user: ReturnType<typeof userEvent.setup>,
      row = batchRows()[0],
    ) {
      act(() => row.focus());
      await user.keyboard('{Delete}');
      await user.click(screen.getByRole('button', { name: 'Remove' }));
    }

    function stubManaged(initial: Batch[], { failDeletes = false } = {}) {
      let batches = initial;
      const remove = (id: string) => () => {
        if (failDeletes) {
          return Response.json(
            { code: 'unknown', params: {} },
            { status: 500 },
          );
        }
        batches = batches.filter((b) => b.id !== id);
        return new Response(null, { status: 204 });
      };
      const { fetchMock, calls } = stubApi({
        'GET /api/pantry': () => Response.json({ batches }),
        'GET /api/settings/family': familySettings(3),
        'PATCH /api/pantry/batches/milk-2': () => Response.json(batches[1]),
        'DELETE /api/pantry/batches/milk-2': remove('milk-2'),
        'DELETE /api/pantry/batches/cheese': remove('cheese'),
      });
      vi.stubGlobal('fetch', fetchMock);
      return calls;
    }

    it('rolls Batches of one Ingredient into a row with the total and soonest expiry', async () => {
      stubManaged(stock());
      renderWithProviders(<PantryPage />);

      const fridge = await screen.findByRole('region', { name: 'Fridge · 2' });
      const [row] = within(fridge).getAllByRole('listitem');
      expect(row.textContent).toBe(
        'Milk' + '1.5 L · 2 batches' + '2 d left' + '2 days left',
      );
    });

    describe('the action row', () => {
      const milkStaple = {
        id: 'staple-1',
        ingredientId: 'milk-id',
        name: 'Milk',
        quantity: null,
        unit: null,
        aisle: null,
      };

      /**
       * Staples and Running-low flags follow the requests, as the API does. `gate` holds every save
       * open; `failSaves` refuses them.
       */
      function stubActions({
        gate,
        failSaves = false,
        staplesAtStart = [],
        flaggedAtStart = [],
        batches = [
          batch({ name: 'Milk', quantity: 1, unit: 'l' }),
          batch({
            name: 'Zorblax paste',
            unmatched: true,
            ingredientId: null,
            location: 'cupboard',
          }),
        ],
      }: {
        gate?: Promise<void>;
        failSaves?: boolean;
        staplesAtStart?: (typeof milkStaple)[];
        flaggedAtStart?: string[];
        batches?: Batch[];
      } = {}) {
        let staples = staplesAtStart;
        const flagged = new Set<string>(flaggedAtStart);
        const refused = () =>
          Response.json({ code: 'errors.unknown' }, { status: 500 });
        const { fetchMock, calls } = stubApi({
          'GET /api/pantry': () =>
            Response.json({ batches, runningLow: [...flagged] }),
          'GET /api/staples': () => Response.json({ staples }),
          'POST /api/staples': async () => {
            await gate;
            if (failSaves) return refused();
            staples = [...staples, milkStaple];
            return Response.json(milkStaple, { status: 201 });
          },
          'DELETE /api/staples/staple-1': async () => {
            await gate;
            if (failSaves) return refused();
            staples = staples.filter((s) => s.id !== 'staple-1');
            return new Response(null, { status: 204 });
          },
          'PUT /api/pantry/running-low/milk-id': async () => {
            await gate;
            if (failSaves) return refused();
            flagged.add('milk-id');
            return new Response(null, { status: 204 });
          },
          'DELETE /api/pantry/running-low/milk-id': async () => {
            await gate;
            if (failSaves) return refused();
            flagged.delete('milk-id');
            return new Response(null, { status: 204 });
          },
        });
        vi.stubGlobal('fetch', fetchMock);
        return calls;
      }

      function gated() {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        return { gate, release };
      }

      /** The chip is named by its label: "Make Staple", or "Staple" while pressed. */
      const stapleChip = () =>
        screen.queryByRole('button', { name: /^(Make )?Staple$/ });
      const lowChip = () =>
        screen.queryByRole('button', { name: 'Running low' });
      /** The Running low marker on the Ingredient row itself. */
      const lowMarker = (name = 'Milk') =>
        within(
          screen.getByRole('button', { name: new RegExp(`^${name}`) }),
        ).queryByText('Running low', { ignore: '[aria-hidden] *' });

      async function openMilk(user: ReturnType<typeof userEvent.setup>) {
        await user.click(await screen.findByRole('button', { name: /^Milk/ }));
      }

      it('ends the open card of a matched Ingredient with the Staple and Running low chips', async () => {
        const user = userEvent.setup();
        stubActions();
        renderWithProviders(<PantryPage />);

        await screen.findByRole('button', { name: /^Milk/ });
        expect(stapleChip()).not.toBeInTheDocument();
        expect(lowChip()).not.toBeInTheDocument();
        await openMilk(user);

        const staple = stapleChip()!;
        const low = lowChip()!;
        expect(staple).toHaveTextContent(/^Make Staple$/);
        expect(staple).toHaveAttribute('aria-pressed', 'false');
        expect(low).toHaveTextContent(/^Running low$/);
        expect(low).toHaveAttribute('aria-pressed', 'false');
        // After the Batches, Staple first.
        const [lastBatch] = batchRows().slice(-1);
        expect(
          lastBatch.compareDocumentPosition(staple) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(staple.nextElementSibling).toBe(low);
        // The header has neither the old star nor the old toggle.
        expect(
          screen.queryByRole('button', { name: /a staple$/ }),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: 'Mark running low' }),
        ).not.toBeInTheDocument();
      });

      it('shows neither chip on an Unmatched Ingredient', async () => {
        const user = userEvent.setup();
        stubActions();
        renderWithProviders(<PantryPage />);

        await user.click(
          await screen.findByRole('button', { name: /^Zorblax/ }),
        );
        expect(
          screen.getByRole('group', { name: /^Zorblax paste, 1 batch/ }),
        ).toBeVisible();
        expect(stapleChip()).not.toBeInTheDocument();
        expect(lowChip()).not.toBeInTheDocument();
      });

      describe('the Add batch button', () => {
        const milk: CatalogSearchResult = {
          owner: 'catalog',
          id: 'milk-id',
          name: 'Milk',
          defaultUnit: 'l',
          leafCategory: { id: 'milk', name: 'Milk' },
          parentCategory: {
            id: 'dairy',
            name: 'Dairy',
            aisle: { id: 'aisle', name: 'Dairy & eggs' },
          },
          defaults: { expiryDays: 7, location: 'fridge' },
          amountScale: 'medium',
        };

        /** The Pantry follows the saves, as the API does; Catalog search finds Milk. */
        function stubAdding({
          searchGate,
        }: { searchGate?: Promise<void> } = {}) {
          let batches = [
            batch({ id: 'milk-1', name: 'Milk', quantity: 1, unit: 'l' }),
            batch({
              id: 'zorblax-1',
              name: 'Zorblax paste',
              unmatched: true,
              ingredientId: null,
              location: 'cupboard',
            }),
          ];
          const { fetchMock, calls } = stubApi({
            'GET /api/pantry': () => Response.json({ batches, runningLow: [] }),
            'GET /api/staples': () => Response.json({ staples: [] }),
            'GET /api/settings/family': familySettings(3),
            'GET /api/catalog/search': async () => {
              await searchGate;
              return Response.json({ results: [parmesan, milk] });
            },
            'POST /api/pantry/batches': () => {
              const saved = batch({
                id: 'milk-new',
                name: 'Milk',
                quantity: 2,
                unit: 'l',
                productDescription: 'Fresh',
              });
              batches = [...batches, saved];
              return Response.json(saved, { status: 201 });
            },
          });
          vi.stubGlobal('fetch', fetchMock);
          return calls;
        }

        const addButton = (name: string) =>
          screen.getByRole('button', { name: `Add a batch of ${name}` });

        it('ends the action row of every open Ingredient, Unmatched included', async () => {
          const user = userEvent.setup();
          stubAdding();
          renderWithProviders(<PantryPage />);

          await openMilk(user);
          expect(lowChip()!.nextElementSibling).toBe(addButton('Milk'));

          await user.click(screen.getByRole('button', { name: /^Zorblax/ }));
          expect(addButton('Zorblax paste')).toBeVisible();
          expect(stapleChip()).not.toBeInTheDocument();
          expect(lowChip()).not.toBeInTheDocument();
        });

        it('opens Add batch with the Ingredient picked, and the open card shows the saved Batch', async () => {
          const user = userEvent.setup();
          const calls = stubAdding();
          renderWithProviders(<PantryPage />);
          await openMilk(user);

          await user.click(addButton('Milk'));

          screen.getByRole('form', { name: 'Add to Pantry' });
          // Milk shows as the picked token, with its Catalog defaults, as if it had been picked from the search.
          expect(
            await screen.findByRole('combobox', {
              name: 'Ingredient: Milk. Press Backspace to change',
            }),
          ).toHaveValue('Milk');
          expect(await screen.findByText(/in 7 days/)).toBeInTheDocument();
          expect(pressedLocation()).toBe('Fridge');
          expect(
            screen.getByRole('button', { name: 'Unit: L' }),
          ).toBeInTheDocument();
          expect(
            screen.queryByText(/will be saved as Unmatched/),
          ).not.toBeInTheDocument();

          await user.clear(
            screen.getByRole('textbox', { name: /Amount of Milk/ }),
          );
          await user.type(
            screen.getByRole('textbox', { name: /Amount of Milk/ }),
            '2',
          );
          await typeNote(user, 'Fresh');
          await user.click(
            screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
          );

          await waitFor(() =>
            expect(
              calls.find((call) => call.key === 'POST /api/pantry/batches')
                ?.body,
            ).toEqual({
              ingredientId: 'milk-id',
              quantity: 2,
              unit: 'l',
              location: 'fridge',
              expiryDate: inDays(7),
              productDescription: 'Fresh',
            }),
          );
          // Done goes back to the Pantry with Milk still open, now with the new Batch.
          await user.click(await screen.findByRole('button', { name: 'Done' }));
          await waitFor(() => expect(batchRows()).toHaveLength(2));
          expect(batchRows()[1]).toHaveTextContent(/Fresh/);
        });

        it("keeps a Location and expiry the Member set before the Ingredient's Catalog defaults arrive", async () => {
          const user = userEvent.setup();
          const { gate, release } = gated();
          const calls = stubAdding({ searchGate: gate });
          renderWithProviders(<PantryPage />);
          await openMilk(user);

          await user.click(addButton('Milk'));
          // The search for Milk's defaults is still out: the Member picks the freezer and a 3-day expiry.
          await pickLocation(user, 'Freezer');
          await user.click(screen.getByRole('button', { name: 'Calendar' }));
          const sheet = await screen.findByRole('dialog', { name: 'Expires' });
          await user.click(quickPick(sheet, /^3 days,/));
          await user.click(sheetButton(sheet, 'Done'));
          await waitFor(() =>
            expect(
              screen.queryByRole('dialog', { name: 'Expires' }),
            ).not.toBeInTheDocument(),
          );
          await act(async () => release());
          // Milk's defaults have landed: it shows as the picked token.
          await screen.findByRole('combobox', {
            name: 'Ingredient: Milk. Press Backspace to change',
          });
          expect(pressedLocation()).toBe('Freezer');

          await user.clear(
            screen.getByRole('textbox', { name: /Amount of Milk/ }),
          );
          await user.type(
            screen.getByRole('textbox', { name: /Amount of Milk/ }),
            '2',
          );
          await user.click(
            screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
          );

          await waitFor(() =>
            expect(
              calls.find((call) => call.key === 'POST /api/pantry/batches')
                ?.body,
            ).toEqual({
              ingredientId: 'milk-id',
              quantity: 2,
              unit: 'l',
              location: 'freezer',
              expiryDate: inDays(3),
              productDescription: null,
            }),
          );
        });

        it("opens Add batch with an Unmatched Ingredient's name filled in, to save another Unmatched Batch", async () => {
          const user = userEvent.setup();
          const calls = stubAdding();
          renderWithProviders(<PantryPage />);
          await user.click(
            await screen.findByRole('button', { name: /^Zorblax/ }),
          );

          await user.click(addButton('Zorblax paste'));

          expect(
            screen.getByRole('combobox', { name: 'Search ingredients' }),
          ).toHaveValue('Zorblax paste');
          expect(
            screen.getByText(/"Zorblax paste" will be saved as Unmatched/),
          ).toBeVisible();
          await user.clear(
            screen.getByRole('textbox', { name: /Amount of Zorblax paste/ }),
          );
          await user.type(
            screen.getByRole('textbox', { name: /Amount of Zorblax paste/ }),
            '1',
          );
          await user.click(
            screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
          );

          await waitFor(() =>
            expect(
              calls.find((call) => call.key === 'POST /api/pantry/batches')
                ?.body,
            ).toMatchObject({ rawName: 'Zorblax paste', quantity: 1 }),
          );
        });

        it('returns to the open card with focus on its row when cancelled', async () => {
          const user = userEvent.setup();
          const calls = stubAdding();
          renderWithProviders(<PantryPage />);
          await openMilk(user);

          await user.click(addButton('Milk'));
          await user.click(screen.getByRole('button', { name: 'Close' }));

          const row = await screen.findByRole('button', { name: /^Milk/ });
          expect(row).toHaveAttribute('aria-expanded', 'true');
          await waitFor(() => expect(addButton('Milk')).toHaveFocus());
          expect(
            calls.some((call) => call.key === 'POST /api/pantry/batches'),
          ).toBe(false);
        });

        it('leaves the header "+" opening an empty form', async () => {
          const user = userEvent.setup();
          stubAdding();
          renderWithProviders(<PantryPage />);
          await openMilk(user);
          await user.click(addButton('Milk'));
          await user.click(screen.getByRole('button', { name: 'Close' }));

          await user.click(
            await screen.findByRole('button', { name: 'Add batch' }),
          );

          expect(
            screen.getByRole('combobox', { name: 'Search ingredients' }),
          ).toHaveValue('');
          // Nothing picked: the amount and the rest wait for a pick.
          expect(
            screen.queryByRole('textbox', { name: /^Amount/ }),
          ).not.toBeInTheDocument();
        });

        describe('the Add to Pantry sheet', () => {
          const sheet = () =>
            screen.findByRole('dialog', { name: 'Add to Pantry' });
          const closed = () =>
            waitFor(() =>
              expect(
                screen.queryByRole('dialog', { name: 'Add to Pantry' }),
              ).not.toBeInTheDocument(),
            );

          it('focuses the search when it opens from md up', async () => {
            stubViewport(1024);
            const user = userEvent.setup();
            stubAdding();
            renderWithProviders(<PantryPage />);
            await user.click(
              await screen.findByRole('button', { name: 'Add batch' }),
            );

            const dialog = await sheet();
            await waitFor(() =>
              expect(
                within(dialog).getByRole('combobox', {
                  name: 'Search ingredients',
                }),
              ).toHaveFocus(),
            );
          });

          it('opens from the header "+" as a modal dialog over the list, with focus on the sheet on a phone', async () => {
            const user = userEvent.setup();
            stubAdding();
            renderWithProviders(<PantryPage />);
            const plus = await screen.findByRole('button', {
              name: 'Add batch',
            });
            await user.click(plus);

            const dialog = await sheet();
            expect(dialog).toHaveAttribute('aria-modal', 'true');
            await waitFor(() => expect(dialog).toHaveFocus());
            expect(
              within(dialog).getByRole('combobox', {
                name: 'Search ingredients',
              }),
            ).not.toHaveFocus();
            // The list is still rendered behind the scrim.
            expect(
              screen.getByRole('button', { name: /^Milk/, hidden: true }),
            ).toBeInTheDocument();

            await user.keyboard('{Escape}');
            await closed();
            await waitFor(() => expect(plus).toHaveFocus());
          });

          it('closes on the x and on a scrim tap', async () => {
            const user = userEvent.setup();
            stubAdding();
            renderWithProviders(<PantryPage />);
            await user.click(
              await screen.findByRole('button', { name: 'Add batch' }),
            );
            await user.click(
              within(await sheet()).getByRole('button', { name: 'Close' }),
            );
            await closed();

            await user.click(
              await screen.findByRole('button', { name: 'Add batch' }),
            );
            await sheet();
            await user.click(
              document.querySelector('.MuiBackdrop-root') as Element,
            );
            await closed();
          });

          it('opens with the Ingredient picked from an open card, and with the name typed in from an Unmatched row', async () => {
            const user = userEvent.setup();
            stubAdding();
            renderWithProviders(<PantryPage />);
            await openMilk(user);
            await user.click(addButton('Milk'));
            expect(
              within(await sheet()).getByRole('textbox', { name: /^Amount/ }),
            ).toBeInTheDocument();
            await user.click(screen.getByRole('button', { name: 'Close' }));
            await closed();

            await user.click(screen.getByRole('button', { name: /^Zorblax/ }));
            await user.click(addButton('Zorblax paste'));
            expect(
              within(await sheet()).getByRole('combobox', {
                name: 'Search ingredients',
              }),
            ).toHaveValue('Zorblax paste');
          });
        });
      });

      describe('the Staple chip', () => {
        it('makes the Ingredient a Staple at once, says so with no Undo, and sends the add', async () => {
          const user = userEvent.setup();
          const { gate, release } = gated();
          const calls = stubActions({ gate });
          renderWithProviders(<PantryPage />);
          await openMilk(user);

          const chip = stapleChip()!;
          expect(chip).toHaveAccessibleName('Make Staple');
          await user.click(chip);
          // Held at the server: the chip already shows the new state, and its name follows the label.
          expect(chip).toHaveAttribute('aria-pressed', 'true');
          expect(chip).toHaveTextContent(/^Staple$/);
          expect(chip).toHaveAccessibleName('Staple');
          // The toast waits for the server, so a refusal never leaves it saying otherwise.
          expect(
            screen.queryByText('Milk is a Staple'),
          ).not.toBeInTheDocument();

          release();
          expect(await screen.findByText('Milk is a Staple')).toBeVisible();
          expect(
            screen.queryByRole('button', { name: 'Undo' }),
          ).not.toBeInTheDocument();
          await waitFor(() =>
            expect(
              calls.find((c) => c.key === 'POST /api/staples')?.body,
            ).toEqual({ ingredientId: 'milk-id' }),
          );
          await waitFor(() =>
            expect(
              calls.filter((c) => c.key === 'GET /api/staples'),
            ).toHaveLength(2),
          );
          expect(chip).toHaveAttribute('aria-pressed', 'true');
        });

        it('does nothing from another row of the Ingredient while the add is still out', async () => {
          const user = userEvent.setup();
          const { gate, release } = gated();
          const calls = stubActions({
            gate,
            batches: [
              batch({ name: 'Milk', location: 'fridge' }),
              batch({ name: 'Milk', location: 'cupboard' }),
            ],
          });
          renderWithProviders(<PantryPage />);
          const fridge = await screen.findByRole('region', {
            name: 'Fridge · 1',
          });
          const cupboard = screen.getByRole('region', { name: 'Cupboard · 1' });

          await user.click(
            within(fridge).getByRole('button', { name: /^Milk/ }),
          );
          await user.click(stapleChip()!);
          await user.click(
            within(cupboard).getByRole('button', { name: /^Milk/ }),
          );
          // The add has no Staple id yet: the chip here has nothing to remove by.
          await user.click(stapleChip()!);
          expect(stapleChip()).toHaveAttribute('aria-pressed', 'true');

          release();
          expect(await screen.findByText('Milk is a Staple')).toBeVisible();
          expect(
            calls.filter((c) => c.key.startsWith('DELETE /api/staples')),
          ).toEqual([]);
        });

        it('removes the Staple by its id, at once, and says so', async () => {
          const user = userEvent.setup();
          const calls = stubActions({ staplesAtStart: [milkStaple] });
          renderWithProviders(<PantryPage />);
          await openMilk(user);

          const chip = stapleChip()!;
          await waitFor(() =>
            expect(chip).toHaveAttribute('aria-pressed', 'true'),
          );
          expect(chip).toHaveTextContent(/^Staple$/);
          await user.click(chip);

          expect(chip).toHaveAttribute('aria-pressed', 'false');
          expect(chip).toHaveTextContent(/^Make Staple$/);
          expect(
            await screen.findByText('Milk is no longer a Staple'),
          ).toBeVisible();
          await waitFor(() =>
            expect(
              calls.some((c) => c.key === 'DELETE /api/staples/staple-1'),
            ).toBe(true),
          );
        });

        it('flips back and shows a translated error when the Staple limit is reached', async () => {
          const user = userEvent.setup();
          const { fetchMock } = stubApi({
            'GET /api/pantry': () =>
              Response.json({ batches: [batch({ name: 'Milk' })] }),
            'GET /api/staples': () => Response.json({ staples: [] }),
            'POST /api/staples': () =>
              Response.json(
                {
                  code: 'shopping.staple_limit_reached',
                  params: { max: 200 },
                },
                { status: 409 },
              ),
          });
          vi.stubGlobal('fetch', fetchMock);
          renderWithProviders(<PantryPage />);
          await openMilk(user);

          const chip = stapleChip()!;
          await user.click(chip);

          expect(await screen.findByRole('alert')).toHaveTextContent(
            'You can have up to 200 staples',
          );
          expect(chip).toHaveAttribute('aria-pressed', 'false');
          expect(
            screen.queryByText('Milk is a Staple'),
          ).not.toBeInTheDocument();
        });
      });

      describe('the Running low chip', () => {
        it('sets the flag at once, on the chip and on the row, says so with no Undo, and clears it on the next press', async () => {
          const user = userEvent.setup();
          const { gate, release } = gated();
          const calls = stubActions({ gate });
          renderWithProviders(<PantryPage />);
          await openMilk(user);

          const chip = lowChip()!;
          expect(lowMarker()).not.toBeInTheDocument();
          await user.click(chip);
          // Held at the server: the chip and the row's marker already show it.
          expect(chip).toHaveAttribute('aria-pressed', 'true');
          expect(lowMarker()).toBeVisible();
          expect(
            await screen.findByText('Milk marked running low'),
          ).toBeVisible();
          expect(
            screen.queryByRole('button', { name: 'Undo' }),
          ).not.toBeInTheDocument();
          release();
          await waitFor(() =>
            expect(
              calls.some(
                (c) => c.key === 'PUT /api/pantry/running-low/milk-id',
              ),
            ).toBe(true),
          );

          await user.click(chip);
          expect(chip).toHaveAttribute('aria-pressed', 'false');
          expect(lowMarker()).not.toBeInTheDocument();
          expect(
            await screen.findByText('Milk no longer running low'),
          ).toBeVisible();
          await waitFor(() =>
            expect(
              calls.some(
                (c) => c.key === 'DELETE /api/pantry/running-low/milk-id',
              ),
            ).toBe(true),
          );
        });

        it('flips back and shows an error when the save fails', async () => {
          const user = userEvent.setup();
          const { gate, release } = gated();
          stubActions({ gate, failSaves: true });
          renderWithProviders(<PantryPage />);
          await openMilk(user);

          const chip = lowChip()!;
          await user.click(chip);
          expect(chip).toHaveAttribute('aria-pressed', 'true');

          release();
          await waitFor(() =>
            expect(chip).toHaveAttribute('aria-pressed', 'false'),
          );
          expect(await screen.findByRole('alert')).toBeInTheDocument();
        });
      });

      describe('the Running low marker on the row', () => {
        it('is hidden while the flag is off', async () => {
          stubActions({
            batches: [batch({ name: 'Milk', expiryDate: inDays(2) })],
          });
          renderWithProviders(<PantryPage />);

          await screen.findByRole('button', { name: /^Milk/ });
          expect(lowMarker()).not.toBeInTheDocument();
        });

        it('shows on the collapsed row in place of the detail line', async () => {
          stubActions({
            batches: [
              batch({
                name: 'Milk',
                quantity: 1,
                unit: 'l',
                expiryDate: inDays(2),
              }),
            ],
            flaggedAtStart: ['milk-id'],
          });
          renderWithProviders(<PantryPage />);

          const fridge = await screen.findByRole('region', {
            name: 'Fridge · 1',
          });
          const row = within(fridge).getByRole('listitem');
          expect(row.textContent).toBe(
            'Milk' + 'Running low' + '2 d left' + '2 days left',
          );
          expect(lowMarker()).toBeVisible();
        });

        it.each([
          {
            hides: 'the Batch count',
            batches: [
              batch({ name: 'Milk', quantity: 1, unit: 'l' }),
              batch({ name: 'Milk', quantity: 2, unit: 'l' }),
            ],
            region: 'Fridge · 2',
          },
          {
            hides: 'the Product Description',
            batches: [
              batch({
                name: 'Milk',
                quantity: 1,
                unit: 'l',
                productDescription: 'Arla whole milk',
              }),
            ],
            region: 'Fridge · 1',
          },
        ])(
          'hides $hides on the collapsed row while flagged',
          async ({ batches, region }) => {
            stubActions({ batches, flaggedAtStart: ['milk-id'] });
            renderWithProviders(<PantryPage />);

            const fridge = await screen.findByRole('region', { name: region });
            expect(within(fridge).getByRole('listitem').textContent).toBe(
              'Milk' + 'Running low',
            );
          },
        );

        it('shows on the open row, which has no expiry tag of its own', async () => {
          const user = userEvent.setup();
          stubActions({
            batches: [
              batch({
                name: 'Milk',
                quantity: 1,
                unit: 'l',
                expiryDate: inDays(2),
              }),
            ],
            flaggedAtStart: ['milk-id'],
          });
          renderWithProviders(<PantryPage />);

          await openMilk(user);
          expect(lowMarker()).toBeVisible();
          // The expiry shows per Batch in the open card, so the marker stays on the header.
          expect(
            within(
              screen.getByRole('group', { name: 'Milk, 1 batch' }),
            ).getByText('2 days left'),
          ).toBeVisible();
          expect(lowChip()).toHaveAttribute('aria-pressed', 'true');
        });

        it('shows when the ingredient has no expiry date', async () => {
          stubActions({
            batches: [
              batch({ name: 'Milk', quantity: 1, unit: 'l', expiryDate: null }),
            ],
            flaggedAtStart: ['milk-id'],
          });
          renderWithProviders(<PantryPage />);

          await screen.findByRole('button', { name: /^Milk/ });
          expect(lowMarker()).toBeVisible();
        });

        it('shows in every Location section for the Ingredient, and toggling once updates them all', async () => {
          const user = userEvent.setup();
          stubActions({
            batches: [
              batch({
                name: 'Milk',
                location: 'fridge',
                quantity: 1,
                unit: 'l',
              }),
              batch({
                name: 'Milk',
                location: 'cupboard',
                quantity: 1,
                unit: 'l',
              }),
            ],
          });
          renderWithProviders(<PantryPage />);

          const fridge = await screen.findByRole('region', {
            name: 'Fridge · 1',
          });
          const cupboard = screen.getByRole('region', { name: 'Cupboard · 1' });
          const marker = (section: HTMLElement) =>
            within(
              within(section).getByRole('button', { name: /^Milk/ }),
            ).queryByText('Running low', { ignore: '[aria-hidden] *' });

          await user.click(
            within(fridge).getByRole('button', { name: /^Milk/ }),
          );
          await user.click(lowChip()!);

          expect(marker(fridge)).toBeVisible();
          expect(marker(cupboard)).toBeVisible();

          await user.click(lowChip()!);
          await waitFor(() => expect(marker(fridge)).not.toBeInTheDocument());
          expect(marker(cupboard)).not.toBeInTheDocument();
        });
      });
    });

    it('lists totals separately when the units differ', async () => {
      stubManaged([
        batch({ name: 'Flour', ingredientId: 'f', quantity: 500, unit: 'g' }),
        batch({ name: 'Flour', ingredientId: 'f', quantity: 2, unit: 'pcs' }),
      ]);
      renderWithProviders(<PantryPage />);
      expect(
        await screen.findByText('500 g + 2 pcs · 2 batches'),
      ).toBeVisible();
    });

    it('expands a row to each Batch with its own expiry, swipeable and holdable', async () => {
      const user = userEvent.setup();
      stubManaged(stock());
      renderWithProviders(<PantryPage />);

      const toggle = await screen.findByRole('button', { name: /^Milk/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      // The roll-up row itself is not a gesture row.
      expect(screen.queryByRole('group', { name: 'Milk' })).toBeNull();
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      const details = batchRows();
      expect(details[0]).toHaveTextContent(/^10\.5 L · .+Opened2 d left/);
      expect(details[1]).toHaveTextContent(/^21 L · .+5 d/);
      expect(batchRows()[0]).toHaveAccessibleDescription(
        'Swipe left to remove, hold to edit',
      );
      // No Edit or Delete icons any more: the hidden custom actions are not tab stops.
      expect(
        screen.getAllByRole('button', { name: /^Edit .*Milk/ })[0],
      ).toHaveAttribute('tabindex', '-1');
      expect(screen.queryByRole('button', { name: /Delete Milk/ })).toBeNull();

      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    it('moves the expiry from the row onto each Batch while expanded', async () => {
      const user = userEvent.setup();
      stubManaged(stock());
      renderWithProviders(<PantryPage />);

      const toggle = await screen.findByRole('button', { name: /^Parmesan/ });
      expect(toggle).toHaveTextContent(/40 d40 days$/);
      await user.click(toggle);

      expect(toggle).not.toHaveTextContent(/40 d40 days$/);
      const [detail] = batchRows('Parmesan');
      expect(detail).toHaveTextContent(/^1.+Grana Padano 200g40 d/);
    });

    describe('opening an Ingredient', () => {
      const row = (name: string) =>
        screen.getByRole('button', { name: new RegExp(`^${name}`) });

      it('shows a chevron at the end of every row, single-Batch rows included, turned while open', async () => {
        const user = userEvent.setup();
        stubManaged(stock());
        renderWithProviders(<PantryPage />);
        await screen.findByRole('button', { name: /^Milk/ });

        for (const name of ['Milk', 'Parmesan', 'Rice']) {
          const chevron = within(row(name)).getByTestId('chevron');
          expect(chevron).toHaveAttribute('aria-hidden', 'true');
          expect(row(name).lastElementChild).toBe(chevron);
          expect(chevron).toHaveStyle({ transform: 'none' });
        }

        await user.click(row('Parmesan'));
        expect(within(row('Parmesan')).getByTestId('chevron')).toHaveStyle({
          transform: 'rotate(180deg)',
        });
        expect(within(row('Milk')).getByTestId('chevron')).toHaveStyle({
          transform: 'none',
        });
      });

      it('keeps one Ingredient open on the whole page, across Locations', async () => {
        const user = userEvent.setup();
        stubManaged(stock());
        renderWithProviders(<PantryPage />);
        await screen.findByRole('button', { name: /^Milk/ });

        await user.click(row('Milk'));
        expect(row('Milk')).toHaveAttribute('aria-expanded', 'true');

        // Parmesan is in the Freezer, Milk in the Fridge.
        await user.click(row('Parmesan'));
        expect(row('Parmesan')).toHaveAttribute('aria-expanded', 'true');
        expect(row('Milk')).toHaveAttribute('aria-expanded', 'false');
        expect(
          screen.queryByRole('group', { name: /^Milk, / }),
        ).not.toBeInTheDocument();

        await user.click(row('Rice'));
        expect(row('Rice')).toHaveAttribute('aria-expanded', 'true');
        expect(row('Parmesan')).toHaveAttribute('aria-expanded', 'false');

        // Tapping the open Ingredient's header closes it.
        await user.click(row('Rice'));
        expect(row('Rice')).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('group', { name: /batch/ })).toBeNull();
      });

      it('closes the open Ingredient once its row is filtered away, so it does not come back open', async () => {
        const user = userEvent.setup();
        stubManaged(stock());
        renderWithProviders(<PantryPage />);
        await screen.findByRole('button', { name: /^Milk/ });

        await user.click(row('Milk'));
        // Milk is in the Fridge: the Freezer chip hides it.
        await user.click(screen.getByRole('button', { name: /^Freezer/ }));
        expect(
          screen.queryByRole('button', { name: /^Milk/ }),
        ).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /^All/ }));

        expect(row('Milk')).toHaveAttribute('aria-expanded', 'false');
      });

      it('opens only the tapped Location when the Ingredient is in two', async () => {
        const user = userEvent.setup();
        stubManaged([
          ...stock(),
          batch({ id: 'milk-3', name: 'Milk', location: 'freezer' }),
        ]);
        renderWithProviders(<PantryPage />);
        const freezer = await screen.findByRole('region', {
          name: /^Freezer/,
        });
        const fridge = screen.getByRole('region', { name: /^Fridge/ });

        await user.click(
          within(freezer).getByRole('button', { name: /^Milk/ }),
        );
        expect(
          within(freezer).getByRole('button', { name: /^Milk/ }),
        ).toHaveAttribute('aria-expanded', 'true');
        expect(
          within(fridge).getByRole('button', { name: /^Milk/ }),
        ).toHaveAttribute('aria-expanded', 'false');
      });

      it('controls a group named for the Ingredient and its Batch count', async () => {
        const user = userEvent.setup();
        stubManaged(stock());
        renderWithProviders(<PantryPage />);
        await screen.findByRole('button', { name: /^Milk/ });
        expect(row('Milk')).not.toHaveAttribute('aria-controls');

        await user.click(row('Milk'));
        const body = screen.getByRole('group', { name: 'Milk, 2 batches' });
        expect(row('Milk')).toHaveAttribute('aria-controls', body.id);
        expect(within(body).getAllByRole('group')).toHaveLength(2);

        await user.click(row('Parmesan'));
        expect(
          screen.getByRole('group', { name: 'Parmesan, 1 batch' }),
        ).toBeInTheDocument();
      });

      it.each([
        ['da', 'Mælk, 2 partier', 'Parmesan, 1 parti'],
        ['ro', 'Lapte, 2 loturi', 'Parmezan, 1 lot'],
      ] as const)(
        'names the group with the %s plural',
        async (locale, two, one) => {
          const user = userEvent.setup();
          stubManaged([
            batch({ id: 'a', name: two.split(',')[0] }),
            batch({ id: 'b', name: two.split(',')[0] }),
            batch({
              id: 'c',
              name: one.split(',')[0],
              ingredientId: 'parmesan-id',
            }),
          ]);
          renderWithProviders(<PantryPage />, { locale });
          await user.click(
            await screen.findByRole('button', {
              name: new RegExp(`^${two.split(',')[0]}`),
            }),
          );
          expect(screen.getByRole('group', { name: two })).toBeInTheDocument();
          await user.click(row(one.split(',')[0]));
          expect(screen.getByRole('group', { name: one })).toBeInTheDocument();
        },
      );

      it('keeps focus on the row when it opens, and returns it there when closed from inside', async () => {
        const user = userEvent.setup();
        stubManaged(stock());
        renderWithProviders(<PantryPage />);
        await screen.findByRole('button', { name: /^Milk/ });

        await user.click(row('Milk'));
        expect(row('Milk')).toHaveFocus();

        act(() => batchRows()[0].focus());
        await user.keyboard('{Escape}');
        expect(row('Milk')).toHaveAttribute('aria-expanded', 'false');
        expect(row('Milk')).toHaveFocus();
      });

      it('lets Escape cancel a Batch removal first, without closing the Ingredient', async () => {
        const user = userEvent.setup();
        stubManaged(stock());
        renderWithProviders(<PantryPage />);
        await user.click(await screen.findByRole('button', { name: /^Milk/ }));

        act(() => batchRows()[0].focus());
        await user.keyboard('{Delete}');
        expect(screen.getByRole('button', { name: 'Remove' })).toBeVisible();
        await user.keyboard('{Escape}');

        expect(row('Milk')).toHaveAttribute('aria-expanded', 'true');
      });
    });

    describe('the lifted Ingredient card', () => {
      const fridgeOfFour = () =>
        ['Butter', 'Eggs', 'Milk', 'Yogurt'].map((name, index) =>
          batch({
            id: name,
            name,
            ingredientId: `${name}-id`,
            expiryDate: inDays(index + 1),
          }),
        );
      const blocks = () =>
        within(screen.getByRole('region', { name: /^Fridge/ })).getAllByRole(
          'listitem',
        );
      const card = 'var(--pp-r-card)';
      const corners = (block: HTMLElement) => {
        const style = getComputedStyle(block);
        return [
          style.borderTopLeftRadius,
          style.borderTopRightRadius,
          style.borderBottomRightRadius,
          style.borderBottomLeftRadius,
        ].map((value) => (value === card ? 'r' : '0'));
      };

      it('stacks the Location as blocks with the outer corners rounded', async () => {
        stubManaged(fridgeOfFour());
        renderWithProviders(<PantryPage />);
        await screen.findByRole('button', { name: /^Milk/ });

        expect(blocks().map(corners)).toEqual([
          ['r', 'r', '0', '0'],
          ['0', '0', '0', '0'],
          ['0', '0', '0', '0'],
          ['0', '0', 'r', 'r'],
        ]);
      });

      it('lifts the open Ingredient, and its neighbours round the corners next to it', async () => {
        const user = userEvent.setup();
        stubManaged(fridgeOfFour());
        renderWithProviders(<PantryPage />);
        await user.click(await screen.findByRole('button', { name: /^Eggs/ }));

        expect(blocks().map(corners)).toEqual([
          ['r', 'r', 'r', 'r'],
          ['r', 'r', 'r', 'r'],
          ['r', 'r', '0', '0'],
          ['0', '0', 'r', 'r'],
        ]);
        expect(blocks()[1]).toHaveStyle({
          marginTop: '10px',
          marginBottom: '10px',
          marginLeft: '-6px',
          marginRight: '-6px',
        });
        expect(blocks()[0]).toHaveStyle({ marginTop: '0px' });
      });

      it('rounds all four corners of an open first or last block', async () => {
        const user = userEvent.setup();
        stubManaged(fridgeOfFour());
        renderWithProviders(<PantryPage />);
        await user.click(
          await screen.findByRole('button', { name: /^Butter/ }),
        );
        expect(blocks().map(corners)).toEqual([
          ['r', 'r', 'r', 'r'],
          ['r', 'r', '0', '0'],
          ['0', '0', '0', '0'],
          ['0', '0', 'r', 'r'],
        ]);

        await user.click(screen.getByRole('button', { name: /^Yogurt/ }));
        expect(blocks().map(corners)).toEqual([
          ['r', 'r', '0', '0'],
          ['0', '0', '0', '0'],
          ['0', '0', 'r', 'r'],
          ['r', 'r', 'r', 'r'],
        ]);
      });

      it('numbers the Batch rows, with the amount and date, the Product Description and the tag', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 9, 14, 15, 30));
        const user = userEvent.setup();
        stubManaged([
          batch({
            id: 'later',
            name: 'Greek yogurt',
            quantity: 500,
            unit: 'g',
            expiryDate: '2026-10-17',
            productDescription: 'Fage 5%',
          }),
          batch({
            id: 'undated',
            name: 'Greek yogurt',
            quantity: 150,
            unit: 'g',
            expiryDate: null,
          }),
          batch({
            id: 'soon',
            name: 'Greek yogurt',
            quantity: 1,
            unit: 'kg',
            expiryDate: '2026-10-15',
          }),
        ]);
        renderWithProviders(<PantryPage />);
        await user.click(
          await screen.findByRole('button', { name: /^Greek yogurt/ }),
        );

        const rows = batchRows('Greek yogurt');
        expect(rows.map((row) => row.textContent)).toEqual([
          expect.stringMatching(/^11 kg · Thu, Oct 15Tomorrow/),
          expect.stringMatching(/^2500 g · Sat, Oct 17Fage 5%3 d/),
          expect.stringMatching(/^3150 g · no dateNo expiry/),
        ]);
        // The number is only a visual index.
        expect(within(rows[0]).getByText('1')).toHaveAttribute(
          'aria-hidden',
          'true',
        );
      });

      it('hides the soonest-expiry tag in the open header', async () => {
        const user = userEvent.setup();
        stubManaged(stock());
        renderWithProviders(<PantryPage />);
        const toggle = await screen.findByRole('button', { name: /^Milk/ });
        expect(toggle).toHaveTextContent('2 d left');
        await user.click(toggle);
        expect(toggle).not.toHaveTextContent('2 d left');
      });

      it('names the Batch in its removal confirmation', async () => {
        const user = userEvent.setup();
        stubManaged(stock());
        renderWithProviders(<PantryPage />);
        await user.click(await screen.findByRole('button', { name: /^Milk/ }));

        act(() => batchRows()[0].focus());
        await user.keyboard('{Delete}');
        expect(
          screen.getByRole('group', { name: 'Remove 0.5 L Milk?' }),
        ).toBeVisible();
      });

      describe('scrolling the opened card above the Dock', () => {
        afterEach(() => vi.restoreAllMocks());

        async function openWithBottomAt(bottom: number) {
          vi.useFakeTimers({ shouldAdvanceTime: true });
          const user = userEvent.setup({
            advanceTimers: vi.advanceTimersByTime,
          });
          const scrollBy = vi.fn();
          vi.stubGlobal('scrollBy', scrollBy);
          vi.stubGlobal('innerHeight', 800);
          vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
            bottom,
          } as DOMRect);
          stubManaged(stock());
          renderWithProviders(<PantryPage />);
          await user.click(
            await screen.findByRole('button', { name: /^Milk/ }),
          );
          return scrollBy;
        }

        it('scrolls the card clear of the Dock once it has lifted', async () => {
          const scrollBy = await openWithBottomAt(760);
          expect(scrollBy).not.toHaveBeenCalled();
          await act(() => vi.advanceTimersByTimeAsync(300));
          // 800 tall, the Dock and its gap take the bottom 130 with the capsule's overhang, and 14 more to breathe.
          expect(scrollBy).toHaveBeenCalledWith({
            top: 104,
            behavior: 'smooth',
          });
        });

        it('jumps instead under reduce-motion', async () => {
          stubMotion(true);
          const scrollBy = await openWithBottomAt(760);
          await act(() => vi.advanceTimersByTimeAsync(300));
          expect(scrollBy).toHaveBeenCalledWith({ top: 104, behavior: 'auto' });
        });

        it('leaves the page alone when the card is clear of the Dock', async () => {
          const scrollBy = await openWithBottomAt(600);
          await act(() => vi.advanceTimersByTimeAsync(300));
          expect(scrollBy).not.toHaveBeenCalled();
        });
      });
    });

    it('edits a Batch and sends only that Batch', async () => {
      const user = userEvent.setup();
      const calls = stubManaged(stock());
      renderWithProviders(<PantryPage />);

      await user.click(await screen.findByRole('button', { name: /^Milk/ }));
      await openEditor(user);
      const form = screen.getByRole('form', { name: 'Edit Milk batch' });
      expect(
        within(form).getByRole('textbox', { name: /Amount of Milk/ }),
      ).toHaveValue('0.5');
      expect(within(form).getByLabelText('Note · optional')).toHaveValue(
        'Opened',
      );

      await user.clear(
        within(form).getByRole('textbox', { name: /Amount of Milk/ }),
      );
      await user.clear(
        within(form).getByRole('textbox', { name: /Amount of Milk/ }),
      );
      await user.type(
        within(form).getByRole('textbox', { name: /Amount of Milk/ }),
        '0.25',
      );
      await pickLocation(user, 'Freezer', form);
      await user.click(within(form).getByRole('button', { name: /^Expires,/ }));
      const sheet = await screen.findByRole('dialog', { name: 'Expires' });
      await user.click(sheetButton(sheet, 'No expiry'));
      await user.click(sheetButton(sheet, 'Done'));
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Expires' }),
        ).not.toBeInTheDocument(),
      );
      await user.click(
        within(form).getByRole('button', { name: 'Save changes' }),
      );

      const patch = calls.find(
        (call) => call.key === 'PATCH /api/pantry/batches/milk-2',
      );
      // Only what changed, so two Members editing different fields do not overwrite each other.
      expect(patch?.body).toEqual({
        quantity: 0.25,
        location: 'freezer',
        expiryDate: null,
      });
      await waitFor(() =>
        expect(
          screen.queryByRole('form', { name: 'Edit Milk batch' }),
        ).not.toBeInTheDocument(),
      );
    });

    it("does not revert another Member's change made while the form was open", async () => {
      const user = userEvent.setup();
      const initial = stock();
      let live = initial;
      const { fetchMock, calls } = stubApi({
        'GET /api/pantry': () => Response.json({ batches: live }),
        'PATCH /api/pantry/batches/milk-2': () => Response.json(live[1]),
      });
      vi.stubGlobal('fetch', fetchMock);
      renderWithProviders(<PantryPage />);
      await user.click(await screen.findByRole('button', { name: /^Milk/ }));
      await openEditor(user);
      const form = screen.getByRole('form', { name: 'Edit Milk batch' });

      // Another Member changes the quantity, and the list refetches under the open form.
      live = initial.map((b) =>
        b.id === 'milk-2' ? { ...b, quantity: 0.75 } : b,
      );
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await waitFor(() =>
        expect(calls.filter((c) => c.key === 'GET /api/pantry').length).toBe(2),
      );

      await user.type(within(form).getByLabelText('Note · optional'), ' jar');
      await user.click(
        within(form).getByRole('button', { name: 'Save changes' }),
      );
      const patch = calls.find((c) => c.key.startsWith('PATCH'));
      expect(patch?.body).toEqual({ productDescription: 'Opened jar' });
    });

    it('offers the usual amounts of the Batch Ingredient, and marks the one its amount matches', async () => {
      mockChipRow();
      const user = userEvent.setup();
      stubManaged([
        batch({
          id: 'paprika',
          name: 'Paprika',
          ingredientId: 'paprika-id',
          amountScale: 'low',
          quantity: 50,
          unit: 'g',
        }),
      ]);
      renderWithProviders(<PantryPage />);
      await user.click(await screen.findByRole('button', { name: /^Paprika/ }));
      await openEditor(user, batchRows('Paprika')[0]);

      expect(
        chipLabels(
          screen.getByRole('group', { name: 'Usual amounts for Paprika' }),
        ),
      ).toEqual(['10 g', '20 g', '50 g', '100 g']);
      expect(screen.getByRole('button', { name: '50 g' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('shows and leaves unchanged a stored amount that matches no chip', async () => {
      mockChipRow();
      const user = userEvent.setup();
      const calls = stubManaged([
        batch({
          id: 'paprika',
          name: 'Paprika',
          ingredientId: 'paprika-id',
          amountScale: 'low',
          quantity: 333,
          unit: 'g',
        }),
      ]);
      renderWithProviders(<PantryPage />);
      await user.click(await screen.findByRole('button', { name: /^Paprika/ }));
      await openEditor(user, batchRows('Paprika')[0]);

      expect(
        screen.getByRole('textbox', { name: /Amount of Paprika/ }),
      ).toHaveValue('333');
      const chips = within(
        screen.getByRole('group', { name: 'Usual amounts for Paprika' }),
      ).getAllByRole('button');
      for (const chip of chips) {
        expect(chip).toHaveAttribute('aria-pressed', 'false');
      }
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);
    });

    it('edits the amount and unit in one input, with the Location toggle under it', async () => {
      const user = userEvent.setup();
      const calls = stubManaged(stock());
      renderWithProviders(<PantryPage />);
      await user.click(await screen.findByRole('button', { name: /^Milk/ }));
      await openEditor(user);
      const amount = screen.getByRole('textbox', { name: /Amount of Milk/ });
      expectLocationBelowAmount(amount, screen.getByLabelText('Location'));
      await user.clear(amount);
      await user.type(amount, '500 ml');
      await pickLocation(user, 'Freezer');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() =>
        expect(calls.find((c) => c.key.startsWith('PATCH'))?.body).toEqual({
          quantity: 500,
          unit: 'ml',
          location: 'freezer',
        }),
      );
    });

    it('saves on Enter in the amount, and Escape closes only the unit menu', async () => {
      const user = userEvent.setup();
      const calls = stubManaged(stock());
      renderWithProviders(<PantryPage />);
      await user.click(await screen.findByRole('button', { name: /^Milk/ }));
      await openEditor(user);
      const form = screen.getByRole('form', { name: 'Edit Milk batch' });

      await user.click(within(form).getByRole('button', { name: /^Unit: / }));
      expect(within(form).getByRole('menu', { name: 'Units' })).toBeVisible();
      await user.keyboard('{Escape}');
      expect(within(form).queryByRole('menu', { name: 'Units' })).toBeNull();
      expect(form).toBeInTheDocument();

      const amount = within(form).getByRole('textbox', {
        name: /Amount of Milk/,
      });
      await user.clear(amount);
      await user.type(amount, '2{Enter}');
      await waitFor(() =>
        expect(calls.find((c) => c.key.startsWith('PATCH'))?.body).toEqual({
          quantity: 2,
        }),
      );
    });

    it('sends no request when nothing changed', async () => {
      const user = userEvent.setup();
      const calls = stubManaged(stock());
      renderWithProviders(<PantryPage />);
      await user.click(await screen.findByRole('button', { name: /^Milk/ }));
      await openEditor(user);
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() =>
        expect(
          screen.queryByRole('form', { name: 'Edit Milk batch' }),
        ).not.toBeInTheDocument(),
      );
      expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);
    });

    it('refuses an exponent quantity when editing', async () => {
      const user = userEvent.setup();
      stubManaged(stock());
      renderWithProviders(<PantryPage />);
      await user.click(await screen.findByRole('button', { name: /^Milk/ }));
      await openEditor(user);
      fireEvent.change(
        screen.getByRole('textbox', { name: /Amount of Milk/ }),
        {
          target: { value: '1e3' },
        },
      );
      expect(
        screen.getByRole('button', { name: 'Save changes' }),
      ).toBeDisabled();
    });

    it('refuses an invalid quantity when editing', async () => {
      const user = userEvent.setup();
      stubManaged(stock());
      renderWithProviders(<PantryPage />);
      await user.click(await screen.findByRole('button', { name: /^Milk/ }));
      await openEditor(user);
      await user.clear(screen.getByRole('textbox', { name: /Amount of Milk/ }));
      await user.clear(screen.getByRole('textbox', { name: /Amount of Milk/ }));
      await user.type(
        screen.getByRole('textbox', { name: /Amount of Milk/ }),
        '1.2345',
      );
      expect(
        screen.getByRole('button', { name: 'Save changes' }),
      ).toBeDisabled();
    });

    describe('removing a Batch', () => {
      afterEach(() => vi.useRealTimers());

      async function openMilk(batches = stock(), options = {}) {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const calls = stubManaged(batches, options);
        renderWithProviders(<PantryPage />);
        const toggle = await screen.findByRole('button', { name: /^Milk/ });
        await user.click(toggle);
        return { user, toggle, calls };
      }
      const deletes = (calls: { key: string }[]) =>
        calls.filter((c) => c.key.startsWith('DELETE'));
      const expireUndo = () => act(() => vi.advanceTimersByTimeAsync(5100));

      it('hides the Batch with Undo and sends the delete only when the Undo expires', async () => {
        const { user, calls } = await openMilk();
        await removeBatch(user);

        expect(await screen.findByText('Removed Milk')).toBeInTheDocument();
        await waitFor(() => expect(batchRows()).toHaveLength(1));
        expect(deletes(calls)).toHaveLength(0);

        await expireUndo();
        await waitFor(() =>
          expect(calls.map((c) => c.key)).toContain(
            'DELETE /api/pantry/batches/milk-2',
          ),
        );
        expect(batchRows()).toHaveLength(1);
      });

      it('brings the Batch back with an error toast when the delete fails', async () => {
        const { user, calls } = await openMilk(stock(), { failDeletes: true });
        await removeBatch(user);
        await waitFor(() => expect(batchRows()).toHaveLength(1));

        await expireUndo();

        await waitFor(() => expect(batchRows()).toHaveLength(2));
        expect(deletes(calls)).toHaveLength(1);
        expect(screen.queryByText('Removed Milk')).toBeNull();
        expect(
          screen.getByText('Something went wrong. Please try again.'),
        ).toBeInTheDocument();
      });

      it('brings the Batch back on Undo without any request', async () => {
        const { user, calls } = await openMilk();
        await removeBatch(user);
        await user.click(await screen.findByRole('button', { name: 'Undo' }));

        expect(batchRows()).toHaveLength(2);
        await expireUndo();
        expect(deletes(calls)).toHaveLength(0);
      });

      it('keeps a roll-up open after its last Batch is removed, and collapses it once the delete is sent', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const calls = stubManaged(stock());
        renderWithProviders(<PantryPage />);
        const toggle = await screen.findByRole('button', { name: /^Parmesan/ });
        await user.click(toggle);
        await removeBatch(user, batchRows('Parmesan')[0]);

        await screen.findByText('Removed Parmesan');
        expect(toggle).toBeInTheDocument();
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(screen.queryByRole('group', { name: 'Parmesan' })).toBeNull();
        expect(deletes(calls)).toHaveLength(0);

        // Undo puts the Batch back inside the same open roll-up.
        await user.click(screen.getByRole('button', { name: 'Undo' }));
        expect(batchRows('Parmesan')).toHaveLength(1);

        await removeBatch(user, batchRows('Parmesan')[0]);
        await expireUndo();
        await waitFor(() =>
          expect(
            screen.queryByRole('button', { name: /^Parmesan/ }),
          ).toBeNull(),
        );
        expect(deletes(calls)).toHaveLength(1);
      });

      it('moves focus to the next Batch row after removing one of several', async () => {
        const { user } = await openMilk();
        await removeBatch(user);
        await waitFor(() => expect(batchRows()).toHaveLength(1));
        expect(batchRows()[0]).toHaveFocus();
      });

      it('focuses the section heading after removing the last Batch of a row', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        stubManaged([
          ...stock(),
          batch({
            id: 'peas',
            name: 'Peas',
            ingredientId: 'peas-id',
            location: 'freezer',
          }),
        ]);
        renderWithProviders(<PantryPage />);
        await user.click(
          await screen.findByRole('button', { name: /^Parmesan/ }),
        );
        await removeBatch(user, batchRows('Parmesan')[0]);
        await waitFor(() =>
          expect(
            screen.getByRole('heading', { name: 'Freezer · 1' }),
          ).toHaveFocus(),
        );
      });

      it('focuses the Add button after removing the last Batch of the last section', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        stubManaged([stock()[2]]);
        renderWithProviders(<PantryPage />);
        await user.click(
          await screen.findByRole('button', { name: /^Parmesan/ }),
        );
        await removeBatch(user, batchRows('Parmesan')[0]);
        await waitFor(() =>
          expect(
            screen.getByRole('button', { name: 'Add batch' }),
          ).toHaveFocus(),
        );
        await expireUndo();
        await waitFor(() =>
          expect(screen.queryByRole('heading', { name: /Freezer/ })).toBeNull(),
        );
        expect(screen.getByRole('button', { name: 'Add batch' })).toHaveFocus();
      });
    });

    describe('the expiry picker in Edit batch', () => {
      // Wednesday 14 October 2026, mid-afternoon. Only `Date` is faked, so timers and transitions run as usual.
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 9, 14, 15, 30));
      });
      afterEach(() => vi.useRealTimers());

      /** Open the editor of the opened Milk (0.5 L, Fridge, expiring in 2 days) and its expiry sheet. */
      async function openExpirySheet(user: ReturnType<typeof userEvent.setup>) {
        const calls = stubManaged(stock());
        renderWithProviders(<PantryPage />);
        await user.click(await screen.findByRole('button', { name: /^Milk/ }));
        await openEditor(user);
        const form = screen.getByRole('form', { name: 'Edit Milk batch' });
        await user.click(
          within(form).getByRole('button', {
            name: 'Expires, Friday, October 16, in 2 days',
          }),
        );
        const sheet = await screen.findByRole('dialog', { name: 'Expires' });
        return { calls, form, sheet };
      }

      async function saveEdit(
        user: ReturnType<typeof userEvent.setup>,
        form: HTMLElement,
        calls: ReturnType<typeof stubManaged>,
      ) {
        await user.click(
          within(form).getByRole('button', { name: 'Save changes' }),
        );
        await waitFor(() =>
          expect(
            calls.find((c) => c.key === 'PATCH /api/pantry/batches/milk-2'),
          ).toBeDefined(),
        );
        return calls.find((c) => c.key === 'PATCH /api/pantry/batches/milk-2')
          ?.body;
      }

      it("shows the Batch's context and the five fixed quick picks, with no Usual tile", async () => {
        const user = userEvent.setup();
        const { sheet } = await openExpirySheet(user);

        expect(sheet).toHaveTextContent('Milk · 0.5 L · Fridge');
        expect(within(sheet).getByRole('status')).toHaveTextContent(
          'Fri, Oct 16in 2 days2 d left',
        );
        expect(
          quickPickTiles(sheet).map((tile) => tile.getAttribute('aria-label')),
        ).toEqual([
          '3 days, Saturday, October 17',
          '5 days, Monday, October 19',
          '1 week, Wednesday, October 21',
          '2 weeks, Wednesday, October 28',
          '1 month, Friday, November 13',
        ]);
      });

      it('saves a quick pick as today + n, and Escape closes only the expiry sheet', async () => {
        const user = userEvent.setup();
        const { calls, form, sheet } = await openExpirySheet(user);

        await user.click(quickPick(sheet, /^1 week/));
        await user.keyboard('{Escape}');
        await waitFor(() =>
          expect(
            screen.queryByRole('dialog', { name: 'Expires' }),
          ).not.toBeInTheDocument(),
        );
        expect(form).toBeInTheDocument();
        expect(
          within(form).getByRole('button', {
            name: 'Expires, Wednesday, October 21, in 7 days',
          }),
        ).toBeInTheDocument();

        expect(await saveEdit(user, form, calls)).toEqual({
          expiryDate: '2026-10-21',
        });
      });

      it('opens on the month of a Batch expiring 18 months out, and lets that date be re-selected', async () => {
        const scrolling = trackScrolling();
        const user = userEvent.setup();
        const calls = stubManaged(
          stock().map((b) =>
            b.id === 'milk-2' ? { ...b, expiryDate: '2028-04-14' } : b,
          ),
        );
        renderWithProviders(<PantryPage />);
        await user.click(await screen.findByRole('button', { name: /^Milk/ }));
        // The far-off Batch now sorts last.
        await openEditor(user, batchRows()[1]);
        const form = screen.getByRole('form', { name: 'Edit Milk batch' });
        await user.click(
          within(form).getByRole('button', {
            name: /^Expires, Friday, April 14, 2028,/,
          }),
        );
        const sheet = await screen.findByRole('dialog', { name: 'Expires' });
        const calendar = within(sheet).getByRole('group', { name: 'Calendar' });

        const headings = within(calendar)
          .getAllByRole('heading')
          .map((heading) => heading.textContent);
        expect(headings.at(-1)).toBe('April 2028');
        expect(
          scrolling.scrolledTo(calendar)?.child?.querySelector('h3'),
        ).toHaveTextContent('April 2028');
        const day = calendarDay(sheet, 'Friday, April 14, 2028');
        expect(day).toHaveAttribute('aria-pressed', 'true');

        await user.click(quickPick(sheet, /^3 days,/));
        expect(day).toHaveAttribute('aria-pressed', 'false');
        await user.click(day);
        expect(day).toHaveAttribute('aria-pressed', 'true');
        expect(within(sheet).getByRole('status')).toHaveTextContent(
          'Fri, Apr 14, 2028',
        );
        await user.click(sheetButton(sheet, 'Done'));
        await waitFor(() =>
          expect(
            screen.queryByRole('dialog', { name: 'Expires' }),
          ).not.toBeInTheDocument(),
        );

        // Back on the date the Batch already had: nothing to send.
        await user.click(
          within(form).getByRole('button', { name: 'Save changes' }),
        );
        await waitFor(() =>
          expect(
            screen.queryByRole('form', { name: 'Edit Milk batch' }),
          ).not.toBeInTheDocument(),
        );
        expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);
      });

      it('opens on the month of a Batch that expired 3 months ago, and lets that date be re-selected', async () => {
        const scrolling = trackScrolling();
        const user = userEvent.setup();
        const calls = stubManaged(
          stock().map((b) =>
            b.id === 'milk-2' ? { ...b, expiryDate: '2026-07-14' } : b,
          ),
        );
        renderWithProviders(<PantryPage />);
        await user.click(await screen.findByRole('button', { name: /^Milk/ }));
        // The expired Batch sorts first.
        await openEditor(user, batchRows()[0]);
        const form = screen.getByRole('form', { name: 'Edit Milk batch' });
        await user.click(
          within(form).getByRole('button', {
            name: /^Expires, Tuesday, July 14,/,
          }),
        );
        const sheet = await screen.findByRole('dialog', { name: 'Expires' });
        const calendar = within(sheet).getByRole('group', { name: 'Calendar' });

        const headings = within(calendar)
          .getAllByRole('heading')
          .map((heading) => heading.textContent);
        expect(headings[0]).toBe('July 2026');
        expect(
          scrolling.scrolledTo(calendar)?.child?.querySelector('h3'),
        ).toHaveTextContent('July 2026');
        const day = calendarDay(sheet, 'Tuesday, July 14, 2026');
        expect(day).toHaveAttribute('aria-pressed', 'true');

        await user.click(quickPick(sheet, /^3 days,/));
        expect(day).toHaveAttribute('aria-pressed', 'false');
        await user.click(day);
        expect(day).toHaveAttribute('aria-pressed', 'true');
        await user.click(sheetButton(sheet, 'Done'));
        await waitFor(() =>
          expect(
            screen.queryByRole('dialog', { name: 'Expires' }),
          ).not.toBeInTheDocument(),
        );

        // Back on the date the Batch already had: nothing to send.
        await user.click(
          within(form).getByRole('button', { name: 'Save changes' }),
        );
        await waitFor(() =>
          expect(
            screen.queryByRole('form', { name: 'Edit Milk batch' }),
          ).not.toBeInTheDocument(),
        );
        expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);
      });

      it('saves a day tapped on the calendar', async () => {
        const user = userEvent.setup();
        const { calls, form, sheet } = await openExpirySheet(user);

        await user.click(calendarDay(sheet, 'Thursday, December 3, 2026'));
        await user.click(sheetButton(sheet, 'Done'));
        await waitFor(() =>
          expect(
            screen.queryByRole('dialog', { name: 'Expires' }),
          ).not.toBeInTheDocument(),
        );

        expect(await saveEdit(user, form, calls)).toEqual({
          expiryDate: '2026-12-03',
        });
      });
    });

    describe('the Batch editor sheet', () => {
      afterEach(() => vi.useRealTimers());

      it('focuses the form, and returns focus to the row on Cancel', async () => {
        const user = userEvent.setup();
        stubManaged(stock());
        renderWithProviders(<PantryPage />);
        await user.click(await screen.findByRole('button', { name: /^Milk/ }));
        const row = batchRows()[0];
        await openEditor(user, row);
        expect(
          screen.getByRole('textbox', { name: /Amount of Milk/ }),
        ).toHaveFocus();
        await user.click(screen.getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(row).toHaveFocus());
      });

      it('says "Updated Milk" after Save and returns focus to the row', async () => {
        const user = userEvent.setup();
        stubManaged(stock());
        renderWithProviders(<PantryPage />);
        await user.click(await screen.findByRole('button', { name: /^Milk/ }));
        const row = batchRows()[0];
        await openEditor(user, row);
        await user.clear(
          screen.getByRole('textbox', { name: /Amount of Milk/ }),
        );
        await user.clear(
          screen.getByRole('textbox', { name: /Amount of Milk/ }),
        );
        await user.type(
          screen.getByRole('textbox', { name: /Amount of Milk/ }),
          '2',
        );
        await user.click(screen.getByRole('button', { name: 'Save changes' }));
        expect(await screen.findByText('Updated Milk')).toBeInTheDocument();
        await waitFor(() => expect(row).toHaveFocus());
      });

      it('"Remove from Pantry" closes the sheet and opens the row\'s confirmation', async () => {
        const user = userEvent.setup();
        stubManaged(stock());
        renderWithProviders(<PantryPage />);
        await user.click(await screen.findByRole('button', { name: /^Milk/ }));
        await openEditor(user);
        await user.click(
          screen.getByRole('button', { name: 'Remove from Pantry' }),
        );

        const question = await screen.findByRole('group', {
          name: 'Remove 0.5 L Milk?',
        });
        expect(within(question).getByText('in your Pantry')).toBeVisible();
        await waitFor(() =>
          expect(screen.getByRole('button', { name: 'Keep' })).toHaveFocus(),
        );
        expect(screen.queryByRole('form')).toBeNull();
      });
    });

    describe('hold to edit', () => {
      afterEach(() => vi.useRealTimers());

      async function expanded() {
        // Real timers to load and expand; then frozen time, so no real time leaks into the hold.
        const user = userEvent.setup();
        stubManaged(stock());
        renderWithProviders(<PantryPage />);
        await user.click(await screen.findByRole('button', { name: /^Milk/ }));
        const content = batchRows()[0].querySelector(
          '[data-swipe-row-content]',
        ) as HTMLElement;
        vi.useFakeTimers();
        return { content };
      }
      const press = (content: HTMLElement, x = 50, y = 20) =>
        fireEvent.pointerDown(content, {
          pointerId: 1,
          clientX: x,
          clientY: y,
        });
      const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

      it('opens the editor after 500 ms (plus the 160 ms lead-in)', async () => {
        const { content } = await expanded();
        press(content);
        await wait(600);
        expect(screen.queryByRole('form')).toBeNull();
        await wait(200);
        expect(
          screen.getByRole('form', { name: 'Edit Milk batch' }),
        ).toBeInTheDocument();
      });

      it('does nothing visible for a quick tap', async () => {
        const { content } = await expanded();
        press(content);
        await wait(60);
        expect(content.querySelector('[data-hold-circle]')).toBeNull();
        fireEvent.pointerUp(content, {
          pointerId: 1,
          clientX: 50,
          clientY: 20,
        });
        await wait(1000);
        expect(screen.queryByRole('form')).toBeNull();
        expect(content.querySelector('[data-hold-circle]')).toBeNull();
      });

      it('cancels when the finger moves more than 8 pt', async () => {
        const { content } = await expanded();
        press(content);
        await wait(200);
        fireEvent.pointerMove(content, {
          pointerId: 1,
          clientX: 50,
          clientY: 31,
        });
        await wait(1000);
        expect(screen.queryByRole('form')).toBeNull();
      });

      it('only dims the row, with no circle, under reduce-motion', async () => {
        stubMotion(true);
        const { content } = await expanded();
        press(content);
        await wait(120);
        expect(content.querySelector('[data-hold-circle]')).toBeNull();
        expect(content.firstElementChild).toHaveStyle({ opacity: '0.7' });
      });

      it('shows the hold circle while pressing', async () => {
        const { content } = await expanded();
        press(content);
        await wait(120);
        expect(content.querySelector('[data-hold-circle]')).not.toBeNull();
      });
    });

    it('searches localised names and Product Descriptions', async () => {
      const user = userEvent.setup();
      stubManaged(stock());
      renderWithProviders(<PantryPage />);

      const search = await screen.findByRole('searchbox', {
        name: 'Search Pantry',
      });
      await user.type(search, 'grana');
      expect(screen.getByText('Parmesan')).toBeInTheDocument();
      expect(screen.queryByText('Milk')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'All · 1' }),
      ).toBeInTheDocument();

      await user.clear(search);
      await user.type(search, 'MILK');
      expect(screen.getByText('Milk')).toBeInTheDocument();
      expect(screen.queryByText('Parmesan')).not.toBeInTheDocument();

      await user.clear(search);
      await user.type(search, 'zzz');
      expect(screen.getByText('No batches match.')).toBeInTheDocument();
    });

    it('filters by Location with live counts and marks the active chip', async () => {
      const user = userEvent.setup();
      stubManaged(stock());
      renderWithProviders(<PantryPage />);

      const all = await screen.findByRole('button', { name: 'All · 4' });
      expect(all).toHaveAttribute('aria-pressed', 'true');
      expect(
        screen.getByRole('button', { name: 'Fridge · 2' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Freezer · 1' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Cupboard · 1' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Spices · 0' }),
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Freezer · 1' }));
      expect(
        screen.getByRole('button', { name: 'Freezer · 1' }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(all).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByText('Parmesan')).toBeInTheDocument();
      expect(screen.queryByText('Milk')).not.toBeInTheDocument();

      // Counts follow the search.
      await user.type(
        screen.getByRole('searchbox', { name: 'Search Pantry' }),
        'milk',
      );
      expect(
        screen.getByRole('button', { name: 'Fridge · 2' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Freezer · 0' }),
      ).toBeInTheDocument();
    });
  });

  describe('Recently Stocked tiles on the Add batch search', () => {
    const daysAgo = (days: number) =>
      new Date(Date.now() - days * 86_400_000).toISOString();
    const milk: Stocked = {
      ...parmesan,
      id: 'milk-id',
      name: 'Milk',
      defaultUnit: 'ml',
      lastStockedAt: daysAgo(0),
      inPantry: true,
    };
    const stocked: Stocked[] = [
      milk,
      {
        ...parmesan,
        lastStockedAt: daysAgo(17),
        inPantry: false,
      },
    ];

    it('shows tiles with the in-Pantry state and a short relative time', async () => {
      const user = userEvent.setup();
      stubPantry([], [], stocked);
      renderWithProviders(<PantryPage />);

      await user.click(
        await screen.findByRole('button', { name: 'Add batch' }),
      );
      await user.click(
        await screen.findByRole('combobox', { name: 'Search ingredients' }),
      );
      const section = await screen.findByRole('region', {
        name: 'Recently stocked',
      });

      const milkTile = within(section).getByRole('button', {
        name: 'Milk, in pantry, added today',
      });
      expect(milkTile).toHaveTextContent('●in pantry · added today');
      const parmesanTile = within(section).getByRole('button', {
        name: 'Parmesan, added 2w ago',
      });
      expect(parmesanTile).toHaveTextContent('+added 2w ago');
    });

    it('selects the tapped Ingredient through the search and shows the form', async () => {
      const user = userEvent.setup();
      stubPantry([], [], stocked);
      renderWithProviders(<PantryPage />);

      await user.click(
        await screen.findByRole('button', { name: 'Add batch' }),
      );
      await user.click(
        await screen.findByRole('combobox', { name: 'Search ingredients' }),
      );
      await user.click(
        await screen.findByRole('button', { name: /^Parmesan, added/ }),
      );

      expect(
        screen.getByRole('combobox', {
          name: 'Ingredient: Parmesan. Press Backspace to change',
        }),
      ).toBeInTheDocument();
      expect(pressedLocation()).toBe('Fridge');
      expect(
        screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('region', { name: 'Recently stocked' }),
      ).not.toBeInTheDocument();
    });

    it('hides the section when nothing has been stocked', async () => {
      const user = userEvent.setup();
      stubPantry([], [], []);
      renderWithProviders(<PantryPage />);

      await user.click(
        await screen.findByRole('button', { name: 'Add batch' }),
      );
      await screen.findByRole('combobox', { name: 'Search ingredients' });
      await waitFor(() =>
        expect(
          screen.queryByRole('region', { name: 'Recently stocked' }),
        ).not.toBeInTheDocument(),
      );
      expect(screen.queryByText('Recently stocked')).not.toBeInTheDocument();
    });

    it('shows at most 8 tiles', async () => {
      const user = userEvent.setup();
      const many = Array.from({ length: 10 }, (_, i) => ({
        ...milk,
        id: `ing-${i}`,
        name: `Item ${i}`,
      }));
      stubPantry([], [], many);
      renderWithProviders(<PantryPage />);

      await user.click(
        await screen.findByRole('button', { name: 'Add batch' }),
      );
      await user.click(
        await screen.findByRole('combobox', { name: 'Search ingredients' }),
      );
      const section = await screen.findByRole('region', {
        name: 'Recently stocked',
      });
      expect(within(section).getAllByRole('button')).toHaveLength(8);
    });
  });
});

describe('PantryPage Browse by aisle', () => {
  afterEach(() => vi.unstubAllGlobals());
  const browseAisles = {
    aisles: [
      {
        id: 'aisle-dairy',
        name: 'Dairy & eggs',
        parentCategories: [{ id: 'p-dairy', name: 'Dairy' }],
      },
    ],
  };

  it('shows Browse by aisle in the add-batch search, and opening an aisle searches it', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = stubApi({
      'GET /api/pantry': () => Response.json({ batches: [] }),
      'GET /api/settings/family': familySettings(3),
      'GET /api/catalog/aisles': () => Response.json(browseAisles),
      'GET /api/catalog/search': () => Response.json({ results: [parmesan] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<PantryPage />);

    await user.click(await screen.findByRole('button', { name: 'Add batch' }));
    await user.click(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
    );
    expect(await screen.findByText('Browse by aisle')).toBeVisible();
    await user.click(
      await screen.findByRole('button', { name: 'Dairy & eggs' }),
    );

    // The aisle view takes the block's place in the list (handoff 4.4).
    expect(
      screen.getByRole('button', { name: 'Leave Dairy & eggs' }),
    ).toBeVisible();
    await vi.waitFor(() => {
      const search = calls.filter((c) => c.key === 'GET /api/catalog/search');
      const params = new URLSearchParams(search.at(-1)?.search);
      expect(params.get('aisleId')).toBe('aisle-dairy');
      expect(params.get('scope')).not.toBe('shared');
    });
  });

  it('puts Recently stocked above Browse by aisle', async () => {
    const user = userEvent.setup();
    const { fetchMock } = stubApi({
      'GET /api/pantry': () => Response.json({ batches: [] }),
      'GET /api/pantry/recently-stocked': () =>
        Response.json({
          ingredients: [
            {
              ...parmesan,
              lastStockedAt: new Date().toISOString(),
              inPantry: true,
            },
          ],
        }),
      'GET /api/settings/family': familySettings(3),
      'GET /api/catalog/aisles': () => Response.json(browseAisles),
      'GET /api/catalog/search': () => Response.json({ results: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<PantryPage />);

    await user.click(await screen.findByRole('button', { name: 'Add batch' }));
    await user.click(
      await screen.findByRole('combobox', { name: 'Search ingredients' }),
    );
    const recent = await screen.findByRole('region', {
      name: 'Recently stocked',
    });
    const browse = await screen.findByText('Browse by aisle');

    expect(
      recent.compareDocumentPosition(browse) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('PantryPage: Add to your catalog (#270)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers Add to your catalog in the Add batch search, above Use as typed when nothing matches', async () => {
    const user = userEvent.setup();
    stubPantry([], []);
    renderWithProviders(<PantryPage />);

    await user.click(await screen.findByRole('button', { name: 'Add batch' }));
    await user.click(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
    );
    await user.paste('kombucha');

    const options = await screen.findAllByRole('option');
    expect(options[0]).toHaveAccessibleName(/Add “kombucha” to your catalog/);
    expect(options[1]).toHaveAccessibleName(/Use “kombucha” as typed/);
    expect(
      screen.getByRole('button', { name: 'Add “kombucha” to your catalog' }),
    ).toBeVisible();
  });
});
