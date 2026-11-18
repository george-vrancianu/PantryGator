import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '@/lib/catalog';
import type { Batch } from '@/lib/pantry';
import { FLASH_HOLD_MS, resetRowFlash } from '@/lib/rowFlash';
import { UNDO_WINDOW_MS } from '@/lib/useUndoToast';
import { renderWithProviders, stubApi } from '@/test/render';
import { PantryPage } from './PantryPage';

const milk: CatalogSearchResult = {
  owner: 'catalog',
  amountScale: 'medium',
  id: 'milk-id',
  name: 'Milk',
  defaultUnit: 'ml',
  leafCategory: { id: 'dairy', name: 'Dairy' },
  parentCategory: {
    id: 'dairy',
    name: 'Dairy',
    aisle: { id: 'aisle', name: 'Dairy & eggs' },
  },
  defaults: { expiryDays: 7, location: 'fridge' },
};
const rice: CatalogSearchResult = {
  ...milk,
  id: 'rice-id',
  name: 'Rice',
  defaultUnit: 'g',
  defaults: { expiryDays: null, location: 'cupboard' },
};

/** A Pantry that holds what was added and not deleted; returns the recorded calls. */
function stubPantry() {
  const batches: Batch[] = [];
  let n = 0;
  const { fetchMock, calls } = stubApi({
    'GET /api/pantry': () => Response.json({ batches: [...batches] }),
    'GET /api/staples': () => Response.json({ staples: [] }),
    'GET /api/settings/family': () =>
      Response.json({ staleThresholdDays: 3, expiryOverrides: [] }),
    'GET /api/pantry/recently-stocked': () =>
      Response.json({ ingredients: [] }),
    'GET /api/catalog/search': (url) =>
      Response.json({
        results: [milk, rice].filter((r) =>
          r.name
            .toLowerCase()
            .startsWith((url.searchParams.get('q') ?? '').toLowerCase()),
        ),
      }),
  });
  const route = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), window.location.origin);
    if (init?.method === 'POST' && url.pathname === '/api/pantry/batches') {
      const body = JSON.parse(String(init.body));
      const found = [milk, rice].find((r) => r.id === body.ingredientId)!;
      const created: Batch = {
        id: `b${++n}`,
        name: found.name,
        ingredientId: found.id,
        unmatched: false,
        aisle: null,
        amountScale: null,
        defaultUnit: null,
        defaultExpiryDays: null,
        quantity: body.quantity,
        unit: body.unit,
        location: body.location,
        expiryDate: body.expiryDate,
        productDescription: null,
        createdAt: '2026-10-01T00:00:00Z',
      };
      batches.push(created);
      calls.push({ key: 'POST /api/pantry/batches', search: '', body });
      return Promise.resolve(Response.json(created, { status: 201 }));
    }
    if (init?.method === 'DELETE') {
      const id = url.pathname.split('/').at(-1);
      batches.splice(
        batches.findIndex((b) => b.id === id),
        1,
      );
    }
    return fetchMock(input, init);
  };
  vi.stubGlobal('fetch', route);
  return calls;
}

/** The save toast: other live regions on the page are statuses too. */
const toast = async () =>
  (await screen.findByText(/^Added .+ · /)).closest(
    '[role="status"]',
  ) as HTMLElement;
const dialog = () => screen.findByRole('dialog', { name: 'Add to Pantry' });

async function addItem(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  amount: string,
) {
  const sheet = within(await dialog());
  await user.type(
    sheet.getByRole('combobox', { name: 'Search ingredients' }),
    name,
  );
  await user.click(
    await sheet.findByRole('option', { name: new RegExp(name) }),
  );
  const field = await sheet.findByRole('textbox', { name: /Amount of/ });
  await user.clear(field);
  await user.type(field, amount);
  await user.click(
    sheet.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
  );
}

