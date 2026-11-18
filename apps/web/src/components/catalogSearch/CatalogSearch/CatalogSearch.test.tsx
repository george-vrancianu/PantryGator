import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '@/lib/catalog';
import { renderWithProviders } from '@/test/render';
import { stubMotion } from '@/test/viewport';
import { CatalogSearch, type CatalogSearchProps } from './CatalogSearch';
import { useEmptyStateSearch } from '../emptyState/context';

/** The seeded Dairy & eggs Aisle, so the icon tint is a real one. */
const DAIRY_AISLE = '244cde4d-f9a5-5df8-9f40-5e1f48fd4fcf';
const DAIRY_TINT = 'dairy';

const parmesan = (locale: 'en' | 'ro'): CatalogSearchResult => ({
  owner: 'catalog',
  amountScale: 'medium',
  id: 'parmesan-id',
  name: locale === 'ro' ? 'Parmezan' : 'Parmesan',
  defaultUnit: 'g',
  leafCategory: {
    id: 'hard-cheese',
    name: locale === 'ro' ? 'Brânzeturi tari' : 'Hard cheese',
  },
  parentCategory: {
    id: 'dairy',
    name: locale === 'ro' ? 'Lactate' : 'Dairy',
    aisle: { id: DAIRY_AISLE, name: 'Dairy & eggs' },
  },
  defaults: { expiryDays: 30, location: 'fridge' },
});

const cheddar: CatalogSearchResult = {
  owner: 'catalog',
  amountScale: 'medium',
  id: 'cheddar-id',
  name: 'Cheddar',
  defaultUnit: 'g',
  leafCategory: { id: 'hard-cheese', name: 'Hard cheese' },
  parentCategory: {
    id: 'dairy',
    name: 'Dairy',
    aisle: { id: DAIRY_AISLE, name: 'Dairy & eggs' },
  },
  defaults: { expiryDays: 30, location: 'fridge' },
};

/** The API names results in the Member's Catalog Language, which the request does not carry: `language` is that one. */
function stubSearch(
  results: (locale: 'en' | 'ro') => CatalogSearchResult[],
  language: 'en' | 'ro' = 'en',
) {
  const requests: URL[] = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = new URL(String(input), window.location.origin);
    requests.push(url);
    return Promise.resolve(Response.json({ results: results(language) }));
  });
  return requests;
}

