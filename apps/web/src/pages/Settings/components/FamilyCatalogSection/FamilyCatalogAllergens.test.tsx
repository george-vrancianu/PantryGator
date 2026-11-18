import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FamilyCatalogIngredient } from '@/lib/familyCatalog';
import { renderWithProviders, stubApi } from '@/test/render';
import { FamilyCatalogSection } from './FamilyCatalogSection';

// Spec: #360 / #350, ADR 0014.
const ingredient = (
  id: string,
  name: string,
  {
    allergensChecked,
    allergenIds,
    retired = [],
  }: {
    allergensChecked: boolean;
    allergenIds: string[];
    /** Tagged Allergens the picker no longer offers, by id and name. */
    retired?: { id: string; name: string }[];
  },
): FamilyCatalogIngredient => ({
  id,
  name,
  owner: 'family',
  defaultUnit: 'g',
  amountScale: 'medium',
  leafCategory: { id: 'l', name: 'Ground spices' },
  parentCategory: {
    id: 'p',
    name: 'Spices',
    aisle: { id: 'a', name: 'Oils & spices' },
  },
  defaults: { expiryDays: null, location: null },
  usage: {
    batches: 0,
    shoppingItems: 0,
    templateLines: 0,
    recipeLines: 2,
    staples: 0,
  },
  allergensChecked,
  allergenIds,
  allergens: allergenIds.map(
    (id) =>
      retired.find((r) => r.id === id) ?? {
        id,
        name: id === 'al-milk' ? 'Milk' : 'Peanuts',
      },
  ),
});

