import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Batch } from '@/lib/pantry';
import type { ShoppingList } from '@/lib/shopping';
import type { Staple } from '@/lib/staples';
import type { Template } from '@/lib/shoppingTemplates';
import { renderWithProviders, stubApi } from '@/test/render';
import { stubMotion } from '@/test/viewport';
import { PantryPage } from '@/pages/Pantry/PantryPage';
import { ShoppingPage } from '@/pages/Shopping/ShoppingPage';
import { StaplesPage } from '@/pages/Shopping/StaplesPage';
import { TemplateEditorPage } from '@/pages/Shopping/templates/TemplateEditorPage';

/** The pill reads the `row.hint` string (en). */
const PILL = 'Swipe left to remove · hold to edit';
const flag = (list: string) => localStorage.getItem(`pp.rowHint.${list}`);
const sleep = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const peeking = () => document.querySelector('[data-peeking]');
const pill = () => document.querySelector('[data-row-hint]');
/** The pill keeps its space while hidden; it is "shown" once exposed to assistive technology. */
const pillShown = () => pill()?.getAttribute('aria-hidden') === 'false';
const contentOf = (row: HTMLElement) =>
  row.querySelector('[data-swipe-row-content]')!;

const dairy = { id: 'a4', name: 'Dairy & eggs', sortOrder: 4 };
const milkItem = {
  id: 'i1',
  ingredientId: null,
  name: 'Milk',
  quantity: null,
  unit: null,
  checked: false,
  unmatched: false,
};
const shoppingList = (empty = false): ShoppingList => ({
  id: 'l1',
  groups: empty ? [] : [{ aisle: dairy, items: [milkItem] }],
  summary: { remaining: empty ? 0 : 1, checked: 0 },
});
const staple: Staple = {
  id: 's1',
  ingredientId: 'milk-id',
  name: 'Milk',
  quantity: 2,
  unit: 'l',
  aisle: dairy,
};
const line = {
  id: 'l1',
  ingredientId: 'milk-id',
  name: 'Milk',
  quantity: 1,
  unit: 'l' as const,
  unmatched: false,
  inPantry: false,
  aisle: dairy,
};
const batch = (id: string): Batch => ({
  amountScale: null,
  defaultUnit: null,
  defaultExpiryDays: null,
  id,
  name: 'Milk',
  ingredientId: 'milk-id',
  unmatched: false,
  aisle: null,
  quantity: 1,
  unit: 'l',
  location: 'fridge',
  expiryDate: null,
  productDescription: null,
  createdAt: '2026-10-01T00:00:00Z',
});

type Setup = {
  list: string;
  render: () => void;
  firstRow: () => Promise<HTMLElement>;
  empty: () => void;
};

const SETUPS: Setup[] = [
  {
    list: 'shopping',
    render: () => renderWithProviders(<ShoppingPage />),
    firstRow: () => screen.findByRole('group', { name: 'Milk' }),
    empty: () => {
      vi.stubGlobal(
        'fetch',
        stubApi({
          'GET /api/shopping-list': () => Response.json(shoppingList(true)),
        }).fetchMock,
      );
    },
  },
  {
    list: 'staples',
    render: () => renderWithProviders(<StaplesPage />),
    firstRow: () => screen.findByRole('group', { name: 'Milk' }),
    empty: () => {
      vi.stubGlobal(
        'fetch',
        stubApi({
          'GET /api/staples': () => Response.json({ staples: [] }),
        }).fetchMock,
      );
    },
  },
  {
    list: 'template',
    render: () =>
      renderWithProviders(
        <Routes>
          <Route path="/:id" element={<TemplateEditorPage />} />
        </Routes>,
        { route: '/t1' },
      ),
    firstRow: () => screen.findByRole('group', { name: 'Milk' }),
    empty: () => {
      const taco: Template = { id: 't1', name: 'Taco night', lines: [] };
      vi.stubGlobal(
        'fetch',
        stubApi({
          'GET /api/shopping-templates/t1': () => Response.json(taco),
        }).fetchMock,
      );
    },
  },
  {
    list: 'pantry',
    render: () => renderWithProviders(<PantryPage />),
    // Only the Batch rows swipe: expand the roll-up first.
    firstRow: async () => {
      await userEvent.click(
        await screen.findByRole('button', { name: /Milk/ }),
      );
      // A Batch row is named for its amount too.
      return (await screen.findAllByRole('group', { name: '1 L Milk' }))[0];
    },
    empty: () => {
      vi.stubGlobal(
        'fetch',
        stubApi({
          'GET /api/pantry': () => Response.json({ batches: [] }),
        }).fetchMock,
      );
    },
  },
];

