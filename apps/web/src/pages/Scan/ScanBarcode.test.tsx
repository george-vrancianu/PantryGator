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
import { SCAN_INTERVAL_MS } from '@/lib/cameraMode';
import { resetReads } from '@/lib/scanReads';
import { resetScanSession } from '@/lib/scanSession';
import { renderWithProviders, stubApi } from '@/test/render';
import { stubMatchMedia, stubViewport } from '@/test/viewport';
import {
  emitBarcode,
  expectStack,
  fakeCamera,
  languageChip,
  photoStack,
  queryLanguageChip,
  selected,
  shutter,
  slider,
  stackCount,
  takeScan,
} from '@/test/scan';
import { ReviewOverviewPage } from '@/pages/Review/ReviewOverviewPage';
import { ReviewPage } from '@/pages/Review/ReviewPage';
import { ScanPage } from './ScanPage';

vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
vi.mock('@/lib/image', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/image')>()),
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,YQ=='),
}));

const yogurt = {
  owner: 'catalog',
  amountScale: 'medium',
  id: 'yogurt-id',
  name: 'Yogurt',
  defaultUnit: 'g',
  leafCategory: { id: 'leaf', name: 'Leaf' },
  parentCategory: {
    id: 'dairy',
    name: 'Dairy',
    aisle: { id: 'aisle', name: 'Dairy & eggs' },
  },
  defaults: { expiryDays: 10, location: 'fridge' },
};
const found = (overrides: object = {}) => ({
  found: true,
  source: 'open_food_facts',
  match: yogurt,
  lowConfidence: false,
  productDescription: 'Greek yogurt',
  quantity: 400,
  unit: 'g',
  allergens: [],
  missingAllergens: [],
  ...overrides,
});
const MILK = { id: 'al-milk', name: 'Milk' };
const GLUTEN = { id: 'al-gluten', name: 'Gluten' };
const A = '5941234567899';
const B = '5949999999993';

type Held = { code: string; search: string; respond: (r: Response) => void };
/** Barcode Lookups and photo reads answer only when the test says so. */
let lookups: Held[];
let calls: ReturnType<typeof stubApi>['calls'];
let answers: Record<string, () => Response>;
/** When set, a photo read of a Product answers at once with this. */
let productAnswer: (() => Response) | null;

function renderScan(route = '/scan') {
  lookups = [];
  answers = {};
  productAnswer = null;
  const stub = stubApi({
    'POST /api/pantry/batches/bulk': () => Response.json({ batches: [] }),
    'GET /api/catalog/search': () =>
      Response.json({
        results: [yogurt, { ...yogurt, id: 'skyr-id', name: 'Skyr' }],
      }),
    'GET /api/catalog/allergens': () =>
      Response.json({ allergens: [MILK, GLUTEN] }),
  });
  calls = stub.calls;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), window.location.origin);
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    const code = url.pathname.match(/^\/api\/barcode-lookup\/(\d+)$/)?.[1];
    if (code) {
      calls.push({ key, search: url.search, body: undefined });
      const ready = answers[code];
      if (ready) return Promise.resolve(ready());
      return new Promise<Response>((resolve) =>
        lookups.push({ code, search: url.search, respond: resolve }),
      );
    }
    if (key === 'POST /api/scan/product') {
      calls.push({ key, search: url.search, body: undefined });
      if (productAnswer) return Promise.resolve(productAnswer());
      return new Promise<Response>(() => {});
    }
    return stub.fetchMock(input, init);
  });
  return renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/scan/review" element={<ReviewOverviewPage />} />
      <Route path="/scan/review/:scanId" element={<ReviewPage />} />
    </Routes>,
    { route },
  );
}

const flush = () => act(async () => {});
/** The camera decodes `code`: the Scan page accepts it and re-arms the watch. */
async function decode(code: string) {
  await waitFor(() => expect(fakeCamera.emit).not.toBeNull());
  act(() => emitBarcode(code));
  await flush();
}
const lookupCalls = () =>
  calls.filter((call) => call.key.startsWith('GET /api/barcode-lookup'));

