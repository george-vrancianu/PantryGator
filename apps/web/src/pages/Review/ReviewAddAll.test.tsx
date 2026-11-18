import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '@/lib/catalog';
import type { ProposedLine, ScanMode } from '@/lib/scan';
import {
  dispatchScanSession,
  getScanSession,
  resetScanSession,
} from '@/lib/scanSession';
import { renderWithProviders, stubApi } from '@/test/render';
import { ScanPage } from '@/pages/Scan/ScanPage';
import { ReviewOverviewPage } from './ReviewOverviewPage';

vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);

const milk: CatalogSearchResult = {
  owner: 'catalog',
  amountScale: 'medium',
  id: 'milk-id',
  name: 'Milk',
  defaultUnit: 'l',
  leafCategory: { id: 'milk', name: 'Milk' },
  parentCategory: {
    id: 'dairy',
    name: 'Dairy',
    aisle: { id: 'aisle', name: 'Dairy' },
  },
  defaults: { expiryDays: 7, location: 'fridge' },
};

const line = (name: string): ProposedLine => ({
  name,
  match: { ...milk, name },
  lowConfidence: false,
  quantity: 1,
  unit: 'pcs',
  expiryDate: null,
  sourceText: null,
  productDescription: null,
});

const seed = (id: string, mode: ScanMode, lines: ProposedLine[] | 'reading') =>
  act(() => {
    dispatchScanSession({
      type: 'enqueue',
      scan: {
        id,
        mode,
        scanLanguage: 'en',
        image: 'data:image/jpeg;base64,YQ==',
        thumbnail: 'data:image/jpeg;base64,YQ==',
      },
    });
    dispatchScanSession({ type: 'start' });
    if (lines !== 'reading') dispatchScanSession({ type: 'read', id, lines });
  });

