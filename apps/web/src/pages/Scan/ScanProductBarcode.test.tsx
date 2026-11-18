import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PHOTO_DECODE_TIMEOUT_MS, resetReads } from '@/lib/scanReads';
import { resetScanSession } from '@/lib/scanSession';
import { renderWithProviders, stubApi } from '@/test/render';
import { takeScan, fakeCamera, expectStack, stackCount } from '@/test/scan';
import { ReviewOverviewPage } from '@/pages/Review/ReviewOverviewPage';
import { ReviewPage } from '@/pages/Review/ReviewPage';
import { ScanPage } from './ScanPage';

vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
vi.mock('@/lib/image', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/image')>()),
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,YQ=='),
  cropToReceiptGuide: () => Promise.resolve('data:image/jpeg;base64,Y3JvcA=='),
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
const line = (name: string) => ({
  name,
  sourceText: null,
  match: { ...yogurt, name },
  lowConfidence: false,
  quantity: 1,
  unit: 'g',
  expiryDate: null,
  productDescription: null,
});
const CODE = '5941234567899';

/** Stands in for the browser Back button (jsdom has none): goes to the overview, leaving the editor. */
function BackToOverview() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/scan/review')}>
      test back
    </button>
  );
}

let calls: ReturnType<typeof stubApi>['calls'];
let readLines: object[];

function renderScan(route = '/scan?mode=product') {
  fakeCamera.deferReads = true;
  readLines = [line('Yogurt')];
  const stub = stubApi({
    'POST /api/scan/product': () => Response.json({ lines: readLines }),
    'POST /api/scan/ingredients': () => Response.json({ lines: readLines }),
    'POST /api/scan/receipt': () => Response.json({ lines: readLines }),
    'POST /api/pantry/batches/bulk': () => Response.json({ batches: [] }),
    'GET /api/catalog/search': () =>
      Response.json({
        results: [yogurt, { ...yogurt, id: 'skyr-id', name: 'Skyr' }],
      }),
    'GET /api/catalog/allergens': () => Response.json({ allergens: [] }),
  });
  calls = stub.calls;
  vi.stubGlobal('fetch', stub.fetchMock);
  return renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/scan/review" element={<ReviewOverviewPage />} />
      <Route
        path="/scan/review/:scanId"
        element={
          <>
            <ReviewPage />
            <BackToOverview />
          </>
        }
      />
    </Routes>,
    { route },
  );
}

const flush = () => act(async () => {});
const saves = () =>
  calls
    .filter((call) => call.key === 'POST /api/pantry/batches/bulk')
    .flatMap((call) => (call.body as { batches: object[] }).batches);
/** The camera's frame is decoded: the nth pending decode answers. */
const decoded = async (code: string | null, nth = 0) => {
  await waitFor(() =>
    expect(fakeCamera.pendingReads.length).toBeGreaterThan(nth),
  );
  await act(async () => fakeCamera.pendingReads[nth].resolve(code));
};
/** Dismisses the line's sheet (its edits stay) so the page behind it can be reached. */
async function closeSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('{Escape}');
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
}
async function addAll(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
  await user.click(await screen.findByRole('button', { name: 'Add all' }));
  await waitFor(() => expect(saves().length).toBeGreaterThan(0));
}

