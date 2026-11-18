import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '@/lib/catalog';
import type { ProposedLine } from '@/lib/scan';
import { calendarDay, sheetButton } from '@/test/expirySheet';
import { renderWithProviders, stubApi } from '@/test/render';
import { stubViewport } from '@/test/viewport';
import { REVIEW_ROUTE, startReview } from '@/test/review';
import { ReviewPage } from './ReviewPage';
import { tabletTemplate } from './components/layout';

const parmesan: CatalogSearchResult = {
  owner: 'catalog',
  amountScale: 'medium',
  id: 'parmesan-id',
  name: 'Parmesan',
  defaultUnit: 'g',
  leafCategory: { id: 'hard', name: 'Hard cheese' },
  parentCategory: {
    id: 'dairy',
    name: 'Dairy',
    aisle: { id: 'aisle', name: 'Dairy' },
  },
  defaults: { expiryDays: 60, location: 'fridge' },
};
const milk: CatalogSearchResult = {
  ...parmesan,
  id: 'milk-id',
  name: 'Milk',
  defaultUnit: 'ml',
  defaults: { expiryDays: 7, location: 'fridge' },
};

const line = (overrides: Partial<ProposedLine> = {}): ProposedLine => ({
  name: 'Grana Padano',
  match: parmesan,
  lowConfidence: false,
  quantity: 200,
  unit: 'g',
  expiryDate: '2026-12-24',
  sourceText: 'GRANA PAD 200G',
  productDescription: 'Grana Padano 200g',
  ...overrides,
});

