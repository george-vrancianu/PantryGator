import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '@/lib/catalog';
import { renderWithProviders, stubApi } from '@/test/render';
import { stubViewport } from '@/test/viewport';
import { CatalogSearch } from '../CatalogSearch/CatalogSearch';

// Spec: #273, ADR 0011. The popover's
// "Another name for…" mode; the "New ingredient" mode is covered in AddToCatalog.test.tsx.

const DAIRY_AISLE = { id: 'dairy-aisle', name: 'Dairy & eggs' };
const ingredient = (id: string, name: string, leaf = 'Hard cheese') => ({
  amountScale: 'medium',
  id,
  name,
  owner: 'catalog',
  defaultUnit: 'g',
  leafCategory: { id: `${id}-leaf`, name: leaf },
  parentCategory: { id: 'dairy', name: 'Dairy', aisle: DAIRY_AISLE },
  defaults: { expiryDays: 60, location: 'fridge' },
});
const parmesan = ingredient('parmesan-id', 'Parmesan');
const OTHER_CATEGORY = {
  id: 'other-leaf',
  name: 'Other',
  parentCategory: { id: 'other-parent', name: 'Other' },
  aisle: { id: 'other-aisle', name: 'Other' },
  defaults: { expiryDays: null, location: null },
};

type Options = {
  /** What the alias search finds (the field's own search finds nothing). */
  aliasResults?: object[];
  link?: () => Response;
};

