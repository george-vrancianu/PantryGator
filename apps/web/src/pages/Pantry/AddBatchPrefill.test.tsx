import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '../../lib/catalog';
import type { Batch } from '../../lib/pantry';
import type { ProposedLine } from '../../lib/scan';
import { renderWithProviders, stubApi } from '../../test/render';
import { PantryPage } from './PantryPage';
import { clearPick, typeNote } from '../../test/addBatch';
import {
  fakeCamera,
  languageChip,
  pickScanLanguage,
  scanLanguagePreference,
} from '../../test/scan';

// jsdom has no camera or canvas: the camera hook and image preparation are the seams.
const image = vi.hoisted(() => ({
  /** Holds image preparation until released. */
  prepare: null as Promise<void> | null,
}));
vi.mock('../../lib/camera', async () =>
  (await import('../../test/scan')).fakeCameraModule(),
);
vi.mock('../../lib/image', () => ({
  resizeImage: () =>
    (image.prepare ?? Promise.resolve()).then(
      () => 'data:image/jpeg;base64,AAAA',
    ),
}));

const result = (id: string, name: string, unit: 'g' | 'l', days: number) =>
  ({
    owner: 'catalog',
    amountScale: 'medium',
    id,
    name,
    defaultUnit: unit,
    leafCategory: { id: 'leaf', name: 'Leaf' },
    parentCategory: {
      id: 'dairy',
      name: 'Dairy',
      aisle: { id: 'aisle', name: 'Dairy & eggs' },
    },
    defaults: { expiryDays: days, location: 'fridge' },
  }) satisfies CatalogSearchResult;

const yogurt = result('yogurt-id', 'Yogurt', 'g', 10);
const milk = result('milk-id', 'Milk', 'l', 7);

const line = (overrides: Partial<ProposedLine> = {}): ProposedLine => ({
  name: 'Greek yogurt',
  sourceText: 'Greek yogurt 500 g',
  match: yogurt,
  lowConfidence: false,
  quantity: 500,
  unit: 'g',
  expiryDate: '2026-12-24',
  productDescription: 'Greek yogurt 500 g',
  ...overrides,
});

const milkBatch: Batch = {
  id: 'milk-1',
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
};

/** The Product Scan answers when `release` is called with its response. */
function stubProductScan(
  respond: () => Response | Promise<Response>,
  preferredScanLanguage?: 'en' | 'ro' | 'da',
) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const { fetchMock, calls } = stubApi({
    ...(preferredScanLanguage
      ? scanLanguagePreference(preferredScanLanguage)
      : {}),
    'GET /api/pantry': () =>
      Response.json({ batches: [milkBatch], runningLow: [] }),
    'GET /api/staples': () => Response.json({ staples: [] }),
    'GET /api/settings/family': () =>
      Response.json({ staleThresholdDays: 3, expiryOverrides: [] }),
    'GET /api/catalog/search': () => Response.json({ results: [yogurt, milk] }),
    'GET /api/pantry/recently-stocked': () =>
      Response.json({ ingredients: [] }),
    'POST /api/scan/product': async () => {
      await gate;
      return respond();
    },
    'POST /api/pantry/batches': () => Response.json(milkBatch, { status: 201 }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, release };
}

const scanCalls = (calls: ReturnType<typeof stubApi>['calls']) =>
  calls.filter((call) => call.key === 'POST /api/scan/product');

function Where() {
  const location = useLocation();
  return (
    <output data-testid="where">{location.pathname + location.search}</output>
  );
}

async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Add batch' }));
}

const cameraButton = () => screen.getByRole('button', { name: 'Take a photo' });

async function shoot(user: ReturnType<typeof userEvent.setup>) {
  await user.click(cameraButton());
  screen.getByRole('button', { name: 'Take photo' }).focus();
  await user.keyboard('{Enter}');
}

