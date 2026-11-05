import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnverifiedToast } from '../../components/UnverifiedToast';
import type { CatalogSearchResult } from '../../lib/catalog';
import type { ProposedLine } from '../../lib/scan';
import { renderWithProviders, stubApi } from '../../test/render';
import { stubMotion, stubViewport } from '../../test/viewport';
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

/** Shows what router state the page was left with. */
function Probe() {
  const { state } = useLocation();
  return <p>{`state:${JSON.stringify(state)}`}</p>;
}

function renderReview(
  lines: ProposedLine[],
  mode: 'product' | 'receipt' = 'product',
  extra: Record<string, () => Response> = {},
) {
  startReview({ mode, lines });
  const { fetchMock } = stubApi({
    'GET /api/catalog/parents': () => Response.json({ parents: [] }),
    'POST /api/pantry/batches/bulk': () => Response.json({ batches: [] }),
    'POST /api/scan/receipt/confirm': () =>
      Response.json({ batches: [], matchedShoppingItemIds: [] }),
    ...extra,
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route path="/scan/review/:scanId" element={<ReviewPage />} />
      <Route
        path="/shopping"
        element={
          <>
            <UnverifiedToast />
            <Probe />
          </>
        }
      />
      <Route
        path="/pantry"
        element={
          <>
            <UnverifiedToast />
            <Probe />
          </>
        }
      />
    </Routes>,
    { route: REVIEW_ROUTE },
  );
}

const row = (name: string) =>
  screen
    .getAllByRole('button')
    .find(
      (button) =>
        button.hasAttribute('aria-expanded') &&
        button.querySelector('[id$="-title"]')?.textContent === name,
    )!;

describe('Review polish: focus', () => {
  beforeEach(() => {
    stubMotion(true);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens nothing on load and does not move focus', () => {
    renderReview([line({ lowConfidence: true })]);
    expect(row('Parmesan')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body).toHaveFocus();
  });

  it('opening a row with a missing quantity leaves Quantity unfocused on a phone, and closing the sheet returns to the row', async () => {
    renderReview([line({ quantity: null })]);
    await userEvent.click(row('Parmesan'));
    // A text field stays unfocused on a phone, so the keyboard does not jump the sheet.
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute('role', 'dialog'),
    );
    expect(screen.getByLabelText(/^Amount of/)).not.toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(row('Parmesan')).toHaveFocus());
  });

  it('leaves Quantity unfocused with motion enabled too', async () => {
    stubMotion(false);
    renderReview([line({ quantity: null })]);
    await userEvent.click(row('Parmesan'));
    // A text field stays unfocused on a phone, so the keyboard does not jump the sheet.
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute('role', 'dialog'),
    );
    expect(screen.getByLabelText(/^Amount of/)).not.toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(row('Parmesan')).toHaveFocus());
  });

  it('opening a complete matched row focuses the sheet title', async () => {
    renderReview([line()]);
    await userEvent.click(row('Parmesan'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Parmesan' })).toHaveFocus(),
    );
  });

  it('opening an Unmatched row with a blank name leaves the chooser unfocused', async () => {
    renderReview([line({ match: null, name: '  ', quantity: 1 })]);
    await userEvent.click(row('  '));
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute('role', 'dialog'),
    );
    expect(
      screen.getByRole('combobox', { name: 'Matched ingredient' }),
    ).not.toHaveFocus();
  });

  it('Done on a confident row returns focus to the row', async () => {
    renderReview([line()]);
    await userEvent.click(row('Parmesan'));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(row('Parmesan')).toHaveFocus());
  });
});

describe('Review polish: motion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('closes the sheet at once under reduced motion', async () => {
    stubMotion(true);
    renderReview([line()]);
    await userEvent.click(row('Parmesan'));
    expect(screen.getByLabelText(/^Amount of/)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByLabelText(/^Amount of/)).not.toBeInTheDocument(),
    );
  });

  it('slides the sheet away otherwise', async () => {
    stubMotion(false);
    renderReview([line()]);
    await userEvent.click(row('Parmesan'));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByLabelText(/^Amount of/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByLabelText(/^Amount of/)).not.toBeInTheDocument(),
    );
  });
});

describe('Review polish: unverified toast', () => {
  beforeEach(() => {
    stubMotion(true);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('says how many saved lines were never verified, and clears the router state', async () => {
    renderReview([
      line({ lowConfidence: true }),
      line({ name: 'Mystery', match: null }),
      line({ name: 'Milk' }),
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Save 3 items' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      '2 items still unverified',
    );
    expect(await screen.findByText('state:null')).toBeInTheDocument();
  });

  it('uses the singular for one line', async () => {
    renderReview([line({ lowConfidence: true })]);
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 item' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      '1 item still unverified',
    );
  });

  it('does not count a line the Member confirmed', async () => {
    renderReview([line({ lowConfidence: true })]);
    await userEvent.click(row('Parmesan'));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Save 1 item' }),
    );
    await screen.findByText('state:null');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not count removed lines', async () => {
    renderReview([line({ lowConfidence: true }), line({ name: 'Milk' })]);
    await userEvent.click(row('Parmesan'));
    await userEvent.click(
      await screen.findByRole('button', { name: /^Remove Parmesan/ }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Save 1 item' }),
    );
    await screen.findByText('state:null');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('follows "Go to Pantry" after a tick failure', async () => {
    renderReview([line({ lowConfidence: true })], 'receipt', {
      'POST /api/scan/receipt/confirm': () =>
        Response.json({ batches: [], matchedShoppingItemIds: ['item-1'] }),
      'PATCH /api/shopping-list/items/item-1': () =>
        Response.json({ code: 'shopping.item_not_found' }, { status: 404 }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 item' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Go to Pantry' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      '1 item still unverified',
    );
  });
});

describe('Review polish: tablet', () => {
  beforeEach(() => {
    stubViewport(1180);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('the pencil focuses the first input of a sure row, and finishing returns to the pencil', async () => {
    renderReview([line()]);
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit Parmesan' }),
    );
    expect(
      document.getElementById('review-line-line-0-quantity'),
    ).toHaveFocus();
    await userEvent.click(
      screen.getByRole('button', { name: 'Finish editing Parmesan' }),
    );
    expect(screen.getByRole('button', { name: 'Edit Parmesan' })).toHaveFocus();
  });

  it('shows the toast after a tablet Save', async () => {
    renderReview([line({ lowConfidence: true }), line({ name: 'Milk' })]);
    await userEvent.click(screen.getByRole('button', { name: 'Save 2 items' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      '1 item still unverified',
    );
  });
});
