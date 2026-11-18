import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Batch } from '@/lib/pantry';
import { renderWithProviders, stubApi } from '@/test/render';
import { PantryPage } from './PantryPage';

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
    quantity: 1,
    unit: 'l',
    location: 'fridge',
    expiryDate: null,
    productDescription: null,
    createdAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

const milkStaple = {
  id: 'staple-1',
  ingredientId: 'milk-id',
  name: 'Milk',
  quantity: null,
  unit: null,
  aisle: null,
};

type StubOptions = { failSaves?: boolean | 'first' };
/** A failing save answers only once this opens, so the optimistic flag shows before the failure. */
let failGate: () => void = () => {};
/** Running-low flags and Staples follow the PUT and DELETE calls, as the API does. */
function stubRunningLow(
  flaggedAtStart: string[] = [],
  { failSaves = false }: StubOptions = {},
) {
  const flagged = new Set<string>(flaggedAtStart);
  const gate = new Promise<void>((resolve) => (failGate = resolve));
  let failed = false;
  /** Whether this save fails: every one, or with 'first' only the first. */
  const failing = () => {
    if (!failSaves || (failSaves === 'first' && failed)) return false;
    failed = true;
    return true;
  };
  const fail = async () => {
    await gate;
    return Response.json({ status: 500 }, { status: 500 });
  };
  let staples: (typeof milkStaple)[] = [];
  const { fetchMock, calls } = stubApi({
    'GET /api/pantry': () =>
      Response.json({
        batches: [
          batch({ id: 'milk-1' }),
          batch({
            id: 'zorblax',
            name: 'Zorblax paste',
            unmatched: true,
            ingredientId: null,
            location: 'cupboard',
          }),
        ],
        runningLow: [...flagged],
      }),
    'GET /api/settings/family': () =>
      Response.json({ staleThresholdDays: 3, expiryOverrides: [] }),
    'GET /api/staples': () => Response.json({ staples }),
    'POST /api/staples': () => {
      staples = [milkStaple];
      return Response.json(milkStaple, { status: 201 });
    },
    'DELETE /api/staples/staple-1': () => {
      staples = [];
      return new Response(null, { status: 204 });
    },
    'PUT /api/pantry/running-low/milk-id': () => {
      if (failing()) return fail();
      flagged.add('milk-id');
      return new Response(null, { status: 204 });
    },
    'DELETE /api/pantry/running-low/milk-id': () => {
      if (failing()) return fail();
      flagged.delete('milk-id');
      return new Response(null, { status: 204 });
    },
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, flagged };
}

const row = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}`) });
const chip = (name = 'Milk') =>
  within(row(name)).queryByText('Running low', { ignore: '[aria-hidden] *' });
const tint = (name = 'Milk') =>
  row(name).closest('li')!.querySelector('[data-swipe-toggle-tint]');
const saves = (calls: { key: string }[]) =>
  calls.map((call) => call.key).filter((key) => key.includes('/running-low/'));
const stapleSaves = (calls: { key: string }[]) =>
  calls
    .map((call) => call.key)
    .filter((key) => /^(POST|DELETE) \/api\/staples/.test(key));

/** Press on the row at x=300, move to `300 + dx`. */
function drag(target: HTMLElement, dx: number) {
  fireEvent.pointerDown(target, { pointerId: 1, clientX: 300, clientY: 10 });
  fireEvent.pointerMove(target, {
    pointerId: 1,
    clientX: 300 + dx,
    clientY: 10,
  });
}
function release(target: HTMLElement, dx: number) {
  fireEvent.pointerUp(target, { pointerId: 1, clientX: 300 + dx, clientY: 10 });
}
function swipe(target: HTMLElement, dx: number) {
  drag(target, dx);
  release(target, dx);
}

async function renderPage(flagged: string[] = [], options: StubOptions = {}) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { calls, flagged: serverFlagged } = stubRunningLow(flagged, options);
  const { queryClient } = renderWithProviders(<PantryPage />);
  watchSweeps();
  await screen.findByRole('button', { name: /^Milk/ });
  return { calls, serverFlagged, queryClient };
}
const sweepOf = (name = 'Milk') =>
  tint(name)?.getAttribute('data-sweep') ?? null;

/** Every data-sweep value that was ever on the page, so a short-lived sweep cannot slip by a later check. */
let sweepsSeen: string[] = [];
let sweepWatcher: MutationObserver | undefined;
function watchSweeps() {
  sweepsSeen = [];
  sweepWatcher = new MutationObserver(() => {
    document
      .querySelectorAll('[data-sweep]')
      .forEach((el) => sweepsSeen.push(el.getAttribute('data-sweep')!));
  });
  sweepWatcher.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-sweep'],
  });
}
/** Past the 220 ms between the release and the flag flipping. */
const settle = () => act(() => vi.advanceTimersByTimeAsync(250));

describe('swiping an Ingredient row to toggle Running low', () => {
  afterEach(() => {
    failGate = () => {};
    sweepWatcher?.disconnect();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does nothing on a release short of 92 pt', async () => {
    const { calls } = await renderPage();
    swipe(row('Milk'), -91);
    await settle();
    expect(saves(calls)).toEqual([]);
    expect(chip()).toBeNull();
  });

  it('labels the tab by what the release will do', async () => {
    await renderPage(['milk-id']);
    drag(row('Milk'), -100);
    const item = row('Milk').closest('li')!;
    expect(within(item).getByText('Not low')).toBeInTheDocument();
    release(row('Milk'), -100);
  });

  it('flags the Ingredient at 92 pt, shows the chip, and Undo clears it again', async () => {
    const { calls } = await renderPage();
    swipe(row('Milk'), -92);
    // The row springs back first; the flag flips 220 ms later.
    expect(saves(calls)).toEqual([]);
    await settle();

    await waitFor(() =>
      expect(saves(calls)).toEqual(['PUT /api/pantry/running-low/milk-id']),
    );
    expect(chip()).toBeVisible();
    expect(screen.getByText('Milk marked running low')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(saves(calls)).toEqual([
        'PUT /api/pantry/running-low/milk-id',
        'DELETE /api/pantry/running-low/milk-id',
      ]),
    );
    await waitFor(() => expect(chip()).toBeNull());
  });

  it('clears the flag on a row already running low', async () => {
    const { calls } = await renderPage(['milk-id']);
    expect(chip()).toBeVisible();
    swipe(row('Milk'), -120);
    await settle();

    await waitFor(() =>
      expect(saves(calls)).toEqual(['DELETE /api/pantry/running-low/milk-id']),
    );
    expect(chip()).toBeNull();
    expect(screen.getByText('Milk no longer running low')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
  });

  it('does not open the row with the click that follows the drag', async () => {
    await renderPage();
    swipe(row('Milk'), -40);
    fireEvent.click(row('Milk'));
    expect(row('Milk')).toHaveAttribute('aria-expanded', 'false');
  });

  it('does nothing on an open row', async () => {
    const { calls } = await renderPage();
    fireEvent.click(row('Milk'));
    expect(row('Milk')).toHaveAttribute('aria-expanded', 'true');

    swipe(row('Milk'), -120);
    await settle();
    expect(saves(calls)).toEqual([]);
    expect(row('Milk')).toHaveAttribute('aria-expanded', 'true');
  });

  it('does nothing on an Unmatched row', async () => {
    const { calls } = await renderPage();
    swipe(row('Zorblax paste'), -120);
    await settle();
    expect(saves(calls)).toEqual([]);
    expect(chip('Zorblax paste')).toBeNull();
  });

  describe('the Running low tint', () => {
    it('shows on rows already running low when the Pantry loads, and not on others', async () => {
      await renderPage(['milk-id']);
      expect(tint()).not.toBeNull();
      expect(tint()!.getAttribute('aria-hidden')).toBe('true');
      expect(tint('Zorblax paste')).toBeNull();
    });

    it('shows on no row when nothing is flagged', async () => {
      await renderPage();
      expect(tint()).toBeNull();
      expect(tint('Zorblax paste')).toBeNull();
    });

    it('appears after a swipe flags the row, and goes with Undo', async () => {
      await renderPage();
      swipe(row('Milk'), -92);
      await settle();
      await waitFor(() => expect(tint()).not.toBeNull());
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      await waitFor(() => expect(tint()).toBeNull());
    });

    it('goes when a swipe clears the flag', async () => {
      await renderPage(['milk-id']);
      swipe(row('Milk'), -120);
      await settle();
      await waitFor(() => expect(tint()).toBeNull());
    });

    it('appears and goes with the L key', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await renderPage();
      row('Milk').focus();
      await user.keyboard('l');
      await waitFor(() => expect(tint()).not.toBeNull());
      await user.keyboard('l');
      await waitFor(() => expect(tint()).toBeNull());
    });

    it('stays on the header of an open row, and goes with the open row chip', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await renderPage(['milk-id']);
      await user.click(row('Milk'));
      expect(row('Milk')).toHaveAttribute('aria-expanded', 'true');
      expect(tint()).not.toBeNull();
      await user.click(row('Milk'));
      expect(tint()).not.toBeNull();

      await user.click(row('Milk'));
      const item = row('Milk').closest('li')!;
      await user.click(
        within(item).getByRole('button', {
          name: /running low/i,
          pressed: true,
        }),
      );
      await waitFor(() => expect(tint()).toBeNull());
    });
  });

  describe('which routes animate the tint', () => {
    it('plays the on sweep after a swipe flags the row, and leaves the tint', async () => {
      await renderPage();
      swipe(row('Milk'), -92);
      expect(tint()).toBeNull();
      await settle();
      await waitFor(() => expect(sweepOf()).toBe('on'));
      await waitFor(() => expect(sweepOf()).toBeNull());
      expect(tint()).not.toBeNull();
    });

    it('plays the off wipe after a swipe clears the flag', async () => {
      await renderPage(['milk-id']);
      swipe(row('Milk'), -120);
      await settle();
      await waitFor(() => expect(sweepOf()).toBe('off'));
      await waitFor(() => expect(tint()).toBeNull());
    });

    it('animates the L key in both directions', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await renderPage();
      row('Milk').focus();
      await user.keyboard('l');
      await waitFor(() => expect(sweepOf()).toBe('on'));
      await waitFor(() => expect(sweepOf()).toBeNull());
      await user.keyboard('l');
      await waitFor(() => expect(sweepOf()).toBe('off'));
      await waitFor(() => expect(tint()).toBeNull());
    });

    it('flips once and animates once for two quick swipes', async () => {
      const { calls } = await renderPage();
      swipe(row('Milk'), -92);
      await act(() => vi.advanceTimersByTimeAsync(100));
      swipe(row('Milk'), -92);
      await settle();
      await waitFor(() => expect(sweepOf()).toBe('on'));
      await waitFor(() => expect(sweepOf()).toBeNull());
      expect(saves(calls)).toEqual(['PUT /api/pantry/running-low/milk-id']);
      expect(tint()).not.toBeNull();
    });

    it('removes the tint without the off wipe on Undo', async () => {
      await renderPage();
      swipe(row('Milk'), -92);
      await settle();
      await waitFor(() => expect(tint()).not.toBeNull());
      await waitFor(() => expect(sweepOf()).toBeNull());
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      await waitFor(() => expect(chip()).toBeNull());
      expect(tint()).toBeNull();
      expect(sweepsSeen).not.toContain('off');
    });

    it('shows and removes the tint without animating from the open row chip', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await renderPage();
      await user.click(row('Milk'));
      const item = row('Milk').closest('li')!;
      await user.click(
        within(item).getByRole('button', {
          name: /running low/i,
          pressed: false,
        }),
      );
      await waitFor(() => expect(tint()).not.toBeNull());
      expect(sweepOf()).toBeNull();
      await user.click(
        within(item).getByRole('button', {
          name: /running low/i,
          pressed: true,
        }),
      );
      await waitFor(() =>
        expect(
          within(item).getByRole('button', {
            name: /running low/i,
            pressed: false,
          }),
        ).toBeVisible(),
      );
      expect(tint()).toBeNull();
      expect(sweepsSeen).toEqual([]);
    });

    it('does not animate a chip flip that follows an earlier swipe', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await renderPage();
      swipe(row('Milk'), -92);
      await settle();
      await waitFor(() => expect(sweepOf()).toBe('on'));
      await user.click(row('Milk'));
      const item = row('Milk').closest('li')!;
      await user.click(
        within(item).getByRole('button', {
          name: /running low/i,
          pressed: true,
        }),
      );
      await waitFor(() =>
        expect(
          within(item).getByRole('button', {
            name: /running low/i,
            pressed: false,
          }),
        ).toBeVisible(),
      );
      expect(tint()).toBeNull();
      expect(sweepsSeen).not.toContain('off');
    });

    it('does not animate rows flagged when the Pantry loads', async () => {
      await renderPage(['milk-id']);
      expect(tint()).not.toBeNull();
      expect(sweepOf()).toBeNull();
    });

    it('clears the tint without animating when the server clears the flag and the Pantry is read again', async () => {
      // Adding or removing a Batch does this: the API drops the flag and the Pantry read comes back without it.
      const { queryClient, serverFlagged } = await renderPage(['milk-id']);
      expect(tint()).not.toBeNull();
      serverFlagged.delete('milk-id');
      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: ['pantry'] });
      });
      await waitFor(() => expect(tint()).toBeNull());
      expect(sweepsSeen).toEqual([]);
    });

    it('shows the tint without animating when a Voice Action flags the row and the Pantry is read again', async () => {
      // Applying a Voice Action flags the Ingredient on the server, with no flip from the row, and the
      // Pantry read comes back with the flag set. It must snap, as the first load does.
      const { queryClient, serverFlagged } = await renderPage();
      expect(tint()).toBeNull();
      serverFlagged.add('milk-id');
      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: ['pantry'] });
      });
      await waitFor(() => expect(tint()).not.toBeNull());
      expect(chip()).toBeVisible();
      expect(sweepOf()).toBeNull();
      expect(sweepsSeen).toEqual([]);
    });

    it('snaps in both directions under reduced motion', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }));
      await renderPage();
      swipe(row('Milk'), -92);
      await settle();
      await waitFor(() => expect(chip()).toBeVisible());
      expect(tint()).not.toBeNull();
      expect(sweepOf()).toBeNull();
      swipe(row('Milk'), -92);
      await settle();
      await waitFor(() => expect(chip()).toBeNull());
      expect(tint()).toBeNull();
      expect(sweepsSeen).toEqual([]);
    });
  });

  describe('when the save fails', () => {
    const failure = () =>
      act(async () => {
        failGate();
        await vi.advanceTimersByTimeAsync(0);
      });

    it('puts a row that was not low back with no tint, chip or sweep left', async () => {
      const { calls } = await renderPage([], { failSaves: true });
      swipe(row('Milk'), -92);
      await settle();
      await waitFor(() =>
        expect(saves(calls)).toEqual(['PUT /api/pantry/running-low/milk-id']),
      );
      // The flag shows at once, before the save answers.
      await waitFor(() => expect(chip()).toBeVisible());
      await failure();
      expect(
        await screen.findByText('Something went wrong. Please try again.'),
      ).toBeVisible();
      await waitFor(() => expect(chip()).toBeNull());
      expect(tint()).toBeNull();
      expect(sweepOf()).toBeNull();
      expect(sweepsSeen).not.toContain('off');
      await act(() => vi.advanceTimersByTimeAsync(600));
      expect(sweepOf()).toBeNull();
    });

    it('puts a row that was low back with its tint and no sweep left', async () => {
      const { calls } = await renderPage(['milk-id'], { failSaves: true });
      swipe(row('Milk'), -120);
      await settle();
      await waitFor(() =>
        expect(saves(calls)).toEqual([
          'DELETE /api/pantry/running-low/milk-id',
        ]),
      );
      await waitFor(() => expect(chip()).toBeNull());
      await failure();
      expect(
        await screen.findByText('Something went wrong. Please try again.'),
      ).toBeVisible();
      await waitFor(() => expect(tint()).not.toBeNull());
      expect(chip()).toBeVisible();
      expect(sweepOf()).toBeNull();
      expect(sweepsSeen).not.toContain('on');
      await act(() => vi.advanceTimersByTimeAsync(600));
      expect(sweepOf()).toBeNull();
    });

    it('plays a new sweep normally when swiped again after a failed save', async () => {
      await renderPage([], { failSaves: 'first' });
      swipe(row('Milk'), -92);
      await settle();
      await waitFor(() => expect(chip()).toBeVisible());
      await failure();
      await waitFor(() => expect(chip()).toBeNull());
      await act(() => vi.advanceTimersByTimeAsync(600));
      expect(sweepOf()).toBeNull();

      sweepsSeen = [];
      swipe(row('Milk'), -92);
      await settle();
      // The stale sweep state of the failed save does not swallow or replay this one.
      await waitFor(() => expect(sweepOf()).toBe('on'));
      await waitFor(() => expect(sweepOf()).toBeNull());
      expect(sweepsSeen).not.toContain('off');
      expect(tint()).not.toBeNull();
      await act(() => vi.advanceTimersByTimeAsync(600));
      expect(sweepOf()).toBeNull();
    });
  });

  describe('the L key', () => {
    it('toggles Running low on a focused closed row, which says so', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { calls } = await renderPage();
      await waitFor(() =>
        expect(row('Milk')).toHaveAccessibleDescription(
          'Press L: Mark running low. Press S: Make Staple.',
        ),
      );

      row('Milk').focus();
      await user.keyboard('l');
      await waitFor(() =>
        expect(saves(calls)).toEqual(['PUT /api/pantry/running-low/milk-id']),
      );
      await waitFor(() => expect(chip()).toBeVisible());
      expect(row('Milk')).toHaveAccessibleDescription(
        'Press L: Clear running low. Press S: Make Staple.',
      );
      expect(row('Milk')).toHaveFocus();
      expect(row('Milk')).toHaveAttribute('aria-expanded', 'false');
    });

    it('does nothing on an open row or an Unmatched row', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { calls } = await renderPage();
      expect(row('Zorblax paste')).not.toHaveAccessibleDescription();
      row('Zorblax paste').focus();
      await user.keyboard('l');

      await user.click(row('Milk'));
      expect(row('Milk')).not.toHaveAccessibleDescription();
      await user.keyboard('l');
      await settle();
      expect(saves(calls)).toEqual([]);
    });
  });

  describe('the S key', () => {
    it('makes a focused closed row a Staple, and then no longer one, saying so each time', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { calls } = await renderPage();
      await waitFor(() =>
        expect(row('Milk')).toHaveAccessibleDescription(
          'Press L: Mark running low. Press S: Make Staple.',
        ),
      );

      row('Milk').focus();
      await user.keyboard('s');
      expect(await screen.findByText('Milk is a Staple')).toBeVisible();
      expect(stapleSaves(calls)).toEqual(['POST /api/staples']);
      await waitFor(() =>
        expect(row('Milk')).toHaveAccessibleDescription(
          'Press L: Mark running low. Press S: Remove Staple.',
        ),
      );
      expect(row('Milk')).toHaveFocus();
      expect(row('Milk')).toHaveAttribute('aria-expanded', 'false');

      await user.keyboard('s');
      expect(
        await screen.findByText('Milk is no longer a Staple'),
      ).toBeVisible();
      expect(stapleSaves(calls)).toEqual([
        'POST /api/staples',
        'DELETE /api/staples/staple-1',
      ]);
    });

    it('does nothing on an open row or an Unmatched row', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { calls } = await renderPage();
      row('Zorblax paste').focus();
      await user.keyboard('s');

      await user.click(row('Milk'));
      await user.keyboard('s');
      await settle();
      expect(stapleSaves(calls)).toEqual([]);
    });
  });
});