describe('Add to Pantry sheet after a save', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    resetRowFlash();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const setup = () =>
    userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });

  async function open(user: ReturnType<typeof userEvent.setup>) {
    renderWithProviders(<PantryPage />);
    await user.click(await screen.findByRole('button', { name: 'Add batch' }));
  }

  it('stays open, clears the pick, refocuses the search and lists the chip', async () => {
    stubPantry();
    const user = setup();
    await open(user);
    expect(
      within(await dialog()).queryByRole('list', { name: /added/ }),
    ).not.toBeInTheDocument();
    await addItem(user, 'Milk', '500');

    const sheet = within(await dialog());
    const search = await sheet.findByRole('combobox', {
      name: 'Search ingredients',
    });
    await waitFor(() => expect(search).toHaveFocus());
    expect(sheet.queryByRole('textbox', { name: /Amount of/ })).toBeNull();
    const strip = sheet.getByRole('list', { name: '1 batch added' });
    expect(within(strip).getByText('Milk')).toBeInTheDocument();

    await addItem(user, 'Rice', '2');
    const both = await sheet.findByRole('list', { name: '2 batches added' });
    expect(
      within(both)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Milk', 'Rice']);
  });

  it('shows a polite toast "Added {name} · {amount} · {Location}"', async () => {
    stubPantry();
    const user = setup();
    await open(user);
    await addItem(user, 'Milk', '500');
    const saved = await toast();
    expect(saved).toHaveTextContent('Added Milk · 500 ml · Fridge');
    expect(within(saved).getByRole('button', { name: 'Undo' })).toBeVisible();
    // Clear of the sheet's footer.
    // jsdom does not evaluate media queries, so read the emitted CSS.
    const css = Array.from(document.querySelectorAll('style'))
      .flatMap((style) => [
        style.textContent ?? '',
        ...Array.from(style.sheet?.cssRules ?? []).map((r) => r.cssText),
      ])
      .join('\n');
    expect(css).toMatch(/bottom:\s*96px/);
  });

  it('keeps the x as the way out after an add, and the x, Escape and the scrim all close', async () => {
    stubPantry();
    const user = setup();
    await open(user);
    const sheet = within(await dialog());
    await addItem(user, 'Milk', '500');
    await sheet.findByRole('list', { name: /batch(es)? added/ });
    expect(sheet.getByRole('button', { name: 'Close' })).toBeVisible();
    expect(sheet.queryByRole('button', { name: 'Done' })).toBeNull();

    const closed = () =>
      waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Add to Pantry' }),
        ).toBeNull(),
      );
    await user.click(sheet.getByRole('button', { name: 'Close' }));
    await closed();

    await user.click(screen.getByRole('button', { name: 'Add batch' }));
    // A new visit starts with an empty strip and the x.
    expect(
      await within(await dialog()).findByRole('button', { name: 'Close' }),
    ).toBeVisible();
    await addItem(user, 'Milk', '1');
    await within(await dialog()).findByRole('list', {
      name: /batch(es)? added/,
    });
    await user.keyboard('{Escape}');
    await closed();

    await user.click(screen.getByRole('button', { name: 'Add batch' }));
    await addItem(user, 'Milk', '1');
    await within(await dialog()).findByRole('list', {
      name: /batch(es)? added/,
    });
    await user.click(document.querySelector('.MuiBackdrop-root') as Element);
    await closed();
  });

  it('Undo deletes only that Batch and removes its chip', async () => {
    const calls = stubPantry();
    const user = setup();
    await open(user);
    await addItem(user, 'Milk', '500');
    await within(await dialog()).findByRole('list', { name: '1 batch added' });
    await addItem(user, 'Rice', '2');
    const sheet = within(await dialog());
    await sheet.findByRole('list', { name: '2 batches added' });

    await user.click(
      within(await toast()).getByRole('button', {
        name: 'Undo',
      }),
    );
    await waitFor(() =>
      expect(calls.filter((c) => c.key.startsWith('DELETE'))).toHaveLength(1),
    );
    expect(calls.find((c) => c.key.startsWith('DELETE'))?.key).toBe(
      'DELETE /api/pantry/batches/b2',
    );
    const strip = await sheet.findByRole('list', { name: '1 batch added' });
    expect(within(strip).queryByText('Rice')).toBeNull();
    expect(within(strip).getByText('Milk')).toBeInTheDocument();
  });

  it('the Undo window ends: the action goes and nothing is deleted', async () => {
    const calls = stubPantry();
    const user = setup();
    await open(user);
    await addItem(user, 'Milk', '500');
    await toast();
    await act(async () => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS + 1000);
    });
    await waitFor(() => expect(screen.queryByText(/^Added .+ · /)).toBeNull());
    expect(calls.some((c) => c.key.startsWith('DELETE'))).toBe(false);
  });

  it('flashes the rows added this visit on close, for 1.8 s, and not an undone one', async () => {
    stubPantry();
    const user = setup();
    await open(user);
    await addItem(user, 'Milk', '500');
    await within(await dialog()).findByRole('list', { name: '1 batch added' });
    await addItem(user, 'Rice', '2');
    await within(await dialog()).findByRole('list', {
      name: '2 batches added',
    });
    await user.click(
      within(await toast()).getByRole('button', {
        name: 'Undo',
      }),
    );
    await within(await dialog()).findByRole('list', { name: '1 batch added' });
    expect(document.querySelectorAll('[data-row-flash]')).toHaveLength(0);

    await user.click(
      screen.getByRole('button', { name: 'Close', hidden: true }),
    );
    await waitFor(() =>
      expect(document.querySelectorAll('[data-row-flash]')).toHaveLength(1),
    );
    const flash = document.querySelector('[data-row-flash]') as HTMLElement;
    expect(flash.closest('li')).toHaveTextContent('Milk');
    expect(getComputedStyle(flash).animation).toContain('1.8s');

    await act(async () => {
      vi.advanceTimersByTime(FLASH_HOLD_MS + 100);
    });
    expect(document.querySelectorAll('[data-row-flash]')).toHaveLength(0);
  });

  it('shows no flash under reduced motion', async () => {
    stubPantry();
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
        }) as unknown as MediaQueryList,
    );
    const user = setup();
    await open(user);
    await addItem(user, 'Milk', '500');
    await user.click(
      await within(await dialog()).findByRole('button', { name: 'Close' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Add to Pantry' }),
      ).toBeNull(),
    );
    await screen.findByText('Milk');
    expect(document.querySelectorAll('[data-row-flash]')).toHaveLength(0);
  });
});