/** The Nth (1-based) pantry save fails with a server error; every other request succeeds. */
function renderOverview({ failSave }: { failSave?: number } = {}) {
  const stub = stubApi({
    'POST /api/scan/receipt/confirm': () =>
      Response.json({ batches: [], matchedShoppingItemIds: [] }),
  });
  let saves = 0;
  const fetchMock = (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(String(input), window.location.origin).pathname}`;
    if (key === 'POST /api/pantry/batches/bulk') {
      saves += 1;
      if (saves === failSave) {
        stub.calls.push({ key, search: '', body: undefined });
        return Promise.resolve(
          Response.json(
            { code: 'internal_server_error', params: {} },
            { status: 500 },
          ),
        );
      }
      stub.calls.push({ key, search: '', body: undefined });
      return Promise.resolve(Response.json({ batches: [] }));
    }
    return stub.fetchMock(input, init);
  };
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/scan/review" element={<ReviewOverviewPage />} />
    </Routes>,
    { route: '/scan/review' },
  );
  return stub.calls;
}

const cards = () => screen.queryAllByTestId('review-card');
const add = () => screen.getByRole('button', { name: /^Add all/ });
const saveCalls = (calls: ReturnType<typeof renderOverview>) =>
  calls.filter(
    (c) =>
      c.key === 'POST /api/pantry/batches/bulk' ||
      c.key === 'POST /api/scan/receipt/confirm',
  );

describe('Review overview: Add all', () => {
  beforeEach(() => {
    resetScanSession();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('saves every read card, one request per card, each through its own endpoint', async () => {
    await seed('a', 'product', [line('Yogurt')]);
    await seed('b', 'ingredients', [line('Rice'), line('Flour')]);
    await seed('c', 'receipt', [line('Eggs')]);
    const calls = renderOverview();
    await userEvent.click(add());
    await waitFor(() => expect(saveCalls(calls)).toHaveLength(3));
    expect(saveCalls(calls).map((c) => c.key)).toEqual([
      'POST /api/pantry/batches/bulk',
      'POST /api/pantry/batches/bulk',
      'POST /api/scan/receipt/confirm',
    ]);
  });

  it('returns to the camera with an empty Scan Session and a toast naming the photos', async () => {
    await seed('a', 'product', [line('Yogurt')]);
    await seed('b', 'ingredients', [line('Rice')]);
    renderOverview();
    await userEvent.click(add());
    expect(
      await screen.findByText('Added results from 2 photos'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('scan-guide')).toBeInTheDocument();
    expect(getScanSession().scans).toEqual([]);
  });

  it('words the toast for a single photo in the singular', async () => {
    await seed('a', 'product', [line('Yogurt')]);
    renderOverview();
    await userEvent.click(add());
    expect(
      await screen.findByText('Added results from 1 photo'),
    ).toBeInTheDocument();
  });

  it('keeps a card whose save failed, with its error, while the others save', async () => {
    await seed('a', 'product', [line('Yogurt')]);
    await seed('b', 'ingredients', [line('Rice')]);
    await seed('c', 'product', [line('Butter')]);
    const calls = renderOverview({ failSave: 2 });
    await userEvent.click(add());
    await waitFor(() => expect(cards()).toHaveLength(1));
    // All three were tried, in order, even though the second failed.
    expect(saveCalls(calls)).toHaveLength(3);
    expect(within(cards()[0]).getByText('Ingredients')).toBeInTheDocument();
    expect(
      within(cards()[0]).getByText(
        'Something went wrong on our side. Please try again.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('review-overview')).toBeInTheDocument();
    expect(screen.queryByText(/^Added results/)).not.toBeInTheDocument();
  });

  it('saves a card that failed once when Add is pressed again', async () => {
    await seed('a', 'product', [line('Yogurt')]);
    await seed('b', 'ingredients', [line('Rice')]);
    const calls = renderOverview({ failSave: 2 });
    await userEvent.click(add());
    await waitFor(() => expect(cards()).toHaveLength(1));
    await userEvent.click(add());
    expect(
      await screen.findByText('Added results from 2 photos'),
    ).toBeInTheDocument();
    expect(saveCalls(calls)).toHaveLength(3);
  });

  describe('while a Scan is still being read', () => {
    it('disables Add and says how many it is waiting on', async () => {
      await seed('a', 'product', [line('Yogurt')]);
      await seed('b', 'product', 'reading');
      await seed('c', 'product', 'reading');
      const calls = renderOverview();
      const button = screen.getByRole('button', {
        name: 'Add all (waiting on 2)',
      });
      expect(button).toBeDisabled();
      await userEvent.setup({ pointerEventsCheck: 0 }).click(button);
      expect(saveCalls(calls)).toHaveLength(0);
    });

    it('enables Add once the last read arrives', async () => {
      await seed('a', 'product', 'reading');
      renderOverview();
      expect(add()).toBeDisabled();
      act(() =>
        dispatchScanSession({
          type: 'read',
          id: 'a',
          lines: [line('Yogurt')],
        }),
      );
      expect(screen.getByRole('button', { name: 'Add all' })).toBeEnabled();
    });
  });

  it('does not wait on a failed card and drops it, uncounted, on Add', async () => {
    await seed('a', 'product', [line('Yogurt')]);
    await seed('b', 'product', 'reading');
    act(() => dispatchScanSession({ type: 'fail', id: 'b', reason: 'error' }));
    const calls = renderOverview();
    expect(add()).toBeEnabled();
    await userEvent.click(add());
    expect(
      await screen.findByText('Added results from 1 photo'),
    ).toBeInTheDocument();
    expect(saveCalls(calls)).toHaveLength(1);
    expect(getScanSession().scans).toEqual([]);
  });
});

describe('Review overview: Discard all', () => {
  beforeEach(() => {
    resetScanSession();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('empties the Scan Session without saving and returns to the camera', async () => {
    await seed('a', 'product', [line('Yogurt')]);
    await seed('b', 'ingredients', [line('Rice')]);
    const calls = renderOverview();
    await userEvent.click(screen.getByRole('button', { name: 'Discard all' }));
    expect(await screen.findByTestId('scan-guide')).toBeInTheDocument();
    expect(getScanSession().scans).toEqual([]);
    expect(saveCalls(calls)).toHaveLength(0);
    expect(screen.queryByText(/^Added results/)).not.toBeInTheDocument();
  });
});

const alertOf = (text: string) =>
  screen.getByText(text).closest('.MuiAlert-root') as HTMLElement;

describe('Review overview: toasts and saving state', () => {
  beforeEach(() => {
    resetScanSession();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows "Added results" as a success, not a warning', async () => {
    await seed('a', 'product', [line('Yogurt')]);
    renderOverview();
    await userEvent.click(add());
    await screen.findByText('Added results from 1 photo');
    const alert = alertOf('Added results from 1 photo');
    expect(alert.className).toMatch(/MuiAlert-\w*Success/);
    expect(alert.className).not.toMatch(/MuiAlert-\w*Warning/);
  });

  it('says "Discarded" on the camera after Discard all', async () => {
    await seed('a', 'product', [line('Yogurt')]);
    renderOverview();
    await userEvent.click(screen.getByRole('button', { name: 'Discard all' }));
    expect(await screen.findByText('Discarded')).toBeInTheDocument();
    expect(alertOf('Discarded').className).not.toMatch(/MuiAlert-\w*Warning/);
  });

  it('disables opening and removing cards while Add is saving, and saves each card once', async () => {
    await seed('a', 'product', [line('Yogurt')]);
    await seed('b', 'ingredients', [line('Rice')]);
    const releases: Array<() => void> = [];
    const saves: unknown[] = [];
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === '/api/pantry/batches/bulk') {
        saves.push(init?.body);
        return new Promise<Response>((resolve) =>
          releases.push(() => resolve(Response.json({ batches: [] }))),
        );
      }
      return Promise.resolve(
        Response.json({ code: 'not_found', params: {} }, { status: 404 }),
      );
    });
    renderWithProviders(
      <Routes>
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/scan/review" element={<ReviewOverviewPage />} />
      </Routes>,
      { route: '/scan/review' },
    );
    await userEvent.click(add());
    await waitFor(() => expect(saves).toHaveLength(1));
    for (const card of cards()) {
      expect(within(card).getByTestId('card-result')).toBeDisabled();
      expect(
        within(card).getByRole('button', { name: /remove/i }),
      ).toBeDisabled();
    }
    await act(async () => releases[0]());
    await waitFor(() => expect(saves).toHaveLength(2));
    await act(async () => releases[1]());
    await screen.findByText('Added results from 2 photos');
    expect(saves).toHaveLength(2);
  });
});
