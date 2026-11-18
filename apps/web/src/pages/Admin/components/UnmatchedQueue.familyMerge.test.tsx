import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminCatalog } from '../../../lib/admin';
import { renderWithProviders, stubApi } from '../../../test/render';
import { expectFocusInDialog, resultNotice } from './reviewTestUtils';
import { UnmatchedQueue } from './UnmatchedQueue';

// Spec: #276, ADR 0011. Merge sits on
// each row of the Family ingredients queue; "Synonym candidates" is a third
// kind in the same switch.
const catalog: AdminCatalog = {
  aisles: [],
  tagGroups: [],
  tags: [],
  allergens: [],
  eatingMoments: [],
  parentCategories: [],
  leafCategories: [],
  ingredients: [],
};

const leaf = { id: 'l1', name: 'Other' };
const group = {
  normalizedName: 'kombucha',
  name: 'Kombucha',
  leafCategory: leaf,
  familyCount: 3,
  locale: 'en',
  copies: [
    {
      id: 'c1',
      name: 'Kombucha',
      locale: 'en',
      defaultUnit: 'ml',
      leafCategory: leaf,
    },
    {
      id: 'c2',
      name: 'KOMBUCHA',
      locale: 'en',
      defaultUnit: 'ml',
      leafCategory: leaf,
    },
  ],
};
const other = {
  ...group,
  normalizedName: 'tempeh',
  name: 'Tempeh',
  familyCount: 1,
};

const candidate = {
  normalizedName: 'cilantro',
  name: 'Cilantro',
  ingredient: { id: 'i9', name: 'Coriander' },
  familyCount: 4,
};
const candidate2 = {
  normalizedName: 'rocket',
  name: 'Rocket',
  ingredient: { id: 'i8', name: 'Arugula' },
  familyCount: 1,
};

const kombuchaResult = {
  id: 'i1',
  name: 'Kombucha drink',
  defaultUnit: 'ml',
  leafCategory: { id: 'l9', name: 'Soft drinks' },
  parentCategory: {
    id: 'p9',
    name: 'Drinks',
    aisle: { id: 'a9', name: 'Drinks' },
  },
  defaults: { expiryDays: null, location: null },
};

function stub(routes: Parameters<typeof stubApi>[0] = {}) {
  const api = stubApi({
    'GET /api/admin/unmatched': () =>
      Response.json({ entries: [], nextCursor: null }),
    'GET /api/admin/family-ingredients': () =>
      Response.json({ groups: [group, other], nextCursor: null }),
    'GET /api/admin/family-synonyms': () =>
      Response.json({ candidates: [candidate, candidate2], nextCursor: null }),
    'GET /api/catalog/search': () =>
      Response.json({ results: [kombuchaResult] }),
    ...routes,
  });
  vi.stubGlobal('fetch', api.fetchMock);
  return api.calls;
}

async function open(user: ReturnType<typeof userEvent.setup>, kind: string) {
  renderWithProviders(<UnmatchedQueue catalog={catalog} />);
  await user.click(await screen.findByRole('button', { name: kind }));
}

/** Opens the Kombucha group's sheet and goes on to the merge picker. */
async function openMerge(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Kombucha/ }));
  await user.click(screen.getByRole('button', { name: 'Merge into…' }));
}

async function pickShared(user: ReturnType<typeof userEvent.setup>) {
  await openMerge(user);
  await user.type(
    screen.getByRole('combobox', { name: 'Search ingredients' }),
    'komb',
  );
  await user.click(
    await screen.findByRole('option', { name: /Kombucha drink/ }),
  );
}

describe('UnmatchedQueue: merge a Family ingredient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('puts Merge into… next to Promote to Catalog in every group sheet', async () => {
    stub();
    const user = userEvent.setup();
    await open(user, 'Family');

    await user.click(await screen.findByRole('button', { name: /^Kombucha/ }));

    expect(screen.getByRole('button', { name: 'Merge into…' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Promote to Catalog' }),
    ).toBeVisible();
  });

  it('opens a shared-catalog picker with Merge disabled until an ingredient is picked', async () => {
    const calls = stub();
    const user = userEvent.setup();
    await open(user, 'Family');

    await openMerge(user);

    expect(
      screen.getByRole('heading', { name: 'Merge Kombucha' }),
    ).toBeVisible();
    await expectFocusInDialog('Merge Kombucha');
    expect(screen.getByRole('button', { name: 'Merge' })).toBeDisabled();
    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'komb',
    );
    await user.click(
      await screen.findByRole('option', { name: /Kombucha drink/ }),
    );
    expect(screen.getByRole('button', { name: 'Merge' })).toBeEnabled();
    // Only shared ingredients can be the target.
    const searches = calls.filter((c) => c.key === 'GET /api/catalog/search');
    expect(searches.length).toBeGreaterThan(0);
    expect(searches.every((s) => s.search.includes('scope=shared'))).toBe(true);
  });

  it('merges the whole group into the picked ingredient, announces it and drops the group', async () => {
    let merged = false;
    const calls = stub({
      'GET /api/admin/family-ingredients': () =>
        Response.json({
          groups: merged ? [other] : [group, other],
          nextCursor: null,
        }),
      'POST /api/admin/family-ingredients/merge': () => {
        merged = true;
        return Response.json({
          targetIngredientId: 'i1',
          mergedIngredientIds: ['c1', 'c2'],
        });
      },
    });
    const user = userEvent.setup();
    await open(user, 'Family');
    await pickShared(user);

    await user.click(screen.getByRole('button', { name: 'Merge' }));

    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/admin/family-ingredients/merge')
          ?.body,
      ).toEqual({ ingredientId: 'c1', targetIngredientId: 'i1' }),
    );
    expect(
      await resultNotice(/Merged Kombucha into Kombucha drink/),
    ).toBeVisible();
    expect(await screen.findByText('Tempeh')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Kombucha/ })).toBeNull();
  });

  it('goes back to the list on Close with focus on the row, without merging', async () => {
    const calls = stub();
    const user = userEvent.setup();
    await open(user, 'Family');

    await openMerge(user);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(
      await screen.findByRole('button', { name: /^Kombucha/ }),
    ).toHaveFocus();
    expect(calls.map((c) => c.key)).not.toContain(
      'POST /api/admin/family-ingredients/merge',
    );
  });

  it('shows an Alert and keeps the picker when the merge fails', async () => {
    stub({
      'POST /api/admin/family-ingredients/merge': () =>
        Response.json(
          { code: 'family_ingredients.target_not_found', params: {} },
          { status: 404 },
        ),
    });
    const user = userEvent.setup();
    await open(user, 'Family');
    await pickShared(user);

    await user.click(screen.getByRole('button', { name: 'Merge' }));

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Merge Kombucha' }),
    ).toBeVisible();
  });
});

