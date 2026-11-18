import { focusManager } from '@tanstack/react-query';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminCatalog } from '@/lib/admin';
import type { UnmatchedEntry } from '@/lib/unmatched';
import { UNDO_WINDOW_MS } from '@/lib/useUndoToast';
import { renderWithProviders, stubApi } from '@/test/render';
import { expectFocusInDialog, resultNotice } from '../reviewTestUtils';
import { UnmatchedQueue } from './UnmatchedQueue';

const catalog: AdminCatalog = {
  aisles: [],
  tagGroups: [],
  tags: [],
  allergens: [],
  eatingMoments: [],
  parentCategories: [
    {
      id: 'p1',
      name: 'Dairy',
      aisleId: 'a1',
      defaultExpiryDays: null,
      defaultLocation: null,
      translations: [],
    },
  ],
  leafCategories: [
    {
      id: 'l1',
      name: 'Hard cheese',
      parentId: 'p1',
      isOther: false,
      defaultExpiryDays: null,
      defaultLocation: null,
      translations: [],
    },
  ],
  ingredients: [],
};

const entry: UnmatchedEntry = {
  normalizedName: 'branza ciudata',
  rawName: 'Brânză ciudată',
  count: 3,
  locale: 'ro',
  locales: ['ro'],
  sourceText: null,
  sourceLanguage: null,
  sources: ['manual', 'receipt'],
  dismissed: false,
  references: [],
};

const printedEntry: UnmatchedEntry = {
  ...entry,
  normalizedName: 'ost',
  rawName: 'Cheese',
  locale: 'en',
  locales: ['en'],
  sourceText: 'OST 200G',
  sourceLanguage: 'da',
};

const resolution = {
  ingredientId: 'i1',
  locale: 'en',
  relinkedBatches: 2,
  relinkedShoppingItems: 0,
  relinkedTemplateLines: 0,
  synonymAdded: true,
  sourceSynonymAdded: false,
  sourceSynonymSkipped: null,
};

/** Opens the resolver of the printed-text entry and picks Parmesan. */
async function pickParmesan(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', { name: 'Resolve Cheese' }),
  );
  await user.type(
    screen.getByRole('combobox', { name: 'Search ingredients' }),
    'parm',
  );
  const option = await screen.findByRole('option', { name: /Parmesan/ });
  // The resolver has no use for a unit chip.
  expect(option).toHaveAccessibleName('Parmesan, Hard cheese · Dairy');
  await user.click(option);
}

function stub(routes: Parameters<typeof stubApi>[0] = {}) {
  const api = stubApi({
    'GET /api/admin/unmatched': () =>
      Response.json({ entries: [entry], nextCursor: null }),
    'GET /api/catalog/search': () =>
      Response.json({
        results: [
          {
            id: 'i1',
            name: 'Parmesan',
            defaultUnit: 'g',
            leafCategory: { id: 'l1', name: 'Hard cheese' },
            parentCategory: {
              id: 'p1',
              name: 'Dairy',
              aisle: { id: 'aisle', name: 'Dairy' },
            },
            defaults: { expiryDays: null, location: null },
          },
        ],
      }),
    ...routes,
  });
  vi.stubGlobal('fetch', api.fetchMock);
  return api.calls;
}

const dismissCalls = (calls: Array<{ key: string }>) =>
  calls
    .filter((c) => c.key === 'POST /api/admin/unmatched/dismiss')
    .map((c) => c.key);

