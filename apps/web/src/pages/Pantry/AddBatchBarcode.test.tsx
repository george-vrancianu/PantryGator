import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '@/lib/catalog';
import type { Batch } from '@/lib/pantry';
import { clearPick, typeNote } from '@/test/addBatch';
import { renderWithProviders, stubApi } from '@/test/render';
import { PantryPage } from './PantryPage';
import {
  emitBarcode,
  fakeCamera,
  languageChip,
  queryLanguageChip,
} from '@/test/scan';

vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
vi.mock('@/lib/image', () => ({
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,AAAA'),
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
const CODE = '5941234567899';

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

const MILK_ALLERGEN = { id: 'al-milk', name: 'Milk' };
const GLUTEN_ALLERGEN = { id: 'al-gluten', name: 'Gluten' };

const found = (overrides: object = {}) => ({
  allergens: [],
  missingAllergens: [],
  found: true,
  source: 'open_food_facts',
  match: yogurt,
  lowConfidence: false,
  productDescription: 'Greek yogurt',
  quantity: 400,
  unit: 'g',
  ...overrides,
});

function stubLookup(
  answer: () => Response | Promise<Response>,
  extra: Record<string, (url: URL) => Response | Promise<Response>> = {},
) {
  const { fetchMock, calls } = stubApi({
    'GET /api/pantry': () =>
      Response.json({ batches: [milkBatch], runningLow: [] }),
    'GET /api/staples': () => Response.json({ staples: [] }),
    'GET /api/settings/family': () =>
      Response.json({ staleThresholdDays: 3, expiryOverrides: [] }),
    'GET /api/catalog/search': () => Response.json({ results: [yogurt, milk] }),
    'GET /api/pantry/recently-stocked': () =>
      Response.json({ ingredients: [] }),
    [`GET /api/barcode-lookup/${CODE}`]: answer,
    'POST /api/scan/product': () => Response.json({ lines: [] }),
    'POST /api/pantry/batches': () => Response.json(milkBatch, { status: 201 }),
    ...extra,
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const productLine = {
  name: 'Zorblax',
  sourceText: null,
  match: null,
  lowConfidence: false,
  quantity: null,
  unit: null,
  expiryDate: null,
  productDescription: 'Zorblax Crunch',
};

async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Add batch' }));
}
const cameraButton = () => screen.getByRole('button', { name: 'Scan barcode' });

async function decode(code = CODE) {
  await waitFor(() => expect(fakeCamera.emit).not.toBeNull());
  act(() => emitBarcode(code));
}

/** Reads a code, waits for the result card and confirms it with Use this. */
async function decodeAndUse(code = CODE) {
  await decode(code);
  fireEvent.click(await screen.findByRole('button', { name: 'Use this' }));
}

describe('Prefill the add-Batch form from a Barcode Lookup', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers Product and Barcode, starts in Barcode with no Scan Language chip', async () => {
    const user = userEvent.setup();
    stubLookup(() => Response.json(found()));
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());

    const slider = screen.getAllByRole('radio');
    expect(slider.map((radio) => radio.textContent)).toEqual([
      'Product',
      'Barcode',
    ]);
    expect(screen.getByRole('radio', { name: 'Barcode' })).toBeChecked();
    expect(queryLanguageChip()).not.toBeInTheDocument();
    expect(fakeCamera.watching).toBe(1);

    await user.click(screen.getByRole('radio', { name: 'Product' }));
    expect(languageChip()).toBeInTheDocument();
    expect(fakeCamera.watching).toBe(0);
  });

  it('closes on a decoded barcode, prefills the form and credits Open Food Facts, without a Scan', async () => {
    const user = userEvent.setup();
    const calls = stubLookup(() => Response.json(found()));
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decode();
    // The card waits for Use this: nothing is filled yet.
    const card = await screen.findByTestId('barcode-card');
    expect(within(card).getByText('Greek yogurt')).toBeVisible();
    expect(within(card).getByText('Yogurt · Dairy & eggs')).toBeVisible();
    expect(
      within(card).getByText('Product data: Open Food Facts'),
    ).toBeVisible();
    expect(card).toHaveAttribute('role', 'status');
    expect(screen.queryByTestId('scan-line')).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Use this' }));

    expect(screen.queryByTestId('camera-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('camera-source-tag')).toHaveTextContent(
      'Scanned',
    );
    expect(screen.getByTestId('selected-token')).toHaveTextContent(
      'Greek yogurt',
    );
    expect(screen.queryByTestId('prefilled-ingredient')).toBeNull();
    expect(
      await screen.findByText(/Found by barcode · Greek yogurt/),
    ).toBeVisible();
    expect(
      await screen.findByRole('combobox', {
        name: 'Ingredient: Yogurt. Press Backspace to change',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /Amount of Yogurt/ }),
    ).toHaveValue('400');
    expect(screen.getByRole('button', { name: 'Unit: g' })).toBeInTheDocument();
    expect(screen.getByLabelText('Note · optional')).toHaveValue(
      'Greek yogurt',
    );
    expect(screen.getByTestId('prefilled-description')).toHaveTextContent(
      'Filled from the product',
    );
    expect(screen.getByText('Product data: Open Food Facts')).toBeVisible();
    const lookup = calls.filter((call) =>
      call.key.startsWith('GET /api/barcode'),
    );
    expect(lookup).toHaveLength(1);
    expect(calls.some((call) => call.key === 'POST /api/scan/product')).toBe(
      false,
    );
  });

  it('shows a lookup state while the code is looked up', async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    stubLookup(async () => {
      await gate;
      return Response.json(found());
    });
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decode();
    expect(await screen.findByText('Looking up the barcode…')).toBeVisible();
    release();
    expect(
      await screen.findByRole('button', { name: 'Use this' }),
    ).toBeVisible();
    expect(screen.queryByText('Looking up the barcode…')).toBeNull();
  });

  it('with no confident match, pre-types the Ingredient search and fills the description', async () => {
    const user = userEvent.setup();
    stubLookup(() =>
      Response.json(
        found({ match: null, productDescription: 'Zorblax Crunch' }),
      ),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decodeAndUse();

    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Search ingredients' }),
      ).toHaveValue('Zorblax Crunch'),
    );
    // No Ingredient is picked yet, so the rest of the form waits for one.
    expect(screen.queryByLabelText('Note · optional')).toBeNull();
    expect(screen.getByText('Product data: Open Food Facts')).toBeVisible();
    await user.clear(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
    );
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'yog',
    );
    await user.click(await screen.findByRole('option', { name: /Yogurt/ }));
    expect(screen.getByLabelText('Note · optional')).toHaveValue(
      'Zorblax Crunch',
    );
  });

  it('keeps what the Member already set', async () => {
    const user = userEvent.setup();
    stubLookup(() => Response.json(found()));
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'mil',
    );
    await user.click(await screen.findByRole('option', { name: /Milk/ }));
    await typeNote(user, 'Mine');
    // The camera is for an empty pick: clear it. The note the Member typed stays.
    await clearPick(user);
    await user.click(cameraButton());
    await decodeAndUse();

    await screen.findByText('Product data: Open Food Facts');
    expect(
      screen.getByRole('combobox', {
        name: 'Ingredient: Yogurt. Press Backspace to change',
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Note · optional')).toHaveValue('Mine');
    expect(
      screen.getByRole('textbox', { name: /Amount of Yogurt/ }),
    ).toHaveValue('400');
  });

  it('on not found, shows the unknown-barcode card with Take a photo and Type it', async () => {
    const user = userEvent.setup();
    stubLookup(() => Response.json({ found: false }));
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decode();

    const card = await screen.findByTestId('barcode-card');
    expect(
      await within(card).findByText("We don't know this barcode yet"),
    ).toBeVisible();
    expect(within(card).getByText(CODE)).toBeVisible();
    expect(
      within(card).getByRole('button', { name: 'Take a photo' }),
    ).toBeVisible();
    expect(within(card).getByRole('button', { name: 'Type it' })).toBeVisible();
    expect(screen.queryByText('Product data: Open Food Facts')).toBeNull();
  });

  it('Scan again dismisses the card and reads again', async () => {
    const user = userEvent.setup();
    stubLookup(() => Response.json(found()));
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decode();
    await user.click(await screen.findByRole('button', { name: 'Scan again' }));
    expect(screen.queryByTestId('barcode-card')).toBeNull();
    expect(screen.getByTestId('camera-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('scan-line')).toBeInTheDocument();
    await waitFor(() => expect(fakeCamera.watching).toBe(1));
  });

  it('says why the lookup failed on the card and offers Scan again', async () => {
    const user = userEvent.setup();
    stubLookup(() =>
      Response.json(
        { code: 'barcode.provider_unavailable', params: {} },
        { status: 502 },
      ),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decode();
    expect(
      await screen.findByText(/barcode lookup is unavailable/),
    ).toBeVisible();
    expect(screen.getByTestId('camera-overlay')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scan again' })).toBeVisible();
  });

  it('offers Type it and Take a photo after a failed lookup, without teaching the code', async () => {
    const user = userEvent.setup();
    const calls = stubLookup(() =>
      Response.json(
        { code: 'barcode.rate_limited', params: {} },
        { status: 429, headers: { 'Retry-After': '30' } },
      ),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decode();
    const card = await screen.findByTestId('barcode-card');
    expect(
      await within(card).findByText(/Too many Barcode Lookups/),
    ).toBeVisible();
    expect(
      within(card).queryByText("We don't know this barcode yet"),
    ).toBeNull();
    expect(
      within(card).getByRole('button', { name: 'Scan again' }),
    ).toBeVisible();
    expect(
      within(card).getByRole('button', { name: 'Take a photo' }),
    ).toBeVisible();
    await user.click(within(card).getByRole('button', { name: 'Type it' }));
    expect(screen.queryByTestId('camera-overlay')).toBeNull();
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'mil',
    );
    await user.click(await screen.findByRole('option', { name: /Milk/ }));
    await user.click(
      screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    );
    await waitFor(() =>
      expect(
        calls.some((call) => call.key === 'POST /api/pantry/batches'),
      ).toBe(true),
    );
    const create = calls.find(
      (call) => call.key === 'POST /api/pantry/batches',
    );
    expect(create?.body).toMatchObject({ ingredientId: 'milk-id' });
    expect(create?.body).not.toHaveProperty('barcode');
  });

  it('sends no barcode when the Member takes a photo after a failed lookup', async () => {
    const user = userEvent.setup();
    const calls = stubLookup(
      () =>
        Response.json(
          { code: 'barcode.rate_limited', params: {} },
          { status: 429, headers: { 'Retry-After': '30' } },
        ),
      {
        'POST /api/scan/product': () =>
          Response.json({ lines: [{ ...productLine, match: yogurt }] }),
      },
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decode();
    const card = await screen.findByTestId('barcode-card');
    await within(card).findByText(/Too many Barcode Lookups/);
    await user.click(
      within(card).getByRole('button', { name: 'Take a photo' }),
    );
    screen.getByRole('button', { name: 'Take photo' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.queryByTestId('camera-overlay')).toBeNull(),
    );
    await user.click(
      await screen.findByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    );
    await waitFor(() =>
      expect(
        calls.some((call) => call.key === 'POST /api/pantry/batches'),
      ).toBe(true),
    );
    const create = calls.find(
      (call) => call.key === 'POST /api/pantry/batches',
    );
    expect(create?.body).not.toHaveProperty('barcode');
  });

  it('ignores a lookup that lands after the Member switched to Product', async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const calls = stubLookup(async () => {
      await gate;
      return Response.json(found());
    });
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decode();
    expect(await screen.findByText('Looking up the barcode…')).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'Product' }));
    expect(screen.queryByTestId('barcode-card')).toBeNull();
    release();
    await act(async () => {
      await gate;
    });
    await waitFor(() =>
      expect(
        calls.filter((c) => c.key.startsWith('GET /api/barcode')),
      ).toHaveLength(1),
    );
    expect(screen.queryByTestId('barcode-card')).toBeNull();
  });

  it('says to wait on the card when the lookup is rate limited', async () => {
    const user = userEvent.setup();
    stubLookup(() =>
      Response.json(
        { code: 'barcode.rate_limited', params: {} },
        { status: 429, headers: { 'Retry-After': '30' } },
      ),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decode();
    expect(await screen.findByText(/Too many Barcode Lookups/)).toBeVisible();
    expect(screen.queryByText(/No product found/)).toBeNull();
  });

  it('cancelling keeps the form and ends the watch', async () => {
    const user = userEvent.setup();
    const calls = stubLookup(() => Response.json(found()));
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await user.click(screen.getByRole('button', { name: 'Close scanner' }));
    expect(fakeCamera.watching).toBe(0);
    expect(calls.some((call) => call.key.startsWith('GET /api/barcode'))).toBe(
      false,
    );
  });

  it('drops the Open Food Facts credit once a Product photo is read after a barcode', async () => {
    const user = userEvent.setup();
    stubLookup(() => Response.json(found()), {
      'POST /api/scan/product': () => Response.json({ lines: [productLine] }),
    });
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decodeAndUse();
    await screen.findByText('Product data: Open Food Facts');

    await clearPick(user);
    await user.click(cameraButton());
    await user.click(screen.getByRole('radio', { name: 'Product' }));
    screen.getByRole('button', { name: 'Take photo' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.queryByText('Product data: Open Food Facts')).toBeNull(),
    );
  });

  it('with no confident match after a cleared pick, pre-types the search', async () => {
    const user = userEvent.setup();
    let calls = 0;
    stubLookup(() =>
      Response.json(
        ++calls === 1
          ? found()
          : found({ match: null, productDescription: 'Zorblax' }),
      ),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decodeAndUse();
    await screen.findByRole('combobox', {
      name: 'Ingredient: Yogurt. Press Backspace to change',
    });

    fakeCamera.emit = null;
    await clearPick(user);
    await user.click(cameraButton());
    await decodeAndUse();
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Search ingredients' }),
      ).toHaveValue('Zorblax'),
    );
  });

  it('shows the strings in Romanian and Danish', async () => {
    const user = userEvent.setup();
    stubLookup(() => Response.json(found()));
    renderWithProviders(<PantryPage />, { locale: 'da' });
    await user.click(await screen.findByRole('button', { name: /^Tilføj/ }));
    await user.click(screen.getByRole('button', { name: 'Scan stregkode' }));
    expect(screen.getByRole('radio', { name: 'Stregkode' })).toBeChecked();
  });

  it('shows Barcode in Romanian', async () => {
    const user = userEvent.setup();
    stubLookup(() => Response.json(found()));
    renderWithProviders(<PantryPage />, { locale: 'ro' });
    await user.click(await screen.findByRole('button', { name: /^Adaugă/ }));
    await user.click(screen.getByRole('button', { name: 'Scanează codul' }));
    expect(screen.getByRole('radio', { name: 'Cod de bare' })).toBeChecked();
  });
});

describe('Known Barcodes on the add-Batch form (#348)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const known = (overrides: object = {}) =>
    found({
      source: 'known_barcode',
      productDescription: 'Our usual tub',
      quantity: null,
      unit: null,
      ...overrides,
    });

  it('sends the looked-up barcode with the Batch create', async () => {
    const user = userEvent.setup();
    const calls = stubLookup(() => Response.json(found()));
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decodeAndUse();
    await screen.findByText('Product data: Open Food Facts');
    await user.click(
      screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    );

    await waitFor(() =>
      expect(
        calls.some((call) => call.key === 'POST /api/pantry/batches'),
      ).toBe(true),
    );
    const create = calls.find(
      (call) => call.key === 'POST /api/pantry/batches',
    );
    expect(create?.body).toMatchObject({
      ingredientId: 'yogurt-id',
      barcode: CODE,
    });
  });

  it('learns a barcode Open Food Facts does not know: unknown, Type it, then a manual save sends it', async () => {
    const user = userEvent.setup();
    const calls = stubLookup(() => Response.json({ found: false }));
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decode();
    await user.click(await screen.findByRole('button', { name: 'Type it' }));
    expect(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
    ).toHaveFocus();
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'mil',
    );
    await user.click(await screen.findByRole('option', { name: /Milk/ }));
    await user.click(
      screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    );

    await waitFor(() =>
      expect(
        calls.some((call) => call.key === 'POST /api/pantry/batches'),
      ).toBe(true),
    );
    const create = calls.find(
      (call) => call.key === 'POST /api/pantry/batches',
    );
    expect(create?.body).toMatchObject({
      ingredientId: 'milk-id',
      barcode: CODE,
    });
  });

  it('keeps the looked-up barcode through a Product photo with no decodable code', async () => {
    const user = userEvent.setup();
    const calls = stubLookup(() => Response.json({ found: false }), {
      'POST /api/scan/product': () => Response.json({ lines: [productLine] }),
    });
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decode();
    await user.click(
      within(await screen.findByTestId('barcode-card')).getByRole('button', {
        name: 'Take a photo',
      }),
    );
    expect(screen.getByRole('radio', { name: 'Product' })).toBeChecked();
    screen.getByRole('button', { name: 'Take photo' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(calls.some((call) => call.key === 'POST /api/scan/product')).toBe(
        true,
      ),
    );
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'mil',
    );
    await user.click(await screen.findByRole('option', { name: /Milk/ }));
    await user.click(
      screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    );

    await waitFor(() =>
      expect(
        calls.some((call) => call.key === 'POST /api/pantry/batches'),
      ).toBe(true),
    );
    const create = calls.find(
      (call) => call.key === 'POST /api/pantry/batches',
    );
    expect(create?.body).toMatchObject({ barcode: CODE });
  });

  it('sends no barcode for a Batch typed by hand', async () => {
    const user = userEvent.setup();
    const calls = stubLookup(() => Response.json(found()));
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'mil',
    );
    await user.click(await screen.findByRole('option', { name: /Milk/ }));
    await user.click(
      screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    );

    await waitFor(() =>
      expect(
        calls.some((call) => call.key === 'POST /api/pantry/batches'),
      ).toBe(true),
    );
    const create = calls.find(
      (call) => call.key === 'POST /api/pantry/batches',
    );
    expect(create?.body).not.toHaveProperty('barcode');
  });

  it('prefills exactly what the Family saved, with no Open Food Facts credit', async () => {
    const user = userEvent.setup();
    stubLookup(() => Response.json(known()));
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decodeAndUse();

    expect(
      await screen.findByRole('combobox', {
        name: 'Ingredient: Yogurt. Press Backspace to change',
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Note · optional')).toHaveValue(
      'Our usual tub',
    );
    expect(screen.queryByText('Product data: Open Food Facts')).toBeNull();
  });

  it('fills the typed Unmatched name exactly and still sends the barcode', async () => {
    const user = userEvent.setup();
    const calls = stubLookup(() =>
      Response.json(
        known({
          match: null,
          unmatchedName: 'Zorblax Crunch',
          productDescription: 'Zorblax tub',
        }),
      ),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decodeAndUse();

    expect(
      await screen.findByText(/"Zorblax Crunch" will be saved as Unmatched/),
    ).toBeVisible();
    expect(screen.getByLabelText('Note · optional')).toHaveValue('Zorblax tub');
    expect(screen.queryByText('Product data: Open Food Facts')).toBeNull();
    await user.click(
      screen.getByRole('button', { name: /^Add (?!.*to your catalog)/ }),
    );
    await waitFor(() =>
      expect(
        calls.some((call) => call.key === 'POST /api/pantry/batches'),
      ).toBe(true),
    );
    expect(
      calls.find((call) => call.key === 'POST /api/pantry/batches')?.body,
    ).toMatchObject({ rawName: 'Zorblax Crunch', barcode: CODE });
  });
});

// Spec: #352. Open Food Facts allergens are a proposal for a new Family Ingredient's
// Contains row, and an informational note on a matched Ingredient.
describe('Allergens from a Barcode Lookup', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const catalogRoutes = {
    // Nothing matches the product name, so "Add to your catalog" is offered.
    'GET /api/catalog/search': () => Response.json({ results: [] }),
    'POST /api/catalog/family-ingredients': () =>
      Response.json(
        {
          ...yogurt,
          id: 'zorblax-id',
          name: 'Zorblax Crunch',
          owner: 'family',
        },
        { status: 201 },
      ),
    'GET /api/catalog/allergens': () =>
      Response.json({ allergens: [MILK_ALLERGEN, GLUTEN_ALLERGEN] }),
    'GET /api/catalog/categories': () =>
      Response.json({
        categories: [
          {
            id: 'leaf',
            name: 'Other',
            parentCategory: { id: 'dairy', name: 'Dairy' },
            aisle: { id: 'aisle', name: 'Dairy & eggs' },
            defaults: { expiryDays: 10, location: 'fridge' },
          },
        ],
      }),
  };

  async function lookUpUnmatched(allergens: object[]) {
    const user = userEvent.setup();
    const calls = stubLookup(
      () =>
        Response.json(
          found({
            match: null,
            productDescription: 'Zorblax Crunch',
            allergens,
          }),
        ),
      catalogRoutes,
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decodeAndUse();
    await user.click(
      await screen.findByRole('button', {
        name: 'Add “Zorblax Crunch” to your catalog',
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Add to your catalog',
    });
    return { user, dialog, calls };
  }

  it('pre-ticks the listed Allergens in the Contains row of a new Family Ingredient, and the Member can change them', async () => {
    const { user, dialog } = await lookUpUnmatched([MILK_ALLERGEN]);
    const milkChip = await within(dialog).findByRole('button', {
      name: 'Milk',
    });
    expect(milkChip).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(dialog).getByRole('button', { name: 'Gluten' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      within(dialog).getByRole('button', { name: 'None' }),
    ).toHaveAttribute('aria-pressed', 'false');

    await user.click(within(dialog).getByRole('button', { name: 'Gluten' }));
    await user.click(milkChip);
    expect(
      within(dialog).getByRole('button', { name: 'Gluten' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(milkChip).toHaveAttribute('aria-pressed', 'false');
  });

  it('saves the Family Ingredient with the pre-ticked Allergens as the Member left them', async () => {
    const { user, dialog, calls } = await lookUpUnmatched([MILK_ALLERGEN]);
    await user.click(
      await within(dialog).findByRole('button', { name: 'Gluten' }),
    );
    await user.click(
      within(dialog).getByRole('combobox', { name: 'Category' }),
    );
    await user.click(
      await within(dialog).findByRole('option', { name: /Other/ }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: /^Add & pick/ }),
    );

    await waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/catalog/family-ingredients')
          ?.body,
      ).toMatchObject({ allergenIds: ['al-milk', 'al-gluten'] }),
    );
  });

  it('does not pre-tick when the lookup matched an Ingredient', async () => {
    const user = userEvent.setup();
    stubLookup(
      () => Response.json(found({ allergens: [MILK_ALLERGEN], match: yogurt })),
      catalogRoutes,
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decodeAndUse();
    // Drop the match and create a new Ingredient instead.
    await screen
      .findByRole('combobox', {
        name: 'Ingredient: Yogurt. Press Backspace to change',
      })
      .then((box) => box.focus());
    await user.keyboard('{Backspace}');
    await user.click(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
    );
    await user.paste('Zorblax Crunch');
    await user.click(
      await screen.findByRole('button', {
        name: 'Add “Zorblax Crunch” to your catalog',
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Add to your catalog',
    });
    expect(
      await within(dialog).findByRole('button', { name: 'Milk' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('joins several listed Allergens in the locale list style', async () => {
    const user = userEvent.setup();
    stubLookup(() =>
      Response.json(
        found({ missingAllergens: [MILK_ALLERGEN, GLUTEN_ALLERGEN] }),
      ),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decodeAndUse();
    expect(
      await screen.findByText('This product lists Milk and Gluten'),
    ).toBeVisible();
  });

  it('proposes nothing until the Member saves: no tags are sent by the lookup', async () => {
    const { calls } = await lookUpUnmatched([MILK_ALLERGEN]);
    expect(
      calls.some((call) => call.key === 'POST /api/catalog/family-ingredients'),
    ).toBe(false);
  });

  it('pre-ticks nothing, and not "None", when Open Food Facts lists no Allergens', async () => {
    const { dialog } = await lookUpUnmatched([]);
    await within(dialog).findByRole('button', { name: 'Milk' });
    for (const name of ['Milk', 'Gluten', 'None']) {
      expect(within(dialog).getByRole('button', { name })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    }
  });

  it('notes the listed Allergens a matched Ingredient is not tagged with, and tags nothing', async () => {
    const user = userEvent.setup();
    const calls = stubLookup(() =>
      Response.json(found({ missingAllergens: [MILK_ALLERGEN] })),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decodeAndUse();

    expect(await screen.findByText('This product lists Milk')).toBeVisible();
    expect(
      calls.some(
        (call) => !call.key.startsWith('GET') && call.key.includes('allergens'),
      ),
    ).toBe(false);
  });

  it('shows no note when the matched Ingredient already has every listed Allergen', async () => {
    const user = userEvent.setup();
    stubLookup(() => Response.json(found({ allergens: [MILK_ALLERGEN] })));
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decodeAndUse();

    await screen.findByText('Product data: Open Food Facts');
    expect(screen.queryByText(/This product lists/)).toBeNull();
  });

  it('drops the note when the Member picks another Ingredient', async () => {
    const user = userEvent.setup();
    stubLookup(() =>
      Response.json(found({ missingAllergens: [MILK_ALLERGEN] })),
    );
    renderWithProviders(<PantryPage />);
    await openForm(user);
    await user.click(cameraButton());
    await decodeAndUse();
    await screen.findByText('This product lists Milk');

    screen
      .getByRole('combobox', {
        name: 'Ingredient: Yogurt. Press Backspace to change',
      })
      .focus();
    await user.keyboard('{Backspace}');
    expect(screen.queryByText(/This product lists/)).toBeNull();
  });
});
