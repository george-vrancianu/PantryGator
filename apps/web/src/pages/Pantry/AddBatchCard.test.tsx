import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '@/lib/catalog';
import { stubPantry } from '@/test/addBatch';
import { pickLocation, pressedLocation } from '@/test/location';
import { renderWithProviders } from '@/test/render';
import { PantryPage } from './PantryPage';

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
const eggs: CatalogSearchResult = {
  ...parmesan,
  id: 'eggs-id',
  name: 'Eggs',
  defaultUnit: 'pcs',
  leafCategory: { id: 'eggs', name: 'Eggs' },
  defaults: { expiryDays: null, location: null },
};

const batchPost = (calls: ReturnType<typeof stubPantry>) =>
  calls.find((call) => call.key === 'POST /api/pantry/batches')?.body;

async function openAndPick(name: string, query: string) {
  const user = userEvent.setup();
  const calls = stubPantry({
    'GET /api/catalog/search': () =>
      Response.json({ results: [parmesan, eggs] }),
    'POST /api/pantry/batches': () =>
      Response.json({ id: 'b1' }, { status: 201 }),
  });
  renderWithProviders(<PantryPage />);
  await user.click(await screen.findByRole('button', { name: 'Add batch' }));
  await user.type(
    screen.getByRole('combobox', { name: 'Search ingredients' }),
    query,
  );
  await user.click(
    await screen.findByRole('option', { name: new RegExp(name) }),
  );
  return { user, calls };
}

