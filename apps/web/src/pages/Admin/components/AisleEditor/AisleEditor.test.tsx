import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminAisle } from '@/lib/admin';
import { renderWithProviders, stubApi } from '@/test/render';
import { AisleEditor } from './AisleEditor';

const bakery: AdminAisle = {
  id: 'a2',
  name: 'Bakery',
  sortOrder: 2,
  translations: [
    { id: 't1', locale: 'en', kind: 'name', value: 'Bakery' },
    { id: 't2', locale: 'ro', kind: 'name', value: 'Panificație' },
  ],
};

describe('AisleEditor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates an Aisle by name', async () => {
    const { fetchMock, calls } = stubApi({
      'POST /api/admin/catalog/aisles': () =>
        Response.json({ id: 'new' }, { status: 201 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    renderWithProviders(<AisleEditor onDone={onDone} />);
    const user = userEvent.setup();

    expect(screen.getByRole('heading', { name: 'New Aisle' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    await user.type(screen.getByLabelText(/Name \(English\)/), '  Frozen  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls[0]).toMatchObject({
      key: 'POST /api/admin/catalog/aisles',
      body: { name: 'Frozen' },
    });
  });

  it('renames an Aisle and edits its translations', async () => {
    const { fetchMock, calls } = stubApi({
      'PATCH /api/admin/catalog/aisles/a2': () => Response.json(bakery),
      'PATCH /api/admin/catalog/translations/t2': () => Response.json({}),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    renderWithProviders(<AisleEditor aisle={bakery} onDone={onDone} />);
    const user = userEvent.setup();

    const romanian = screen.getByLabelText('Name (Romanian)');
    await user.clear(romanian);
    await user.type(romanian, 'Brutărie');
    await user.click(
      screen.getByRole('button', { name: 'Save Romanian name' }),
    );
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      key: 'PATCH /api/admin/catalog/translations/t2',
      body: { value: 'Brutărie' },
    });

    const name = screen.getByLabelText(/Name \(English\)/);
    await user.clear(name);
    await user.type(name, 'Bread');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls[1]).toMatchObject({
      key: 'PATCH /api/admin/catalog/aisles/a2',
      body: { name: 'Bread' },
    });
  });

  it('explains why an Aisle in use cannot be deleted', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        'DELETE /api/admin/catalog/aisles/a2': () =>
          Response.json(
            { code: 'catalog.aisle_in_use', params: { parents: 2 } },
            { status: 409 },
          ),
      }).fetchMock,
    );
    const onDone = vi.fn();
    renderWithProviders(<AisleEditor aisle={bakery} onDone={onDone} />, {
      locale: 'da',
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Slet' }));
    await user.click(screen.getByRole('button', { name: 'Bekræft' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /overkategorier/i,
    );
    expect(onDone).not.toHaveBeenCalled();
  });
});
