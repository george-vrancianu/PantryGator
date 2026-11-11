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
import type { CatalogSearchResult } from '../../lib/catalog';
import type { ProposedLine } from '../../lib/scan';
import { calendarDay, sheetButton } from '../../test/expirySheet';
import { pickLocation, pressedLocation } from '../../test/location';
import { renderWithProviders, stubApi } from '../../test/render';
import { stubViewport } from '../../test/viewport';
import { REVIEW_ROUTE, startReview } from '../../test/review';
import { ReviewPage } from './ReviewPage';

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
  quantity: null,
  unit: null,
  expiryDate: '2026-12-24',
  sourceText: 'GRANA PAD 200G',
  productDescription: 'Grana Padano 200g',
  ...overrides,
});

function renderReview(
  lines: ProposedLine[],
  extra = {},
  scanLanguage?: 'en' | 'ro' | 'da',
) {
  startReview({ mode: 'product', lines, scanLanguage });
  const { fetchMock, calls } = stubApi({
    'GET /api/catalog/search': () => Response.json({ results: [milk] }),
    'GET /api/catalog/parents': () =>
      Response.json({
        parents: [
          { id: 'dairy-id', name: 'Dairy' },
          { id: 'other-id', name: 'Other' },
        ],
      }),
    'POST /api/pantry/batches/bulk': () => Response.json({ batches: [] }),
    'GET /api/settings/family': () =>
      Response.json({ staleThresholdDays: 3, expiryOverrides: [] }),
    ...extra,
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

/** A confident, complete line: starts shut, in "Confident". */
const sure = (overrides: Partial<ProposedLine> = {}) =>
  line({ quantity: 200, unit: 'g', ...overrides });

/** A row's own button (not the Match or Remove buttons that mention the same name). */
const row = (name: string, index = 0) =>
  screen
    .getAllByRole('button')
    .filter(
      (button) =>
        button.querySelector('[id$="-title"]') !== null &&
        button.textContent?.includes(name),
    )[index];

/** A line's sheet: a dialog named after the line. */
const sheet = (name: string) => screen.getByRole('dialog', { name });

/** Taps a row and returns its sheet. */
async function openSheet(name: string, index = 0) {
  await userEvent.click(row(name, index));
  return await screen.findByRole('dialog', {
    name: new RegExp(`^${name}`),
  });
}

/** Clears a matched line's Ingredient token, which starts a search in the sheet. */
const startChoosing = async (
  user: Pick<ReturnType<typeof userEvent.setup>, 'click'> = userEvent,
) => {
  await user.click(screen.getByRole('button', { name: 'Change ingredient' }));
  return screen.getByRole('combobox', { name: 'Matched ingredient' });
};

const sheetClosed = () =>
  waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

describe('ReviewPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('goes back to the overview when the card is gone', () => {
    vi.stubGlobal('fetch', stubApi({}).fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/scan/review/:scanId" element={<ReviewPage />} />
        <Route path="/scan/review" element={<p>overview screen</p>} />
      </Routes>,
      { route: REVIEW_ROUTE },
    );
    expect(screen.getByText('overview screen')).toBeInTheDocument();
  });

  it('says how many lines were read, per Scan Mode', () => {
    renderReview([sure(), line({ match: null, name: 'Mystery' })]);
    expect(
      screen.getByText('Scanned product · 2 lines read'),
    ).toBeInTheDocument();
  });

  it('shows the quantity and unit a Product Scan line proposes', () => {
    renderReview([
      sure({ quantity: 1, unit: 'l', productDescription: 'Whole milk 1 l' }),
    ]);
    expect(row('Parmesan')).toHaveTextContent('1 L');
    expect(row('Parmesan')).not.toHaveTextContent('?');
  });

  it('shows a confident line as one shut row with its quantity, Location and short date', () => {
    renderReview([sure()]);
    const button = row('Parmesan');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).not.toHaveAttribute('aria-controls');
    expect(button).toHaveTextContent('200 g');
    expect(button).toHaveTextContent('Fridge');
    expect(button).toHaveTextContent('24.12.26');
    expect(button).toHaveTextContent('Read: GRANA PAD 200G');
    expect(
      screen.getByRole('img', { name: 'High confidence' }),
    ).toBeInTheDocument();
  });

  it('shows what the Scan read under the name, and nothing without it', () => {
    renderReview([sure(), sure({ name: 'Plate thing', sourceText: null })]);
    expect(screen.getAllByText('Read: GRANA PAD 200G')).toHaveLength(1);
    expect(screen.getAllByText(/^Read:/)).toHaveLength(1);
  });

  it('opens nothing on load, lists rows to check with their status, and flags a missing quantity with an amber pill', () => {
    renderReview([
      line({ quantity: null }),
      line({ match: milk, name: 'Beer', lowConfidence: true, quantity: 1 }),
      line({ match: null, name: 'Mystery', quantity: 1 }),
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    for (const name of ['Parmesan', 'Milk', 'Mystery'])
      expect(row(name)).toHaveAttribute('aria-expanded', 'false');
    expect(row('Parmesan')).toHaveTextContent('? g');
    expect(
      screen.getByRole('img', { name: 'Quantity missing' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'To check · 3' }),
    ).toBeInTheDocument();
  });

  it('opens a sheet named after the line with the message, and only one line at a time', async () => {
    renderReview([
      line({ match: milk, name: 'Beer', lowConfidence: true, quantity: 1 }),
      line({ match: null, name: 'Mystery', quantity: 1 }),
    ]);
    const beer = await openSheet('Milk');
    expect(within(beer).getByRole('note')).toHaveTextContent(/Low confidence/);
    expect(within(beer).getByRole('heading', { name: 'Milk' })).toBeVisible();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    // The sheet is modal: the other row is out of reach until it closes.
    expect(row('Mystery')).toBeUndefined();
    await userEvent.keyboard('{Escape}');
    await sheetClosed();
    expect(row('Milk')).toHaveFocus();
    const mystery = await openSheet('Mystery');
    expect(within(mystery).getByRole('note')).toHaveTextContent(/No match/);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('keeps edits when the sheet is dismissed, without confirming the line', async () => {
    renderReview([line({ lowConfidence: true, quantity: 1 })]);
    const dialog = await openSheet('Parmesan');
    const amount = within(dialog).getByLabelText(/^Amount of/);
    await userEvent.clear(amount);
    await userEvent.type(amount, '7');
    await userEvent.keyboard('{Escape}');
    await sheetClosed();
    expect(row('Parmesan')).toHaveTextContent('7 g');
    expect(
      screen.getByRole('heading', { level: 2, name: 'To check · 1' }),
    ).toBeInTheDocument();
  });

  it('keeps an open row in its group while its sheet is open, and shows Confident for a sure line', async () => {
    renderReview([sure(), sure({ match: milk, name: 'Milk', unit: 'ml' })]);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(row('Parmesan')).toBeUndefined();
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));
    const dialog = await openSheet('Parmesan');
    const amount = within(dialog).getByLabelText(/^Amount of/);
    await userEvent.clear(amount);
    expect(
      screen.getByRole('heading', {
        level: 2,
        hidden: true,
        name: /Confident/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { hidden: true, name: /To check/ }),
    ).not.toBeInTheDocument();
  });

  it('puts rows to check first (low, then missing quantity) and counts them', () => {
    renderReview([
      sure({ name: 'Sure one' }),
      line({ name: 'No qty', quantity: null }),
      line({ match: milk, name: 'Beer', lowConfidence: true, quantity: 1 }),
    ]);
    const labels = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);
    expect(labels).toEqual(['To check · 2', 'Confident · 1']);
    const tiles = screen.getByText('to check').parentElement;
    expect(tiles).toHaveTextContent('2');
  });

  it('collapses Confident to one line of names, and shows it again', async () => {
    renderReview([sure(), sure({ match: milk, name: 'Milk', unit: 'ml' })]);
    const toggle = screen.getByRole('button', { name: 'Collapse' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    expect(screen.getByText('Parmesan, Milk')).toBeInTheDocument();
    expect(row('Parmesan')).toBeUndefined();
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(row('Parmesan')).toBeInTheDocument();
  });

  it('confirming moves a row from To check to Confident and updates the counters', async () => {
    renderReview([
      sure({ name: 'Milk', match: milk }),
      line({ lowConfidence: true, quantity: 1 }),
    ]);
    expect(
      screen.getByRole('heading', { level: 2, name: 'To check · 1' }),
    ).toBeInTheDocument();
    await openSheet('Parmesan');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await sheetClosed();
    expect(
      screen.queryByRole('heading', { name: /To check/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Confident · 2' }),
    ).toBeInTheDocument();
    expect(row('Parmesan')).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(row('Parmesan')).toHaveFocus());
  });

  it('keeps an edited confident row confident, and calls its button Done', async () => {
    renderReview([sure()]);
    await openSheet('Parmesan');
    await userEvent.clear(screen.getByLabelText(/^Amount of/));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await sheetClosed();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Confident · 1' }),
    ).toBeInTheDocument();
  });

  it('removes a row to Excluded and adds it back, focusing it', async () => {
    renderReview([sure(), sure({ name: 'Other', match: milk })]);
    expect(
      screen.getByRole('button', { name: 'Save 2 items' }),
    ).toBeInTheDocument();
    await openSheet('Parmesan');
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Parmesan' }),
    );
    await sheetClosed();
    expect(row('Parmesan')).toBeUndefined();
    expect(
      screen.getByRole('button', { name: 'Save 1 item' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Excluded · 1/ }));
    expect(screen.getByText('Removed by you')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Add Parmesan back' }),
    );
    expect(
      screen.getByRole('button', { name: 'Save 2 items' }),
    ).toBeInTheDocument();
    expect(row('Parmesan')).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: /Excluded/ }),
    ).not.toBeInTheDocument();
  });

  it('adds a confident line back into a collapsed Confident group and focuses it', async () => {
    renderReview([sure(), sure({ match: milk, name: 'Milk', unit: 'ml' })]);
    await openSheet('Parmesan');
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Parmesan' }),
    );
    await sheetClosed();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    await userEvent.click(screen.getByRole('button', { name: /Excluded · 1/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Add Parmesan back' }),
    );
    expect(row('Parmesan')).toHaveFocus();
  });

  it('moves focus to the next row after a Remove, else to the Excluded button', async () => {
    renderReview([sure(), sure({ match: milk, name: 'Milk', unit: 'ml' })]);
    await openSheet('Parmesan');
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Parmesan' }),
    );
    await sheetClosed();
    await waitFor(() => expect(row('Milk')).toHaveFocus());
    await openSheet('Milk');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Milk' }));
    await sheetClosed();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Excluded · 2/ }),
      ).toHaveFocus(),
    );
  });

  it('after a Remove with Confident collapsed, focus falls back to the Excluded button', async () => {
    renderReview([
      line({ match: milk, name: 'Beer', lowConfidence: true, quantity: 1 }),
      sure(),
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    await openSheet('Milk');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Milk' }));
    await sheetClosed();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Excluded · 1/ }),
      ).toHaveFocus(),
    );
  });

  it('saves in the Scan Language of the scan, with the printed text of Unmatched lines only', async () => {
    const calls = renderReview(
      [
        line({ name: 'Cheese', match: null, sourceText: 'OST 200G' }),
        sure(),
        line({ name: 'Typed', match: null, sourceText: null }),
      ],
      {},
      'da',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save 3 items' }));
    await screen.findByText('pantry screen');
    const save = calls.find((c) => c.key === 'POST /api/pantry/batches/bulk');
    expect(new URLSearchParams(save?.search).get('scanLanguage')).toBe('da');
    const { batches } = (save?.body ?? {}) as { batches: object[] };
    expect(batches[0]).toMatchObject({
      rawName: 'Cheese',
      sourceText: 'OST 200G',
    });
    expect(batches[1]).not.toHaveProperty('sourceText');
    expect(batches[2]).not.toHaveProperty('sourceText');
  });

  it('focuses the first invalid field in display order when Save is blocked', async () => {
    renderReview([
      line({ quantity: 5 }),
      line({ match: milk, name: 'Beer', lowConfidence: true, quantity: 1 }),
    ]);
    // Milk (low confidence) is shown first; make both invalid.
    await openSheet('Parmesan');
    fireEvent.change(screen.getByLabelText(/^Amount of/), {
      target: { value: '0' },
    });
    await userEvent.keyboard('{Escape}');
    await sheetClosed();
    await openSheet('Milk');
    fireEvent.change(screen.getByLabelText(/^Amount of/), {
      target: { value: '0' },
    });
    await userEvent.keyboard('{Escape}');
    await sheetClosed();
    await userEvent.click(screen.getByRole('button', { name: 'Save 2 items' }));
    const dialog = await screen.findByRole('dialog', { name: 'Milk' });
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute('role', 'dialog'),
    );
    expect(within(dialog).getByLabelText(/^Amount of/)).not.toHaveFocus();
    expect(screen.getAllByText(/Enter an amount from 0.001/)).toHaveLength(1);
    await userEvent.keyboard('{Escape}');
    await sheetClosed();
    await userEvent.click(row('Parmesan'));
    expect(
      await screen.findByText(/Enter an amount from 0.001/),
    ).toBeInTheDocument();
  });

  it('scrolls the invalid field into view, leaving focus on the sheet, when Save is blocked', async () => {
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      renderReview([line({ quantity: 5 })]);
      await openSheet('Parmesan');
      fireEvent.change(screen.getByLabelText(/^Amount of/), {
        target: { value: '0' },
      });
      await userEvent.keyboard('{Escape}');
      await sheetClosed();
      await userEvent.click(
        screen.getByRole('button', { name: 'Save 1 item' }),
      );
      const dialog = await screen.findByRole('dialog', { name: 'Parmesan' });
      const amount = within(dialog).getByLabelText(/^Amount of/);
      await waitFor(() => expect(scrolled).toContain(amount));
      expect(amount).not.toHaveFocus();
    } finally {
      // @ts-expect-error jsdom has no scrollIntoView
      delete Element.prototype.scrollIntoView;
    }
  });

  it('does not scroll on a later row-tap after a blocked-Save sheet closed before it finished opening', async () => {
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      renderReview([line({ quantity: 5 })]);
      await openSheet('Parmesan');
      fireEvent.change(screen.getByLabelText(/^Amount of/), {
        target: { value: '0' },
      });
      await userEvent.keyboard('{Escape}');
      await sheetClosed();
      await userEvent.click(
        screen.getByRole('button', { name: 'Save 1 item' }),
      );
      // Close it again before the open transition ends.
      const opening = await screen.findByRole('dialog', { name: 'Parmesan' });
      expect(scrolled).toEqual([]);
      fireEvent.keyDown(opening, { key: 'Escape' });
      await sheetClosed();
      scrolled.length = 0;
      // Fake timers, so the open transition can be run to its end: onEntered runs then.
      vi.useFakeTimers();
      fireEvent.click(row('Parmesan'));
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(
        screen.getByRole('dialog', { name: 'Parmesan' }),
      ).toBeInTheDocument();
      expect(scrolled).toEqual([]);
    } finally {
      vi.useRealTimers();
      // @ts-expect-error jsdom has no scrollIntoView
      delete Element.prototype.scrollIntoView;
    }
  });

  it('Confirm with an invalid field focuses it instead of shutting the row', async () => {
    renderReview([line({ lowConfidence: true, quantity: 1 })]);
    await openSheet('Parmesan');
    fireEvent.change(screen.getByLabelText(/^Amount of/), {
      target: { value: '0' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(sheet('Parmesan')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText(/^Amount of/)).toHaveFocus(),
    );
  });

  it('picks a Location in the phone panel with the full-width toggle', async () => {
    renderReview([sure()]);
    const panel = await openSheet('Parmesan');
    expect(
      within(panel).queryByRole('combobox', { name: 'Location' }),
    ).toBeNull();
    await pickLocation(userEvent.setup(), 'Freezer', panel);
    expect(pressedLocation(panel)).toBe('Freezer');
  });

  it('edits a line with the same amount, Location and expiry fields as adding a Batch', async () => {
    renderReview([sure()]);
    const panel = await openSheet('Parmesan');
    expect(within(panel).getByLabelText(/^Amount of Parmesan/)).toHaveValue(
      '200',
    );
    expect(
      within(panel).getByRole('group', { name: 'Usual amounts for Parmesan' }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole('group', { name: 'Location' }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole('button', { name: /^Expires, / }),
    ).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('keeps the number when the unit changes, since a Review line is corrected, not converted', async () => {
    renderReview([sure()]);
    const panel = await openSheet('Parmesan');
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Unit: g' }),
    );
    await userEvent.click(
      within(screen.getByRole('menu', { name: 'Units' })).getByRole(
        'menuitemradio',
        { name: 'kg' },
      ),
    );
    expect(within(panel).getByLabelText(/^Amount of Parmesan/)).toHaveValue(
      '200',
    );
    expect(
      within(panel).getByRole('button', { name: 'Unit: kg' }),
    ).toBeInTheDocument();
  });

  it('blocks Save on a leftover invalid date, focusing the Expires button and describing why', async () => {
    const calls = renderReview([sure({ expiryDate: '31.02.20' })]);
    await userEvent.click(row('Parmesan'));
    await screen.findByRole('dialog', { name: 'Parmesan' });
    await userEvent.keyboard('{Escape}');
    await sheetClosed();
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 item' }));
    const expires = within(
      await screen.findByRole('dialog', { name: 'Parmesan' }),
    ).getByRole('button', { name: /^Expires, / });
    await waitFor(() => expect(expires).toHaveFocus());
    expect(expires).toHaveAccessibleDescription(
      /Enter a real date as dd\.mm\.yyyy\./,
    );
    expect(calls.map((c) => c.key)).not.toContain(
      'POST /api/pantry/batches/bulk',
    );
  });

  it('pre-fills a matched line from the proposal and the Catalog defaults', async () => {
    renderReview([sure()]);
    const panel = await openSheet('Parmesan');
    expect(pressedLocation(panel)).toBe('Fridge');
    expect(
      within(panel).getByRole('button', { name: 'Unit: g' }),
    ).toBeInTheDocument();
    expect(within(panel).getByLabelText('Product description')).toHaveValue(
      'Grana Padano 200g',
    );
    // The matched Ingredient is the chooser's token.
    expect(within(panel).getByTestId('selected-token')).toHaveTextContent(
      'Parmesan',
    );
    expect(within(panel).queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('changes the Match inline in the sheet, taking the new defaults', async () => {
    renderReview([
      line({ expiryDate: null, lowConfidence: true, quantity: 1 }),
    ]);
    await openSheet('Parmesan');
    const search = await startChoosing();
    expect(search).toHaveFocus();
    // No dialog opens, and the sheet's other fields step aside while searching.
    expect(
      screen.queryByRole('dialog', { name: /Change match/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Unit: / })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Remove Parmesan' }),
    ).toBeNull();
    await userEvent.type(search, 'milk');
    const option = await screen.findByRole('option', { name: /Milk/ });
    // The chooser has no use for a unit chip.
    expect(option).toHaveAccessibleName('Milk, Hard cheese · Dairy');
    await userEvent.click(option);
    // The sheet stays open, now titled with the new match, and the form is back.
    const panel = await screen.findByRole('dialog', { name: 'Milk' });
    expect(
      within(panel).getByRole('button', { name: 'Unit: ml' }),
    ).toBeInTheDocument();
    expect(within(panel).getByTestId('selected-token')).toHaveTextContent(
      'Milk',
    );
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('starts a search without changing the line when the token is cleared, and keeps the old match if the sheet closes', async () => {
    renderReview([sure()]);
    await openSheet('Parmesan');
    await startChoosing();
    // Still Parmesan: the row behind and the sheet's title are unchanged.
    expect(screen.getByRole('dialog', { name: 'Parmesan' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await sheetClosed();
    expect(row('Parmesan')).toBeInTheDocument();
    // Opened again, the token is back and the form shows.
    const panel = await openSheet('Parmesan');
    expect(within(panel).getByTestId('selected-token')).toHaveTextContent(
      'Parmesan',
    );
    expect(
      within(panel).getByRole('button', { name: 'Unit: g' }),
    ).toBeInTheDocument();
  });

  it.each([
    ['Backspace', '{Backspace}'],
    ['typing', 'x'],
  ])('%s over the token starts a search', async (_how, keys) => {
    renderReview([sure()]);
    await openSheet('Parmesan');
    const input = screen.getByRole('combobox', {
      name: /^Ingredient: Parmesan/,
    });
    input.focus();
    await userEvent.keyboard(keys);
    expect(
      screen.getByRole('combobox', { name: 'Matched ingredient' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('selected-token')).toBeNull();
  });

  it('never offers Use as typed on a matched line, and lists an exact-name Ingredient without picking it', async () => {
    renderReview([sure()], {
      'GET /api/catalog/search': () => Response.json({ results: [milk] }),
    });
    await openSheet('Parmesan');
    const search = await startChoosing();
    await userEvent.type(search, 'Milk');
    expect(await screen.findByRole('option', { name: /Milk/ })).toBeVisible();
    expect(screen.queryByRole('option', { name: /as typed/ })).toBeNull();
    // Listed, not picked by itself: the line is still Parmesan.
    expect(
      screen.getByRole('dialog', { name: 'Parmesan' }),
    ).toBeInTheDocument();
  });

  it('focuses the sheet title, not the chooser, on a matched line with nothing to fix', async () => {
    renderReview([sure()]);
    const panel = await openSheet('Parmesan');
    await waitFor(() =>
      expect(
        within(panel).getByRole('heading', { name: 'Parmesan' }),
      ).toHaveFocus(),
    );
  });

  it('tells repeated names apart by position, and only then', async () => {
    renderReview([
      line({ match: null, name: 'Tomato', quantity: 1 }),
      line({ match: null, name: 'Tomato', quantity: 1 }),
      sure(),
    ]);
    await openSheet('Tomato', 0);
    expect(
      screen.getByRole('button', { name: 'Remove Tomato (1 of 2)' }),
    ).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await sheetClosed();
    await openSheet('Parmesan');
    expect(
      screen.getByRole('button', { name: 'Remove Parmesan' }),
    ).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await sheetClosed();
    await openSheet('Tomato', 1);
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Tomato (2 of 2)' }),
    );
    await sheetClosed();
    await openSheet('Tomato');
    expect(
      screen.getByRole('button', { name: 'Remove Tomato' }),
    ).toBeInTheDocument();
  });

  it('gives each repeated row its own name on the row and its sheet', async () => {
    renderReview([
      line({ match: null, name: 'Tomato', quantity: 1, sourceText: null }),
      line({ match: null, name: 'Tomato', quantity: 1, sourceText: null }),
    ]);
    expect(
      screen.getByRole('button', { name: /Tomato \(1 of 2\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Tomato \(2 of 2\)/ }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /Tomato \(2 of 2\)/ }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Tomato (2 of 2)' }),
    ).toBeInTheDocument();
  });

  it('names each repeated row its own sheet', async () => {
    renderReview([
      line({ lowConfidence: true, quantity: 1 }),
      line({ lowConfidence: true, quantity: 1 }),
      line({ match: null, name: 'Mystery jar', quantity: 1 }),
      line({ match: null, name: 'Mystery jar', quantity: 1 }),
    ]);
    await userEvent.click(
      screen.getByRole('button', { name: /Parmesan \(1 of 2\)/ }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Parmesan (1 of 2)' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('selected-token')).toHaveTextContent('Parmesan');
    await userEvent.keyboard('{Escape}');
    await sheetClosed();
    await userEvent.click(
      screen.getByRole('button', { name: /Mystery jar \(2 of 2\)/ }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Mystery jar (2 of 2)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Matched ingredient' }),
    ).toHaveValue('Mystery jar');
  });

  it('opens and works as a bottom sheet at 899 px, the widest phone layout', async () => {
    stubViewport(899);
    renderReview([line({ quantity: 1, lowConfidence: true })]);
    await openSheet('Parmesan');
    await userEvent.type(await startChoosing(), 'milk');
    await userEvent.click(await screen.findByRole('option', { name: /Milk/ }));
    expect(
      await screen.findByRole('dialog', { name: 'Milk' }),
    ).toBeInTheDocument();
  });

  it('turns an Unmatched line into a matched one when an Ingredient is picked, keeping the sheet open', async () => {
    renderReview([line({ match: null, name: 'Mystery jar', quantity: 1 })]);
    await openSheet('Mystery jar');
    const search = screen.getByRole('combobox', { name: 'Matched ingredient' });
    // Pre-typed with the scanned name and no token, so suggestions show straight away.
    expect(search).toHaveValue('Mystery jar');
    expect(screen.queryByTestId('selected-token')).toBeNull();
    expect(
      screen.queryByRole('dialog', { name: /Change match/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(search);
    await userEvent.click(await screen.findByRole('option', { name: /Milk/ }));
    const panel = await screen.findByRole('dialog', { name: 'Milk' });
    expect(within(panel).getByTestId('selected-token')).toHaveTextContent(
      'Milk',
    );
    expect(within(panel).queryByLabelText('Name')).not.toBeInTheDocument();
    expect(
      within(panel).getByRole('button', { name: 'Unit: ml' }),
    ).toBeInTheDocument();
    expect(within(panel).queryByRole('note')).not.toBeInTheDocument();
  });

  it('passes a barcode lookup to the chooser: the product name as the query, the listed Allergens for a new Ingredient', async () => {
    const milkAllergen = { id: 'al-milk', name: 'Milk' };
    const glutenAllergen = { id: 'al-gluten', name: 'Gluten' };
    renderReview(
      [
        line({
          match: null,
          name: 'Greek yogurt',
          lowConfidence: true,
          quantity: 1,
          barcode: '5901234123457',
          source: 'open_food_facts',
          allergens: [milkAllergen],
          missingAllergens: [],
        }),
      ],
      {
        'GET /api/catalog/search': () => Response.json({ results: [] }),
        'GET /api/catalog/allergens': () =>
          Response.json({ allergens: [milkAllergen, glutenAllergen] }),
      },
    );
    await openSheet('Greek yogurt');
    expect(
      screen.getByRole('combobox', { name: 'Matched ingredient' }),
    ).toHaveValue('Greek yogurt');
    await userEvent.click(
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

  it('leaves the chooser unfocused when an Unmatched line opens on a phone', async () => {
    renderReview([line({ match: null, name: 'Mystery jar', quantity: 1 })]);
    await openSheet('Mystery jar');
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute('role', 'dialog'),
    );
    expect(
      screen.getByRole('combobox', { name: 'Matched ingredient' }),
    ).not.toHaveFocus();
  });

  it('offers Use as typed on an Unmatched line, which keeps it Unmatched under a token with a pill', async () => {
    const calls = renderReview(
      [line({ match: null, name: 'Mystery jar', quantity: 1 })],
      { 'GET /api/catalog/search': () => Response.json({ results: [] }) },
    );
    await openSheet('Mystery jar');
    const search = screen.getByRole('combobox', { name: 'Matched ingredient' });
    await userEvent.clear(search);
    await userEvent.type(search, 'Grandma jam');
    await userEvent.click(
      await screen.findByRole('option', { name: /Use “Grandma jam” as typed/ }),
    );
    const token = await screen.findByTestId('selected-token');
    expect(token).toHaveTextContent('Grandma jam');
    expect(within(token).getByText('Unmatched')).toBeInTheDocument();
    expect(within(token).queryByText('Family')).toBeNull();
    // Still Unmatched: the Category select stays, and the sheet stays open.
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(sheet('Grandma jam')).toBeInTheDocument();
    for (const call of calls.filter(
      (c) => c.key === 'GET /api/catalog/search',
    )) {
      expect(new URLSearchParams(call.search).get('scope')).not.toBe('shared');
    }
    // Clearing the token searches again.
    await userEvent.click(
      screen.getByRole('button', { name: 'Change ingredient' }),
    );
    expect(screen.queryByTestId('selected-token')).toBeNull();
    expect(
      screen.getByRole('combobox', { name: 'Matched ingredient' }),
    ).toBeInTheDocument();
  });

  it('never offers Use as typed on a matched line', async () => {
    renderReview([line({ lowConfidence: true, quantity: 1 })], {
      'GET /api/catalog/search': () => Response.json({ results: [] }),
    });
    await openSheet('Parmesan');
    await userEvent.type(await startChoosing(), 'zzz');
    expect(await screen.findByText('No match for “zzz”')).toBeVisible();
    expect(screen.queryByRole('option', { name: /as typed/ })).toBeNull();
  });

  it('shows an Unmatched line with the chooser and a Category, and no Name input', async () => {
    renderReview([line({ match: null, name: 'Mystery jar', quantity: 1 })]);
    const panel = await openSheet('Mystery jar');
    expect(
      within(panel).getByRole('combobox', { name: 'Matched ingredient' }),
    ).toHaveValue('Mystery jar');
    expect(within(panel).queryByLabelText('Name')).toBeNull();
    await within(panel).findByRole('option', { name: 'Dairy' });
    expect(within(panel).getByLabelText('Category')).toBeInTheDocument();
  });

  it('saves the edited lines as Batches, Unmatched ones under their name', async () => {
    const calls = renderReview([
      line(),
      line({ match: null, name: 'Mystery jar' }),
    ]);
    await openSheet('Parmesan');
    await userEvent.type(screen.getByLabelText(/^Amount of/), '200');
    await userEvent.keyboard('{Escape}');
    await sheetClosed();
    await userEvent.click(screen.getByRole('button', { name: 'Save 2 items' }));

    expect(await screen.findByText('pantry screen')).toBeInTheDocument();
    const body = calls.find(
      (c) => c.key === 'POST /api/pantry/batches/bulk',
    )?.body;
    expect(body).toEqual({
      batches: [
        {
          ingredientId: 'parmesan-id',
          quantity: 200,
          unit: 'g',
          location: 'fridge',
          expiryDate: '2026-12-24',
          productDescription: 'Grana Padano 200g',
        },
        {
          rawName: 'Mystery jar',
          source: 'product',
          sourceText: 'GRANA PAD 200G',
          quantity: null,
          unit: null,
          location: 'cupboard',
          expiryDate: '2026-12-24',
          productDescription: 'Grana Padano 200g',
        },
      ],
    });
  });

  it('lets the Member place an Unmatched line in a Parent Category, and not a matched one', async () => {
    const calls = renderReview([
      sure(),
      line({ match: null, name: 'Mystery jar' }),
    ]);
    expect(
      within(await openSheet('Parmesan')).queryByLabelText('Category'),
    ).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await sheetClosed();
    const panel = await openSheet('Mystery jar');
    await within(panel).findByRole('option', { name: 'Dairy' });
    await userEvent.selectOptions(
      within(panel).getByLabelText('Category'),
      'Dairy',
    );
    await userEvent.keyboard('{Escape}');
    await sheetClosed();
    await userEvent.click(screen.getByRole('button', { name: 'Save 2 items' }));
    await screen.findByText('pantry screen');
    const body = calls.find((c) => c.key === 'POST /api/pantry/batches/bulk')
      ?.body as { batches: object[] };
    expect(body.batches[0]).not.toHaveProperty('parentCategoryId');
    expect(body.batches[1]).toMatchObject({
      rawName: 'Mystery jar',
      parentCategoryId: 'dairy-id',
    });
  });

  it('flags a blank Unmatched name on the chooser and will not save it', async () => {
    renderReview([line({ match: null, name: '  ', quantity: 1 })]);
    await userEvent.click(row('  '));
    await screen.findByRole('dialog');
    const search = screen.getByRole('combobox', { name: 'Matched ingredient' });
    expect(screen.getByText('Enter a name.')).toBeInTheDocument();
    expect(search).toHaveAccessibleDescription('Enter a name.');
    await userEvent.keyboard('{Escape}');
    await sheetClosed();
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 item' }));
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute('role', 'dialog'),
    );
    expect(
      screen.getByRole('combobox', { name: 'Matched ingredient' }),
    ).not.toHaveFocus();
  });

  it.each(['0', '1e3', '2000000'])(
    'will not save a quantity the server rejects (%s)',
    async (bad) => {
      const calls = renderReview([line({ lowConfidence: true })]);
      await openSheet('Parmesan');
      fireEvent.change(screen.getByLabelText(/^Amount of/), {
        target: { value: bad },
      });
      await userEvent.keyboard('{Escape}');
      await sheetClosed();
      await userEvent.click(
        screen.getByRole('button', { name: 'Save 1 item' }),
      );
      await waitFor(() =>
        expect(document.activeElement).toHaveAttribute('role', 'dialog'),
      );
      expect(screen.getByLabelText(/^Amount of/)).not.toHaveFocus();
      expect(screen.getByLabelText(/^Amount of/)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(calls.map((c) => c.key)).not.toContain(
        'POST /api/pantry/batches/bulk',
      );
    },
  );

  it('shows the action bar in place of the dock, and discards back to Scan', async () => {
    renderReview([sure()]);
    expect(screen.getByRole('button', { name: 'Save 1 item' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByText('scan screen')).toBeInTheDocument();
  });

  it('shows a save error', async () => {
    renderReview([sure()], {
      'POST /api/pantry/batches/bulk': () =>
        Response.json(
          { code: 'pantry.ingredient_not_found', params: {} },
          { status: 404 },
        ),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 item' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not find that ingredient',
    );
  });

  describe('the expiry cell', () => {
    // Wednesday 14 October 2026. Only `Date` is faked, so timers and transitions run as usual.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 14, 15, 30));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

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
      await user.click(
        sheetButton(screen.getByRole('dialog', { name: 'Expires' }), 'Done'),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Expires' }),
        ).not.toBeInTheDocument(),
      );
    }

    it("shows the date day-first, opens the sheet with the line's context when tapped, and saves the picked day", async () => {
      const user = userEvent.setup();
      const calls = renderReview([sure()]);
      await user.click(row('Parmesan'));
      await screen.findByRole('dialog', { name: 'Parmesan' });
      const cell = screen.getByRole('button', {
        name: /^Expires, Thursday, December 24,/,
      });
      expect(cell).toHaveAttribute('aria-haspopup', 'dialog');

      await user.click(cell);
      const sheet = await screen.findByRole('dialog', { name: 'Expires' });
      expect(sheet).toHaveTextContent('Parmesan · 200 g · Fridge');
      await user.click(calendarDay(sheet, 'Friday, February 5, 2027'));
      await done(user);
      expect(cell).toHaveFocus();
      expect(cell).toHaveAccessibleName(/^Expires, Friday, February 5, 2027/);
      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(await saved(user, calls)).toMatchObject({
        expiryDate: '2027-02-05',
      });
    });

    it('returns focus to the expiry cell when the sheet closes, even if a tap did not focus it', async () => {
      const user = userEvent.setup();
      renderReview([sure()]);
      await user.click(row('Parmesan'));
      await screen.findByRole('dialog', { name: 'Parmesan' });
      const cell = screen.getByRole('button', { name: /^Expires,/ });
      // Safari doesn't focus a button on tap, so a synthetic click leaves focus elsewhere.
      fireEvent.click(cell);
      await screen.findByRole('dialog', { name: 'Expires' });
      await done(user);
      expect(cell).toHaveFocus();
    });

    it('saves no expiry when No expiry is chosen in the sheet', async () => {
      const user = userEvent.setup();
      const calls = renderReview([sure()]);
      await user.click(row('Parmesan'));
      await screen.findByRole('dialog', { name: 'Parmesan' });
      await user.click(screen.getByRole('button', { name: /^Expires,/ }));
      await user.click(
        within(
          await screen.findByRole('dialog', { name: 'Expires' }),
        ).getByRole('button', { name: 'No expiry' }),
      );
      await done(user);
      expect(
        screen.getByRole('button', { name: 'Expires, no expiry date' }),
      ).toBeInTheDocument();
      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(await saved(user, calls)).toMatchObject({ expiryDate: null });
    });

    it('keeps a picked date when the Match changes, instead of the new default', async () => {
      const user = userEvent.setup();
      renderReview([
        line({ expiryDate: null, lowConfidence: true, quantity: 1 }),
      ]);
      // No date was read, so the cell holds Parmesan's Default Expiry (60 days).
      await user.click(row('Parmesan'));
      await screen.findByRole('dialog', { name: 'Parmesan' });
      await user.click(
        screen.getByRole('button', {
          name: /^Expires, Sunday, December 13,/,
        }),
      );
      await user.click(
        within(
          await screen.findByRole('dialog', { name: 'Expires' }),
        ).getByRole('button', { name: 'Monday, December 28, 2026' }),
      );
      await done(user);

      await user.click(row('Parmesan'));
      await user.type(await startChoosing(user), 'milk');
      await user.click(await screen.findByRole('option', { name: /Milk/ }));
      await screen.findByRole('dialog', { name: 'Milk' });
      expect(
        screen.getByRole('button', {
          name: /^Expires, Monday, December 28,/,
        }),
      ).toBeInTheDocument();
    });
  });
});

describe('ReviewPage match dialog has no Browse by aisle', () => {
  it('offers no Browse by aisle in the inline chooser and never lists Aisles', async () => {
    const calls = renderReview(
      [line({ expiryDate: null, lowConfidence: true, quantity: 1 })],
      { 'GET /api/catalog/aisles': () => Response.json({ aisles: [] }) },
    );
    await openSheet('Parmesan');
    await userEvent.click(await startChoosing());

    expect(screen.queryByText('Browse by aisle')).not.toBeInTheDocument();
    expect(calls?.some((c) => c.key === 'GET /api/catalog/aisles')).toBeFalsy();
  });
});

describe('ReviewPage: Add to your catalog (#270)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is offered in the inline chooser, which has no Use as typed', async () => {
    // A low-confidence line shows its Change button without opening the row.
    renderReview(
      [line({ expiryDate: null, lowConfidence: true, quantity: 1 })],
      {
        'GET /api/catalog/search': () => Response.json({ results: [] }),
      },
    );
    await openSheet('Parmesan');
    await userEvent.type(await startChoosing(), 'kombucha');

    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAccessibleName(/Add “kombucha” to your catalog/);
  });

  it('matches an Unmatched line to the Family Ingredient added from the inline chooser', async () => {
    const kombucha: CatalogSearchResult = {
      ...parmesan,
      owner: 'family',
      id: 'kombucha-id',
      name: 'Kombucha',
      defaultUnit: 'ml',
      leafCategory: { id: 'drinks', name: 'Soft drinks' },
      defaults: { expiryDays: 30, location: 'fridge' },
    };
    const calls = renderReview(
      [line({ match: null, name: 'Kombucha', quantity: 1 })],
      {
        'GET /api/catalog/search': () => Response.json({ results: [] }),
        'GET /api/catalog/categories': () =>
          Response.json({
            categories: [
              {
                id: 'drinks',
                name: 'Soft drinks',
                parentCategory: { id: 'dairy', name: 'Drinks' },
                aisle: { id: 'aisle', name: 'Drinks' },
                defaults: { expiryDays: 30, location: 'fridge' },
              },
            ],
          }),
        'POST /api/catalog/family-ingredients': () =>
          Response.json(kombucha, { status: 201 }),
      },
    );
    await openSheet('Kombucha');
    const search = screen.getByRole('combobox', { name: 'Matched ingredient' });
    await userEvent.click(search);
    await userEvent.click(
      await screen.findByRole('option', {
        name: /Add “Kombucha” to your catalog/,
      }),
    );
    expect(search).toBeDefined();
    await userEvent.click(
      await screen.findByRole('combobox', { name: 'Category' }),
    );
    await userEvent.paste('soft');
    await userEvent.click(
      await screen.findByRole('option', { name: /Soft drinks/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: /^Add & pick/ }));

    const panel = await screen.findByRole('dialog', { name: 'Kombucha' });
    expect(within(panel).queryByLabelText('Name')).not.toBeInTheDocument();
    expect(
      within(panel).getByRole('button', { name: 'Unit: ml' }),
    ).toBeInTheDocument();
    expect(
      calls?.some((c) => c.key === 'POST /api/catalog/family-ingredients'),
    ).toBe(true);
  });
});