function stubCatalog({ aliasResults = [parmesan], link }: Options = {}) {
  const { fetchMock, calls } = stubApi({
    'GET /api/catalog/search': (url) =>
      Response.json({
        results: url.searchParams.get('q') === 'kombucha' ? [] : aliasResults,
      }),
    'GET /api/catalog/categories': () =>
      Response.json({ categories: [OTHER_CATEGORY] }),
    'POST /api/catalog/family-synonyms':
      link ?? (() => Response.json(parmesan, { status: 201 })),
    'POST /api/catalog/family-ingredients': () =>
      Response.json({}, { status: 500 }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function Host({ onPicked }: { onPicked?: (r: CatalogSearchResult) => void }) {
  const [selected, setSelected] = useState<CatalogSearchResult | null>(null);
  return (
    <>
      <button>elsewhere</button>
      <CatalogSearch
        selected={selected}
        onSelect={(picked) => {
          setSelected(picked);
          onPicked?.(picked);
        }}
        onQueryChange={(q) => {
          if (q === '') setSelected(null);
        }}
      />
    </>
  );
}

const HINT =
  'Your family will see this name in search, scans and receipts, and it will mean that ingredient.';

async function openAliasMode(options: Options & { viewport?: number } = {}) {
  stubViewport(options.viewport ?? 1024);
  const calls = stubCatalog(options);
  const picked = vi.fn();
  const { queryClient } = renderWithProviders(<Host onPicked={picked} />);
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('combobox', { name: 'Search ingredients' }),
  );
  await user.paste('kombucha');
  await screen.findByText(/No match for/);
  await user.click(
    screen.getByRole('button', { name: 'Add “kombucha” to your catalog' }),
  );
  const dialog = await screen.findByRole('dialog', {
    name: 'Add to your catalog',
  });
  await user.click(
    within(dialog).getByRole('tab', { name: 'Another name for…' }),
  );
  return { user, calls, picked, queryClient, dialog };
}

async function pickTarget(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  name = 'Parmesan',
) {
  await user.click(
    within(dialog).getByRole('combobox', { name: 'Search the catalog' }),
  );
  await user.paste('parm');
  await user.click(
    await within(dialog).findByRole('option', { name: new RegExp(name) }),
  );
}

describe('Add to your catalog: Another name for…', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('switching modes', () => {
    it('offers New ingredient (selected by default) and Another name for… as tabs', async () => {
      stubViewport(1024);
      stubCatalog();
      renderWithProviders(<Host />);
      const user = userEvent.setup();
      await user.click(
        screen.getByRole('combobox', { name: 'Search ingredients' }),
      );
      await user.paste('kombucha');
      await screen.findByText(/No match for/);
      await user.click(
        screen.getByRole('button', { name: 'Add “kombucha” to your catalog' }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: 'Add to your catalog',
      });

      expect(
        within(dialog).getByRole('tablist', { name: 'How to add it' }),
      ).toBeVisible();
      expect(
        within(dialog).getByRole('tab', { name: 'New ingredient' }),
      ).toHaveAttribute('aria-selected', 'true');
      expect(
        within(dialog).getByRole('tab', { name: 'Another name for…' }),
      ).toHaveAttribute('aria-selected', 'false');
      expect(
        within(dialog).getByRole('combobox', { name: 'Category' }),
      ).toBeVisible();
    });

    it('swaps the category, unit and Add & pick for a catalog search, the hint and Link & pick, and focuses the search', async () => {
      const { dialog } = await openAliasMode();

      expect(
        within(dialog).getByRole('tab', { name: 'Another name for…' }),
      ).toHaveAttribute('aria-selected', 'true');
      expect(
        within(dialog).queryByRole('combobox', { name: 'Category' }),
      ).toBeNull();
      expect(within(dialog).queryByLabelText('Unit')).toBeNull();
      expect(
        within(dialog).queryByRole('button', { name: /^Add & pick/ }),
      ).toBeNull();
      const search = within(dialog).getByRole('combobox', {
        name: 'Search the catalog',
      });
      await waitFor(() => expect(search).toHaveFocus());
      expect(dialog).toHaveTextContent(HINT);
      expect(dialog).toHaveTextContent('“kombucha” is the same as');
      expect(
        within(dialog).getByRole('button', { name: /^Link & pick/ }),
      ).toBeDisabled();
      expect(
        within(dialog).getByRole('button', { name: 'Cancel' }),
      ).toBeEnabled();
    });

    it('keeps the Name through a switch and back', async () => {
      const { user, dialog } = await openAliasMode();
      const name = within(dialog).getByRole('textbox', { name: 'Name' });
      await user.clear(name);
      await user.paste('Kombucha');

      await user.click(
        within(dialog).getByRole('tab', { name: 'New ingredient' }),
      );

      expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue(
        'Kombucha',
      );
      expect(
        within(dialog).getByRole('combobox', { name: 'Category' }),
      ).toBeVisible();
    });

    it('works the same in the Sheet on a phone', async () => {
      const { dialog } = await openAliasMode({ viewport: 390 });

      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(
        within(dialog).getByRole('combobox', { name: 'Search the catalog' }),
      ).toBeVisible();
      expect(
        within(dialog).getByRole('button', { name: /^Link & pick/ }),
      ).toBeVisible();
    });
  });

  describe('the alias search', () => {
    it('searches the catalog as the Member types, asking for up to 5 rows', async () => {
      const { user, dialog, calls } = await openAliasMode();

      await user.click(
        within(dialog).getByRole('combobox', { name: 'Search the catalog' }),
      );
      await user.paste('parm');

      await within(dialog).findByRole('option', { name: /Parmesan/ });
      const search = calls
        .filter((c) => c.key === 'GET /api/catalog/search')
        .at(-1);
      const params = new URLSearchParams(search?.search);
      expect(params.get('q')).toBe('parm');
      expect(params.get('limit')).toBe('5');
      expect(params.get('scope')).toBeNull();
    });

    it('shows at most 5 rows, each with the name and "leaf · aisle"', async () => {
      const many = Array.from({ length: 7 }, (_, i) =>
        ingredient(`cheese-${i}`, `Cheese ${i}`),
      );
      const { user, dialog } = await openAliasMode({ aliasResults: many });

      await user.click(
        within(dialog).getByRole('combobox', { name: 'Search the catalog' }),
      );
      await user.paste('chee');

      await within(dialog).findByRole('option', { name: /Cheese 0/ });
      const rows = within(dialog).getAllByRole('option');
      expect(rows).toHaveLength(5);
      expect(rows[0]).toHaveTextContent('Cheese 0');
      expect(rows[0]).toHaveTextContent('Hard cheese · Dairy & eggs');
    });

    it('says so when nothing matches', async () => {
      const { user, dialog } = await openAliasMode({ aliasResults: [] });

      await user.click(
        within(dialog).getByRole('combobox', { name: 'Search the catalog' }),
      );
      await user.paste('zzz');

      expect(
        await within(dialog).findByText('No ingredient matches.'),
      ).toBeVisible();
    });
  });

  describe('picking the target', () => {
    it('collapses the search to a tinted row with the Ingredient, its leaf and aisle, and a way to change it', async () => {
      const { user, dialog } = await openAliasMode();

      await pickTarget(user, dialog);

      expect(
        within(dialog).queryByRole('combobox', { name: 'Search the catalog' }),
      ).toBeNull();
      expect(within(dialog).queryByRole('option')).toBeNull();
      const change = within(dialog).getByRole('button', {
        name: 'Change ingredient',
      });
      expect(change.parentElement).toHaveTextContent('Parmesan');
      expect(change.parentElement).toHaveTextContent(
        'Hard cheese · Dairy & eggs',
      );
      expect(
        within(dialog).getByRole('button', { name: /^Link & pick/ }),
      ).toBeEnabled();
    });

    it('goes back to the search with Change ingredient, focused', async () => {
      const { user, dialog } = await openAliasMode();
      await pickTarget(user, dialog);

      await user.click(
        within(dialog).getByRole('button', { name: 'Change ingredient' }),
      );

      const search = within(dialog).getByRole('combobox', {
        name: 'Search the catalog',
      });
      await waitFor(() => expect(search).toHaveFocus());
      expect(
        within(dialog).getByRole('button', { name: /^Link & pick/ }),
      ).toBeDisabled();
    });
  });

  describe('Link & pick', () => {
    it('links the typed name to the Ingredient, selects the existing Ingredient, closes and toasts', async () => {
      const { user, dialog, calls, picked } = await openAliasMode();
      const name = within(dialog).getByRole('textbox', { name: 'Name' });
      await user.clear(name);
      await user.paste('  Kombucha  ');
      await pickTarget(user, dialog);

      await user.click(
        within(dialog).getByRole('button', { name: /^Link & pick/ }),
      );

      await waitFor(() => expect(picked).toHaveBeenCalledWith(parmesan));
      const post = calls.find(
        (c) => c.key === 'POST /api/catalog/family-synonyms',
      );
      expect(post?.body).toEqual({
        name: 'Kombucha',
        ingredientId: 'parmesan-id',
      });
      expect(
        calls.some((c) => c.key === 'POST /api/catalog/family-ingredients'),
      ).toBe(false);
      expect(
        await screen.findByText(
          '“Kombucha” now means Parmesan for your family',
        ),
      ).toBeVisible();
      expect(screen.queryByRole('dialog')).toBeNull();
      // No Family tag: the picked Ingredient is the shared one.
      expect(screen.queryByText('Family')).toBeNull();
    });

    it("refreshes what the Family's Unmatched items were relinked in", async () => {
      const { user, dialog, picked, queryClient } = await openAliasMode();
      const keys = [
        ['pantry', 'en'],
        ['pantry', 'recently-stocked'],
        ['shopping-list', 'en'],
        ['shopping-templates', 'detail', 't1'],
        ['recipes', 'list'],
        ['suggestions', 'en'],
      ];
      for (const key of keys) queryClient.setQueryData(key, {});
      await pickTarget(user, dialog);

      await user.click(
        within(dialog).getByRole('button', { name: /^Link & pick/ }),
      );
      await waitFor(() => expect(picked).toHaveBeenCalled());

      for (const key of keys) {
        expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
      }
    });
  });

  describe('when the name already means that Ingredient (409)', () => {
    async function conflict() {
      const opened = await openAliasMode({
        link: () =>
          Response.json(
            {
              code: 'catalog.family_synonym_exists',
              params: { existing: parmesan },
            },
            { status: 409 },
          ),
      });
      await pickTarget(opened.user, opened.dialog);
      await opened.user.click(
        within(opened.dialog).getByRole('button', { name: /^Link & pick/ }),
      );
      return opened;
    }

    it('swaps Link & pick for "Pick {existing}" and says why', async () => {
      const { dialog } = await conflict();

      expect(
        await within(dialog).findByRole('button', { name: 'Pick Parmesan' }),
      ).toBeEnabled();
      expect(
        within(dialog).queryByRole('button', { name: /^Link & pick/ }),
      ).toBeNull();
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        '“kombucha” is already a name for Parmesan.',
      );
    });

    it('forgets the answer when the Name is edited', async () => {
      const { user, dialog } = await conflict();
      await within(dialog).findByRole('button', { name: 'Pick Parmesan' });

      const name = within(dialog).getByRole('textbox', { name: 'Name' });
      await user.clear(name);
      await user.paste('Booch');

      expect(
        await within(dialog).findByRole('button', { name: /^Link & pick/ }),
      ).toBeEnabled();
      expect(within(dialog).queryByRole('alert')).toBeNull();
    });

    it('picks the existing Ingredient on Pick, closes, and shows no toast', async () => {
      const { user, dialog, picked } = await conflict();

      await user.click(
        await within(dialog).findByRole('button', { name: 'Pick Parmesan' }),
      );

      expect(picked).toHaveBeenCalledWith(parmesan);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByText(/now means/)).toBeNull();
    });
  });

  describe('strings', () => {
    it.each(['en', 'ro', 'da'])('are translated in %s', (lng) => {
      const { i18n } = renderWithProviders(<div />);
      const t = (key: string, options: object = {}) =>
        i18n.t(`catalog:catalogAdd.${key}`, { lng, ...options });
      for (const key of [
        'modeNew',
        'modeAlias',
        'sameAs',
        'aliasHint',
        'link',
        'pickOne',
      ]) {
        expect(t(key, { name: 'X' }), `${lng} ${key}`).not.toBe(
          `catalogAdd.${key}`,
        );
      }
      const linked = t('linked', { name: 'Kombucha', ingredient: 'Parmesan' });
      expect(linked).toContain('Kombucha');
      expect(linked).toContain('Parmesan');
      expect(
        t('aliasExists', { name: 'kombucha', ingredient: 'Parmesan' }),
      ).toContain('Parmesan');
      if (lng !== 'en') {
        expect(t('modeAlias')).not.toBe(
          i18n.t('catalog:catalogAdd.modeAlias', { lng: 'en' }),
        );
        expect(t('link')).not.toBe(
          i18n.t('catalog:catalogAdd.link', { lng: 'en' }),
        );
      }
    });

    it('matches the handoff wording in English', () => {
      const { i18n } = renderWithProviders(<div />);
      const t = (key: string, options: object = {}) =>
        i18n.t(`catalog:catalogAdd.${key}`, { lng: 'en', ...options });
      expect(t('modeNew')).toBe('New ingredient');
      expect(t('modeAlias')).toBe('Another name for…');
      expect(t('aliasHint')).toBe(HINT);
      expect(t('link')).toBe('Link & pick');
      expect(t('linked', { name: 'A', ingredient: 'B' })).toBe(
        '“A” now means B for your family',
      );
    });
  });
});