describe('Barcode on the Scan page', () => {
  beforeEach(() => {
    resetScanSession();
    resetReads();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  describe('the mode slider', () => {
    it('opens on Receipt the first time', () => {
      renderScan();
      expect(selected()).toEqual(['Receipt']);
    });

    it('reopens in Barcode after the Scan page was left in Barcode', async () => {
      const user = userEvent.setup();
      const first = renderScan();
      await user.click(screen.getByRole('radio', { name: 'Barcode' }));
      first.unmount();

      renderScan();
      expect(selected()).toEqual(['Barcode']);
    });
  });

  describe('the controls', () => {
    it('turns the shutter into a ring that takes no input, shows the hint, and hides the language chip and Import', async () => {
      renderScan('/scan?mode=barcode');
      expect(
        screen.queryByRole('button', { name: 'Take photo' }),
      ).not.toBeInTheDocument();
      const ring = screen.getByTestId('shutter-ring');
      expect(ring).toHaveAttribute('aria-hidden', 'true');
      expect(ring).not.toHaveAttribute('tabindex');
      expect(ring.querySelector('button, [tabindex]')).toBeNull();
      expect(screen.getByTestId('scan-guide')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
      expect(
        screen.getByText('Point the camera at the barcode.'),
      ).toBeInTheDocument();
      expect(queryLanguageChip()).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Import from photos' }),
      ).not.toBeInTheDocument();
      await waitFor(() => expect(fakeCamera.watching).toBe(1));
    });

    it('sweeps a scan line in the Barcode guide, hides it after a read, and not in other modes', async () => {
      const user = userEvent.setup();
      renderScan('/scan?mode=barcode');
      expect(screen.getByTestId('scan-line')).toBeInTheDocument();
      await decode(A);
      expect(screen.queryByTestId('scan-line')).toBeNull();
      await user.click(screen.getByRole('radio', { name: 'Product' }));
      expect(screen.queryByTestId('scan-line')).toBeNull();
    });

    it('brings the scan line back 1.2 s after a read', async () => {
      renderScan('/scan?mode=barcode');
      await waitFor(() => expect(fakeCamera.emit).not.toBeNull());
      vi.useFakeTimers();
      try {
        await act(async () => {
          emitBarcode(A);
          await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.queryByTestId('scan-line')).toBeNull();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1199);
        });
        expect(screen.queryByTestId('scan-line')).toBeNull();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1);
        });
        expect(screen.getByTestId('scan-line')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('holds the scan line still under reduced motion', () => {
      stubMatchMedia((query) => query.includes('prefers-reduced-motion'));
      renderScan('/scan?mode=barcode');
      expect(screen.getByTestId('scan-line')).toHaveAttribute(
        'data-static',
        'true',
      );
    });

    it('stops reading barcodes in another mode', async () => {
      const user = userEvent.setup();
      renderScan('/scan?mode=barcode');
      await waitFor(() => expect(fakeCamera.watching).toBe(1));
      await user.click(screen.getByRole('radio', { name: 'Product' }));
      expect(fakeCamera.watching).toBe(0);
      expect(languageChip()).toBeInTheDocument();
    });
  });

  describe('changing mode', () => {
    it('forgets the last code, so the pack still held up is taken again on coming back', async () => {
      const user = userEvent.setup();
      renderScan('/scan?mode=barcode');
      await decode(A);
      expect(stackCount()).toBe(1);
      await user.click(screen.getByRole('radio', { name: 'Product' }));
      await user.click(screen.getByRole('radio', { name: 'Barcode' }));
      await decode(A);
      expect(stackCount()).toBe(2);
    });

    it.each(['Plate', 'Barcode'])(
      'hides the Scan Language chip in %s',
      async (mode) => {
        const user = userEvent.setup();
        renderScan('/scan?mode=product');
        expect(languageChip()).toBeInTheDocument();
        await user.click(screen.getByRole('radio', { name: mode }));
        expect(queryLanguageChip()).not.toBeInTheDocument();
      },
    );
  });

  describe('accepting codes', () => {
    it('adds a card per accepted code with the frozen frame and a barcode badge, and keeps reading', async () => {
      renderScan('/scan?mode=barcode');
      await decode(A);

      expect(stackCount()).toBe(1);
      expect(photoStack()).toHaveAccessibleName(/^Review 1 barcode/);
      expect(
        screen.getByTestId('photo-stack').querySelector('img'),
      ).toHaveAttribute('src', 'data:image/jpeg;base64,YQ==');
      expect(fakeCamera.watching).toBe(1);

      await decode(B);
      expect(stackCount()).toBe(2);
    });

    it('watches again only after the scan interval, so a held pack is not decoded back to back', async () => {
      renderScan('/scan?mode=barcode');
      await waitFor(() => expect(fakeCamera.emit).not.toBeNull());
      vi.useFakeTimers();
      try {
        act(() => emitBarcode(A));
        expect(fakeCamera.watching).toBe(0);
        act(() => {
          vi.advanceTimersByTime(SCAN_INTERVAL_MS - 1);
        });
        expect(fakeCamera.watching).toBe(0);
        act(() => {
          vi.advanceTimersByTime(1);
        });
        expect(fakeCamera.watching).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('takes the held pack again after the Member leaves Barcode and comes back', async () => {
      const user = userEvent.setup();
      renderScan('/scan?mode=barcode');
      await decode(A);
      await user.click(
        within(slider()).getByRole('radio', { name: /Product/ }),
      );
      await user.click(
        within(slider()).getByRole('radio', { name: /Barcode/ }),
      );
      await decode(A);
      expect(stackCount()).toBe(2);
    });

    it('ignores a code identical to the last accepted one, but takes it again after another', async () => {
      renderScan('/scan?mode=barcode');
      await decode(A);
      await decode(A);
      expect(stackCount()).toBe(1);
      await decode(B);
      await decode(A);
      expect(stackCount()).toBe(3);
    });

    it('treats a UPC-A and its EAN-13 form as the same code', async () => {
      renderScan('/scan?mode=barcode');
      await decode('036000291452');
      await decode('0036000291452');
      expect(stackCount()).toBe(1);
      await decode(B);
      await decode('0036000291452');
      expect(stackCount()).toBe(3);
    });

    describe('the cooldown', () => {
      const vibrate = vi.fn(() => true);
      beforeEach(() => {
        vibrate.mockClear();
        Object.defineProperty(navigator, 'vibrate', {
          value: vibrate,
          configurable: true,
        });
      });
      afterEach(() => {
        vi.useRealTimers();
        Reflect.deleteProperty(navigator, 'vibrate');
      });
      const announced = () =>
        screen
          .getAllByRole('status')
          .map((region) => region.textContent)
          .join(' ');
      /** Time passes, then the camera sees `code` (the watch has re-armed by then). */
      const seeAfter = async (ms: number, code: string) => {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(ms);
        });
        expect(fakeCamera.emit).not.toBeNull();
        await act(async () => {
          emitBarcode(code);
          await vi.advanceTimersByTimeAsync(0);
        });
      };
      const startWatching = async () => {
        renderScan('/scan?mode=barcode');
        await waitFor(() => expect(fakeCamera.emit).not.toBeNull());
        vi.useFakeTimers();
      };

      it('adds one card however long the same code is held, every sighting restarting the 1.5 s', async () => {
        await startWatching();
        await seeAfter(0, A);
        // Seen every 1.4 s for 7 s: no gap reaches 1.5 s, so it is never taken again.
        for (let i = 0; i < 5; i++) await seeAfter(1400, A);
        expect(stackCount()).toBe(1);
        expect(vibrate).toHaveBeenCalledTimes(1);
      });

      it('takes the same code again once 1.5 s pass without it being seen', async () => {
        await startWatching();
        await seeAfter(0, A);
        await seeAfter(1499, A);
        expect(stackCount()).toBe(1);
        await seeAfter(1500, A);
        expect(stackCount()).toBe(2);
      });

      it('takes the same code again right after a different code was accepted', async () => {
        await startWatching();
        await seeAfter(0, A);
        await seeAfter(SCAN_INTERVAL_MS, B);
        await seeAfter(SCAN_INTERVAL_MS, A);
        expect(stackCount()).toBe(3);
      });

      it('vibrates briefly and announces each accepted read, but not ignored sightings', async () => {
        await startWatching();
        await seeAfter(0, A);
        expect(vibrate).toHaveBeenCalledTimes(1);
        expect(vibrate.mock.calls[0]).toEqual([expect.any(Number)]);
        expect(announced()).toContain('Barcode 1 added');

        await seeAfter(SCAN_INTERVAL_MS, A);
        expect(vibrate).toHaveBeenCalledTimes(1);
        expect(announced()).toContain('Barcode 1 added');
        expect(announced()).not.toContain('Barcode 2');

        await seeAfter(1500, A);
        expect(vibrate).toHaveBeenCalledTimes(2);
        expect(announced()).toContain('Barcode 2 added');
      });

      it('counts the Session cards when the screen is opened again, and announces nothing until a read', async () => {
        const first = renderScan('/scan?mode=barcode');
        await decode(A);
        await decode(B);
        first.unmount();
        renderScan('/scan?mode=barcode');
        expect(announced()).not.toMatch(/Barcode \d+ added/);
        await decode(A);
        expect(announced()).toContain('Barcode 3 added');
        expect(announced()).not.toContain('Barcode 1 added');
      });

      it('does not vibrate or announce a read refused by the Session limit', async () => {
        await startWatching();
        for (let i = 0; i < 20; i++)
          await seeAfter(SCAN_INTERVAL_MS, `59400000000${10 + i}`);
        expect(stackCount()).toBe(20);
        vibrate.mockClear();
        await seeAfter(SCAN_INTERVAL_MS, B);
        expect(stackCount()).toBe(20);
        expect(vibrate).not.toHaveBeenCalled();
        expect(announced()).toContain('Barcode 20 added');
        expect(announced()).not.toContain('Barcode 21');
      });
    });

    it('does not take a Scan when the ring or the guide is tapped', async () => {
      renderScan('/scan?mode=barcode');
      fireEvent.click(screen.getByTestId('shutter-ring'));
      fireEvent.pointerDown(screen.getByTestId('scan-guide'));
      fireEvent.pointerUp(screen.getByTestId('scan-guide'));
      await flush();
      expect(stackCount()).toBe(0);
    });

    it('brings the shutter back when the mode changes away from Barcode', async () => {
      const user = userEvent.setup();
      renderScan('/scan?mode=barcode');
      await user.click(screen.getByRole('radio', { name: 'Product' }));
      expect(shutter()).toBeInTheDocument();
      expect(screen.queryByTestId('shutter-ring')).not.toBeInTheDocument();
    });

    it('looks the code up at once in the UI locale, even when both photo reads are busy', async () => {
      const user = userEvent.setup();
      renderScan('/scan?mode=product');
      takeScan();
      await flush();
      takeScan();
      await flush();
      expect(
        calls.filter((call) => call.key === 'POST /api/scan/product'),
      ).toHaveLength(2);

      await user.click(screen.getByRole('radio', { name: 'Barcode' }));
      await decode(A);

      expect(lookupCalls()).toHaveLength(1);
      expectStack('reading', 3);
    });
  });

  /** The Review's only line row (its sheet opens when tapped). */
  const tapOnlyRow = async (user: ReturnType<typeof userEvent.setup>) => {
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('button')
          .filter((button) => button.id.startsWith('review-line-')),
      ).toHaveLength(1),
    );
    await user.click(
      screen
        .getAllByRole('button')
        .filter((button) => button.id.startsWith('review-line-'))[0],
    );
  };
  /** Dismisses the line's sheet (its edits stay) so the page behind it can be reached. */
  const closeSheet = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  };

  describe('the lookup result', () => {
    it('reads a found product into one prefilled line', async () => {
      const user = userEvent.setup();
      renderScan('/scan?mode=barcode');
      answers[A] = () => Response.json(found());
      await decode(A);
      await waitFor(() => expectStack('read'));

      await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
      expect(await screen.findByTestId('card-result')).toHaveTextContent(
        'Yogurt',
      );
      await user.click(screen.getByTestId('card-result'));
      await user.click(await screen.findByRole('button', { name: /Yogurt/ }));
      expect(await screen.findByLabelText(/^Amount of/)).toHaveValue('400');
      expect(
        screen.getByRole('button', { name: 'Unit: g' }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Product description')).toHaveValue(
        'Greek yogurt',
      );
    });

    it('leaves a low-confidence product Unmatched, with the Ingredient search pre-typed', async () => {
      const user = userEvent.setup();
      renderScan('/scan?mode=barcode');
      answers[A] = () =>
        Response.json(
          found({
            match: null,
            lowConfidence: true,
            quantity: null,
            unit: null,
          }),
        );
      await decode(A);
      await waitFor(() => expectStack('read'));

      await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
      await user.click(await screen.findByTestId('card-result'));
      await tapOnlyRow(user);
      expect(
        await screen.findByRole('combobox', { name: 'Matched ingredient' }),
      ).toHaveValue('Greek yogurt');
    });

    it('reads a product that is not found into one empty line to fill', async () => {
      renderScan('/scan?mode=barcode');
      answers[A] = () => Response.json({ found: false });
      await decode(A);
      await waitFor(() => expectStack('read'));

      await userEvent.click(
        screen.getByRole('button', { name: /^Review \d+ / }),
      );
      expect(await screen.findByTestId('card-result')).toHaveTextContent(
        '1 item',
      );
    });

    it('fails the card on an API error and repeats the lookup from its card in Review', async () => {
      const user = userEvent.setup();
      renderScan('/scan?mode=barcode');
      answers[A] = () =>
        Response.json({ code: 'internal', params: {} }, { status: 500 });
      await decode(A);
      await waitFor(() => expectStack('failed'));
      expect(screen.getByText('Barcode Lookup failed')).toBeInTheDocument();

      answers[A] = () => Response.json(found());
      // Retry lives on the card in Review.
      await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
      await user.click(
        await screen.findByRole('button', { name: 'Look up again' }),
      );
      expect(await screen.findByTestId('card-result')).toHaveTextContent(
        'Yogurt',
      );
      expect(lookupCalls()).toHaveLength(2);
    });
  });

  describe('when Barcode Lookups are rate limited', () => {
    it('fails the card with the rate-limit copy, never as not found, and repeats the lookup from its card in Review', async () => {
      const user = userEvent.setup();
      renderScan('/scan?mode=barcode');
      answers[A] = () =>
        Response.json(
          { code: 'barcode.rate_limited', params: {} },
          { status: 429, headers: { 'Retry-After': '30' } },
        );
      await decode(A);
      await waitFor(() => expectStack('failed'));

      answers[A] = () => Response.json(found());
      // Retry lives on the card in Review.
      await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
      await user.click(
        await screen.findByRole('button', { name: 'Look up again' }),
      );
      expect(await screen.findByTestId('card-result')).toHaveTextContent(
        'Yogurt',
      );
      expect(lookupCalls()).toHaveLength(2);
    });
  });

  describe('the Scan Cap and the Session limit', () => {
    it('keeps accepting codes once the Scan Cap is reached, never failing them with the cap', async () => {
      const user = userEvent.setup();
      renderScan('/scan?mode=product');
      // A Product Scan the API refuses with the Scan Cap.
      vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
        const url = new URL(String(input), window.location.origin);
        if (url.pathname === '/api/scan/product')
          return Promise.resolve(
            Response.json(
              { code: 'scan.cap_reached', params: {} },
              { status: 429 },
            ),
          );
        calls.push({
          key: `GET ${url.pathname}`,
          search: url.search,
          body: undefined,
        });
        return Promise.resolve(Response.json(found()));
      });
      takeScan();
      await flush();
      await waitFor(() => expectStack('failed'));
      expect(screen.getByText('Daily scan limit reached')).toBeInTheDocument();

      await user.click(screen.getByRole('radio', { name: 'Barcode' }));
      await decode(A);
      await waitFor(() =>
        expect(photoStack()).toHaveAccessibleName(
          "Review 1 photo and 1 barcode, 1 couldn't be read",
        ),
      );
      expect(lookupCalls()).toHaveLength(1);
    });

    it('counts Barcode cards toward the 20-card limit and tells the Member when it is full', async () => {
      renderScan('/scan?mode=barcode');
      for (let i = 0; i < 20; i += 1)
        await decode(`59412342${String(i).padStart(5, '0')}`);
      expect(stackCount()).toBe(20);

      await decode(B);
      expect(stackCount()).toBe(20);
      expect(
        await screen.findByText(
          'A Scan Session holds at most 20 Scans and Barcode Lookups in total. Add or discard these first.',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('a held pack and the Session limit', () => {
    it('toasts once for a code held at the limit, not on every decoder tick', async () => {
      renderScan('/scan?mode=barcode');
      for (let i = 0; i < 20; i += 1)
        await decode(`59412342${String(i).padStart(5, '0')}`);
      await decode(B);
      await screen.findByText(/holds at most 20 Scans and Barcode Lookups/);
      await userEvent.keyboard('{Escape}');
      await waitFor(() =>
        expect(
          screen.queryByText(/holds at most 20 Scans and Barcode Lookups/),
        ).toBeNull(),
      );
      await decode(B);
      expect(
        screen.queryByText(/holds at most 20 Scans and Barcode Lookups/),
      ).toBeNull();
    });
  });

  describe('in Review', () => {
    it('saves a found card with its barcode in the new Batch', async () => {
      const user = userEvent.setup();
      renderScan('/scan?mode=barcode');
      answers[A] = () => Response.json(found());
      await decode(A);
      await waitFor(() => expectStack('read'));
      await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
      await user.click(await screen.findByRole('button', { name: 'Add all' }));

      await waitFor(() =>
        expect(
          calls.some((call) => call.key === 'POST /api/pantry/batches/bulk'),
        ).toBe(true),
      );
      const save = calls.find(
        (call) => call.key === 'POST /api/pantry/batches/bulk',
      );
      expect(save?.body).toMatchObject({
        batches: [{ ingredientId: 'yogurt-id', barcode: A }],
      });
    });

    it('saves the Ingredient the Member picks with Change match', async () => {
      const user = userEvent.setup();
      renderScan('/scan?mode=barcode');
      answers[A] = () => Response.json(found());
      await decode(A);
      await waitFor(() => expectStack('read'));
      await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
      await user.click(await screen.findByTestId('card-result'));

      await user.click(await screen.findByRole('button', { name: /Yogurt/ }));
      await user.click(
        await screen.findByRole('button', { name: 'Change ingredient' }),
      );
      const search = screen.getByRole('combobox', {
        name: 'Matched ingredient',
      });
      await user.type(search, 'skyr');
      await user.click(await screen.findByRole('option', { name: /Skyr/ }));
      await screen.findByRole('dialog', { name: 'Skyr' });
      await closeSheet(user);
      await user.click(screen.getByRole('button', { name: /^Save/ }));

      await waitFor(() =>
        expect(
          calls.some((call) => call.key === 'POST /api/pantry/batches/bulk'),
        ).toBe(true),
      );
      const save = calls.find(
        (call) => call.key === 'POST /api/pantry/batches/bulk',
      );
      expect(save?.body).toMatchObject({
        batches: [{ ingredientId: 'skyr-id', barcode: A }],
      });
    });

    it('adds a read Product card and a Barcode card together, only the barcode one carrying its code', async () => {
      const user = userEvent.setup();
      renderScan('/scan?mode=product');
      productAnswer = () =>
        Response.json({
          lines: [
            {
              name: 'Milk',
              sourceText: 'MILK',
              match: { ...yogurt, id: 'milk-id', name: 'Milk' },
              lowConfidence: false,
              quantity: 1,
              unit: 'l',
              expiryDate: null,
              productDescription: 'Whole milk',
            },
          ],
        });
      takeScan();
      await waitFor(() => expectStack('read'));
      await user.click(
        within(slider()).getByRole('radio', { name: /Barcode/ }),
      );
      answers[A] = () => Response.json(found());
      await decode(A);
      await waitFor(() => expectStack('read', 2));
      await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
      await user.click(await screen.findByRole('button', { name: 'Add all' }));

      await waitFor(() =>
        expect(
          calls.some((call) => call.key === 'POST /api/pantry/batches/bulk'),
        ).toBe(true),
      );
      const bodies = calls
        .filter((call) => call.key === 'POST /api/pantry/batches/bulk')
        .flatMap((call) => (call.body as { batches: object[] }).batches);
      expect(bodies).toHaveLength(2);
      const milk = bodies.find(
        (b) => (b as { ingredientId: string }).ingredientId === 'milk-id',
      );
      expect(milk).not.toHaveProperty('barcode');
      expect(bodies).toContainEqual(
        expect.objectContaining({ ingredientId: 'yogurt-id', barcode: A }),
      );
    });

    it('lets the Member open, name and save a not-found card alone, still sending its barcode', async () => {
      const user = userEvent.setup();
      renderScan('/scan?mode=barcode');
      answers[A] = () => Response.json({ found: false });
      await decode(A);
      await waitFor(() => expectStack('read'));
      await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
      await user.click(await screen.findByTestId('card-result'));

      await tapOnlyRow(user);
      const search = await screen.findByRole('combobox', {
        name: 'Matched ingredient',
      });
      await user.type(search, 'Mystery jar');
      await user.click(
        await screen.findByRole('option', {
          name: /Use “Mystery jar” as typed/,
        }),
      );
      await closeSheet(user);
      await user.click(screen.getByRole('button', { name: /^Save/ }));

      await waitFor(() =>
        expect(
          calls.some((call) => call.key === 'POST /api/pantry/batches/bulk'),
        ).toBe(true),
      );
      const save = calls.find(
        (call) => call.key === 'POST /api/pantry/batches/bulk',
      );
      expect(save?.body).toMatchObject({
        batches: [{ rawName: 'Mystery jar', barcode: A }],
      });
      // As the add-Batch form sends an Unmatched name: no source (stored as manual).
      const [batch] = (save!.body as { batches: object[] }).batches;
      expect(batch).not.toHaveProperty('source');
    });

    it('fills a Known Barcode saved under an Unmatched name with that exact name, and saves it with the barcode', async () => {
      const user = userEvent.setup();
      renderScan('/scan?mode=barcode');
      answers[A] = () =>
        Response.json(
          found({
            source: 'known_barcode',
            match: null,
            unmatchedName: 'Grandma jam',
            productDescription: 'Homemade jam',
            quantity: null,
            unit: null,
          }),
        );
      await decode(A);
      await waitFor(() => expectStack('read'));
      await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
      await user.click(await screen.findByTestId('card-result'));
      await tapOnlyRow(user);
      expect(
        await screen.findByRole('combobox', { name: 'Matched ingredient' }),
      ).toHaveValue('Grandma jam');
      await closeSheet(user);
      await user.click(screen.getByRole('button', { name: /^Save/ }));

      await waitFor(() =>
        expect(
          calls.some((call) => call.key === 'POST /api/pantry/batches/bulk'),
        ).toBe(true),
      );
      const save = calls.find(
        (call) => call.key === 'POST /api/pantry/batches/bulk',
      );
      expect(save?.body).toMatchObject({
        batches: [{ rawName: 'Grandma jam', barcode: A }],
      });
    });

    it('removes a Barcode card from the overview', async () => {
      const user = userEvent.setup();
      renderScan('/scan?mode=barcode');
      answers[A] = () => Response.json(found());
      await decode(A);
      await waitFor(() => expectStack('read'));
      await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
      await user.click(
        await screen.findByRole('button', { name: 'Remove photo' }),
      );
      expect(screen.queryByTestId('review-card')).not.toBeInTheDocument();
    });
  });

  describe('Open Food Facts attribution and Allergens in Review', () => {
    /** Decodes A, answers the lookup, and opens the card's line. */
    async function openLine(answer: object, row: RegExp | null = /Yogurt/) {
      const user = userEvent.setup();
      renderScan('/scan?mode=barcode');
      answers[A] = () => Response.json(answer);
      await decode(A);
      await waitFor(() => expectStack('read'));
      await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
      await user.click(await screen.findByTestId('card-result'));
      if (row)
        await user.click(await screen.findByRole('button', { name: row }));
      else await tapOnlyRow(user);
      return user;
    }

    it('credits Open Food Facts on a line whose lookup came from it', async () => {
      await openLine(found());
      expect(
        await screen.findByText('Product data: Open Food Facts'),
      ).toBeVisible();
    });

    it('gives no credit to a Known Barcode line', async () => {
      await openLine(found({ source: 'known_barcode' }));
      await screen.findByLabelText(/^Amount of/);
      expect(screen.queryByText('Product data: Open Food Facts')).toBeNull();
    });

    it('gives no credit to a not-found line', async () => {
      await openLine({ found: false }, null);
      await screen.findByRole('combobox', { name: 'Matched ingredient' });
      expect(screen.queryByText('Product data: Open Food Facts')).toBeNull();
    });

    it('notes the Allergens the matched Ingredient is not tagged with, and drops the note when another Ingredient is picked', async () => {
      const user = await openLine(
        found({ allergens: [MILK, GLUTEN], missingAllergens: [MILK, GLUTEN] }),
      );
      expect(
        await screen.findByText('This product lists Milk and Gluten'),
      ).toBeVisible();

      await user.click(
        await screen.findByRole('button', { name: 'Change ingredient' }),
      );
      const search = screen.getByRole('combobox', {
        name: 'Matched ingredient',
      });
      await user.type(search, 'skyr');
      await user.click(await screen.findByRole('option', { name: /Skyr/ }));
      await screen.findByRole('dialog', { name: 'Skyr' });
      expect(screen.queryByText(/This product lists/)).toBeNull();
    });

    it('shows the credit and the note in the line row of the tablet table, without opening it', async () => {
      stubViewport(1180);
      const user = userEvent.setup();
      renderScan('/scan?mode=barcode');
      answers[A] = () =>
        Response.json(
          found({
            lowConfidence: true,
            allergens: [MILK],
            missingAllergens: [MILK],
          }),
        );
      await decode(A);
      await waitFor(() => expectStack('read'));
      await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
      await user.click(await screen.findByTestId('card-result'));

      const row = (await screen.findByRole('table')).querySelector(
        '[role="row"]:has(input)',
      ) as HTMLElement;
      expect(
        within(row).getByText('Product data: Open Food Facts'),
      ).toBeVisible();
      expect(within(row).getByText('This product lists Milk')).toBeVisible();
    });

    it('shows no note when the matched Ingredient already has every listed Allergen', async () => {
      await openLine(found({ allergens: [MILK] }));
      await screen.findByText('Product data: Open Food Facts');
      expect(screen.queryByText(/This product lists/)).toBeNull();
    });

    it('pre-ticks the listed Allergens when the Member adds a new Family Ingredient from the line', async () => {
      const user = await openLine(
        found({ match: null, lowConfidence: true, allergens: [MILK] }),
        null,
      );
      await user.click(
        await screen.findByRole('button', {
          name: 'Add “Greek yogurt” to your catalog',
        }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: 'Add to your catalog',
      });
      expect(
        await within(dialog).findByRole('button', { name: 'Milk' }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(
        within(dialog).getByRole('button', { name: 'Gluten' }),
      ).toHaveAttribute('aria-pressed', 'false');
    });

    it('shows no attribution or Allergen note on a Product card', async () => {
      const user = userEvent.setup();
      renderScan('/scan?mode=product');
      productAnswer = () =>
        Response.json({
          lines: [
            {
              name: 'Milk',
              sourceText: 'MILK',
              match: { ...yogurt, id: 'milk-id', name: 'Milk' },
              lowConfidence: false,
              quantity: 1,
              unit: 'l',
              expiryDate: null,
              productDescription: null,
            },
          ],
        });
      takeScan();
      await waitFor(() => expectStack('read'));
      await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
      await user.click(await screen.findByTestId('card-result'));
      await user.click(await screen.findByRole('button', { name: /Milk/ }));
      await screen.findByLabelText(/^Amount of/);
      expect(screen.queryByText('Product data: Open Food Facts')).toBeNull();
      expect(screen.queryByText(/This product lists/)).toBeNull();
    });
  });
});