function stubPopulated() {
  const taco: Template = { id: 't1', name: 'Taco night', lines: [line] };
  vi.stubGlobal(
    'fetch',
    stubApi({
      'GET /api/shopping-list': () => Response.json(shoppingList()),
      'GET /api/staples': () => Response.json({ staples: [staple] }),
      'GET /api/shopping-templates/t1': () => Response.json(taco),
      'GET /api/pantry': () =>
        Response.json({ batches: [batch('b1'), batch('b2')] }),
    }).fetchMock,
  );
}

describe('first-use row hint', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe.each(SETUPS)('$list', (setup) => {
    const swipeToZone1 = (row: HTMLElement) => {
      const content = contentOf(row);
      vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({
        width: 350,
        left: 0,
        top: 0,
      } as DOMRect);
      const at = (clientX: number) => ({ pointerId: 1, clientX, clientY: 5 });
      fireEvent.pointerDown(content, at(300));
      fireEvent.pointerMove(content, at(180));
      fireEvent.pointerUp(content, at(180));
    };

    it('peeks the first row and shows the pill once, then remembers it', async () => {
      stubPopulated();
      setup.render();
      const row = await setup.firstRow();
      expect(pillShown()).toBe(false);

      await waitFor(() => expect(pillShown()).toBe(true));
      expect(screen.getByText(PILL)).toBeVisible();
      await waitFor(() => expect(peeking()).toBe(contentOf(row)));
      expect(flag(setup.list)).not.toBeNull();
    });

    it('stays quiet once the flag is stored', async () => {
      localStorage.setItem(`pp.rowHint.${setup.list}`, '1');
      stubPopulated();
      setup.render();
      await setup.firstRow();
      await sleep(900);
      expect(pill()).toBeNull();
      expect(peeking()).toBeNull();
    });

    it('shows nothing and sets no flag for an empty list', async () => {
      setup.empty();
      setup.render();
      await waitFor(() => expect(screen.queryByRole('group')).toBeNull());
      await sleep(900);
      expect(pill()).toBeNull();
      expect(flag(setup.list)).toBeNull();
    });

    it('shows the pill but does not peek under reduce-motion', async () => {
      stubMotion(true);
      stubPopulated();
      setup.render();
      await setup.firstRow();
      await waitFor(() => expect(pillShown()).toBe(true));
      await sleep(100);
      expect(peeking()).toBeNull();
    });

    it('fades the pill after a swipe that reaches zone 1, keeping its space', async () => {
      stubPopulated();
      setup.render();
      const row = await setup.firstRow();
      await waitFor(() => expect(pillShown()).toBe(true));
      swipeToZone1(row);
      await waitFor(() => expect(pillShown()).toBe(false));
      expect(pill()).toBeInTheDocument();
      expect(screen.getByText(PILL)).not.toBeVisible();
    });
  });

  it.each([
    ['shopping', SETUPS[0]],
    ['template', SETUPS[2]],
    ['staples', SETUPS[1]],
  ])('fades the pill after a completed hold on %s', async (_list, setup) => {
    stubPopulated();
    setup.render();
    const row = await setup.firstRow();
    await waitFor(() => expect(pillShown()).toBe(true));
    fireEvent.pointerDown(contentOf(row), {
      pointerId: 1,
      clientX: 50,
      clientY: 5,
    });
    await sleep(550);
    await waitFor(() => expect(pillShown()).toBe(false));
    expect(pill()).toBeInTheDocument();
  });

  describe('Pantry', () => {
    it('waits for a roll-up to be expanded', async () => {
      stubPopulated();
      renderWithProviders(<PantryPage />);
      await screen.findByRole('button', { name: /Milk/ });
      await sleep(900);
      expect(pill()).toBeNull();
      expect(flag('pantry')).toBeNull();
    });

    it('peeks only the first Batch of the expanded roll-up', async () => {
      stubPopulated();
      renderWithProviders(<PantryPage />);
      await userEvent.click(
        await screen.findByRole('button', { name: /Milk/ }),
      );
      const rows = within(
        screen.getByRole('group', { name: 'Milk, 2 batches' }),
      ).getAllByRole('group');
      expect(rows).toHaveLength(2);
      await waitFor(() => expect(peeking()).toBe(contentOf(rows[0])));
      expect(document.querySelectorAll('[data-peeking]')).toHaveLength(1);
    });

    it('shows nothing when the roll-up is collapsed again before the hint', async () => {
      stubPopulated();
      renderWithProviders(<PantryPage />);
      const rollUp = await screen.findByRole('button', { name: /Milk/ });
      await userEvent.click(rollUp);
      await userEvent.click(rollUp);
      await sleep(900);
      expect(pill()).toBeNull();
      expect(flag('pantry')).toBeNull();
    });
  });
});