describe('Product Scans teach the Known Barcode decoded from their photo', () => {
  beforeEach(() => {
    resetScanSession();
    resetReads();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sends the barcode found in the photo with the saved Batch, without Open Food Facts credit', async () => {
    const user = userEvent.setup();
    renderScan();
    takeScan();
    await waitFor(() => expectStack('read'));
    await decoded(CODE);
    // No lookup happened: nothing credits Open Food Facts in the editor.
    await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
    await user.click(await screen.findByTestId('card-result'));
    await user.click(await screen.findByRole('button', { name: /Yogurt/ }));
    expect(
      screen.queryByText('Product data: Open Food Facts'),
    ).not.toBeInTheDocument();
    await closeSheet(user);
    await user.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(saves().length).toBeGreaterThan(0));
    expect(saves()).toEqual([
      expect.objectContaining({ ingredientId: 'yogurt-id', barcode: CODE }),
    ]);
  });

  it('decodes the full captured frame, not the resized photo', async () => {
    renderScan();
    takeScan();
    await waitFor(() => expect(fakeCamera.pendingReads).toHaveLength(1));
    expect(await fakeCamera.pendingReads[0].source.text()).toBe('frame');
  });

  it('keeps the barcode after the Member changes the Ingredient in Review', async () => {
    const user = userEvent.setup();
    renderScan();
    takeScan();
    await waitFor(() => expectStack('read'));
    await decoded(CODE);
    await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
    await user.click(await screen.findByTestId('card-result'));
    await user.click(await screen.findByRole('button', { name: /Yogurt/ }));
    await user.click(
      await screen.findByRole('button', { name: 'Change ingredient' }),
    );
    const search = screen.getByRole('combobox', { name: 'Matched ingredient' });
    await user.type(search, 'skyr');
    await user.click(await screen.findByRole('option', { name: /Skyr/ }));
    await screen.findByRole('dialog', { name: 'Skyr' });
    await closeSheet(user);
    await user.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(saves().length).toBeGreaterThan(0));
    expect(saves()).toEqual([
      expect.objectContaining({ ingredientId: 'skyr-id', barcode: CODE }),
    ]);
  });

  it('attaches a barcode that settles while the Member is already editing the card', async () => {
    const user = userEvent.setup();
    renderScan();
    takeScan();
    await waitFor(() => expectStack('read'));
    await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
    await user.click(await screen.findByTestId('card-result'));
    await screen.findByRole('button', { name: /Yogurt/ });
    await decoded(CODE);
    await user.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(saves().length).toBeGreaterThan(0));
    expect(saves()).toEqual([expect.objectContaining({ barcode: CODE })]);
  });

  it('attaches a barcode that settles before the read answers', async () => {
    const user = userEvent.setup();
    renderScan();
    takeScan();
    await decoded(CODE);
    await waitFor(() => expectStack('read'));
    await addAll(user);

    expect(saves()).toEqual([expect.objectContaining({ barcode: CODE })]);
  });

  it('sends no barcode when the photo has none', async () => {
    const user = userEvent.setup();
    renderScan();
    takeScan();
    await waitFor(() => expectStack('read'));
    await decoded(null);
    await addAll(user);

    expect(saves()[0]).not.toHaveProperty('barcode');
  });

  it('sends no barcode when the Product Scan read as more than one line', async () => {
    const user = userEvent.setup();
    renderScan();
    readLines = [line('Yogurt'), line('Skyr')];
    takeScan();
    await waitFor(() => expectStack('read'));
    await decoded(CODE);
    await addAll(user);

    expect(saves()).toHaveLength(2);
    saves().forEach((batch) => expect(batch).not.toHaveProperty('barcode'));
  });

  it('reads the card without waiting for a slow decode, and a failed decode does not fail it', async () => {
    const user = userEvent.setup();
    renderScan();
    takeScan();
    // The decode never answers, yet the card is read.
    await waitFor(() => expectStack('read'));
    await act(async () =>
      fakeCamera.pendingReads[0].reject(new Error('no detector here')),
    );
    await flush();
    expectStack('read');
    await addAll(user);

    expect(saves()[0]).not.toHaveProperty('barcode');
  });

  describe('a decode that settles after its card is gone', () => {
    /** Two Product Scans; the first one's decode is still pending. */
    async function twoScans() {
      renderScan();
      takeScan();
      await waitFor(() => expectStack('read'));
      takeScan();
      await waitFor(() => expectStack('read', 2));
      await waitFor(() => expect(fakeCamera.pendingReads).toHaveLength(1));
    }
    /** The first decode settles late; the second then settles without a barcode. */
    const settleLate = async () => {
      await decoded(CODE, 0);
      await decoded(null, 1);
    };

    it('is ignored when the card was removed', async () => {
      const user = userEvent.setup();
      await twoScans();
      await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
      const [remove] = await screen.findAllByRole('button', {
        name: 'Remove photo',
      });
      await user.click(remove);
      await settleLate();
      await user.click(await screen.findByRole('button', { name: 'Add all' }));

      await waitFor(() => expect(saves()).toHaveLength(1));
      expect(saves()[0]).not.toHaveProperty('barcode');
    });

    it('is ignored when the card was saved on its own', async () => {
      const user = userEvent.setup();
      await twoScans();
      await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
      const [first] = await screen.findAllByTestId('card-result');
      await user.click(first);
      await user.click(await screen.findByRole('button', { name: /Yogurt/ }));
      await closeSheet(user);
      await user.click(screen.getByRole('button', { name: /^Save/ }));
      await waitFor(() => expect(saves()).toHaveLength(1));
      await settleLate();
      await user.click(await screen.findByRole('button', { name: 'Add all' }));

      await waitFor(() => expect(saves()).toHaveLength(2));
      saves().forEach((batch) => expect(batch).not.toHaveProperty('barcode'));
    });
  });

  it('decodes one photo at a time, so a gallery import does not run them all at once', async () => {
    renderScan();
    const photos = [1, 2, 3].map(
      (n) => new File(['x'], `pack${n}.jpg`, { type: 'image/jpeg' }),
    );
    await act(async () => {
      fireEvent.change(screen.getByTestId('import-input'), {
        target: { files: photos },
      });
    });
    await waitFor(() => expect(fakeCamera.pendingReads).toHaveLength(1));
    await flush();
    expect(fakeCamera.pendingReads).toHaveLength(1);
    await decoded(null, 0);
    await waitFor(() => expect(fakeCamera.pendingReads).toHaveLength(2));
  });

  it('gives up on a hung decode so the next photo is still decoded', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    renderScan();
    const photos = [1, 2].map(
      (n) => new File(['x'], `pack${n}.jpg`, { type: 'image/jpeg' }),
    );
    await act(async () => {
      fireEvent.change(screen.getByTestId('import-input'), {
        target: { files: photos },
      });
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(fakeCamera.pendingReads).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(PHOTO_DECODE_TIMEOUT_MS));
    expect(fakeCamera.pendingReads).toHaveLength(2);
  });

  it('skips the decode of a photo whose card was removed before its turn', async () => {
    const user = userEvent.setup();
    renderScan();
    const photos = [1, 2, 3].map(
      (n) => new File(['x'], `pack${n}.jpg`, { type: 'image/jpeg' }),
    );
    await act(async () => {
      fireEvent.change(screen.getByTestId('import-input'), {
        target: { files: photos },
      });
    });
    await waitFor(() => expectStack('read', 3));
    await waitFor(() => expect(fakeCamera.pendingReads).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
    const removes = await screen.findAllByRole('button', {
      name: 'Remove photo',
    });
    await user.click(removes[1]);
    await decoded(null, 0);
    await decoded(null, 1);
    await flush();
    expect(fakeCamera.pendingReads).toHaveLength(2);
  });

  it('pre-types the chooser of an Unmatched Product line with its scanned name, barcode or not', async () => {
    const user = userEvent.setup();
    renderScan();
    readLines = [{ ...line('Mystery'), match: null }];
    takeScan();
    await waitFor(() => expectStack('read'));
    await decoded(CODE);
    await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
    await user.click(await screen.findByTestId('card-result'));
    await user.click(await screen.findByRole('button', { name: /Mystery/ }));

    expect(
      await screen.findByRole('combobox', { name: 'Matched ingredient' }),
    ).toHaveValue('Mystery');
  });

  it('keeps the barcode when the Member renames an Unmatched line', async () => {
    const user = userEvent.setup();
    renderScan();
    readLines = [{ ...line('Mystery'), match: null }];
    takeScan();
    await waitFor(() => expectStack('read'));
    await decoded(CODE);
    await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
    await user.click(await screen.findByTestId('card-result'));
    await user.click(await screen.findByRole('button', { name: /Mystery/ }));
    await user.type(
      await screen.findByRole('combobox', { name: 'Matched ingredient' }),
      ' jar',
    );
    await user.click(
      await screen.findByRole('option', { name: /Use “Mystery jar” as typed/ }),
    );
    await closeSheet(user);
    await user.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(saves().length).toBeGreaterThan(0));
    expect(saves()).toEqual([
      expect.objectContaining({ rawName: 'Mystery jar', barcode: CODE }),
    ]);
  });

  it('attaches a barcode that settles after the Member edited the card and went back to the overview', async () => {
    const user = userEvent.setup();
    renderScan();
    takeScan();
    await waitFor(() => expectStack('read'));
    await user.click(screen.getByRole('button', { name: /^Review \d+ / }));
    await user.click(await screen.findByTestId('card-result'));
    await user.click(await screen.findByRole('button', { name: /Yogurt/ }));
    await user.click(
      await screen.findByRole('button', { name: 'Change ingredient' }),
    );
    const search = screen.getByRole('combobox', { name: 'Matched ingredient' });
    await user.type(search, 'skyr');
    await user.click(await screen.findByRole('option', { name: /Skyr/ }));
    await screen.findByRole('dialog', { name: 'Skyr' });
    await closeSheet(user);
    await user.click(screen.getByRole('button', { name: 'test back' }));
    await decoded(CODE);
    await user.click(await screen.findByRole('button', { name: 'Add all' }));

    await waitFor(() => expect(saves().length).toBeGreaterThan(0));
    expect(saves()).toEqual([
      expect.objectContaining({ ingredientId: 'skyr-id', barcode: CODE }),
    ]);
  });

  it('decodes Product photos imported from the gallery', async () => {
    const user = userEvent.setup();
    renderScan();
    const photo = new File(['gallery'], 'pack.jpg', { type: 'image/jpeg' });
    await act(async () => {
      fireEvent.change(screen.getByTestId('import-input'), {
        target: { files: [photo] },
      });
    });
    await waitFor(() => expectStack('read'));
    await waitFor(() => expect(fakeCamera.pendingReads).toHaveLength(1));
    expect(fakeCamera.pendingReads[0].source).toBe(photo);
    await decoded(CODE);
    await addAll(user);

    expect(saves()).toEqual([expect.objectContaining({ barcode: CODE })]);
  });

  it.each(['receipt', 'ingredients', 'plate'])(
    'does not decode %s Scans for a barcode',
    async (mode) => {
      renderScan(`/scan?mode=${mode}`);
      takeScan();
      await waitFor(() => expect(stackCount()).toBe(1));
      await flush();
      expect(fakeCamera.pendingReads).toHaveLength(0);
    },
  );
});