function renderReview(lines: ProposedLine[]) {
  startReview({ mode: 'product', lines });
  const { fetchMock, calls } = stubApi({
    'GET /api/catalog/search': () => Response.json({ results: [milk] }),
    'GET /api/catalog/parents': () =>
      Response.json({ parents: [{ id: 'dairy-id', name: 'Dairy' }] }),
    'POST /api/pantry/batches/bulk': () => Response.json({ batches: [] }),
    'GET /api/settings/family': () =>
      Response.json({ staleThresholdDays: 3, expiryOverrides: [] }),
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route path="/scan/review/:scanId" element={<ReviewPage />} />
      <Route path="/scan" element={<p>scan screen</p>} />
      <Route path="/pantry" element={<p>pantry screen</p>} />
    </Routes>,
    { route: REVIEW_ROUTE },
  );
  return calls;
}

/** The table row of a line, found by its Remove button, which every row has and names the line. */
const rowOf = (name: string) =>
  screen
    .getByRole('button', { name: `Remove ${name}` })
    .closest('[role="row"]') as HTMLElement;

describe('Review on a tablet or laptop', () => {
  beforeEach(() => {
    stubViewport(1180);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is a table with column headers and group rows, with counters and no sticky bar', () => {
    renderReview([
      line(),
      line({ match: milk, name: 'Beer', lowConfidence: true }),
    ]);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('columnheader')
        .map((h) => h.textContent)
        .filter(Boolean),
    ).toEqual(
      expect.arrayContaining([
        'Product',
        'Qty',
        'Location',
        'Expires',
        'Confidence',
      ]),
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'To check · 1' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Confident · 1' }),
    ).toBeInTheDocument();
    expect(screen.getByText('to save').parentElement).toHaveTextContent('2');
    expect(
      screen.getByText('Sure rows are collapsed. Tap a row to edit it.'),
    ).toBeInTheDocument();
  });

  it('edits a row to check in place, with name, source and Description lines and swap + delete actions', async () => {
    renderReview([line({ match: milk, name: 'Beer', lowConfidence: true })]);
    const row = rowOf('Milk');
    expect(within(row).getByText('Read: GRANA PAD 200G')).toBeInTheDocument();
    expect(within(row).getByLabelText('Product description: Milk')).toHaveValue(
      'Grana Padano 200g',
    );
    expect(within(row).getByText('Low')).toBeInTheDocument();
    expect(
      within(row).getByRole('img', { name: 'Low confidence' }),
    ).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: 'Change match for Milk' }),
    ).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: 'Remove Milk' }),
    ).toBeInTheDocument();
    const qty = within(row).getByLabelText('Quantity: Milk');
    await userEvent.clear(qty);
    await userEvent.type(qty, '3');
    expect(qty).toHaveValue(3);
    expect(within(row).getByLabelText('Expiry date: Milk')).toHaveValue(
      '24.12.2026',
    );
    // A table cell is too narrow for the Location toggle: the tablet keeps the dropdown.
    expect(
      within(row).getByRole('combobox', { name: 'Location: Milk' }),
    ).toHaveValue('fridge');
    expect(within(row).queryByRole('group', { name: 'Location' })).toBeNull();
  });

  it('keeps a missing-quantity row in To check while typed, then Confirm moves it to Confident', async () => {
    renderReview([line({ quantity: null, unit: null })]);
    const row = rowOf('Parmesan');
    expect(within(row).getByText('No quantity')).toBeInTheDocument();
    await userEvent.type(
      within(row).getByLabelText('Quantity: Parmesan'),
      '25',
    );
    expect(
      within(rowOf('Parmesan')).getByLabelText('Quantity: Parmesan'),
    ).toHaveValue(25);
    expect(
      screen.getByRole('heading', { level: 2, name: 'To check · 1' }),
    ).toBeInTheDocument();
    expect(within(rowOf('Parmesan')).getByText('High')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm Parmesan' }),
    );
    expect(
      screen.queryByRole('heading', { name: /To check/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Confident · 1' }),
    ).toBeInTheDocument();
    expect(screen.getByText('to check').parentElement).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: 'Edit Parmesan' })).toHaveFocus();
  });

  it('blocks Confirm on an invalid value and focuses it', async () => {
    renderReview([line({ lowConfidence: true })]);
    const qty = screen.getByLabelText('Quantity: Parmesan');
    await userEvent.clear(qty);
    await userEvent.type(qty, '0');
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm Parmesan' }),
    );
    expect(screen.getByLabelText('Quantity: Parmesan')).toHaveFocus();
    expect(
      screen.getByRole('heading', { level: 2, name: 'To check · 1' }),
    ).toBeInTheDocument();
  });

  it('does not reopen a collapsed Confident group when a row to check is typed in', async () => {
    renderReview([line(), line({ name: 'B', match: milk, quantity: null })]);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    await userEvent.type(screen.getByLabelText('Quantity: Milk'), '2');
    expect(screen.getByRole('button', { name: 'Show' })).toBeInTheDocument();
  });

  it('shows a sure row as read-only text until the row or its pencil is clicked', async () => {
    renderReview([line(), line({ match: milk, name: 'Milk', unit: 'ml' })]);
    const row = rowOf('Parmesan');
    expect(within(row).queryByRole('textbox')).not.toBeInTheDocument();
    expect(row).toHaveTextContent('200 g');
    expect(row).toHaveTextContent('24.12.2026');
    expect(row).toHaveTextContent('Read: GRANA PAD 200G');
    expect(row).toHaveTextContent('Grana Padano 200g');
    expect(within(row).getByText('High')).toBeInTheDocument();
    await userEvent.click(row);
    expect(
      within(rowOf('Parmesan')).getByLabelText('Quantity: Parmesan'),
    ).toBeInTheDocument();
    expect(
      within(rowOf('Parmesan')).getByLabelText('Product description: Parmesan'),
    ).toBeInTheDocument();
    await userEvent.click(
      within(rowOf('Milk')).getByRole('button', { name: 'Edit Milk' }),
    );
    expect(
      within(rowOf('Milk')).getByLabelText('Quantity: Milk'),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Finish editing Milk' }),
    );
    expect(
      within(rowOf('Milk')).queryByLabelText('Quantity: Milk'),
    ).not.toBeInTheDocument();
  });

  it('lets an Unmatched row edit its Name and Category in place', async () => {
    const calls = renderReview([line({ match: null, name: 'Mystery' })]);
    const row = rowOf('Mystery');
    const name = within(row).getByLabelText('Name: Mystery');
    await userEvent.clear(name);
    await userEvent.type(name, 'Zaatar');
    expect(within(row).getByText('Low')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(row).getByRole('option', { name: 'Dairy' }),
      ).toBeInTheDocument(),
    );
    await userEvent.selectOptions(
      within(row).getByLabelText('Category: Zaatar'),
      'Dairy',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 item' }));
    await screen.findByText('pantry screen');
    const body = calls.find((c) => c.key === 'POST /api/pantry/batches/bulk')
      ?.body as { batches: object[] };
    expect(body.batches[0]).toMatchObject({
      rawName: 'Zaatar',
      parentCategoryId: 'dairy-id',
    });
  });

  it('swaps the Match in the dialog, keeps the row in To check and returns focus to the trigger', async () => {
    renderReview([line({ lowConfidence: true })]);
    const trigger = screen.getByRole('button', {
      name: 'Change match for Parmesan',
    });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await userEvent.click(trigger);
    const dialog = screen.getByRole('dialog', {
      name: 'Change match for Parmesan',
    });
    await userEvent.type(
      within(dialog).getByRole('combobox', { name: 'Search ingredients' }),
      'mil',
    );
    await userEvent.click(await screen.findByRole('option', { name: /Milk/ }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'To check · 1' }),
    ).toBeInTheDocument();
    expect(rowOf('Milk')).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Change match for Milk' }),
    ).toHaveFocus();
  });

  it('lets a sure row, and a confirmed Unmatched row, choose a Match', async () => {
    renderReview([line(), line({ match: null, name: 'Mystery' })]);
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm Mystery' }),
    );
    await userEvent.click(rowOf('Mystery'));
    await userEvent.click(
      screen.getByRole('button', { name: 'Choose match for Mystery' }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('removes a row to Excluded and adds it back', async () => {
    renderReview([line(), line({ match: milk, name: 'Milk' })]);
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Parmesan' }),
    );
    expect(
      screen.getByRole('button', { name: 'Save 1 item' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Excluded · 1/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Add Parmesan back' }),
    );
    expect(
      screen.getByRole('button', { name: 'Save 2 items' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Parmesan' })).toHaveFocus();
  });

  it('blocks Save on an invalid date, opening the sure row and focusing the field', async () => {
    const calls = renderReview([line()]);
    await userEvent.click(rowOf('Parmesan'));
    const expiry = screen.getByLabelText('Expiry date: Parmesan');
    await userEvent.clear(expiry);
    await userEvent.type(expiry, '0810');
    await userEvent.click(
      screen.getByRole('button', { name: 'Finish editing Parmesan' }),
    );
    expect(screen.getByLabelText('Expiry date: Parmesan')).toHaveFocus();
    expect(
      screen.getByText('Enter a real date as dd.mm.yyyy.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 item' }));
    expect(calls.map((c) => c.key)).not.toContain(
      'POST /api/pantry/batches/bulk',
    );
  });

  it('focuses the first invalid field of a collapsed sure row when Save is blocked', async () => {
    renderReview([
      line({ expiryDate: '2026-12-24' }),
      line({ name: 'B', match: milk }),
    ]);
    await userEvent.click(rowOf('Milk'));
    const qty = screen.getByLabelText('Quantity: Milk');
    await userEvent.clear(qty);
    await userEvent.type(qty, '0');
    await userEvent.click(rowOf('Parmesan'));
    await userEvent.click(screen.getByRole('button', { name: 'Save 2 items' }));
    expect(screen.getByLabelText('Quantity: Milk')).toHaveFocus();
    expect(
      screen.getByText(
        'Enter an amount from 0.001 to 1,000,000, with up to 3 decimals and no exponent.',
      ),
    ).toBeInTheDocument();
  });

  it('saves from the footer', async () => {
    const calls = renderReview([line()]);
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 item' }));
    await screen.findByText('pantry screen');
    expect(calls.map((c) => c.key)).toContain('POST /api/pantry/batches/bulk');
  });
});

describe('Review layout breakpoint', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is the phone layout at 899 px', () => {
    stubViewport(899);
    renderReview([line({ lowConfidence: true })]);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('to check')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
    expect(
      screen.queryByText('Sure rows are collapsed. Tap a row to edit it.'),
    ).not.toBeInTheDocument();
  });

  it('is the table at 900 px', () => {
    stubViewport(900);
    renderReview([line({ lowConfidence: true })]);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});

describe('the expiry sheet in the Review table', () => {
  // Wednesday 14 October 2026. Only `Date` is faked, so timers and transitions run as usual.
  beforeEach(() => {
    stubViewport(1180);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 14, 15, 30));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function openSheet(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      screen.getByRole('button', { name: 'Pick expiry date: Parmesan' }),
    );
    return screen.findByRole('dialog', { name: 'Expires' });
  }

  async function saved(
    user: ReturnType<typeof userEvent.setup>,
    calls: ReturnType<typeof renderReview>,
  ) {
    await user.click(screen.getByRole('button', { name: 'Save 1 item' }));
    await screen.findByText('pantry screen');
    const body = calls.find((c) => c.key === 'POST /api/pantry/batches/bulk')
      ?.body as { batches: object[] };
    return body.batches[0];
  }

  async function done(user: ReturnType<typeof userEvent.setup>) {
    await user.click(sheetButton(screen.getByRole('dialog'), 'Done'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  }

  it('keeps the typed dd.mm.yyyy field, and a typed date is saved as ISO', async () => {
    const user = userEvent.setup();
    const calls = renderReview([line({ lowConfidence: true })]);
    const expiry = screen.getByLabelText('Expiry date: Parmesan');
    expect(expiry).toHaveValue('24.12.2026');
    await user.clear(expiry);
    await user.type(expiry, '01022027');
    expect(expiry).toHaveValue('01.02.2027');
    expect(await saved(user, calls)).toMatchObject({
      expiryDate: '2027-02-01',
    });
  });

  it('says a typed impossible date is wrong only once the field is left', async () => {
    const user = userEvent.setup();
    renderReview([line({ lowConfidence: true })]);
    const expiry = screen.getByLabelText('Expiry date: Parmesan');
    await user.clear(expiry);
    await user.type(expiry, '31022027');
    expect(
      screen.queryByText('Enter a real date as dd.mm.yyyy.'),
    ).not.toBeInTheDocument();
    await user.tab();
    expect(
      screen.getByText('Enter a real date as dd.mm.yyyy.'),
    ).toBeInTheDocument();
  });

  it("opens the sheet from the cell's calendar button with the line's context, and a picked day fills the cell and is saved", async () => {
    const user = userEvent.setup();
    const calls = renderReview([line({ lowConfidence: true })]);
    const opener = screen.getByRole('button', {
      name: 'Pick expiry date: Parmesan',
    });
    expect(opener).toHaveAttribute('aria-haspopup', 'dialog');

    const sheet = await openSheet(user);
    expect(sheet).toHaveTextContent('Parmesan · 200 g · Fridge');
    expect(calendarDay(sheet, 'Thursday, December 24, 2026')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(calendarDay(sheet, 'Monday, December 28, 2026'));
    expect(screen.getByLabelText('Expiry date: Parmesan')).toHaveValue(
      '28.12.2026',
    );
    await done(user);
    expect(opener).toHaveFocus();
    expect(await saved(user, calls)).toMatchObject({
      expiryDate: '2026-12-28',
    });
  });

  it('returns focus to the calendar button when the sheet closes, even if a tap did not focus it', async () => {
    const user = userEvent.setup();
    renderReview([line({ lowConfidence: true })]);
    const opener = screen.getByRole('button', {
      name: 'Pick expiry date: Parmesan',
    });
    // Safari doesn't focus a button on tap, so a synthetic click leaves focus elsewhere.
    fireEvent.click(opener);
    await screen.findByRole('dialog', { name: 'Expires' });
    await done(user);
    expect(opener).toHaveFocus();
  });

  it('saves no expiry when No expiry is chosen in the sheet', async () => {
    const user = userEvent.setup();
    const calls = renderReview([line({ lowConfidence: true })]);
    const sheet = await openSheet(user);
    await user.click(sheetButton(sheet, 'No expiry'));
    expect(screen.getByLabelText('Expiry date: Parmesan')).toHaveValue('');
    await done(user);
    expect(await saved(user, calls)).toMatchObject({ expiryDate: null });
  });

  it('keeps a picked date when the Match changes, instead of the new default', async () => {
    const user = userEvent.setup();
    renderReview([line({ lowConfidence: true, expiryDate: null })]);
    // No date was read, so the cell holds Parmesan's Default Expiry (60 days).
    expect(screen.getByLabelText('Expiry date: Parmesan')).toHaveValue(
      '13.12.2026',
    );
    const sheet = await openSheet(user);
    await user.click(calendarDay(sheet, 'Monday, December 28, 2026'));
    await done(user);

    await user.click(
      screen.getByRole('button', { name: 'Change match for Parmesan' }),
    );
    await user.type(
      within(
        screen.getByRole('dialog', { name: 'Change match for Parmesan' }),
      ).getByRole('combobox', { name: 'Search ingredients' }),
      'milk',
    );
    await user.click(await screen.findByRole('option', { name: /Milk/ }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Expiry date: Milk')).toHaveValue(
      '28.12.2026',
    );
  });
});

describe('tablet column template', () => {
  it('uses fixed widths so Produs takes the remainder', () => {
    expect(tabletTemplate()).toBe(
      '24px minmax(0,1fr) 120px 104px 144px 112px 144px',
    );
    expect(tabletTemplate(true)).toBe(
      '24px minmax(0,1fr) 150px 150px 180px 120px 144px',
    );
  });
});