describe('Prefill the add-Batch form from a Product Scan', () => {
  beforeEach(() => {
    localStorage.clear();
    image.prepare = null;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens a camera overlay in the remembered mode, and cancelling keeps the form', async () => {
    const user = userEvent.setup();
    const { calls } = stubProductScan(() => Response.json({ lines: [line()] }));
    renderWithProviders(
      <>
        <PantryPage />
        <Where />
      </>,
      { route: '/pantry?mode=receipt&tab=x' },
    );
    await openForm(user);
    await user.click(cameraButton());
    expect(screen.getByTestId('camera-overlay')).toBeInTheDocument();
    expect(languageChip()).toBeInTheDocument();
    // The host page's URL is left alone.
    expect(screen.getByTestId('where')).toHaveTextContent(
      '/pantry?mode=receipt&tab=x',
    );

    await user.click(screen.getByRole('button', { name: 'Close scanner' }));
    expect(screen.queryByTestId('camera-overlay')).not.toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
    ).toBeInTheDocument();
    expect(scanCalls(calls)).toHaveLength(0);
  });

  it('closes on Escape, focuses into the dialog, and returns focus to the camera button', async () => {
    const user = userEvent.setup();
    stubProductScan(() => Response.json({ lines: [line()] }));
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    expect(screen.getByTestId('camera-overlay')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('camera-overlay')).not.toBeInTheDocument();
    expect(cameraButton()).toHaveFocus();
    expect(
      screen.getByRole('dialog', { name: 'Add to Pantry' }),
    ).toBeInTheDocument();
  });

  it('closes only the language menu on Escape, not the overlay', async () => {
    const user = userEvent.setup();
    stubProductScan(() => Response.json({ lines: [line()] }));
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await user.click(languageChip());
    expect(screen.getByRole('menu')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByTestId('camera-overlay')).toBeInTheDocument();
  });

  it('starts again at the Scan Language preference when the overlay is reopened', async () => {
    const user = userEvent.setup();
    stubProductScan(() => Response.json({ lines: [line()] }), 'ro');
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await vi.waitFor(() => expect(languageChip()).toHaveTextContent('RO'));
    await pickScanLanguage('Dansk');
    expect(languageChip()).toHaveTextContent('DA');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('camera-overlay')).not.toBeInTheDocument();
    await user.click(cameraButton());
    expect(languageChip()).toHaveTextContent('RO');
  });

  it('drops a photo still being prepared when the overlay is cancelled', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let finish: () => void = () => {};
    image.prepare = new Promise<void>((resolve) => (finish = resolve));
    const { calls, release } = stubProductScan(() =>
      Response.json({ lines: [line()] }),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    screen.getByRole('button', { name: 'Take photo' }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');
    finish();
    release();
    // Every promise is already settled; the wait only gives a wrongly started read time to show.
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(scanCalls(calls)).toHaveLength(0);
    expect(screen.queryByText(/Reading the product photo/)).toBeNull();
    expect(screen.queryByTestId('prefilled-expiry')).toBeNull();
  });

  it("leaves the Scan page's remembered mode alone", async () => {
    const user = userEvent.setup();
    localStorage.setItem('pocket-pantry.scan-mode', 'receipt');
    const { release } = stubProductScan(() =>
      Response.json({ lines: [line()] }),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await shoot(user);
    release();
    await screen.findByTestId('camera-source-tag');
    expect(localStorage.getItem('pocket-pantry.scan-mode')).toBe('receipt');
  });

  it('fills a fractional amount in the locale notation', async () => {
    const user = userEvent.setup();
    const { release } = stubProductScan(() =>
      Response.json({ lines: [line({ quantity: 0.5, unit: 'l' })] }),
    );
    renderWithProviders(<PantryPage />, { locale: 'ro' });
    await user.click(await screen.findByRole('button', { name: /^Adaugă/ }));
    await user.click(screen.getByRole('button', { name: 'Fă o poză' }));
    screen.getByRole('button', { name: 'Fă o fotografie' }).focus();
    await user.keyboard('{Enter}');
    release();
    expect(await screen.findByDisplayValue('0,5')).toBeInTheDocument();
  });

  it('shows a clear message when the camera is denied', async () => {
    fakeCamera.status = 'unavailable';
    const user = userEvent.setup();
    stubProductScan(() => Response.json({ lines: [line()] }));
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    expect(
      screen.getByText(/camera is not available.*permission/i),
    ).toBeInTheDocument();
  });

  it('reads in the camera, then closes on the match with the From photo tag and a toast, in the Scan Language preference unless the chip is changed', async () => {
    const user = userEvent.setup();
    const { calls, release } = stubProductScan(
      () => Response.json({ lines: [line()] }),
      'ro',
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await vi.waitFor(() => expect(languageChip()).toHaveTextContent('RO'));
    await pickScanLanguage('Dansk');
    screen.getByRole('button', { name: 'Take photo' }).focus();
    await user.keyboard('{Enter}');

    // The camera stays up while the label is read, with the shutter off.
    expect(await screen.findByText("Gator's reading the label…")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Take photo' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    release();
    await waitFor(() =>
      expect(screen.queryByTestId('camera-overlay')).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole('combobox', {
        name: 'Ingredient: Yogurt. Press Backspace to change',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /Amount of Yogurt/ }),
    ).toHaveValue('500');
    expect(screen.getByTestId('camera-source-tag')).toHaveTextContent(
      'From photo',
    );
    expect(
      await screen.findByText('Read from your photo · check it and add'),
    ).toBeVisible();
    expect(await screen.findByTestId('prefilled-expiry')).toBeInTheDocument();
    const [post] = scanCalls(calls);
    expect(post.search).toContain('scanLanguage=da');
    expect(post.body).toEqual({ productImage: 'data:image/jpeg;base64,AAAA' });
    // The chip change is for this Batch only: nothing is remembered.
    expect(localStorage.getItem('pocket-pantry.scan-language')).toBeNull();
    expect(calls.map((c) => c.key)).not.toContain(
      'PUT /api/settings/preferences',
    );
  });

  it('fills every untouched field, marks them, and saves what was read', async () => {
    const user = userEvent.setup();
    const { calls, release } = stubProductScan(() =>
      Response.json({ lines: [line()] }),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await shoot(user);
    release();

    expect(
      await screen.findByRole('combobox', {
        name: 'Ingredient: Yogurt. Press Backspace to change',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /Amount of Yogurt/ }),
    ).toHaveValue('500');
    expect(screen.getByRole('button', { name: 'Unit: g' })).toBeInTheDocument();
    // The quick row (the opener) is gone, so focus lands on the token.
    expect(
      screen.getByRole('combobox', {
        name: 'Ingredient: Yogurt. Press Backspace to change',
      }),
    ).toHaveFocus();
    expect(screen.getByLabelText('Note · optional')).toHaveValue(
      'Greek yogurt 500 g',
    );
    expect(screen.getByText(/Thu, Dec 24 · in/)).toBeInTheDocument();
    // The camera tag sits in the token with the product name; the Ingredient needs no second mark.
    const tag = screen.getByTestId('camera-source-tag');
    expect(tag).toHaveTextContent('From photo');
    const token = screen.getByTestId('selected-token');
    expect(token).toContainElement(tag);
    expect(token).toHaveTextContent('Greek yogurt');
    expect(screen.queryByTestId('prefilled-ingredient')).toBeNull();
    for (const field of ['amount', 'expiry', 'description'])
      expect(screen.getByTestId(`prefilled-${field}`)).toHaveTextContent(
        'Filled from the product',
      );
    expect(screen.queryByText(/Low confidence/)).not.toBeInTheDocument();

    // Editing a field drops its mark.
    await user.type(screen.getByLabelText('Note · optional'), '!');
    expect(screen.queryByTestId('prefilled-description')).toBeNull();
    expect(screen.getByTestId('prefilled-amount')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    );
    const post = calls.find((c) => c.key === 'POST /api/pantry/batches');
    expect(post?.body).toEqual({
      ingredientId: 'yogurt-id',
      quantity: 500,
      unit: 'g',
      location: 'fridge',
      expiryDate: '2026-12-24',
      productDescription: 'Greek yogurt 500 g!',
    });
  });

  it('fills only the fields the Member has not touched', async () => {
    const user = userEvent.setup();
    const { release } = stubProductScan(() =>
      Response.json({ lines: [line()] }),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'mil',
    );
    await user.click(await screen.findByRole('option', { name: /Milk/ }));
    await user.clear(screen.getByRole('textbox', { name: /Amount of Milk/ }));
    await user.type(
      screen.getByRole('textbox', { name: /Amount of Milk/ }),
      '2',
    );
    await typeNote(user, 'Fresh');
    // The camera is for an empty pick: clear it. What the Member set stays.
    await clearPick(user);
    await shoot(user);
    release();
    await waitFor(() =>
      expect(screen.queryByText(/Reading the product photo/)).toBeNull(),
    );

    expect(
      await screen.findByRole('combobox', {
        name: 'Ingredient: Yogurt. Press Backspace to change',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /Amount of Yogurt/ }),
    ).toHaveValue('2');
    expect(screen.getByLabelText('Note · optional')).toHaveValue('Fresh');
    // Expiry was not touched: it takes the date from the photo.
    expect(await screen.findByTestId('prefilled-expiry')).toBeInTheDocument();
    expect(screen.getByTestId('camera-source-tag')).toBeInTheDocument();
    expect(screen.queryByTestId('prefilled-amount')).toBeNull();
    expect(screen.queryByTestId('prefilled-description')).toBeNull();
  });

  it('hides the quick row while an Ingredient is picked, and brings it back when the pick is cleared', async () => {
    const user = userEvent.setup();
    stubProductScan(() => Response.json({ lines: [line()] }));
    renderWithProviders(<PantryPage />);
    await openForm(user);
    expect(cameraButton()).toBeInTheDocument();
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'yog',
    );
    await user.click(await screen.findByRole('option', { name: /Yogurt/ }));
    expect(screen.queryByRole('button', { name: 'Take a photo' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Add quickly' })).toBeNull();

    await clearPick(user);
    expect(cameraButton()).toBeInTheDocument();
  });

  it('marks a low-confidence match with "check this" and leaves Save enabled', async () => {
    const user = userEvent.setup();
    const { release } = stubProductScan(() =>
      Response.json({ lines: [line({ lowConfidence: true })] }),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await shoot(user);
    release();
    expect(
      await screen.findByText(/Low confidence: check the match/),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    ).toBeEnabled();
  });

  it('on no match, pre-types the search with the read name and says so', async () => {
    const user = userEvent.setup();
    const { release } = stubProductScan(() =>
      Response.json({
        lines: [
          line({ match: null, name: 'Zorblax', quantity: null, unit: null }),
        ],
      }),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await shoot(user);
    release();
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Search ingredients' }),
      ).toHaveValue('Zorblax'),
    );
    expect(
      await screen.findByText("Couldn't match Zorblax · pick the closest"),
    ).toBeVisible();
    // Nothing is picked, so there is no camera tag to show.
    expect(screen.queryByTestId('camera-source-tag')).toBeNull();
    // The note is read into the form; its field shows once an Ingredient is picked.
    // The sheet opens without the keyboard on a phone, so the Member taps the search.
    await user.click(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
    );
    await user.click(await screen.findByRole('option', { name: /Yogurt/ }));
    expect(screen.queryByTestId('camera-source-tag')).toBeNull();
    expect(screen.getByLabelText('Note · optional')).toHaveValue(
      'Greek yogurt 500 g',
    );
  });

  it('with no name and no description, toasts the plain photo line, not a no-match', async () => {
    const user = userEvent.setup();
    const { release } = stubProductScan(() =>
      Response.json({
        lines: [
          line({
            match: null,
            name: '',
            productDescription: null,
            quantity: 250,
            unit: 'g',
          }),
        ],
      }),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await shoot(user);
    release();
    expect(
      await screen.findByText('Read from your photo · check it and add'),
    ).toBeVisible();
    expect(screen.queryByText(/Couldn't match/)).toBeNull();
  });

  it("keeps the Member's typed Unmatched name untagged and silent when the photo only fills the rest", async () => {
    const user = userEvent.setup();
    const { release } = stubProductScan(() =>
      Response.json({
        lines: [line({ match: milk, name: 'Milk', quantity: 500, unit: 'g' })],
      }),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'Zorblax paste',
    );
    await user.click(
      await screen.findByRole('option', {
        name: /Use “Zorblax paste” as typed/,
      }),
    );
    await shoot(user);
    release();
    await waitFor(() =>
      expect(screen.queryByTestId('camera-overlay')).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole('textbox', { name: /Amount of Zorblax paste/ }),
    ).toHaveValue('500');
    expect(screen.getByLabelText('Note · optional')).toHaveValue(
      'Greek yogurt 500 g',
    );
    expect(
      screen.queryByRole('combobox', { name: /Ingredient: Milk/ }),
    ).toBeNull();
    expect(screen.queryByTestId('camera-source-tag')).toBeNull();
    expect(screen.queryByTestId('prefilled-ingredient')).toBeNull();
    expect(
      screen.queryByText('Read from your photo · check it and add'),
    ).toBeNull();
    expect(screen.queryByText(/Couldn't match/)).toBeNull();
  });

  it('keeps the note field once the photo has filled it, even when the Member deletes its text', async () => {
    const user = userEvent.setup();
    const { release } = stubProductScan(() =>
      Response.json({ lines: [line()] }),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await shoot(user);
    release();
    const note = await screen.findByLabelText('Note · optional');
    expect(note).toHaveValue('Greek yogurt 500 g');
    await user.clear(note);
    const still = screen.getByLabelText('Note · optional');
    expect(still).toHaveValue('');
    expect(still).toHaveFocus();
    expect(screen.queryByRole('button', { name: /Add a note/ })).toBeNull();
  });

  it('says the scan cap is used up, in the camera', async () => {
    const user = userEvent.setup();
    const { release } = stubProductScan(() =>
      Response.json(
        { code: 'scan.cap_reached', params: { cap: 30 } },
        { status: 429 },
      ),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await shoot(user);
    release();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/all of today's scans/)).toBeVisible();
    expect(screen.getByTestId('camera-overlay')).toBeInTheDocument();
  });

  it('stays in the camera on a read failure, and Type it returns to the sheet with the search focused', async () => {
    const user = userEvent.setup();
    const { release } = stubProductScan(() =>
      Response.json(
        { code: 'scan.provider_incomplete', params: {} },
        { status: 502 },
      ),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await shoot(user);
    release();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      "Couldn't read that label. Try again or type it.",
    );
    await user.click(within(alert).getByRole('button', { name: 'Type it' }));
    expect(screen.queryByTestId('camera-overlay')).toBeNull();
    expect(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
    ).toHaveFocus();
  });
});

describe('Learn barcodes from Product photos', () => {
  const CODE = '5941234567899';
  beforeEach(() => {
    localStorage.clear();
    image.prepare = null;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function save(
    user: ReturnType<typeof userEvent.setup>,
    calls: ReturnType<typeof stubApi>['calls'],
  ) {
    await user.click(
      screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    );
    await waitFor(() =>
      expect(
        calls.some((call) => call.key === 'POST /api/pantry/batches'),
      ).toBe(true),
    );
    return calls.find((call) => call.key === 'POST /api/pantry/batches')?.body;
  }

  it('sends a barcode decoded from the captured frame with the save, without another Scan', async () => {
    const user = userEvent.setup();
    fakeCamera.reads = [() => Promise.resolve(CODE)];
    const { calls, release } = stubProductScan(() =>
      Response.json({ lines: [line()] }),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await shoot(user);
    release();
    await screen.findByTestId('camera-source-tag');
    await waitFor(() => expect(fakeCamera.readCount).toBe(1));
    await act(async () => {});

    expect(await save(user, calls)).toMatchObject({
      ingredientId: 'yogurt-id',
      barcode: CODE,
    });
    expect(scanCalls(calls)).toHaveLength(1);
  });

  it('sends no barcode when the frame has none', async () => {
    const user = userEvent.setup();
    const { calls, release } = stubProductScan(() =>
      Response.json({ lines: [line()] }),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await shoot(user);
    release();
    await screen.findByTestId('camera-source-tag');
    await waitFor(() => expect(fakeCamera.readCount).toBe(1));
    await act(async () => {});

    expect(await save(user, calls)).not.toHaveProperty('barcode');
  });

  it('ignores a decode failure silently', async () => {
    const user = userEvent.setup();
    fakeCamera.reads = [() => Promise.reject(new Error('no decoder'))];
    const { calls, release } = stubProductScan(() =>
      Response.json({ lines: [line()] }),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await shoot(user);
    release();
    await screen.findByTestId('camera-source-tag');

    await waitFor(() => expect(fakeCamera.readCount).toBe(1));
    await act(async () => {});
    expect(screen.queryByRole('alert')).toBeNull();
    expect(await save(user, calls)).not.toHaveProperty('barcode');
  });

  it('does not let a slow decode overwrite a later photo', async () => {
    const user = userEvent.setup();
    let late: (code: string | null) => void = () => {};
    fakeCamera.reads = [
      () => new Promise<string | null>((resolve) => (late = resolve)),
      () => Promise.resolve(null),
    ];
    const { calls, release } = stubProductScan(() =>
      Response.json({ lines: [line()] }),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await shoot(user);
    release();
    await screen.findByTestId('camera-source-tag');
    await clearPick(user);
    await shoot(user);
    await act(async () => {
      late(CODE);
    });

    expect(await save(user, calls)).not.toHaveProperty('barcode');
  });

  it('drops an earlier photo barcode when the next photo has none', async () => {
    const user = userEvent.setup();
    fakeCamera.reads = [
      () => Promise.resolve(CODE),
      () => Promise.resolve(null),
    ];
    const { calls, release } = stubProductScan(() =>
      Response.json({ lines: [line()] }),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await shoot(user);
    release();
    await screen.findByTestId('camera-source-tag');
    await clearPick(user);
    await shoot(user);
    await waitFor(() => expect(fakeCamera.readCount).toBe(2));

    expect(await save(user, calls)).not.toHaveProperty('barcode');
  });
});