function stub(ingredients: FamilyCatalogIngredient[]) {
  const { fetchMock, calls } = stubApi({
    'GET /api/catalog/family': () =>
      Response.json({ ingredients, synonyms: [] }),
    'GET /api/catalog/allergens': () =>
      Response.json({
        allergens: [
          { id: 'al-milk', name: 'Milk' },
          { id: 'al-peanuts', name: 'Peanuts' },
        ],
      }),
    'PUT /api/catalog/family-ingredients/kombucha/allergens': () =>
      Response.json({
        id: 'kombucha',
        allergensChecked: true,
        allergenIds: ['al-peanuts'],
      }),
    'PUT /api/catalog/family-ingredients/nutella/allergens': () =>
      Response.json({
        id: 'nutella',
        allergensChecked: true,
        allergenIds: [],
      }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const kombucha = ingredient('kombucha', 'Kombucha', {
  allergensChecked: false,
  allergenIds: [],
});
const nutella = ingredient('nutella', 'Nutella', {
  allergensChecked: true,
  allergenIds: ['al-milk'],
});
const rice = ingredient('rice', 'Rice', {
  allergensChecked: true,
  allergenIds: [],
});

const rowOf = (name: string) => screen.getByRole('group', { name });

/** Focus the row and press Enter: the keyboard path to the edit sheet. */
async function openSheet(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  const row = await screen.findByRole('group', { name });
  act(() => row.focus());
  await user.keyboard('{Enter}');
  return screen.findByRole('dialog');
}

describe('Family catalog: Allergens', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tags each row, and counts the Unchecked ones in a status line', async () => {
    stub([kombucha, nutella, rice]);
    renderWithProviders(<FamilyCatalogSection />);

    await screen.findByRole('group', { name: 'Kombucha' });
    expect(
      within(rowOf('Kombucha')).getByText('Check allergens'),
    ).toBeVisible();
    expect(within(rowOf('Nutella')).getByText('Milk')).toBeVisible();
    // None: no tag at all.
    expect(rowOf('Rice')).not.toHaveTextContent(/allergens|Milk/);
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 ingredient is not checked for allergens. Tap one to tag it.',
    );
  });

  it('shows the first allergen and how many more, reading all out to screen readers', async () => {
    const mayo = ingredient('mayo', 'Mayo', {
      allergensChecked: true,
      allergenIds: ['al-milk', 'al-peanuts'],
    });
    stub([mayo]);
    renderWithProviders(<FamilyCatalogSection />);

    const tag = await screen.findByText('Milk +1');
    expect(tag).toHaveAttribute('aria-hidden', 'true');
    // The full read-out is real text for screen readers, not a title.
    expect(screen.getByText('Contains Milk and Peanuts')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('tags an Unchecked Ingredient, sending nothing before Save', async () => {
    const calls = stub([kombucha]);
    renderWithProviders(<FamilyCatalogSection />);
    const user = userEvent.setup();

    const dialog = await openSheet(user, 'Kombucha');
    expect(
      within(dialog).getByText(
        'Not checked yet. Pick what it contains, or None.',
      ),
    ).toBeVisible();
    const save = within(dialog).getByRole('button', { name: 'Save' });
    // Nothing picked, nothing to save.
    expect(save).toBeDisabled();
    await user.click(
      await within(dialog).findByRole('button', { name: 'Peanuts' }),
    );
    expect(calls.filter((c) => c.key.startsWith('PUT'))).toEqual([]);
    await user.click(save);

    await waitFor(() =>
      expect(
        calls.find(
          (c) =>
            c.key === 'PUT /api/catalog/family-ingredients/kombucha/allergens',
        )?.body,
      ).toEqual({ allergenIds: ['al-peanuts'] }),
    );
    // Allergens alone: no PATCH.
    expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);
  });

  it('re-tags a tagged Ingredient as containing none', async () => {
    const calls = stub([nutella]);
    renderWithProviders(<FamilyCatalogSection />);
    const user = userEvent.setup();

    const dialog = await openSheet(user, 'Nutella');
    expect(
      within(dialog).getByText('Saved as checked for allergens.'),
    ).toBeVisible();
    expect(
      await within(dialog).findByRole('button', { name: 'Milk' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'None' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(
        calls.find(
          (c) =>
            c.key === 'PUT /api/catalog/family-ingredients/nutella/allergens',
        )?.body,
      ).toEqual({ allergenIds: [] }),
    );
  });

  it('never goes back to Unchecked: unticking the last tag leaves None', async () => {
    stub([nutella]);
    renderWithProviders(<FamilyCatalogSection />);
    const user = userEvent.setup();

    const dialog = await openSheet(user, 'Nutella');
    await user.click(
      await within(dialog).findByRole('button', { name: 'Milk' }),
    );

    expect(
      within(dialog).getByRole('button', { name: 'None' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a retired tag by name and lets it be unticked, never offering it as new', async () => {
    const eggs = { id: 'al-eggs', name: 'Eggs' };
    const mayo = ingredient('mayo', 'Mayo', {
      allergensChecked: true,
      allergenIds: ['al-eggs', 'al-milk'],
      retired: [eggs],
    });
    stub([mayo]);
    renderWithProviders(<FamilyCatalogSection />);
    const user = userEvent.setup();

    expect(await screen.findByText('Eggs +1')).toBeInTheDocument();
    expect(screen.getByText('Contains Eggs and Milk')).toBeInTheDocument();
    const dialog = await openSheet(user, 'Mayo');
    const chip = await within(dialog).findByRole('button', { name: 'Eggs' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await user.click(chip);
    expect(
      within(dialog).queryByRole('button', { name: 'Eggs' }),
    ).not.toBeInTheDocument();
  });

  it('refreshes every Recipe screen after tagging', async () => {
    stub([kombucha]);
    const { queryClient } = renderWithProviders(<FamilyCatalogSection />);
    const user = userEvent.setup();
    const detailKey = ['recipes', 'detail', 'r1'];
    queryClient.setQueryData(detailKey, { id: 'r1' });

    const dialog = await openSheet(user, 'Kombucha');
    await user.click(
      await within(dialog).findByRole('button', { name: 'Peanuts' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true),
    );
  });
});
