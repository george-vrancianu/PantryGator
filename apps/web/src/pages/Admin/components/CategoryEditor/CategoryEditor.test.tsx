import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminCatalog } from '@/lib/admin';
import { renderWithProviders, stubApi } from '@/test/render';
import { CategoryEditor } from './CategoryEditor';

const catalog: AdminCatalog = {
  aisles: [{ id: 'a1', name: 'Dairy & eggs', sortOrder: 1, translations: [] }],
  tagGroups: [],
  tags: [],
  allergens: [],
  eatingMoments: [],
  parentCategories: [],
  leafCategories: [],
  ingredients: [],
};

describe('CategoryEditor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses a non-whole Default Expiry instead of silently clearing it', async () => {
    const { fetchMock, calls } = stubApi({
      'POST /api/admin/catalog/parent-categories': () =>
        Response.json({}, { status: 201 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <CategoryEditor kind="parent" catalog={catalog} onDone={vi.fn()} />,
    );
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Name \(English\)/), 'Sauces');
    await user.type(screen.getByLabelText('Default Expiry (days)'), '1.5');

    expect(screen.getByText(/whole number of days/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(calls).toEqual([]);

    await user.clear(screen.getByLabelText('Default Expiry (days)'));
    await user.type(screen.getByLabelText('Default Expiry (days)'), '14');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({
      name: 'Sauces',
      aisleId: 'a1',
      defaultExpiryDays: 14,
      defaultLocation: null,
    });
  });

  it('asks before deleting, keeps focus on the prompt, and can be cancelled', async () => {
    const { fetchMock, calls } = stubApi({
      'DELETE /api/admin/catalog/parent-categories/p2': () =>
        new Response(null, { status: 204 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    renderWithProviders(
      <CategoryEditor
        kind="parent"
        category={{
          id: 'p2',
          name: 'Sauces',
          aisleId: 'a1',
          defaultExpiryDays: null,
          defaultLocation: null,
          translations: [],
        }}
        catalog={catalog}
        onDone={onDone}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm).toHaveFocus();
    // The prompt's own Cancel, not the form's.
    await user.click(
      within(confirm.parentElement!).getByRole('button', { name: 'Cancel' }),
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
    expect(calls).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls.map((c) => c.key)).toEqual([
      'DELETE /api/admin/catalog/parent-categories/p2',
    ]);
  });

  it('does not offer to delete or move the Other Leaf Category', () => {
    const other = {
      id: 'l9',
      name: 'Other dairy',
      parentId: 'p1',
      isOther: true,
      defaultExpiryDays: null,
      defaultLocation: null,
      translations: [],
    } as const;
    vi.stubGlobal('fetch', stubApi({}).fetchMock);
    renderWithProviders(
      <CategoryEditor
        kind="leaf"
        category={{ ...other, translations: [] }}
        catalog={{
          ...catalog,
          parentCategories: [
            {
              id: 'p1',
              name: 'Dairy',
              aisleId: 'a1',
              defaultExpiryDays: 10,
              defaultLocation: 'fridge',
              translations: [],
            },
          ],
          leafCategories: [{ ...other, translations: [] }],
        }}
        onDone={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.getByLabelText('Parent Category')).toBeDisabled();
    expect(screen.getByText(/cannot be moved or deleted/)).toBeVisible();
  });

  it('does not offer to delete the top-level Other Parent Category', () => {
    vi.stubGlobal('fetch', stubApi({}).fetchMock);
    renderWithProviders(
      <CategoryEditor
        kind="parent"
        category={{
          id: '06aa911a-270a-58da-9f4c-b4438a117a41',
          name: 'Other',
          aisleId: 'a1',
          defaultExpiryDays: null,
          defaultLocation: null,
          translations: [],
        }}
        catalog={catalog}
        onDone={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});