describe('CatalogSearch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the names in the Catalog Language with the Parent and Leaf Category', async () => {
    const requests = stubSearch((locale) => [parmesan(locale)], 'ro');
    renderWithProviders(<CatalogSearch onSelect={() => {}} />);

    await userEvent.setup().type(screen.getByRole('combobox'), 'parmezan');

    const option = await screen.findByRole('option', { name: /Parmezan/ });
    expect(option).toHaveTextContent('Brânzeturi tari · Dairy & eggs');
    expect(requests.at(-1)?.searchParams.get('q')).toBe('parmezan');
  });

  it('is usable from the keyboard alone', async () => {
    stubSearch((locale) => [parmesan(locale), cheddar]);
    const onSelect = vi.fn();
    renderWithProviders(<CatalogSearch onSelect={onSelect} />);
    const user = userEvent.setup();

    await user.tab();
    const input = screen.getByRole('combobox');
    expect(input).toHaveFocus();
    await user.keyboard('che');
    await screen.findAllByRole('option');
    expect(input).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(input.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: /Cheddar/ }).id,
    );
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith(cheddar);
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the list on Escape and selects with a click', async () => {
    stubSearch((locale) => [parmesan(locale)]);
    const onSelect = vi.fn();
    renderWithProviders(<CatalogSearch onSelect={onSelect} />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('combobox'), 'parm');
    await screen.findByRole('option');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();

    await user.keyboard('a');
    await user.click(await screen.findByRole('option', { name: /Parmesan/ }));
    expect(onSelect).toHaveBeenCalledWith(parmesan('en'));
  });

  it('keeps a visible option clickable while newer results load', async () => {
    const requests: URL[] = [];
    let releaseNewer = () => {};
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.origin);
      requests.push(url);
      const response = () => Response.json({ results: [parmesan('en')] });
      if (url.searchParams.get('q') === 'parm') {
        return Promise.resolve(response());
      }
      return new Promise<Response>((resolve) => {
        releaseNewer = () => resolve(response());
      });
    });
    const onSelect = vi.fn();
    renderWithProviders(<CatalogSearch onSelect={onSelect} />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('combobox'), 'parm');
    await screen.findByRole('option', { name: /Parmesan/ });
    await user.keyboard('a');
    await vi.waitFor(() =>
      expect(requests.at(-1)?.searchParams.get('q')).toBe('parma'),
    );

    await user.click(screen.getByRole('option', { name: /Parmesan/ }));
    expect(onSelect).toHaveBeenCalledWith(parmesan('en'));
    releaseNewer();
  });
  describe('rows', () => {
    it('shows the Ingredient Icon in the Aisle tint, the name and "{Leaf} · {Aisle}"', async () => {
      stubSearch((locale) => [parmesan(locale)]);
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);

      await userEvent.setup().type(screen.getByRole('combobox'), 'parm');

      const option = await screen.findByRole('option', { name: /Parmesan/ });
      const icon = option.querySelector('[data-ingredient-icon]');
      expect(icon).toHaveAttribute('data-ingredient-tint', DAIRY_TINT);
      expect(option).toHaveTextContent('Parmesan');
      expect(option).toHaveTextContent('Hard cheese · Dairy & eggs');
    });

    it('highlights the matched substring, ignoring case and accents', async () => {
      stubSearch(() => [
        { ...cheddar, id: 'creme', name: 'Crème fraîche' },
        { ...cheddar, id: 'cream', name: 'Sour cream' },
      ]);
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);

      await userEvent.setup().type(screen.getByRole('combobox'), 'CREME');

      const creme = await screen.findByRole('option', { name: /Crème/ });
      expect(within(creme).getByText('Crème').tagName).toBe('MARK');
      // No accent-folded match in "Sour cream": nothing is highlighted there.
      const cream = screen.getByRole('option', { name: /Sour cream/ });
      expect(cream.querySelector('mark')).toBeNull();
    });

    it('highlights Danish letters as the search folds them (maelk finds Mælk)', async () => {
      stubSearch(() => [{ ...cheddar, id: 'maelk', name: 'Mælk' }]);
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);

      await userEvent.setup().type(screen.getByRole('combobox'), 'maelk');

      const option = await screen.findByRole('option', { name: /Mælk/ });
      expect(within(option).getByText('Mælk').tagName).toBe('MARK');
    });

    it('does not highlight the category, even when only it matches', async () => {
      stubSearch(() => [cheddar]);
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);

      await userEvent.setup().type(screen.getByRole('combobox'), 'hard');

      const option = await screen.findByRole('option', { name: /Cheddar/ });
      expect(option.querySelector('mark')).toBeNull();
    });

    it('shows the default unit as a chip and names the row "{name}, {meta}, {unit}"', async () => {
      stubSearch((locale) => [parmesan(locale), cheddar]);
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);

      await userEvent.setup().type(screen.getByRole('combobox'), 'che');

      const option = await screen.findByRole('option', { name: /Cheddar/ });
      expect(option).toHaveAccessibleName(
        'Cheddar, Hard cheese · Dairy & eggs, g',
      );
      expect(within(option).getByText('g')).toBeVisible();
    });

    it('leaves the unit chip out with showUnit={false}', async () => {
      stubSearch(() => [cheddar]);
      renderWithProviders(
        <CatalogSearch onSelect={() => {}} showUnit={false} />,
      );

      await userEvent.setup().type(screen.getByRole('combobox'), 'che');

      const option = await screen.findByRole('option', { name: /Cheddar/ });
      expect(option).toHaveAccessibleName(
        'Cheddar, Hard cheese · Dairy & eggs',
      );
      expect(within(option).queryByText('g')).not.toBeInTheDocument();
    });

    it('swaps the unit chip for a ↵ hint on the keyboard-active row only', async () => {
      stubSearch((locale) => [parmesan(locale), cheddar]);
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);
      const user = userEvent.setup();

      await user.type(screen.getByRole('combobox'), 'che');
      const [first, second] = await screen.findAllByRole('option');
      expect(within(first).getByText('g')).toBeVisible();
      expect(within(first).queryByText('↵')).not.toBeInTheDocument();

      await user.keyboard('{ArrowDown}');

      expect(first).toHaveAttribute('aria-selected', 'true');
      expect(within(first).getByText('↵')).toBeVisible();
      expect(within(first).queryByText('g')).not.toBeInTheDocument();
      expect(within(second).getByText('g')).toBeVisible();
      expect(within(second).queryByText('↵')).not.toBeInTheDocument();
    });

    it('shows no ↵ hint when the host hides units', async () => {
      stubSearch(() => [cheddar]);
      renderWithProviders(
        <CatalogSearch onSelect={() => {}} showUnit={false} />,
      );
      const user = userEvent.setup();

      await user.type(screen.getByRole('combobox'), 'che');
      await screen.findByRole('option');
      await user.keyboard('{ArrowDown}');

      expect(screen.getByRole('option')).toHaveAttribute(
        'aria-selected',
        'true',
      );
      // Whatever the active row shows, it is never the unit.
      expect(screen.queryByText('g')).not.toBeInTheDocument();
    });
  });

  describe('loading', () => {
    it('shows four skeleton rows and no field spinner on the first load for a query', async () => {
      stubPending();
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);

      await typeQuery(userEvent.setup(), 'parm');

      expect(await screen.findAllByTestId('search-skeleton')).toHaveLength(4);
      expect(screen.queryByTestId('search-spinner')).not.toBeInTheDocument();
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
    });

    it('hides the skeletons from assistive tech', async () => {
      stubPending();
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);

      await typeQuery(userEvent.setup(), 'parm');

      for (const row of await screen.findAllByTestId('search-skeleton')) {
        expect(row.closest('[aria-hidden="true"]')).not.toBeNull();
      }
    });

    it('replaces the skeletons with the rows once they arrive', async () => {
      const search = stubControlled();
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);

      await typeQuery(userEvent.setup(), 'parm');
      await screen.findAllByTestId('search-skeleton');
      await search.respond('parm', [parmesan('en')]);

      expect(
        await screen.findByRole('option', { name: /Parmesan/ }),
      ).toBeVisible();
      expect(screen.queryByTestId('search-skeleton')).not.toBeInTheDocument();
    });

    it('shows the field spinner and keeps the rows, dimming those not active, when refetching', async () => {
      const search = stubControlled();
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);
      const user = userEvent.setup();

      await typeQuery(user, 'che');
      await screen.findAllByTestId('search-skeleton');
      await search.respond('che', [parmesan('en'), cheddar]);
      await screen.findAllByRole('option');

      await user.keyboard('e');
      await vi.waitFor(() => expect(search.asked('chee')).toBe(true));
      await user.keyboard('{ArrowDown}');

      expect(screen.getByTestId('search-spinner')).toBeVisible();
      expect(screen.queryByTestId('search-skeleton')).not.toBeInTheDocument();
      const [active, other] = screen.getAllByRole('option');
      expect(active).toHaveAttribute('aria-selected', 'true');
      expect(active).not.toHaveAttribute('data-dimmed');
      expect(other).toHaveAttribute('data-dimmed', 'true');

      await search.respond('chee', [cheddar]);
      await vi.waitFor(() =>
        expect(screen.queryByTestId('search-spinner')).not.toBeInTheDocument(),
      );
      expect(screen.getByRole('option')).not.toHaveAttribute('data-dimmed');
    });

    it('animates the shimmer and spinner by default', async () => {
      const search = stubControlled();
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);
      const user = userEvent.setup();

      await typeQuery(user, 'che');
      for (const row of await screen.findAllByTestId('search-skeleton')) {
        expect(row).toHaveAttribute('data-shimmer', 'on');
      }
      await search.respond('che', [cheddar]);
      await screen.findByRole('option');
      await user.keyboard('e');
      await vi.waitFor(() => expect(search.asked('chee')).toBe(true));

      expect(screen.getByTestId('search-spinner')).toHaveAttribute(
        'data-spinning',
        'true',
      );
    });

    it('turns off shimmer, spinner animation and row dimming under reduced motion', async () => {
      stubMotion(true);
      const search = stubControlled();
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);
      const user = userEvent.setup();

      await typeQuery(user, 'che');
      for (const row of await screen.findAllByTestId('search-skeleton')) {
        expect(row).toHaveAttribute('data-shimmer', 'off');
      }
      await search.respond('che', [parmesan('en'), cheddar]);
      await screen.findAllByRole('option');
      await user.keyboard('e');
      await vi.waitFor(() => expect(search.asked('chee')).toBe(true));

      // The spinner stays (as a static ring) so the refetch is still visible.
      expect(screen.getByTestId('search-spinner')).toHaveAttribute(
        'data-spinning',
        'false',
      );
      for (const option of screen.getAllByRole('option')) {
        expect(option).not.toHaveAttribute('data-dimmed');
      }
    });
  });

  describe('live region', () => {
    it('is a visually hidden polite status that replaces the visible status line', async () => {
      stubSearch((locale) => [parmesan(locale), cheddar]);
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
      expect(status).toBeEmptyDOMElement();

      await userEvent.setup().type(screen.getByRole('combobox'), 'che');
      await screen.findAllByRole('option');

      // The text appears once, in the live region, not as a visible line.
      expect(screen.getAllByText('2 results')).toHaveLength(1);
      expect(screen.getByRole('status')).toHaveTextContent('2 results');
      expect(screen.queryByText(/Results: /)).not.toBeInTheDocument();
    });

    it('says "Searching" while the first results load', async () => {
      stubPending();
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);

      await userEvent.setup().type(screen.getByRole('combobox'), 'parm');

      await vi.waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(/^Searching$/),
      );
    });

    it('says "No ingredients found." when nothing matches', async () => {
      stubSearch(() => []);
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);

      await userEvent.setup().type(screen.getByRole('combobox'), 'zzz');

      await vi.waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          /^No ingredients found\.$/,
        ),
      );
    });

    it('says "Search failed." when the search errors', async () => {
      stubFailing();
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);

      await userEvent.setup().type(screen.getByRole('combobox'), 'parm');

      await vi.waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          /^Search failed\.$/,
        ),
      );
    });
  });

  describe('no match', () => {
    it('shows a non-interactive "No match for “…”" row with a hint', async () => {
      stubSearch(() => []);
      // The shared scope has no "Add to your catalog" option (#270), so no option shows.
      renderWithProviders(<CatalogSearch onSelect={() => {}} scope="shared" />);
      const input = screen.getByRole('combobox');

      await userEvent.setup().type(input, 'zzz');

      expect(await screen.findByText('No match for “zzz”')).toBeVisible();
      expect(
        screen.getByText('Check the spelling or try a shorter word.'),
      ).toBeVisible();
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    it('is not selectable with Enter or a click', async () => {
      stubSearch(() => []);
      const onSelect = vi.fn();
      renderWithProviders(<CatalogSearch onSelect={onSelect} />);
      const user = userEvent.setup();

      await user.type(screen.getByRole('combobox'), 'zzz');
      await user.click(await screen.findByText('No match for “zzz”'));
      await user.keyboard('{Enter}');

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('stays, with the field spinner, while the next query loads', async () => {
      const search = stubControlled();
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);
      const user = userEvent.setup();

      await typeQuery(user, 'zzz');
      await search.respond('zzz', []);
      await screen.findByText('No match for “zzz”');
      await user.keyboard('z');
      await vi.waitFor(() => expect(search.asked('zzzz')).toBe(true));

      expect(screen.getByText(/No match for/)).toBeVisible();
      expect(screen.getByTestId('search-spinner')).toBeVisible();
      await search.respond('zzzz', []);
    });

    it('goes away when the field is cleared', async () => {
      stubSearch(() => []);
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);
      const user = userEvent.setup();

      await user.type(screen.getByRole('combobox'), 'zzz');
      await screen.findByText('No match for “zzz”');
      await user.clear(screen.getByRole('combobox'));

      expect(screen.queryByText(/No match for/)).not.toBeInTheDocument();
    });
  });

  describe('error', () => {
    it('shows a role="alert" row with Retry', async () => {
      stubFailing();
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);

      await userEvent.setup().type(screen.getByRole('combobox'), 'parm');

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Couldn’t search right now');
      expect(alert).toHaveTextContent('Check your connection and try again.');
      expect(
        within(alert).getByRole('button', { name: 'Retry' }),
      ).toBeVisible();
      expect(screen.queryByText(/No match for/)).not.toBeInTheDocument();
    });

    it('Retry refetches the current query and clears the error', async () => {
      const search = stubFlaky();
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);
      const user = userEvent.setup();

      await user.type(screen.getByRole('combobox'), 'parm');
      const alert = await screen.findByRole('alert');
      const before = search.requests.length;

      search.failing = false;
      await user.click(within(alert).getByRole('button', { name: 'Retry' }));

      expect(
        await screen.findByRole('option', { name: /Parmesan/ }),
      ).toBeVisible();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(search.requests.length).toBeGreaterThan(before);
      expect(search.requests.at(-1)?.searchParams.get('q')).toBe('parm');
    });

    it('keeps the Retry button from stealing focus from the input', async () => {
      stubFailing();
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);
      const user = userEvent.setup();

      await user.type(screen.getByRole('combobox'), 'parm');
      const retry = await screen.findByRole('button', { name: 'Retry' });
      await user.click(retry);

      expect(screen.getByRole('combobox')).toHaveFocus();
    });

    it('keeps focus in the input when Retry is pressed from the keyboard', async () => {
      stubFailing();
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);
      const user = userEvent.setup();

      await user.type(screen.getByRole('combobox'), 'parm');
      await screen.findByRole('alert');
      // Past the add and clear buttons to Retry.
      await user.tab();
      await user.tab();
      await user.tab();
      expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus();
      await user.keyboard('{Enter}');

      expect(screen.getByRole('combobox')).toHaveFocus();
    });

    it('sits above the rows that were already loaded', async () => {
      const search = stubFlaky();
      search.failing = false;
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);
      const user = userEvent.setup();

      await user.type(screen.getByRole('combobox'), 'parm');
      const option = await screen.findByRole('option', { name: /Parmesan/ });
      search.failing = true;
      await user.keyboard('a');

      const alert = await screen.findByRole('alert');
      expect(
        screen.getByRole('option', { name: /Parmesan/ }),
      ).toBeInTheDocument();
      expect(
        alert.compareDocumentPosition(option) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  describe('keyboard', () => {
    it('wraps ArrowDown past the last row and ArrowUp past the first', async () => {
      stubSearch((locale) => [parmesan(locale), cheddar]);
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);
      const user = userEvent.setup();
      await user.type(screen.getByRole('combobox'), 'che');
      const [first, second] = await screen.findAllByRole('option');

      await user.keyboard('{ArrowUp}');
      expect(second).toHaveAttribute('aria-selected', 'true');
      await user.keyboard('{ArrowDown}');
      expect(first).toHaveAttribute('aria-selected', 'true');
      await user.keyboard('{ArrowUp}');
      expect(second).toHaveAttribute('aria-selected', 'true');
    });

    it('jumps to the last and first row with End and Home once a row is active', async () => {
      stubSearch((locale) => [
        parmesan(locale),
        cheddar,
        { ...cheddar, id: 'edam', name: 'Edam' },
      ]);
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);
      const user = userEvent.setup();
      await user.type(screen.getByRole('combobox'), 'e');
      const [first, , last] = await screen.findAllByRole('option');

      await user.keyboard('{ArrowDown}{End}');
      expect(last).toHaveAttribute('aria-selected', 'true');
      await user.keyboard('{Home}');
      expect(first).toHaveAttribute('aria-selected', 'true');
    });

    it('picks the first result with Enter when no row is active', async () => {
      stubSearch((locale) => [parmesan(locale), cheddar]);
      const onSelect = vi.fn();
      renderWithProviders(<CatalogSearch onSelect={onSelect} />);
      const user = userEvent.setup();
      await user.type(screen.getByRole('combobox'), 'che');
      await screen.findAllByRole('option');
      await vi.waitFor(() =>
        expect(screen.queryByTestId('search-spinner')).not.toBeInTheDocument(),
      );

      await user.keyboard('{Enter}');

      expect(onSelect).toHaveBeenCalledWith(parmesan('en'));
    });

    it('picks the active row with Enter', async () => {
      stubSearch((locale) => [parmesan(locale), cheddar]);
      const onSelect = vi.fn();
      renderWithProviders(<CatalogSearch onSelect={onSelect} />);
      const user = userEvent.setup();
      await user.type(screen.getByRole('combobox'), 'che');
      await screen.findAllByRole('option');

      await user.keyboard('{ArrowUp}{Enter}');

      expect(onSelect).toHaveBeenCalledWith(cheddar);
    });
  });

  describe('selected token', () => {
    const tokenName = 'Ingredient: Parmesan. Press Backspace to change';

    it('renders a token for the controlled `selected` ingredient, with the input still in the DOM', () => {
      stubSearch(() => []);
      renderWithProviders(
        <CatalogSearch onSelect={() => {}} selected={parmesan('en')} />,
      );

      const input = screen.getByRole('combobox', { name: tokenName });
      expect(input).toBeInTheDocument();
      expect(screen.getByText('Parmesan')).toBeVisible();
      expect(screen.getByText('Hard cheese · Dairy & eggs')).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Change ingredient' }),
      ).toBeVisible();
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
    });

    it('turns the field into the token after a pick', async () => {
      stubSearch((locale) => [parmesan(locale)]);
      const onSelect = vi.fn();
      renderWithProviders(<ControlledHost onSelect={onSelect} />);
      const user = userEvent.setup();

      await user.type(screen.getByRole('combobox'), 'parm');
      await user.click(await screen.findByRole('option', { name: /Parmesan/ }));

      expect(onSelect).toHaveBeenCalledWith(parmesan('en'));
      expect(
        screen.getByRole('combobox', { name: tokenName }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Change ingredient' }),
      ).toBeVisible();
    });

    it('clears on Backspace, refocuses the empty input and reports the empty query', async () => {
      stubSearch((locale) => [parmesan(locale)]);
      const onQueryChange = vi.fn();
      renderWithProviders(<ControlledHost onQueryChange={onQueryChange} />);
      const user = userEvent.setup();
      await user.type(screen.getByRole('combobox'), 'parm');
      await user.click(await screen.findByRole('option', { name: /Parmesan/ }));

      await user.keyboard('{Backspace}');

      const input = screen.getByRole('combobox', {
        name: 'Search ingredients',
      });
      expect(input).toHaveValue('');
      expect(input).toHaveFocus();
      expect(onQueryChange).toHaveBeenLastCalledWith('');
      expect(
        screen.queryByRole('button', { name: 'Change ingredient' }),
      ).not.toBeInTheDocument();
    });

    it('replaces the token when a character is typed over it', async () => {
      stubSearch((locale) => [parmesan(locale)]);
      const onQueryChange = vi.fn();
      renderWithProviders(<ControlledHost onQueryChange={onQueryChange} />);
      const user = userEvent.setup();
      await user.type(screen.getByRole('combobox'), 'parm');
      await user.click(await screen.findByRole('option', { name: /Parmesan/ }));

      await user.keyboard('m');

      expect(
        screen.getByRole('combobox', { name: 'Search ingredients' }),
      ).toHaveValue('m');
      expect(onQueryChange).toHaveBeenLastCalledWith('m');
    });

    it('clears on Delete', async () => {
      stubSearch((locale) => [parmesan(locale)]);
      renderWithProviders(<ControlledHost />);
      const user = userEvent.setup();
      await user.type(screen.getByRole('combobox'), 'parm');
      await user.click(await screen.findByRole('option', { name: /Parmesan/ }));

      await user.keyboard('{Delete}');

      expect(
        screen.getByRole('combobox', { name: 'Search ingredients' }),
      ).toHaveValue('');
    });

    it('clears with the × button and refocuses the input', async () => {
      stubSearch((locale) => [parmesan(locale)]);
      renderWithProviders(<ControlledHost />);
      const user = userEvent.setup();
      await user.type(screen.getByRole('combobox'), 'parm');
      await user.click(await screen.findByRole('option', { name: /Parmesan/ }));

      await user.click(
        screen.getByRole('button', { name: 'Change ingredient' }),
      );

      const input = screen.getByRole('combobox', {
        name: 'Search ingredients',
      });
      expect(input).toHaveValue('');
      expect(input).toHaveFocus();
    });

    it('clears when the token itself is tapped', async () => {
      stubSearch((locale) => [parmesan(locale)]);
      renderWithProviders(<ControlledHost />);
      const user = userEvent.setup();
      await user.type(screen.getByRole('combobox'), 'parm');
      await user.click(await screen.findByRole('option', { name: /Parmesan/ }));

      await user.click(screen.getByText('Parmesan'));

      const input = screen.getByRole('combobox', {
        name: 'Search ingredients',
      });
      expect(input).toHaveValue('');
      expect(input).toHaveFocus();
    });

    it('drops the token when the host clears `selected`', async () => {
      stubSearch((locale) => [parmesan(locale)]);
      renderWithProviders(<ControlledHost />);
      const user = userEvent.setup();
      await user.type(screen.getByRole('combobox'), 'parm');
      await user.click(await screen.findByRole('option', { name: /Parmesan/ }));

      expect(
        screen.getByRole('button', { name: 'Change ingredient' }),
      ).toBeVisible();
      await user.click(screen.getByRole('button', { name: 'Host clears' }));

      expect(
        screen.queryByRole('button', { name: 'Change ingredient' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('combobox', { name: 'Search ingredients' }),
      ).toBeInTheDocument();
    });

    it('does not show a token where the host passes no `selected`', async () => {
      stubSearch((locale) => [parmesan(locale)]);
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);
      const user = userEvent.setup();
      await user.type(screen.getByRole('combobox'), 'parm');
      await user.click(await screen.findByRole('option', { name: /Parmesan/ }));

      expect(
        screen.queryByRole('button', { name: 'Change ingredient' }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveAccessibleName(
        'Search ingredients',
      );
    });
  });
});

function CheddarTile() {
  const search = useEmptyStateSearch();
  return (
    <button type="button" onClick={() => search?.select(cheddar)}>
      Cheddar tile
    </button>
  );
}

describe('CatalogSearch host extension points (#266)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('emptyState', () => {
    it('shows when the field is focused and empty, and not before', async () => {
      stubControlled();
      renderWithProviders(
        <CatalogSearch
          onSelect={() => {}}
          emptyState={<p>Gone from your Pantry</p>}
        />,
      );
      expect(screen.queryByText('Gone from your Pantry')).toBeNull();

      await userEvent.setup().click(screen.getByRole('combobox'));

      expect(await screen.findByText('Gone from your Pantry')).toBeVisible();
    });

    it('lets an empty-state block pick through the search, so the pick goes through onSelect', async () => {
      stubControlled();
      const onSelect = vi.fn();
      renderWithProviders(
        <CatalogSearch onSelect={onSelect} emptyState={<CheddarTile />} />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole('combobox'));
      await user.click(
        await screen.findByRole('button', { name: 'Cheddar tile' }),
      );

      expect(onSelect).toHaveBeenCalledWith(cheddar);
      expect(screen.getByRole('combobox')).toHaveValue('Cheddar');
    });

    it('goes away once something is typed, and returns when the field is cleared', async () => {
      const search = stubControlled();
      renderWithProviders(
        <CatalogSearch
          onSelect={() => {}}
          emptyState={<p>Gone from your Pantry</p>}
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole('combobox'));
      await screen.findByText('Gone from your Pantry');

      await typeQuery(user, 'che');
      expect(screen.queryByText('Gone from your Pantry')).toBeNull();
      await search.respond('che', [cheddar]);

      await user.clear(screen.getByRole('combobox'));
      expect(await screen.findByText('Gone from your Pantry')).toBeVisible();
    });

    it('stays when focus leaves the field without typing', async () => {
      stubControlled();
      renderWithProviders(
        <div>
          <CatalogSearch
            onSelect={() => {}}
            emptyState={<p>Gone from your Pantry</p>}
          />
          <button type="button">Elsewhere</button>
        </div>,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole('combobox'));
      await screen.findByText('Gone from your Pantry');

      await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
      expect(screen.getByRole('combobox')).not.toHaveFocus();

      expect(screen.getByText('Gone from your Pantry')).toBeVisible();
    });

    it('closes on Escape', async () => {
      stubControlled();
      renderWithProviders(
        <CatalogSearch
          onSelect={() => {}}
          emptyState={<p>Gone from your Pantry</p>}
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole('combobox'));
      await screen.findByText('Gone from your Pantry');

      await user.keyboard('{Escape}');

      expect(screen.queryByText('Gone from your Pantry')).toBeNull();
    });

    it('lets a button inside it be clicked, though that takes focus off the field', async () => {
      stubControlled();
      const onTile = vi.fn();
      renderWithProviders(
        <CatalogSearch
          onSelect={() => {}}
          emptyState={
            <button type="button" onClick={onTile}>
              Milk tile
            </button>
          }
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole('combobox'));

      await user.click(
        await screen.findByRole('button', { name: 'Milk tile' }),
      );

      expect(onTile).toHaveBeenCalledTimes(1);
    });

    it('is not rendered when the host passes none', async () => {
      stubControlled();
      renderWithProviders(<CatalogSearch onSelect={() => {}} />);
      await userEvent.setup().click(screen.getByRole('combobox'));
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  describe('onUseTyped', () => {
    const useTyped = (q: string) =>
      screen.findByRole('option', { name: new RegExp(`Use “${q}” as typed`) });

    it('ends the no-match state with a Use as typed option and its hint', async () => {
      const search = stubControlled();
      const onUseTyped = vi.fn();
      renderWithProviders(
        <CatalogSearch onSelect={() => {}} onUseTyped={onUseTyped} />,
      );
      const user = userEvent.setup();

      await typeQuery(user, 'zzz');
      await search.respond('zzz', []);

      expect(await screen.findByText('No match for “zzz”')).toBeVisible();
      const option = await useTyped('zzz');
      expect(option).toHaveTextContent(
        'Not in the catalog · saved as an unmatched item',
      );
      await user.click(option);
      expect(onUseTyped).toHaveBeenCalledTimes(1);
      expect(onUseTyped).toHaveBeenCalledWith('zzz');
    });

    it('passes the trimmed name', async () => {
      const search = stubControlled();
      const onUseTyped = vi.fn();
      renderWithProviders(
        <CatalogSearch onSelect={() => {}} onUseTyped={onUseTyped} />,
      );
      const user = userEvent.setup();

      await typeQuery(user, '  Dragon fruit ');
      await search.respond('Dragon fruit', []);
      await user.click(await useTyped('Dragon fruit'));

      expect(onUseTyped).toHaveBeenCalledWith('Dragon fruit');
    });

    it('is listed after the results when none has exactly the typed name', async () => {
      const search = stubControlled();
      const onSelect = vi.fn();
      const onUseTyped = vi.fn();
      renderWithProviders(
        <CatalogSearch onSelect={onSelect} onUseTyped={onUseTyped} />,
      );
      const user = userEvent.setup();

      await typeQuery(user, 'che');
      await search.respond('che', [cheddar]);
      await useTyped('che');

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(2);
      expect(options[0]).toHaveTextContent('Cheddar');
      expect(options[1]).toHaveTextContent('Use “che” as typed');
      await user.click(options[1]);
      expect(onUseTyped).toHaveBeenCalledWith('che');
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('is hidden when a result has the typed name, ignoring case, accents and spacing', async () => {
      const search = stubControlled();
      renderWithProviders(
        <CatalogSearch onSelect={() => {}} onUseTyped={() => {}} />,
      );
      const user = userEvent.setup();

      await typeQuery(user, ' PARMESAN ');
      await search.respond('PARMESAN', [parmesan('en'), cheddar]);
      await screen.findByRole('option', { name: /Parmesan/ });

      expect(screen.queryByRole('option', { name: /as typed/ })).toBeNull();
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });

    it('is not offered while the first results are still loading', async () => {
      stubPending();
      renderWithProviders(
        <CatalogSearch onSelect={() => {}} onUseTyped={() => {}} />,
      );
      const user = userEvent.setup();

      await typeQuery(user, 'zzz');
      await screen.findAllByTestId('search-skeleton');

      expect(screen.queryByRole('option', { name: /as typed/ })).toBeNull();
    });

    it('stays while the next results load, and Enter waits for them', async () => {
      const search = stubControlled();
      const onUseTyped = vi.fn();
      renderWithProviders(
        <CatalogSearch
          onSelect={() => {}}
          onUseTyped={onUseTyped}
          scope="shared"
        />,
      );
      const user = userEvent.setup();

      await typeQuery(user, 'zzz');
      await search.respond('zzz', []);
      await useTyped('zzz');

      await user.keyboard('z');
      await vi.waitFor(() => expect(search.asked('zzzz')).toBe(true));
      expect(
        screen.getByRole('option', { name: /Use “zzzz” as typed/ }),
      ).toBeVisible();
      await user.keyboard('{Enter}');
      expect(onUseTyped).not.toHaveBeenCalled();

      await search.respond('zzzz', []);
      await vi.waitFor(() =>
        expect(screen.queryByTestId('search-spinner')).not.toBeInTheDocument(),
      );
      await user.keyboard('{Enter}');
      expect(onUseTyped).toHaveBeenCalledWith('zzzz');
    });

    it('can tag rows through rowTag: results and the typed row', async () => {
      const search = stubControlled();
      renderWithProviders(
        <CatalogSearch
          onSelect={() => {}}
          onUseTyped={() => {}}
          rowTag={({ ingredientId }) =>
            ingredientId ? 'On list' : 'Typed tag'
          }
        />,
      );
      const user = userEvent.setup();

      await typeQuery(user, 'che');
      await search.respond('che', [cheddar]);

      const [row, typedRow] = await screen.findAllByRole('option');
      expect(within(row).getByText('On list')).toBeVisible();
      expect(row).toHaveAccessibleName(/On list/);
      expect(within(typedRow).getByText('Typed tag')).toBeVisible();
    });

    it('shows no tag when rowTag returns null', async () => {
      const search = stubControlled();
      renderWithProviders(
        <CatalogSearch onSelect={() => {}} rowTag={() => null} />,
      );
      const user = userEvent.setup();

      await typeQuery(user, 'che');
      await search.respond('che', [cheddar]);

      const row = await screen.findByRole('option');
      expect(row).toHaveAccessibleName(/^Cheddar/);
      expect(within(row).queryByText('On list')).toBeNull();
    });

    it('is picked by Enter when it is the only option', async () => {
      const search = stubControlled();
      const onUseTyped = vi.fn();
      renderWithProviders(
        <CatalogSearch
          onSelect={() => {}}
          onUseTyped={onUseTyped}
          scope="shared"
        />,
      );
      const user = userEvent.setup();

      await typeQuery(user, 'zzz');
      await search.respond('zzz', []);
      await useTyped('zzz');
      await user.keyboard('{Enter}');

      expect(onUseTyped).toHaveBeenCalledTimes(1);
      expect(onUseTyped).toHaveBeenCalledWith('zzz');
    });

    it('is not picked by Enter while results are showing: the first result is', async () => {
      const search = stubControlled();
      const onUseTyped = vi.fn();
      const onSelect = vi.fn();
      renderWithProviders(
        <CatalogSearch onSelect={onSelect} onUseTyped={onUseTyped} />,
      );
      const user = userEvent.setup();

      await typeQuery(user, 'che');
      await search.respond('che', [cheddar]);
      await useTyped('che');
      await user.keyboard('{Enter}');

      expect(onUseTyped).not.toHaveBeenCalled();
      expect(onSelect).toHaveBeenCalledWith(cheddar);
    });

    it('can be reached with the arrow keys and picked with Enter', async () => {
      const search = stubControlled();
      const onUseTyped = vi.fn();
      renderWithProviders(
        <CatalogSearch onSelect={() => {}} onUseTyped={onUseTyped} />,
      );
      const user = userEvent.setup();

      await typeQuery(user, 'che');
      await search.respond('che', [cheddar]);
      const option = await useTyped('che');
      await user.keyboard('{ArrowDown}{ArrowDown}');
      expect(
        screen.getByRole('combobox').getAttribute('aria-activedescendant'),
      ).toBe(option.id);
      await user.keyboard('{Enter}');

      expect(onUseTyped).toHaveBeenCalledWith('che');
    });

    it('is absent without the prop: only the no-match hint shows', async () => {
      const search = stubControlled();
      renderWithProviders(<CatalogSearch onSelect={() => {}} scope="shared" />);
      const user = userEvent.setup();

      await typeQuery(user, 'zzz');
      await search.respond('zzz', []);

      expect(await screen.findByText('No match for “zzz”')).toBeVisible();
      expect(
        screen.getByText('Check the spelling or try a shorter word.'),
      ).toBeVisible();
      expect(screen.queryByRole('option')).toBeNull();
      expect(screen.queryByText(/as typed/)).toBeNull();
    });
  });

  describe('scope', () => {
    it('sends scope=shared to the search when the host asks for the shared Catalog', async () => {
      const search = stubControlled();
      renderWithProviders(<CatalogSearch onSelect={() => {}} scope="shared" />);
      const user = userEvent.setup();

      await typeQuery(user, 'che');
      await search.respond('che', [cheddar]);

      expect(search.requests.length).toBeGreaterThan(0);
      for (const url of search.requests) {
        expect(url.pathname).toBe('/api/catalog/search');
        expect(url.searchParams.get('scope')).toBe('shared');
      }
    });

    it.each([['family' as const], [undefined]])(
      'does not ask for the shared scope with scope=%s',
      async (scope) => {
        const search = stubControlled();
        renderWithProviders(
          <CatalogSearch onSelect={() => {}} scope={scope} />,
        );
        const user = userEvent.setup();

        await typeQuery(user, 'che');
        await search.respond('che', [cheddar]);

        expect(search.requests.length).toBeGreaterThan(0);
        for (const url of search.requests) {
          expect(url.searchParams.get('scope')).not.toBe('shared');
        }
      },
    );
  });
});

/** A host that owns `selected`: set on a pick, cleared when the search reports an empty query. */
function ControlledHost({
  onSelect,
  onQueryChange,
}: Pick<Partial<CatalogSearchProps>, 'onSelect' | 'onQueryChange'>) {
  const [selected, setSelected] = useState<CatalogSearchResult | null>(null);
  return (
    <>
      <CatalogSearch
        selected={selected}
        onSelect={(ingredient) => {
          setSelected(ingredient);
          onSelect?.(ingredient);
        }}
        onQueryChange={(query) => {
          if (query === '') setSelected(null);
          onQueryChange?.(query);
        }}
      />
      <button type="button" onClick={() => setSelected(null)}>
        Host clears
      </button>
    </>
  );
}

/** Every search stays pending forever. */
function stubPending() {
  vi.stubGlobal('fetch', () => new Promise<Response>(() => {}));
}

/** Every search fails with a server error. */
function stubFailing() {
  vi.stubGlobal('fetch', () =>
    Promise.resolve(Response.json({ code: 'internal' }, { status: 500 })),
  );
}

/** Parmesan for every query, unless `failing` is set. Records requests. */
function stubFlaky() {
  const state = {
    failing: true,
    requests: [] as URL[],
  };
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = new URL(String(input), window.location.origin);
    state.requests.push(url);
    return Promise.resolve(
      state.failing
        ? Response.json({ code: 'internal' }, { status: 500 })
        : Response.json({ results: [parmesan('en')] }),
    );
  });
  return state;
}

/** Enters a query in one input event, so only one debounced request goes out whatever the machine's speed. */
async function typeQuery(user: ReturnType<typeof userEvent.setup>, q: string) {
  await user.click(screen.getByRole('combobox'));
  await user.paste(q);
}

/** Each query stays pending until the test answers it with `respond`. */
function stubControlled() {
  const pending = new Map<string, (results: CatalogSearchResult[]) => void>();
  const asked = new Set<string>();
  const requests: URL[] = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = new URL(String(input), window.location.origin);
    requests.push(url);
    const q = url.searchParams.get('q') as string;
    asked.add(q);
    return new Promise<Response>((resolve) => {
      pending.set(q, (results) => resolve(Response.json({ results })));
    });
  });
  return {
    requests,
    asked: (q: string) => asked.has(q),
    /** Waits until `q` has been requested, so an answer is never lost. */
    respond: async (q: string, results: CatalogSearchResult[]) => {
      await vi.waitFor(() => expect(pending.has(q)).toBe(true));
      pending.get(q)?.(results);
    },
  };
}

