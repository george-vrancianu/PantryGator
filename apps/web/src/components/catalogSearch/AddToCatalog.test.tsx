import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '../../lib/catalog';
import { renderWithProviders, stubApi } from '../../test/render';
import { stubViewport } from '../../test/viewport';
import { CatalogSearch, type CatalogSearchProps } from './CatalogSearch';

// Spec: #270, ADR 0011.

const DAIRY_AISLE = { id: 'dairy-aisle', name: 'Dairy & eggs' };

const parmesan = {
  amountScale: 'medium',
  id: 'parmesan-id',
  name: 'Parmesan',
  owner: 'catalog',
  defaultUnit: 'g',
  leafCategory: { id: 'hard-cheese', name: 'Hard cheese' },
  parentCategory: { id: 'dairy', name: 'Dairy', aisle: DAIRY_AISLE },
  defaults: { expiryDays: 60, location: 'fridge' },
};

const kombucha = {
  amountScale: 'medium',
  id: 'kombucha-id',
  name: 'Kombucha',
  owner: 'family',
  defaultUnit: 'ml',
  leafCategory: { id: 'ground-spices', name: 'Ground spices' },
  parentCategory: {
    id: 'spices',
    name: 'Spices',
    aisle: { id: 'oils-spices', name: 'Oils & spices' },
  },
  defaults: { expiryDays: 730, location: 'spices' },
};

const OTHER_CATEGORY = {
  id: 'other-leaf',
  name: 'Other',
  parentCategory: { id: 'other-parent', name: 'Other' },
  aisle: { id: 'other-aisle', name: 'Other' },
  defaults: { expiryDays: null, location: null },
};
const SPICES_CATEGORY = {
  id: 'ground-spices',
  name: 'Ground spices',
  parentCategory: { id: 'spices', name: 'Spices' },
  aisle: { id: 'oils-spices', name: 'Oils & spices' },
  defaults: { expiryDays: 730, location: 'spices' },
};

// Fixtures carry the `owner` the API adds to every result.
const asResult = (value: object) => value as CatalogSearchResult;

type Options = {
  results?: object[];
  /** What the create endpoint answers; the default is 201 with the Family Ingredient. */
  create?: () => Response;
};

