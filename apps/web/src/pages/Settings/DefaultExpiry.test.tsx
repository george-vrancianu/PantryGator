import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CategoryOptions } from '../../lib/settings';
import { renderWithProviders, stubApi } from '../../test/render';
import { stubViewport } from '../../test/viewport';
import { SettingsPage } from './SettingsPage';

type Override = { categoryId: string; name: string; days: number };

/** As `GET /api/settings/categories` answers: every category carries `catalogDays`. */
const categories: CategoryOptions = {
  parents: [
    {
      id: 'p-dairy',
      name: 'Dairy',
      catalogDays: 7,
      leaves: [
        { id: 'l-milk', name: 'Milk', catalogDays: 5 },
        { id: 'l-cheese', name: 'Hard cheese', catalogDays: 60 },
      ],
    },
    {
      id: 'p-produce',
      name: 'Produce',
      catalogDays: null,
      leaves: [{ id: 'l-leafy', name: 'Leafy greens', catalogDays: null }],
    },
  ],
};

function family(expiryOverrides: Override[]) {
  return {
    staleThresholdDays: 3,
    expiryOverrides,
  };
}

/** The Family tab with these overrides; the mutation routes answer as the API does. */
function stubFamily(
  overrides: Override[],
  options: {
    put?: () => Response;
    del?: () => Response;
    categories?: () => Response | Promise<Response>;
  } = {},
) {
  let current = overrides;
  const { fetchMock, calls } = stubApi({
    'GET /api/settings/family': () => Response.json(family(current)),
    'GET /api/settings/categories': () =>
      options.categories?.() ?? Response.json(categories),
    'GET /api/settings/preferences': () =>
      Response.json({ locale: null, theme: null }),
    'GET /api/auth/get-session': () => Response.json(null),
    'PUT /api/settings/family/expiry-overrides/l-milk': () =>
      options.put?.() ?? new Response(null, { status: 204 }),
    'DELETE /api/settings/family/expiry-overrides/l-milk': () => {
      current = current.filter((o) => o.categoryId !== 'l-milk');
      return options.del?.() ?? new Response(null, { status: 204 });
    },
    'PUT /api/settings/family/expiry-overrides/l-cheese': () => {
      current = [
        ...current,
        { categoryId: 'l-cheese', name: 'Hard cheese', days: 30 },
      ];
      return new Response(null, { status: 204 });
    },
    'DELETE /api/settings/family/expiry-overrides/p-produce': () => {
      current = current.filter((o) => o.categoryId !== 'p-produce');
      return new Response(null, { status: 204 });
    },
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls };
}

const MILK: Override = { categoryId: 'l-milk', name: 'Milk', days: 9 };
const PRODUCE: Override = {
  categoryId: 'p-produce',
  name: 'Produce',
  days: 21,
};

function renderFamily() {
  return renderWithProviders(<SettingsPage />, {
    route: '/settings?tab=family',
  });
}

const writes = (calls: { key: string }[]) =>
  calls.map((call) => call.key).filter((key) => !key.startsWith('GET'));

const rowOf = (name: string) =>
  within(screen.getByRole('list', { name: 'Default expiry' })).getByRole(
    'button',
    { name: new RegExp(`^${name}\\b`) },
  );

describe('Default expiry', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('the list', () => {
    it('shows each override with its name, parent, Catalog default and value', async () => {
      stubFamily([MILK, PRODUCE]);
      renderFamily();

      const milk = await waitFor(() => rowOf('Milk'));
      expect(within(milk).getByText('Dairy · Catalog 5 d')).toBeVisible();
      expect(within(milk).getByText('9')).toBeVisible();

      const produce = rowOf('Produce');
      expect(
        within(produce).getByText('Produce · every category without its own'),
      ).toBeVisible();
      expect(within(produce).getByText('21')).toBeVisible();
    });

    it('explains the Catalog defaults and offers "Set a category" when empty', async () => {
      stubFamily([]);
      renderFamily();

      expect(
        await screen.findByText(
          'Catalog defaults are used for every category. Add one to set your own.',
        ),
      ).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Set a category' }),
      ).toBeVisible();
    });

    it('removing a row hides it at once, shows Undo, and sends nothing until the toast closes', async () => {
      vi.useFakeTimers();
      const { calls } = stubFamily([MILK, PRODUCE]);
      renderFamily();
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(rowOf('Milk')).toBeVisible();

      fireEvent.click(
        screen.getByRole('button', {
          name: 'Use the Catalog default for Milk',
        }),
      );

      expect(screen.queryByRole('button', { name: /^Milk\b/ })).toBeNull();
      expect(screen.getByText('Milk uses the Catalog default')).toBeVisible();
      expect(writes(calls)).toEqual([]);

      await act(() => vi.advanceTimersByTimeAsync(4000));
      expect(writes(calls)).toEqual([]);
      await act(() => vi.advanceTimersByTimeAsync(1500));
      await act(() => vi.advanceTimersByTimeAsync(0));

      expect(writes(calls)).toEqual([
        'DELETE /api/settings/family/expiry-overrides/l-milk',
      ]);
      expect(screen.queryByRole('button', { name: /^Milk\b/ })).toBeNull();
    });

    it('Undo brings the row back and sends no request', async () => {
      const user = userEvent.setup();
      const { calls } = stubFamily([MILK]);
      renderFamily();
      await screen.findByRole('button', { name: /^Milk\b/ });

      await user.click(
        screen.getByRole('button', {
          name: 'Use the Catalog default for Milk',
        }),
      );
      expect(screen.queryByRole('button', { name: /^Milk\b/ })).toBeNull();
      await user.click(await screen.findByRole('button', { name: 'Undo' }));

      expect(rowOf('Milk')).toBeVisible();
      expect(writes(calls)).toEqual([]);
    });
  });

  describe('the sheet', () => {
    it('opens in pick mode from "Set a category", with search and "All {parent}" first in each group', async () => {
      const user = userEvent.setup();
      stubFamily([]);
      renderFamily();
      await user.click(
        await screen.findByRole('button', { name: 'Set a category' }),
      );

      const sheet = await screen.findByRole('dialog', {
        name: 'Pick a category',
      });
      expect(
        within(sheet).getByRole('textbox', { name: 'Search categories' }),
      ).toBeVisible();
      const dairy = within(sheet).getByRole('group', { name: 'Dairy' });
      const rows = within(dairy).getAllByRole('button');
      expect(rows[0]).toHaveTextContent('All Dairy');
      expect(rows[0]).toHaveTextContent('Every Dairy category without its own');
      expect(rows[1]).toHaveTextContent('Milk');
      expect(rows[1]).toHaveTextContent('Catalog 5 d');
    });

    it('filters by category or parent name and says so when nothing matches', async () => {
      const user = userEvent.setup();
      stubFamily([]);
      renderFamily();
      await user.click(
        await screen.findByRole('button', { name: 'Set a category' }),
      );
      const sheet = await screen.findByRole('dialog', {
        name: 'Pick a category',
      });
      const search = within(sheet).getByRole('textbox', {
        name: 'Search categories',
      });

      await user.type(search, 'chees');
      expect(
        within(sheet).getByRole('button', { name: /Hard cheese/ }),
      ).toBeVisible();
      expect(within(sheet).queryByRole('button', { name: /Milk/ })).toBeNull();

      await user.clear(search);
      await user.type(search, 'produce');
      expect(
        within(sheet).getByRole('button', { name: /Leafy greens/ }),
      ).toBeVisible();

      await user.clear(search);
      await user.type(search, 'zzz');
      expect(
        within(sheet).getByText('No category matches “zzz”.'),
      ).toBeVisible();
    });

    it('says the categories are loading while they load, not that none match', async () => {
      const user = userEvent.setup();
      stubFamily([], { categories: () => new Promise<Response>(() => {}) });
      renderFamily();
      await user.click(
        await screen.findByRole('button', { name: 'Set a category' }),
      );
      const sheet = await screen.findByRole('dialog', {
        name: 'Pick a category',
      });

      expect(within(sheet).getByRole('status')).toHaveTextContent(
        'Loading categories',
      );
      expect(within(sheet).queryByText(/No category matches/)).toBeNull();
    });

    it('shows the error when the categories fail to load', async () => {
      const user = userEvent.setup();
      stubFamily([], {
        categories: () =>
          Response.json({ code: 'unknown', params: {} }, { status: 500 }),
      });
      renderFamily();
      await user.click(
        await screen.findByRole('button', { name: 'Set a category' }),
      );
      const sheet = await screen.findByRole('dialog', {
        name: 'Pick a category',
      });

      expect(await within(sheet).findByRole('alert')).toHaveTextContent(
        'Something went wrong. Please try again.',
      );
      expect(within(sheet).queryByText(/No category matches/)).toBeNull();
    });

    it('shows the override as "Set" beside a category, else the Catalog default', async () => {
      const user = userEvent.setup();
      stubFamily([MILK]);
      renderFamily();
      await user.click(
        await screen.findByRole('button', { name: 'Set a category' }),
      );
      const sheet = await screen.findByRole('dialog', {
        name: 'Pick a category',
      });

      expect(
        within(sheet).getByRole('button', { name: /Milk/ }),
      ).toHaveTextContent('Set · 9 d');
      expect(
        within(sheet).getByRole('button', { name: /Hard cheese/ }),
      ).toHaveTextContent('Catalog 60 d');
    });

    it('starts at the existing override in edit mode, with "Use Catalog default"', async () => {
      const user = userEvent.setup();
      stubFamily([MILK]);
      renderFamily();
      await user.click(await rowOfAsync('Milk'));

      const sheet = await screen.findByRole('dialog', { name: 'Milk' });
      expect(
        within(sheet).getByRole('button', { name: '1 week' }),
      ).toHaveAttribute('aria-pressed', 'false');
      expect(within(sheet).getByText('9 days')).toBeVisible();
      expect(
        within(sheet).getByRole('button', { name: 'Use Catalog default' }),
      ).toBeVisible();
    });

    it('starts at the Catalog default when there is no override, and has no "Use Catalog default" then', async () => {
      const user = userEvent.setup();
      stubFamily([]);
      renderFamily();
      await user.click(
        await screen.findByRole('button', { name: 'Set a category' }),
      );
      await user.click(await screen.findByRole('button', { name: /Milk/ }));

      const sheet = await screen.findByRole('dialog', { name: 'Milk' });
      expect(within(sheet).getByText('5 days')).toBeVisible();
      expect(within(sheet).getByText('Catalog says 5')).toBeVisible();
      expect(
        within(sheet).queryByRole('button', { name: 'Use Catalog default' }),
      ).toBeNull();
    });

    it('starts at seven days when there is neither an override nor a Catalog default', async () => {
      const user = userEvent.setup();
      stubFamily([]);
      renderFamily();
      await user.click(
        await screen.findByRole('button', { name: 'Set a category' }),
      );
      await user.click(
        await screen.findByRole('button', { name: /Leafy greens/ }),
      );

      const sheet = await screen.findByRole('dialog', { name: 'Leafy greens' });
      expect(within(sheet).getByText('7 days')).toBeVisible();
      expect(
        within(sheet).getByRole('button', { name: '1 week' }),
      ).toHaveAttribute('aria-pressed', 'true');
    });

    it('highlights only the quick pick that equals the value', async () => {
      const user = userEvent.setup();
      stubFamily([MILK]);
      renderFamily();
      await user.click(await rowOfAsync('Milk'));
      const sheet = await screen.findByRole('dialog', { name: 'Milk' });

      const pressed = () =>
        within(sheet)
          .queryAllByRole('button', { pressed: true })
          .map((button) => button.getAttribute('aria-label'));
      expect(pressed()).toEqual([]);

      await user.click(within(sheet).getByRole('button', { name: '2 weeks' }));
      expect(pressed()).toEqual(['2 weeks']);
      expect(within(sheet).getByText('14 days')).toBeVisible();
    });

    it('the stepper covers 1 to 3650 days', async () => {
      const user = userEvent.setup();
      stubFamily([]);
      renderFamily();
      await user.click(
        await screen.findByRole('button', { name: 'Set a category' }),
      );
      await user.click(await screen.findByRole('button', { name: /Milk/ }));
      const sheet = await screen.findByRole('dialog', { name: 'Milk' });

      await user.click(
        within(sheet).getByRole('button', { name: 'One day fewer' }),
      );
      await user.click(
        within(sheet).getByRole('button', { name: 'One day fewer' }),
      );
      await user.click(
        within(sheet).getByRole('button', { name: 'One day fewer' }),
      );
      await user.click(
        within(sheet).getByRole('button', { name: 'One day fewer' }),
      );
      expect(within(sheet).getByText('1 day')).toBeVisible();
      expect(
        within(sheet).getByRole('button', { name: 'One day fewer' }),
      ).toBeDisabled();
    });

    it('Save sets the override, closes, and shows "{name}: {n} days"', async () => {
      const user = userEvent.setup();
      const { calls } = stubFamily([MILK]);
      renderFamily();
      await user.click(await rowOfAsync('Milk'));
      const sheet = await screen.findByRole('dialog', { name: 'Milk' });

      await user.click(within(sheet).getByRole('button', { name: '2 weeks' }));
      await user.click(within(sheet).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Milk: 14 days')).toBeVisible();
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Milk' })).toBeNull(),
      );
      expect(calls.filter((call) => call.key.startsWith('PUT'))).toEqual([
        expect.objectContaining({
          key: 'PUT /api/settings/family/expiry-overrides/l-milk',
          body: { days: 14 },
        }),
      ]);
    });

    it('creates a new override from "Set a category" and lists it', async () => {
      const user = userEvent.setup();
      const { calls } = stubFamily([MILK]);
      renderFamily();
      await user.click(
        await screen.findByRole('button', { name: 'Set a category' }),
      );
      const picker = await screen.findByRole('dialog', {
        name: 'Pick a category',
      });
      await user.click(
        within(picker).getByRole('button', { name: /Hard cheese/ }),
      );
      const sheet = await screen.findByRole('dialog', { name: 'Hard cheese' });
      await user.click(within(sheet).getByRole('button', { name: '1 month' }));
      await user.click(within(sheet).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Hard cheese: 30 days')).toBeVisible();
      expect(calls.filter((call) => call.key.startsWith('PUT'))).toEqual([
        expect.objectContaining({
          key: 'PUT /api/settings/family/expiry-overrides/l-cheese',
          body: { days: 30 },
        }),
      ]);
      const row = await waitFor(() => rowOf('Hard cheese'));
      expect(within(row).getByText('Dairy · Catalog 60 d')).toBeVisible();
      expect(within(row).getByText('30')).toBeVisible();
    });

    it('saving a category whose removal is still waiting on Undo drops that removal and sends only the PUT', async () => {
      const user = userEvent.setup();
      const { calls } = stubFamily([MILK]);
      renderFamily();
      await rowOfAsync('Milk');

      await user.click(
        screen.getByRole('button', {
          name: 'Use the Catalog default for Milk',
        }),
      );
      await user.click(screen.getByRole('button', { name: 'Set a category' }));
      const picker = await screen.findByRole('dialog', {
        name: 'Pick a category',
      });
      await user.click(within(picker).getByRole('button', { name: /Milk/ }));
      const sheet = await screen.findByRole('dialog', { name: 'Milk' });
      await user.click(within(sheet).getByRole('button', { name: '2 weeks' }));
      await user.click(within(sheet).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Milk: 14 days')).toBeVisible();
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Milk' })).toBeNull(),
      );
      expect(screen.queryByText('Milk uses the Catalog default')).toBeNull();
      expect(writes(calls)).toEqual([
        'PUT /api/settings/family/expiry-overrides/l-milk',
      ]);
      expect(rowOf('Milk')).toBeVisible();
    });

    it('a save error keeps the sheet open with the error above the footer', async () => {
      const user = userEvent.setup();
      stubFamily([MILK], {
        put: () =>
          Response.json({ code: 'unknown', params: {} }, { status: 500 }),
      });
      renderFamily();
      await user.click(await rowOfAsync('Milk'));
      const sheet = await screen.findByRole('dialog', { name: 'Milk' });

      await user.click(within(sheet).getByRole('button', { name: 'Save' }));

      const alert = await within(sheet).findByRole('alert');
      expect(alert).toHaveTextContent(
        'Something went wrong. Please try again.',
      );
      expect(within(sheet).getByRole('button', { name: 'Save' })).toBeVisible();
    });

    it('"Use Catalog default" removes the override the same way as the row close button', async () => {
      const user = userEvent.setup();
      const { calls } = stubFamily([MILK]);
      renderFamily();
      await user.click(await rowOfAsync('Milk'));
      const sheet = await screen.findByRole('dialog', { name: 'Milk' });

      await user.click(
        within(sheet).getByRole('button', { name: 'Use Catalog default' }),
      );

      expect(screen.getByText('Milk uses the Catalog default')).toBeVisible();
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Milk' })).toBeNull(),
      );
      expect(screen.queryByRole('button', { name: /^Milk\b/ })).toBeNull();
      expect(writes(calls)).toEqual([]);
    });

    it('offers "Use Catalog default" for a category with an override picked through "Set a category"', async () => {
      const user = userEvent.setup();
      const { calls } = stubFamily([MILK]);
      renderFamily();
      await user.click(
        await screen.findByRole('button', { name: 'Set a category' }),
      );
      await user.click(await screen.findByRole('button', { name: /Milk/ }));
      const sheet = await screen.findByRole('dialog', { name: 'Milk' });

      await user.click(
        within(sheet).getByRole('button', { name: 'Use Catalog default' }),
      );

      expect(screen.getByText('Milk uses the Catalog default')).toBeVisible();
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Milk' })).toBeNull(),
      );
      expect(screen.queryByRole('button', { name: /^Milk\b/ })).toBeNull();
      expect(writes(calls)).toEqual([]);
    });

    it('closes on Escape', async () => {
      const user = userEvent.setup();
      stubFamily([MILK]);
      renderFamily();
      await user.click(await rowOfAsync('Milk'));
      const sheet = await screen.findByRole('dialog', { name: 'Milk' });

      await user.keyboard('{Escape}');

      await waitFor(() => expect(sheet).not.toBeInTheDocument());
    });

    it('returns focus to the row it was opened from when it closes', async () => {
      const user = userEvent.setup();
      stubFamily([MILK]);
      renderFamily();
      const row = await rowOfAsync('Milk');
      await user.click(row);
      const sheet = await screen.findByRole('dialog', { name: 'Milk' });

      await user.keyboard('{Escape}');

      await waitFor(() => expect(sheet).not.toBeInTheDocument());
      await waitFor(() => expect(rowOf('Milk')).toHaveFocus());
    });

    it('returns focus to the row even when clicking it did not focus it (as in Safari)', async () => {
      const user = userEvent.setup();
      stubFamily([MILK]);
      renderFamily();
      const row = await rowOfAsync('Milk');
      // fireEvent clicks without moving focus, as Safari does for buttons.
      fireEvent.click(row);
      expect(row).not.toHaveFocus();
      const sheet = await screen.findByRole('dialog', { name: 'Milk' });

      await user.keyboard('{Escape}');

      await waitFor(() => expect(sheet).not.toBeInTheDocument());
      await waitFor(() => expect(rowOf('Milk')).toHaveFocus());
    });

    const openPick = async () => {
      const user = userEvent.setup();
      stubFamily([]);
      renderFamily();
      await user.click(
        await screen.findByRole('button', { name: 'Set a category' }),
      );
      return screen.findByRole('dialog');
    };

    it('moves focus to the search field on open from md up', async () => {
      stubViewport(1024);
      await openPick();

      await waitFor(() =>
        expect(
          screen.getByRole('textbox', { name: 'Search categories' }),
        ).toHaveFocus(),
      );
    });

    it('keeps focus on the sheet on a phone, so the keyboard stays down', async () => {
      stubViewport(390);
      const sheet = await openPick();

      await waitFor(() => expect(sheet).toHaveFocus());
      expect(
        screen.getByRole('textbox', { name: 'Search categories' }),
      ).not.toHaveFocus();
    });
  });
});

/** The row for a name, once the list has loaded. */
async function rowOfAsync(name: string) {
  await screen.findByRole('list', { name: 'Default expiry' });
  return rowOf(name);
}