describe('CatalogSearch row variant (editor card)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a 50 pt row without the recessed well', () => {
    stubSearch(() => []);
    renderWithProviders(<CatalogSearch variant="row" onSelect={() => {}} />);
    const box = screen.getByRole('combobox').parentElement!;
    const style = getComputedStyle(box);
    expect(style.height).toBe('50px');
    expect(style.boxShadow).toBe('');
  });

  it('draws the search icon in the accent, unlike the default field', () => {
    stubSearch(() => []);
    const iconColor = (ui: ReactElement) => {
      const { unmount } = renderWithProviders(ui);
      const box = screen.getByRole('combobox').parentElement!;
      const value = getComputedStyle(box.firstElementChild!).color;
      unmount();
      return value;
    };
    const row = iconColor(<CatalogSearch variant="row" onSelect={() => {}} />);
    const field = iconColor(<CatalogSearch onSelect={() => {}} />);
    expect(row).not.toBe('');
    expect(row).not.toBe(field);
  });

  it('keeps the default field at 48 pt', () => {
    stubSearch(() => []);
    renderWithProviders(<CatalogSearch onSelect={() => {}} />);
    expect(
      getComputedStyle(screen.getByRole('combobox').parentElement!).height,
    ).toBe('48px');
  });

  it('lists the results in a floating popover and picks one', async () => {
    stubSearch((locale) => [parmesan(locale), cheddar]);
    const onSelect = vi.fn();
    renderWithProviders(<CatalogSearch variant="row" onSelect={onSelect} />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('combobox'), 'ch');
    const option = await screen.findByRole('option', { name: /Cheddar/ });
    // The popover is positioned by the design system's Popper, which fixes it so a card cannot clip it.
    expect(option.closest('[data-popper-placement]')).not.toBeNull();
    await user.click(option);
    expect(onSelect).toHaveBeenCalledWith(cheddar);
  });

  it('closes the popover when focus leaves the row', async () => {
    stubSearch((locale) => [parmesan(locale)]);
    renderWithProviders(
      <>
        <CatalogSearch variant="row" onSelect={() => {}} />
        <button type="button">Elsewhere</button>
      </>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByRole('combobox'), 'parm');
    await screen.findByRole('option');
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('clears the text with the × and keeps focus in the field', async () => {
    stubSearch((locale) => [parmesan(locale)]);
    const onQueryChange = vi.fn();
    renderWithProviders(
      <CatalogSearch
        variant="row"
        onSelect={() => {}}
        onQueryChange={onQueryChange}
      />,
    );
    const user = userEvent.setup();
    const input = screen.getByRole('combobox');
    await user.type(input, 'parm');
    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    expect(onQueryChange).toHaveBeenLastCalledWith('');
  });
});
