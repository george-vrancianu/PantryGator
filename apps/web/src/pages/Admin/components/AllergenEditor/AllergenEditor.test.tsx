import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminAllergen } from '@/lib/admin';
import { renderWithProviders, stubApi } from '@/test/render';
import { AllergenEditor } from './AllergenEditor';

const lupin: AdminAllergen = {
  id: 'al1',
  name: 'Lupin',
  sortOrder: 13,
  archived: false,
  translations: [],
};

describe('AllergenEditor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds an Allergen by name, with no Delete', async () => {
    const { fetchMock, calls } = stubApi({
      'POST /api/admin/catalog/allergens': () =>
        Response.json({ id: 'new' }, { status: 201 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    renderWithProviders(<AllergenEditor onDone={onDone} />);
    const user = userEvent.setup();

    expect(screen.getByRole('heading', { name: 'New Allergen' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    await user.type(screen.getByLabelText(/Name \(English\)/), ' Kiwi ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls[0]).toMatchObject({
      key: 'POST /api/admin/catalog/allergens',
      body: { name: 'Kiwi' },
    });
  });

  it('renames an Allergen', async () => {
    const { fetchMock, calls } = stubApi({
      'PATCH /api/admin/catalog/allergens/al1': () => Response.json(lupin),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    renderWithProviders(<AllergenEditor allergen={lupin} onDone={onDone} />);
    const user = userEvent.setup();

    const field = screen.getByLabelText(/Name \(English\)/);
    await user.clear(field);
    await user.type(field, 'Lupine');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls[0].body).toEqual({ name: 'Lupine' });
  });

  it('translates the name in each locale, without Synonyms', async () => {
    const { fetchMock, calls } = stubApi({
      'POST /api/admin/catalog/translations': () =>
        Response.json({}, { status: 201 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<AllergenEditor allergen={lupin} onDone={vi.fn()} />);
    const user = userEvent.setup();

    expect(screen.queryByText(/Synonym/)).toBeNull();
    await user.type(screen.getByLabelText('Name (Danish)'), 'Lupin (da)');
    await user.click(screen.getByRole('button', { name: 'Save Danish name' }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({
      entityType: 'allergen',
      entityId: 'al1',
      locale: 'da',
      kind: 'name',
      value: 'Lupin (da)',
    });
  });

  it('retires an Allergen and brings it back, never deleting it', async () => {
    const { fetchMock, calls } = stubApi({
      'POST /api/admin/catalog/allergens/al1/archive': () => Response.json({}),
      'POST /api/admin/catalog/allergens/al1/unarchive': () =>
        Response.json({}),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    const { unmount } = renderWithProviders(
      <AllergenEditor allergen={lupin} onDone={onDone} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Retire' }));
    await vi.waitFor(() =>
      expect(calls.map((c) => c.key)).toEqual([
        'POST /api/admin/catalog/allergens/al1/archive',
      ]),
    );
    unmount();

    renderWithProviders(
      <AllergenEditor
        allergen={{ ...lupin, archived: true }}
        onDone={onDone}
      />,
    );
    expect(screen.getByText(/This Allergen is retired/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Bring back' }));
    await vi.waitFor(() =>
      expect(calls.map((c) => c.key)).toContain(
        'POST /api/admin/catalog/allergens/al1/unarchive',
      ),
    );
  });
});