function stubCatalog({ results = [], create }: Options = {}) {
  const { fetchMock, calls } = stubApi({
    'GET /api/catalog/allergens': () =>
      Response.json({
        allergens: [
          { id: 'al-milk', name: 'Milk' },
          { id: 'al-peanuts', name: 'Peanuts' },
        ],
      }),
    'GET /api/catalog/search': () => Response.json({ results }),
    'GET /api/catalog/categories': (url) =>
      Response.json({
        categories: url.searchParams.get('q')?.trim()
          ? [SPICES_CATEGORY]
          : [OTHER_CATEGORY],
      }),
    'POST /api/catalog/family-ingredients':
      create ?? (() => Response.json(kombucha, { status: 201 })),
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function Host(
  props: Partial<CatalogSearchProps> & {
    onPicked?: (ingredient: CatalogSearchResult) => void;
  },
) {
  const { onPicked, ...search } = props;
  const [selected, setSelected] = useState<CatalogSearchResult | null>(null);
  return (
    <>
      <button>elsewhere</button>
      <CatalogSearch
        {...search}
        selected={selected}
        onSelect={(ingredient) => {
          setSelected(ingredient);
          onPicked?.(ingredient);
        }}
        onQueryChange={(q) => {
          if (q === '') setSelected(null);
        }}
      />
    </>
  );
}

const field = () =>
  screen.getByRole('combobox', { name: 'Search ingredients' });
const addButton = (q: string) =>
  screen.getByRole('button', { name: `Add “${q}” to your catalog` });
const popover = () =>
  screen.findByRole('dialog', { name: 'Add to your catalog' });

async function type(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(field());
  await user.paste(text);
}

describe('Add to your catalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('entry points', () => {
    it('offers an Add button in the field whenever text is typed and nothing is selected, even beside matches', async () => {
      stubCatalog({ results: [parmesan] });
      renderWithProviders(<Host />);
      const user = userEvent.setup();

      await user.click(field());
      expect(
        screen.queryByRole('button', { name: /to your catalog/ }),
      ).toBeNull();

      await user.paste('parm');
      await screen.findByRole('option', { name: /Parmesan/ });
      expect(addButton('parm')).toHaveAttribute('aria-haspopup', 'dialog');
      // With a match showing, the option row is not offered, only the button.
      expect(
        screen.queryByRole('option', { name: /to your catalog/ }),
      ).toBeNull();

      await user.click(screen.getByRole('option', { name: /Parmesan/ }));
      expect(
        screen.queryByRole('button', { name: /to your catalog/ }),
      ).toBeNull();
    });

    it('opens the popover from the button', async () => {
      stubViewport(1024);
      stubCatalog({ results: [parmesan] });
      renderWithProviders(<Host />);
      const user = userEvent.setup();

      await type(user, 'parm');
      await screen.findByRole('option', { name: /Parmesan/ });
      await user.click(addButton('parm'));

      expect(await popover()).toBeVisible();
    });

    it('offers "Add to your catalog" as the first option when nothing matches, above Use as typed', async () => {
      stubViewport(1024);
      stubCatalog({ results: [] });
      renderWithProviders(<Host onUseTyped={() => {}} />);
      const user = userEvent.setup();

      await type(user, 'zzz');

      const options = await screen.findAllByRole('option');
      expect(options).toHaveLength(2);
      expect(options[0]).toHaveAccessibleName(/Add “zzz” to your catalog/);
      expect(options[0]).toHaveTextContent(
        'Pick its category once · only your family sees it',
      );
      expect(options[1]).toHaveAccessibleName(/Use “zzz” as typed/);

      await user.click(options[0]);
      expect(await popover()).toBeVisible();
    });

    it('opens the popover with Enter on the no-match option', async () => {
      stubViewport(1024);
      stubCatalog({ results: [] });
      renderWithProviders(<Host onUseTyped={() => {}} />);
      const user = userEvent.setup();

      await type(user, 'zzz');
      await screen.findAllByRole('option');
      await user.keyboard('{ArrowDown}{Enter}');

      expect(await popover()).toBeVisible();
    });

    it('is not offered in the shared scope (Admin searches)', async () => {
      stubCatalog({ results: [] });
      renderWithProviders(<Host scope="shared" onUseTyped={() => {}} />);
      const user = userEvent.setup();

      await type(user, 'zzz');
      await screen.findByText('No match for “zzz”');

      expect(
        screen.queryByRole('button', { name: /to your catalog/ }),
      ).toBeNull();
      expect(
        screen.queryByRole('option', { name: /to your catalog/ }),
      ).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('the popover', () => {
    async function open(typed = 'Kombucha') {
      stubViewport(1024);
      const calls = stubCatalog({ results: [] });
      const picked = vi.fn();
      const { queryClient } = renderWithProviders(<Host onPicked={picked} />);
      const user = userEvent.setup();
      await type(user, typed);
      await screen.findByText(/No match for/);
      await user.click(addButton(typed));
      return { user, calls, picked, queryClient, dialog: await popover() };
    }

    it('shows a title, a subtitle, the typed Name, a category search, a Unit and the actions', async () => {
      const { dialog } = await open();

      expect(within(dialog).getByText('Add to your catalog')).toBeVisible();
      expect(dialog).toHaveTextContent('Only your family sees it');
      expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue(
        'Kombucha',
      );
      expect(within(dialog).getByLabelText('Unit')).toHaveValue('pcs');
      for (const unit of ['g', 'kg', 'ml', 'l', 'pcs']) {
        expect(
          within(dialog).getByRole('option', { name: unit }),
        ).toBeInTheDocument();
      }
      expect(
        within(dialog).getByRole('button', { name: 'Cancel' }),
      ).toBeEnabled();
      // Copy never says "shelf life", and there is no expiry control.
      expect(dialog).not.toHaveTextContent(/shelf life/i);
      expect(within(dialog).queryByLabelText(/expiry|shelf/i)).toBeNull();
    });

    it('moves focus to the category search and offers Other with a hint while it is empty', async () => {
      const { dialog } = await open();
      const category = within(dialog).getByRole('combobox', {
        name: 'Category',
      });

      await waitFor(() => expect(category).toHaveFocus());
      expect(dialog).toHaveTextContent(/type to search categories/i);
      expect(
        await within(dialog).findByRole('option', { name: /Other/ }),
      ).toBeVisible();
    });

    it("shows each category's Default Expiry as a chip", async () => {
      const { user, dialog } = await open();
      const other = await within(dialog).findByRole('option', {
        name: /Other/,
      });
      expect(other).toHaveTextContent('No expiry');
      await user.click(
        within(dialog).getByRole('combobox', { name: 'Category' }),
      );
      await user.paste('spice');
      const spices = await within(dialog).findByRole('option', {
        name: /Ground spices/,
      });
      expect(spices).toHaveTextContent('730 d');
      expect(dialog).not.toHaveTextContent(/shelf life/i);
    });

    it('disables Add & pick with "pick one" until a category is chosen', async () => {
      const { user, dialog } = await open();
      const add = within(dialog).getByRole('button', { name: /^Add & pick/ });
      expect(add).toBeDisabled();
      expect(add).toHaveTextContent('· pick one');

      await user.click(
        await within(dialog).findByRole('option', { name: /Other/ }),
      );

      expect(
        within(dialog).getByRole('button', { name: /^Add & pick/ }),
      ).toBeEnabled();
      expect(
        within(dialog).getByRole('button', { name: /^Add & pick/ }),
      ).not.toHaveTextContent('pick one');
    });

    it('searches categories as the Member types and shows parent and aisle on each row', async () => {
      const { user, dialog, calls } = await open();
      const category = within(dialog).getByRole('combobox', {
        name: 'Category',
      });

      await user.click(category);
      await user.paste('spice');

      const row = await within(dialog).findByRole('option', {
        name: /Ground spices/,
      });
      expect(row).toHaveTextContent('Spices · Oils & spices');
      await waitFor(() => {
        const searched = calls.filter(
          (c) => c.key === 'GET /api/catalog/categories',
        );
        expect(new URLSearchParams(searched.at(-1)?.search).get('q')).toBe(
          'spice',
        );
      });
    });

    it('creates the Family Ingredient with the edited name, chosen category and unit, picks it with a Family tag and toasts', async () => {
      const { user, dialog, calls, picked } = await open('kombucha');

      const name = within(dialog).getByRole('textbox', { name: 'Name' });
      await user.clear(name);
      await user.paste('Kombucha');
      await user.selectOptions(within(dialog).getByLabelText('Unit'), 'ml');
      await user.click(
        within(dialog).getByRole('combobox', { name: 'Category' }),
      );
      await user.paste('spice');
      await user.click(
        await within(dialog).findByRole('option', { name: /Ground spices/ }),
      );
      await user.click(
        within(dialog).getByRole('button', { name: /^Add & pick/ }),
      );

      await waitFor(() => expect(picked).toHaveBeenCalledWith(kombucha));
      const post = calls.find(
        (c) => c.key === 'POST /api/catalog/family-ingredients',
      );
      expect(post?.body).toEqual({
        name: 'Kombucha',
        leafCategoryId: 'ground-spices',
        defaultUnit: 'ml',
      });
      expect(
        await screen.findByText(
          "Added Kombucha to your family's catalog · Ground spices",
        ),
      ).toBeVisible();
      // Picked: the token carries the Family tag and the popover is gone.
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByText('Family')).toBeVisible();
    });

    describe('the Contains row', () => {
      async function addWith(choose: (dialog: HTMLElement) => Promise<void>) {
        const { user, dialog, calls, picked } = await open('Kombucha');
        await user.click(
          within(dialog).getByRole('combobox', { name: 'Category' }),
        );
        await user.paste('spice');
        await user.click(
          await within(dialog).findByRole('option', { name: /Ground spices/ }),
        );
        await choose(dialog);
        await user.click(
          within(dialog).getByRole('button', { name: /^Add & pick/ }),
        );
        await waitFor(() => expect(picked).toHaveBeenCalled());
        return calls.find(
          (c) => c.key === 'POST /api/catalog/family-ingredients',
        )?.body;
      }

      it('is optional: left blank, the Ingredient is created without Allergens (Unchecked)', async () => {
        const body = await addWith(async () => {});
        expect(body).not.toHaveProperty('allergenIds');
      });

      it('sends the chosen Allergens', async () => {
        const user = userEvent.setup();
        const body = await addWith(async (dialog) => {
          await user.click(
            await within(dialog).findByRole('button', { name: 'Peanuts' }),
          );
        });
        expect(body).toMatchObject({ allergenIds: ['al-peanuts'] });
      });

      it('sends an empty list for "None"', async () => {
        const user = userEvent.setup();
        const body = await addWith(async (dialog) => {
          await user.click(
            await within(dialog).findByRole('button', { name: 'None' }),
          );
        });
        expect(body).toMatchObject({ allergenIds: [] });
      });
    });

    it("refreshes what the Family's Unmatched items were relinked in (Pantry, Shopping List, Templates, Recipes)", async () => {
      const { user, dialog, picked, queryClient } = await open('Kombucha');
      const keys = [
        ['pantry', 'en'],
        ['pantry', 'recently-stocked'],
        ['shopping-list', 'en'],
        ['shopping-templates', 'detail', 't1'],
        ['recipes', 'list'],
        ['suggestions', 'en'],
      ];
      for (const key of keys) queryClient.setQueryData(key, {});

      await user.click(
        within(dialog).getByRole('combobox', { name: 'Category' }),
      );
      await user.paste('spice');
      await user.click(
        await within(dialog).findByRole('option', { name: /Ground spices/ }),
      );
      await user.click(
        within(dialog).getByRole('button', { name: /^Add & pick/ }),
      );
      await waitFor(() => expect(picked).toHaveBeenCalled());

      for (const key of keys) {
        expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
      }
    });

    it('offers "Pick {existing}" when the name already exists, and picks that Ingredient', async () => {
      stubViewport(1024);
      stubCatalog({
        results: [],
        create: () =>
          Response.json(
            {
              code: 'catalog.family_ingredient_exists',
              params: { existing: parmesan },
            },
            { status: 409 },
          ),
      });
      const picked = vi.fn();
      renderWithProviders(<Host onPicked={picked} />);
      const user = userEvent.setup();
      await type(user, 'parmesan!');
      await screen.findByText(/No match for/);
      await user.click(addButton('parmesan!'));
      const dialog = await popover();
      await user.click(
        await within(dialog).findByRole('option', { name: /Other/ }),
      );
      await user.click(
        within(dialog).getByRole('button', { name: /^Add & pick/ }),
      );

      const pick = await within(dialog).findByRole('button', {
        name: 'Pick Parmesan',
      });
      expect(
        within(dialog).queryByRole('button', { name: /^Add & pick/ }),
      ).toBeNull();
      await user.click(pick);

      expect(picked).toHaveBeenCalledWith(parmesan);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(
        screen.queryByText(/Added .* to your family's catalog/),
      ).toBeNull();
    });

    it('closes on Escape before clearing the search, and returns focus to the field', async () => {
      const { user, dialog } = await open();
      await waitFor(() =>
        expect(
          within(dialog).getByRole('combobox', { name: 'Category' }),
        ).toHaveFocus(),
      );

      await user.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(field()).toHaveValue('Kombucha');
      expect(field()).toHaveFocus();
    });

    it.each([
      ['Cancel', () => screen.getByRole('button', { name: 'Cancel' })],
      ['×', () => screen.getByRole('button', { name: 'Close' })],
    ])(
      'closes with %s and returns focus to the field',
      async (_label, control) => {
        const { user } = await open();

        await user.click(control());

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(field()).toHaveValue('Kombucha');
        expect(field()).toHaveFocus();
      },
    );

    it('closes when the Member taps outside, and returns focus to the field', async () => {
      const { user } = await open();

      await user.click(screen.getByRole('button', { name: 'elsewhere' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(field()).toHaveFocus();
    });

    it('is a popover under the field on a tablet or wider (not a modal)', async () => {
      const { dialog } = await open();
      expect(dialog).not.toHaveAttribute('aria-modal', 'true');
    });
  });

  describe('on a phone', () => {
    it('opens the same content in a modal Sheet and closes with Cancel', async () => {
      stubViewport(390);
      stubCatalog({ results: [] });
      renderWithProviders(<Host />);
      const user = userEvent.setup();
      await type(user, 'Kombucha');
      await screen.findByText(/No match for/);
      await user.click(addButton('Kombucha'));

      const dialog = await popover();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue(
        'Kombucha',
      );
      expect(
        within(dialog).getByRole('combobox', { name: 'Category' }),
      ).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Unit')).toHaveValue('pcs');
      // On a phone the sheet keeps focus: a focused Category field would raise the keyboard mid-slide.
      await waitFor(() => expect(dialog).toHaveFocus());
      expect(
        within(dialog).getByRole('combobox', { name: 'Category' }),
      ).not.toHaveFocus();

      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(field()).toHaveFocus();
    });
  });

  describe('Family tag', () => {
    it('shows on result rows and on the token for Family Ingredients only', async () => {
      stubCatalog({ results: [parmesan, kombucha] });
      renderWithProviders(<Host />);
      const user = userEvent.setup();

      await type(user, 'k');
      const family = await screen.findByRole('option', { name: /Kombucha/ });
      expect(within(family).getByText('Family')).toBeVisible();
      expect(
        within(screen.getByRole('option', { name: /Parmesan/ })).queryByText(
          'Family',
        ),
      ).toBeNull();

      await user.click(family);
      expect(screen.getByText('Family')).toBeVisible();
    });

    it('is available to a host that passes a Family Ingredient as the selection', () => {
      stubCatalog();
      renderWithProviders(
        <CatalogSearch onSelect={() => {}} selected={asResult(kombucha)} />,
      );
      expect(screen.getByText('Family')).toBeVisible();
    });
  });
  it('pluralises the Default Expiry chip in Romanian, which needs the few form', () => {
    const { i18n } = renderWithProviders(<div />);
    const chip = (count: number) =>
      i18n.t('catalog:catalogAdd.expiryDays', { count, lng: 'ro' });
    expect(chip(7)).toBe('7 z');
    expect(chip(1)).toBe('1 z');
    expect(chip(60)).toBe('60 z');
  });
});