describe('UnmatchedQueue', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('lists each name with how many rows carry it and where it came from', async () => {
    stub();
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);

    const item = await screen.findByRole('group', { name: 'Brânză ciudată' });
    expect(within(item).getByText('Brânză ciudată')).toBeVisible();
    expect(within(item).getByText(/3 rows/)).toBeVisible();
    expect(within(item).getByText(/Receipt, Typed/)).toBeVisible();
  });

  it('names a Recipe as a source of a row', async () => {
    stub({
      'GET /api/admin/unmatched': () =>
        Response.json({
          entries: [
            {
              ...entry,
              sources: ['recipe'],
              references: [
                {
                  type: 'recipe_line',
                  id: 'l1',
                  source: 'recipe',
                  locale: 'ro',
                  rawName: 'Brânză ciudată',
                  sourceText: null,
                  sourceLanguage: null,
                },
              ],
            },
          ],
          nextCursor: null,
        }),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const item = await screen.findByRole('group', {
      name: /Brânză ciudată|Cheese/,
    });
    expect(within(item).getByText(/Recipe/)).toBeVisible();
  });

  it('shows an empty state', async () => {
    stub({
      'GET /api/admin/unmatched': () =>
        Response.json({ entries: [], nextCursor: null }),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    expect(await screen.findByText('Nothing to review')).toBeVisible();
    expect(
      screen.getByText(
        'Every name from scans and typing found its Ingredient.',
      ),
    ).toBeVisible();
  });

  it('dismisses an entry without resolving, sending the dismiss only after the Undo window', async () => {
    vi.useFakeTimers();
    const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
    const calls = stub({
      'POST /api/admin/unmatched/dismiss': () =>
        new Response(null, { status: 204 }),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    await flush();

    const row = screen.getByRole('group', { name: 'Brânză ciudată' });
    act(() => row.focus());
    fireEvent.keyDown(row, { key: 'Delete' });
    expect(screen.getByText('Dismiss “Brânză ciudată”?')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await act(() => vi.advanceTimersByTimeAsync(1000));

    expect(screen.queryByRole('group', { name: 'Brânză ciudată' })).toBeNull();
    // A polite live region, not an alert.
    expect(
      screen.getByText('Dismissed “Brânză ciudată”').closest('[role="status"]'),
    ).not.toBeNull();
    expect(dismissCalls(calls)).toEqual([]);
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    await flush();

    expect(
      calls.find((c) => c.key === 'POST /api/admin/unmatched/dismiss')?.body,
    ).toEqual({ normalizedName: 'branza ciudata' });
  });

  it('brings the row back on Undo and sends no dismiss', async () => {
    vi.useFakeTimers();
    const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
    const calls = stub();
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    await flush();

    const row = screen.getByRole('group', { name: 'Brânză ciudată' });
    act(() => row.focus());
    fireEvent.keyDown(row, { key: 'Delete' });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 1000));
    await flush();

    expect(screen.getByRole('group', { name: 'Brânză ciudată' })).toBeVisible();
    expect(dismissCalls(calls)).toEqual([]);
  });

  it('shows the totals from the API on the kind switch and the Open and Dismissed chips', async () => {
    stub({
      'GET /api/admin/unmatched': (url) =>
        Response.json({
          entries: [entry],
          nextCursor: null,
          total: url.searchParams.get('status') === 'dismissed' ? 4 : 7,
        }),
      'GET /api/admin/family-ingredients': () =>
        Response.json({ groups: [], nextCursor: null, total: 3 }),
      'GET /api/admin/family-synonyms': () =>
        Response.json({ candidates: [], nextCursor: null, total: 2 }),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);

    expect(
      await screen.findByRole('button', { name: 'Unmatched, 7' }),
    ).toBeVisible();
    expect(
      await screen.findByRole('button', { name: 'Family, 3' }),
    ).toBeVisible();
    expect(
      await screen.findByRole('button', { name: 'Names, 2' }),
    ).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Open 7' })).toBeVisible();
    expect(
      await screen.findByRole('button', { name: 'Dismissed 4' }),
    ).toBeVisible();
  });

  it('searches the shared Catalog only in the resolver, with no Use as typed', async () => {
    const calls = stub();
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Resolve Brânză ciudată' }),
    );
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'par',
    );
    await screen.findByRole('option', { name: /Parmesan/ });

    expect(screen.queryByRole('option', { name: /as typed/ })).toBeNull();
    const searches = calls.filter((c) => c.key === 'GET /api/catalog/search');
    expect(searches.length).toBeGreaterThan(0);
    for (const call of searches) {
      expect(new URLSearchParams(call.search).get('scope')).toBe('shared');
    }
  });

  it('resolves to an existing Ingredient chosen from search, in the entry locale', async () => {
    const calls = stub({
      'POST /api/admin/unmatched/resolve': () =>
        Response.json(
          {
            ingredientId: 'i1',
            locale: 'ro',
            relinkedBatches: 2,
            relinkedShoppingItems: 1,
            relinkedTemplateLines: 0,
            synonymAdded: true,
          },
          { status: 201 },
        ),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Resolve Brânză ciudată' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Resolve Brânză ciudată' }),
    ).toBeVisible();
    await expectFocusInDialog('Resolve Brânză ciudată');
    // Nothing to confirm until an Ingredient is picked.
    expect(
      screen.getByRole('button', { name: /^Link \d+ rows?$/ }),
    ).toBeDisabled();

    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'parm',
    );
    await user.click(await screen.findByRole('option', { name: /Parmesan/ }));
    await user.click(screen.getByRole('button', { name: /^Link \d+ rows?$/ }));

    await vi.waitFor(() =>
      expect(
        calls.some((c) => c.key === 'POST /api/admin/unmatched/resolve'),
      ).toBe(true),
    );
    expect(
      calls.find((c) => c.key === 'POST /api/admin/unmatched/resolve')?.body,
    ).toEqual({
      normalizedName: 'branza ciudata',
      ingredientId: 'i1',
      locale: 'ro',
    });
    expect(await resultNotice(/Linked 3 rows to Parmesan/)).toBeVisible();
    // Focus lands on the result message, not on the page body.
    await vi.waitFor(async () =>
      expect(await resultNotice(/Linked 3 rows to Parmesan/)).toHaveFocus(),
    );
  });

  it('returns focus to the Resolve button when the resolver is closed', async () => {
    stub();
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Resolve Brânză ciudată' }),
    );
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(
      await screen.findByRole('button', { name: 'Resolve Brânză ciudată' }),
    ).toHaveFocus();
  });

  it('resolves to a new Ingredient prefilled with the raw name', async () => {
    const calls = stub({
      'POST /api/admin/unmatched/resolve': () =>
        Response.json(
          {
            ingredientId: 'new',
            locale: 'ro',
            relinkedBatches: 3,
            relinkedShoppingItems: 0,
            relinkedTemplateLines: 0,
            synonymAdded: true,
          },
          { status: 201 },
        ),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Resolve Brânză ciudată' }),
    );
    await user.click(screen.getByRole('button', { name: 'New Ingredient' }));
    const name = screen.getByLabelText(/Name \(English\)/);
    expect(name).toHaveValue('Brânză ciudată');
    await user.clear(name);
    await user.type(name, 'Odd cheese');
    await user.selectOptions(screen.getByLabelText('Default unit'), 'kg');
    await user.selectOptions(screen.getByLabelText('Synonym language'), 'en');
    await user.click(screen.getByRole('button', { name: /^Link \d+ rows?$/ }));

    await vi.waitFor(() =>
      expect(
        calls.some((c) => c.key === 'POST /api/admin/unmatched/resolve'),
      ).toBe(true),
    );
    expect(
      calls.find((c) => c.key === 'POST /api/admin/unmatched/resolve')?.body,
    ).toEqual({
      normalizedName: 'branza ciudata',
      newIngredient: {
        name: 'Odd cheese',
        leafCategoryId: 'l1',
        defaultUnit: 'kg',
        pantryBasic: false,
      },
      locale: 'en',
    });
  });

  it('shows a translated API error and stays on the entry', async () => {
    stub({
      'POST /api/admin/unmatched/resolve': () =>
        Response.json(
          { code: 'unmatched.name_taken', params: {} },
          { status: 409 },
        ),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Resolve Brânză ciudată' }),
    );
    await user.click(screen.getByRole('button', { name: 'New Ingredient' }));
    await user.click(screen.getByRole('button', { name: /^Link \d+ rows?$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /already belongs to another Ingredient/,
    );
  });

  it('switches to dismissed entries', async () => {
    const calls = stub({
      'GET /api/admin/unmatched': () =>
        Response.json({ entries: [], nextCursor: null }),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Dismissed' }));
    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(1));
  });

  it('shows the printed text with its Scan Language next to the raw name', async () => {
    stub({
      'GET /api/admin/unmatched': () =>
        Response.json({ entries: [printedEntry], nextCursor: null }),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const item = await screen.findByRole('group', {
      name: /Brânză ciudată|Cheese/,
    });
    expect(within(item).getByText('Cheese')).toBeVisible();
    expect(within(item).getByText('Printed: OST 200G (Danish)')).toBeVisible();
  });

  it('shows no printed text for an entry that has none', async () => {
    stub();
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const item = await screen.findByRole('group', {
      name: /Brânză ciudată|Cheese/,
    });
    expect(within(item).queryByText(/Printed:/)).not.toBeInTheDocument();
  });

  it('offers the printed text as a Synonym, unchecked by default, and sends the choice', async () => {
    const calls = stub({
      'GET /api/admin/unmatched': () =>
        Response.json({ entries: [printedEntry], nextCursor: null }),
      'POST /api/admin/unmatched/resolve': () =>
        Response.json(
          { ...resolution, sourceSynonymAdded: true },
          { status: 201 },
        ),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();
    await pickParmesan(user);

    const box = screen.getByRole('checkbox', {
      name: 'Also add the printed text as a Synonym (Danish)',
    });
    expect(box).not.toBeChecked();
    await user.click(box);
    await user.click(screen.getByRole('button', { name: /^Link \d+ rows?$/ }));

    expect(
      await resultNotice(
        'Linked 2 rows to Parmesan. Added "OST 200G" as a Danish Synonym.',
      ),
    ).toBeVisible();
    expect(
      calls.find((c) => c.key === 'POST /api/admin/unmatched/resolve')?.body,
    ).toEqual({
      normalizedName: 'ost',
      ingredientId: 'i1',
      locale: 'en',
      sourceSynonym: true,
    });
  });

  it('does not ask for the printed-text Synonym unless it is ticked', async () => {
    const calls = stub({
      'GET /api/admin/unmatched': () =>
        Response.json({ entries: [printedEntry], nextCursor: null }),
      'POST /api/admin/unmatched/resolve': () =>
        Response.json(resolution, { status: 201 }),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();
    await pickParmesan(user);
    await user.click(screen.getByRole('button', { name: /^Link \d+ rows?$/ }));
    await resultNotice(/Linked 2 rows/);
    expect(
      calls.find((c) => c.key === 'POST /api/admin/unmatched/resolve')?.body,
    ).not.toHaveProperty('sourceSynonym');
  });

  it.each([
    ['exists', /already a Synonym of this Ingredient/],
    ['taken', /belongs to another Ingredient/],
    ['none', /had no printed text/],
  ] as const)(
    'says why the printed text was not added as a Synonym (%s)',
    async (skipped, message) => {
      stub({
        'GET /api/admin/unmatched': () =>
          Response.json({ entries: [printedEntry], nextCursor: null }),
        'POST /api/admin/unmatched/resolve': () =>
          Response.json(
            { ...resolution, sourceSynonymSkipped: skipped },
            { status: 201 },
          ),
      });
      renderWithProviders(<UnmatchedQueue catalog={catalog} />);
      const user = userEvent.setup();
      await pickParmesan(user);
      await user.click(
        screen.getByRole('checkbox', { name: /Also add the printed text/ }),
      );
      await user.click(
        screen.getByRole('button', { name: /^Link \d+ rows?$/ }),
      );
      expect(await resultNotice(message)).toBeVisible();
    },
  );

  it('offers no printed-text Synonym when there is no printed text', async () => {
    stub();
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Resolve Brânză ciudată' }),
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('offers every catalog language for the Synonym of the raw name', async () => {
    stub({
      'GET /api/admin/unmatched': () =>
        Response.json({ entries: [printedEntry], nextCursor: null }),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Resolve Cheese' }),
    );
    const options = within(screen.getByLabelText('Synonym language'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual(['English', 'Romanian', 'Danish']);
  });

  it('loads the next page with the cursor from the previous one', async () => {
    const second = { ...entry, normalizedName: 'alt', rawName: 'Alt nume' };
    const cursors: Array<string | null> = [];
    stub({
      'GET /api/admin/unmatched': (url) => {
        const cursor = url.searchParams.get('cursor');
        if (url.searchParams.get('status') !== 'dismissed')
          cursors.push(cursor);
        return cursor
          ? Response.json({ entries: [second], nextCursor: null })
          : Response.json({ entries: [entry], nextCursor: 'c1' });
      },
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();

    await screen.findByText('Brânză ciudată');
    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Alt nume')).toBeVisible();
    expect(screen.getByText('Brânză ciudată')).toBeVisible();
    expect(cursors).toEqual([null, 'c1']);
    // Focus follows the new content, not the vanished Load more button.
    expect(screen.getByRole('group', { name: 'Alt nume' })).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: 'Load more' }),
    ).not.toBeInTheDocument();
  });

  it('restores a dismissed entry', async () => {
    const calls = stub({
      'GET /api/admin/unmatched': (url) =>
        Response.json({
          entries:
            url.searchParams.get('status') === 'dismissed' ? [entry] : [],
          nextCursor: null,
        }),
      'POST /api/admin/unmatched/undismiss': () =>
        new Response(null, { status: 204 }),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Dismissed' }));
    expect(
      screen.queryByRole('button', { name: 'Dismiss Brânză ciudată' }),
    ).not.toBeInTheDocument();
    await user.click(
      await screen.findByRole('button', { name: /^Brânză ciudată/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Restore' }));

    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/admin/unmatched/undismiss')
          ?.body,
      ).toEqual({ normalizedName: 'branza ciudata' }),
    );
  });

  it('shows a failed Restore inside the sheet and sends one request while it is pending', async () => {
    let release: () => void = () => undefined;
    const calls = stub({
      'GET /api/admin/unmatched': (url) =>
        Response.json({
          entries:
            url.searchParams.get('status') === 'dismissed' ? [entry] : [],
          nextCursor: null,
        }),
      'POST /api/admin/unmatched/undismiss': () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(null, { status: 500 }));
        }),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Dismissed' }));
    await user.click(
      await screen.findByRole('button', { name: /^Brânză ciudată/ }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Resolve Brânză ciudată',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));
    // Restore is drawn disabled while the request is pending.
    expect(
      within(dialog).getByRole('button', { name: 'Restore' }),
    ).toBeDisabled();
    release();

    expect(await within(dialog).findByRole('alert')).toBeVisible();
    expect(
      calls.filter((c) => c.key === 'POST /api/admin/unmatched/undismiss'),
    ).toHaveLength(1);
  });

  it('does not show an old Restore error in the resolver of an Open row', async () => {
    stub({
      'GET /api/admin/unmatched': (url) =>
        Response.json({
          entries: [entry],
          nextCursor: null,
          total: url.searchParams.get('status') === 'dismissed' ? 1 : 1,
        }),
      'POST /api/admin/unmatched/undismiss': () =>
        new Response(null, { status: 500 }),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /^Dismissed/ }));
    await user.click(
      await screen.findByRole('button', { name: /^Brânză ciudată/ }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Resolve Brânză ciudată',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));
    expect(await within(dialog).findByRole('alert')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await user.click(await screen.findByRole('button', { name: /^Open/ }));
    await user.click(
      await screen.findByRole('button', { name: 'Resolve Brânză ciudată' }),
    );

    expect(within(screen.getByRole('dialog')).queryByRole('alert')).toBeNull();
  });

  it('keeps Undo available when the Admin switches kind, and shows the row again after Undo', async () => {
    vi.useFakeTimers();
    const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
    const calls = stub();
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    await flush();

    const row = screen.getByRole('group', { name: 'Brânză ciudată' });
    act(() => row.focus());
    fireEvent.keyDown(row, { key: 'Delete' });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await act(() => vi.advanceTimersByTimeAsync(500));
    fireEvent.click(screen.getByRole('button', { name: /^Family/ }));
    await act(() => vi.advanceTimersByTimeAsync(1000));

    expect(dismissCalls(calls)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('button', { name: /^Unmatched/ }));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 1000));

    expect(screen.getByRole('group', { name: 'Brânză ciudată' })).toBeVisible();
    expect(dismissCalls(calls)).toEqual([]);
  });

  it('counts a name waiting on its Undo as gone, and as back after Undo', async () => {
    vi.useFakeTimers();
    const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
    stub({
      'GET /api/admin/unmatched': () =>
        Response.json({ entries: [entry], nextCursor: null, total: 7 }),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    await flush();
    expect(screen.getByRole('button', { name: 'Open 7' })).toBeVisible();

    const row = screen.getByRole('group', { name: 'Brânză ciudată' });
    act(() => row.focus());
    fireEvent.keyDown(row, { key: 'Delete' });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(screen.getByRole('button', { name: 'Open 6' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Unmatched, 6' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole('button', { name: 'Open 7' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Unmatched, 7' })).toBeVisible();
  });

  it('reports a failed dismiss once, in the toast and not as an alert in the list', async () => {
    vi.useFakeTimers();
    const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
    stub({
      'POST /api/admin/unmatched/dismiss': () =>
        new Response(null, { status: 500 }),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    await flush();

    const row = screen.getByRole('group', { name: 'Brânză ciudată' });
    act(() => row.focus());
    fireEvent.keyDown(row, { key: 'Delete' });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 1000));
    await flush();

    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('returns focus to a swipe row opened from the keyboard when the resolver is closed', async () => {
    stub();
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();

    const row = await screen.findByRole('group', { name: 'Brânză ciudată' });
    act(() => row.focus());
    fireEvent.keyDown(row, { key: 'Enter' });
    await user.click(await screen.findByRole('button', { name: 'Close' }));

    await vi.waitFor(() => expect(row).toHaveFocus());
  });

  it('moves focus to the queue heading when Close finds the row gone', async () => {
    let reads = 0;
    const calls = stub({
      'GET /api/admin/unmatched': () =>
        Response.json({
          entries: reads++ === 0 ? [entry] : [],
          nextCursor: null,
        }),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Resolve Brânză ciudată' }),
    );
    // Someone else resolves the name while the resolver is open.
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await vi.waitFor(() =>
      expect(
        calls.filter((c) => c.key === 'GET /api/admin/unmatched'),
      ).toHaveLength(2),
    );
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(
      await screen.findByRole('heading', { name: 'Unmatched names' }),
    ).toHaveFocus();
  });

  it('puts focus on the queue heading after Dismiss', async () => {
    stub({
      'POST /api/admin/unmatched/dismiss': () =>
        new Response(null, { status: 204 }),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();

    const row = await screen.findByRole('group', { name: 'Brânză ciudată' });
    act(() => row.focus());
    fireEvent.keyDown(row, { key: 'Delete' });
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    await vi.waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Unmatched names' }),
      ).toHaveFocus(),
    );
  });

  it('puts focus on the queue heading after Restore', async () => {
    let restored = false;
    stub({
      'GET /api/admin/unmatched': (url) =>
        Response.json({
          entries:
            (url.searchParams.get('status') === 'dismissed') === !restored
              ? [entry]
              : [],
          nextCursor: null,
        }),
      'POST /api/admin/unmatched/undismiss': () => {
        restored = true;
        return new Response(null, { status: 204 });
      },
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Dismissed' }));
    await user.click(
      await screen.findByRole('button', { name: /^Brânză ciudată/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Restore' }));

    await vi.waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Unmatched names' }),
      ).toHaveFocus(),
    );
  });

  it('shows a name once when it repeats across pages', async () => {
    stub({
      'GET /api/admin/unmatched': (url) =>
        Response.json(
          url.searchParams.get('cursor')
            ? { entries: [entry], nextCursor: null }
            : { entries: [entry], nextCursor: 'c1' },
        ),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Load more' }));
    await vi.waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Load more' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getAllByRole('group', { name: 'Brânză ciudată' }),
    ).toHaveLength(1);
  });
});

describe('UnmatchedQueue Browse by aisle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows Browse by aisle in the resolver search', async () => {
    const calls = stub({
      'GET /api/admin/unmatched': () =>
        Response.json({ entries: [printedEntry], nextCursor: null }),
      'GET /api/catalog/aisles': () =>
        Response.json({
          aisles: [{ id: 'a1', name: 'Dairy & eggs', parentCategories: [] }],
        }),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Resolve Cheese' }),
    );
    await user.click(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
    );

    expect(await screen.findByText('Browse by aisle')).toBeVisible();
    await user.click(
      await screen.findByRole('button', { name: 'Dairy & eggs' }),
    );
    await vi.waitFor(() => {
      const search = calls.filter((c) => c.key === 'GET /api/catalog/search');
      const params = new URLSearchParams(search.at(-1)?.search);
      expect(params.get('aisleId')).toBe('a1');
      expect(params.get('scope')).toBe('shared');
    });
    for (const call of calls.filter(
      (c) => c.key === 'GET /api/catalog/aisles',
    )) {
      expect(new URLSearchParams(call.search).get('scope')).toBe('shared');
    }
  });
});

describe('UnmatchedQueue resolver: no Add to your catalog (#270)', () => {
  it('offers neither the button nor the option when nothing matches', async () => {
    stub({
      'GET /api/admin/unmatched': () =>
        Response.json({ entries: [printedEntry], nextCursor: null }),
      'GET /api/catalog/search': () => Response.json({ results: [] }),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Resolve Cheese' }),
    );

    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'kombucha',
    );

    expect(await screen.findByText('No match for “kombucha”')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /to your catalog/ }),
    ).toBeNull();
    expect(
      screen.queryByRole('option', { name: /to your catalog/ }),
    ).toBeNull();
  });
});