describe('UnmatchedQueue: Synonym candidates', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a third kind that asks for the candidates up front, for its count, and lists name, Ingredient and Family count', async () => {
    const calls = stub({
      'GET /api/admin/family-synonyms': () =>
        Response.json({
          candidates: [candidate, candidate2],
          nextCursor: null,
          total: 2,
        }),
    });
    renderWithProviders(<UnmatchedQueue catalog={catalog} />);
    expect(
      await screen.findByRole('button', { name: 'Names, 2' }),
    ).toBeVisible();
    expect(calls.map((c) => c.key)).toContain('GET /api/admin/family-synonyms');

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /^Names/ }));

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('“Cilantro” → Coriander')).toBeVisible();
    expect(within(items[0]).getByText(/4 families/)).toBeVisible();
    expect(within(items[1]).getByText(/1 family/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Dismissed' })).toBeNull();
  });

  it('shows an empty state', async () => {
    stub({
      'GET /api/admin/family-synonyms': () =>
        Response.json({ candidates: [], nextCursor: null }),
    });
    await open(userEvent.setup(), 'Names');

    expect(
      await screen.findByText('No Synonym candidates to review.'),
    ).toBeVisible();
  });

  it('offers English, Romanian and Danish and adds the candidate in the chosen locale', async () => {
    let added = false;
    const calls = stub({
      'GET /api/admin/family-synonyms': () =>
        Response.json({
          candidates: added ? [candidate2] : [candidate, candidate2],
          nextCursor: null,
        }),
      'POST /api/admin/family-synonyms/promote': () => {
        added = true;
        return Response.json(
          { ingredientId: 'i9', name: 'Cilantro', locale: 'ro' },
          { status: 201 },
        );
      },
    });
    const user = userEvent.setup();
    await open(user, 'Names');

    await user.click(
      await screen.findByRole('button', { name: /^“Cilantro” → Coriander/ }),
    );

    expect(
      screen.getByRole('heading', { name: 'Add Cilantro as a shared synonym' }),
    ).toBeVisible();
    await expectFocusInDialog('Add Cilantro as a shared synonym');
    const picker = screen.getByLabelText('Synonym language');
    expect(
      within(picker)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['English', 'Romanian', 'Danish']);
    await user.selectOptions(picker, 'ro');
    await user.click(
      screen.getByRole('button', { name: 'Add as shared synonym' }),
    );

    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/admin/family-synonyms/promote')
          ?.body,
      ).toEqual({
        normalizedName: 'cilantro',
        ingredientId: 'i9',
        locale: 'ro',
      }),
    );
    expect(
      await resultNotice(/Added Cilantro as a shared synonym of Coriander/),
    ).toBeVisible();
    expect(await screen.findByText('“Rocket” → Arugula')).toBeVisible();
    expect(screen.queryByText('“Cilantro” → Coriander')).toBeNull();
  });

  it('defaults to English and goes back on Close without adding anything', async () => {
    const calls = stub();
    const user = userEvent.setup();
    await open(user, 'Names');

    await user.click(
      await screen.findByRole('button', { name: /^“Cilantro” → Coriander/ }),
    );
    expect(screen.getByLabelText('Synonym language')).toHaveValue('en');
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(
      await screen.findByRole('button', { name: /^“Cilantro” → Coriander/ }),
    ).toHaveFocus();
    expect(calls.map((c) => c.key)).not.toContain(
      'POST /api/admin/family-synonyms/promote',
    );
  });

  it('explains a name another ingredient already owns and keeps the form open', async () => {
    stub({
      'POST /api/admin/family-synonyms/promote': () =>
        Response.json(
          {
            code: 'family_synonyms.shared_name_exists',
            params: { ingredientId: 'i2' },
          },
          { status: 409 },
        ),
    });
    const user = userEvent.setup();
    await open(user, 'Names');

    await user.click(
      await screen.findByRole('button', { name: /^“Cilantro” → Coriander/ }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Add as shared synonym' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /already.*another ingredient/i,
    );
    expect(
      screen.getByRole('heading', { name: 'Add Cilantro as a shared synonym' }),
    ).toBeVisible();
  });
});