describe('the Add to Pantry card', () => {
  // Wednesday 14 October 2026. Only `Date` is faked, so timers and transitions run as usual.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 14, 15, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows the token, starts the amount at the usual one and names the button in lowercase', async () => {
    await openAndPick('Parmesan', 'parm');
    expect(
      screen.getByRole('combobox', {
        name: 'Ingredient: Parmesan. Press Backspace to change',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Hard cheese · Dairy & eggs')).toBeInTheDocument();
    // Mass: the second Usual Amount of a medium scale.
    expect(
      screen.getByRole('textbox', { name: /Amount of Parmesan/ }),
    ).toHaveValue('500');
    expect(screen.getByRole('button', { name: 'Add parmesan' })).toBeEnabled();
  });

  it('clears the pick with Backspace and refocuses the search', async () => {
    const { user } = await openAndPick('Parmesan', 'parm');
    await user.keyboard('{Backspace}');
    expect(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
    ).toHaveFocus();
    expect(screen.queryByRole('group', { name: 'Location' })).toBeNull();
  });

  it('marks the Catalog default Location with a dot read as "usual" and a hint', async () => {
    const { user } = await openAndPick('Parmesan', 'parm');
    const group = screen.getByRole('group', { name: 'Location' });
    const fridge = within(group).getByRole('button', { name: 'Fridge usual' });
    expect(fridge).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('usual for Hard cheese')).toBeInTheDocument();

    await pickLocation(user, 'Freezer');
    expect(pressedLocation()).toBe('Freezer');
    expect(screen.queryByText('usual for Hard cheese')).toBeNull();
    // The dot stays on the Catalog default.
    expect(
      within(group).getByRole('button', { name: 'Fridge usual' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('saves to Cupboard with no dot or hint when the Ingredient has no default Location', async () => {
    const { user, calls } = await openAndPick('Eggs', 'egg');
    expect(pressedLocation()).toBe('Cupboard');
    expect(screen.queryByText(/^usual for/)).toBeNull();
    expect(screen.queryByText('usual', { exact: false })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add eggs' }));
    await waitFor(() => expect(batchPost(calls)).toBeDefined());
    expect(batchPost(calls)).toMatchObject({
      location: 'cupboard',
      expiryDate: null,
      quantity: 6,
      unit: 'pcs',
    });
  });

  it('selects Usual by default and saves the Default Expiry date, with the resolved line', async () => {
    const { user, calls } = await openAndPick('Parmesan', 'parm');
    const chips = screen.getByRole('group', { name: 'Expires' });
    expect(
      within(chips).getByRole('button', { name: 'Usual · 1 mo' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Fri, Nov 13 · in 30 days/)).toHaveTextContent(
      'usual for Parmesan',
    );
    await user.click(screen.getByRole('button', { name: 'Add parmesan' }));
    await waitFor(() => expect(batchPost(calls)).toBeDefined());
    expect(batchPost(calls)).toMatchObject({
      ingredientId: 'parmesan-id',
      location: 'fridge',
      expiryDate: '2026-11-13',
    });
  });

  it.each([
    ['3 d', '2026-10-17', /Sat, Oct 17 · in 3 days/],
    ['1 wk', '2026-10-21', /Wed, Oct 21 · in 7 days/],
    ['2 wk', '2026-10-28', /Wed, Oct 28 · in 14 days/],
    ['No date', null, /No expiry date/],
  ])('saves the %s quick pick', async (chip, date, line) => {
    const { user, calls } = await openAndPick('Parmesan', 'parm');
    await user.click(screen.getByRole('button', { name: chip }));
    expect(screen.getByRole('button', { name: chip })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(line)).not.toHaveTextContent('usual for');
    await user.click(screen.getByRole('button', { name: 'Add parmesan' }));
    await waitFor(() => expect(batchPost(calls)).toBeDefined());
    expect(batchPost(calls)).toMatchObject({ expiryDate: date });
  });

  it('selects Usual when the chosen date equals the usual one, via the calendar', async () => {
    const { user } = await openAndPick('Parmesan', 'parm');
    await user.click(screen.getByRole('button', { name: '3 d' }));
    await user.click(screen.getByRole('button', { name: 'Calendar' }));
    const sheet = await screen.findByRole('dialog', { name: 'Expires' });
    await user.click(
      within(sheet).getByRole('button', { name: 'Friday, November 13, 2026' }),
    );
    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Expires' })).toBeNull(),
    );
    expect(
      screen.getByRole('button', { name: 'Usual · 1 mo' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the chosen expiry when the Location changes', async () => {
    const { user, calls } = await openAndPick('Parmesan', 'parm');
    await user.click(screen.getByRole('button', { name: '1 wk' }));
    await pickLocation(user, 'Freezer');
    expect(screen.getByRole('button', { name: '1 wk' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Add parmesan' }));
    await waitFor(() => expect(batchPost(calls)).toBeDefined());
    expect(batchPost(calls)).toMatchObject({
      location: 'freezer',
      expiryDate: '2026-10-21',
    });
  });

  it('folds the note for a typed pick, and reveals and focuses it on tap', async () => {
    const { user, calls } = await openAndPick('Parmesan', 'parm');
    expect(screen.queryByLabelText('Note · optional')).toBeNull();
    await user.click(
      screen.getByRole('button', { name: '+ Add a note (brand, size)' }),
    );
    const note = screen.getByLabelText('Note · optional');
    expect(note).toHaveFocus();
    await user.type(note, 'Grana');
    await user.click(screen.getByRole('button', { name: 'Add parmesan' }));
    await waitFor(() => expect(batchPost(calls)).toBeDefined());
    expect(batchPost(calls)).toMatchObject({ productDescription: 'Grana' });
  });

  it('presses Usual, not 1 mo, when the Default Expiry is a month', async () => {
    const { user } = await openAndPick('Parmesan', 'parm');
    await user.click(screen.getByRole('button', { name: '3 d' }));
    await user.click(screen.getByRole('button', { name: '1 mo' }));
    expect(
      screen.getByRole('button', { name: 'Usual · 1 mo' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '1 mo' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('puts the date in the calendar chip name, and the resolved line in the group description', async () => {
    const { user } = await openAndPick('Parmesan', 'parm');
    const group = screen.getByRole('group', { name: 'Expires' });
    expect(group).toHaveAccessibleDescription(/Fri, Nov 13 · in 30 days/);
    await user.click(screen.getByRole('button', { name: '3 d' }));
    await user.click(screen.getByRole('button', { name: 'Calendar' }));
    const sheet = await screen.findByRole('dialog', { name: 'Expires' });
    await user.click(
      within(sheet).getByRole('button', { name: 'Tuesday, October 20, 2026' }),
    );
    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Expires' })).toBeNull(),
    );
    expect(
      screen.getByRole('button', { name: /^Calendar, .*Oct 20/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(group).toHaveAccessibleDescription(/Tue, Oct 20 · in 6 days/);
  });

  it('puts "Add parmesan" in the sheet footer only after a pick, with no Cancel', async () => {
    const user = userEvent.setup();
    stubPantry({
      'GET /api/catalog/search': () => Response.json({ results: [parmesan] }),
    });
    renderWithProviders(<PantryPage />);
    await user.click(await screen.findByRole('button', { name: 'Add batch' }));
    const dialog = screen.getByRole('dialog', { name: 'Add to Pantry' });
    expect(within(dialog).queryByRole('button', { name: /^Add / })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).toBeNull();
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'parm',
    );
    await user.click(await screen.findByRole('option', { name: /Parmesan/ }));
    const add = within(dialog).getByRole('button', { name: 'Add parmesan' });
    // Outside the form and the scrolling body, tied to the form by `form=`.
    expect(add.closest('form')).toBeNull();
    expect(add).toHaveAttribute('form', screen.getByRole('form').id);
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
});
