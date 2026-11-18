import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminAisle } from '@/lib/admin';
import { renderWithProviders, stubApi } from '@/test/render';
import { AisleList } from './AisleList';

const aisles: AdminAisle[] = [
  {
    id: 'a1',
    name: 'Fruit & veg',
    sortOrder: 1,
    translations: [
      { id: 't1', locale: 'ro', kind: 'name', value: 'Legume și fructe' },
    ],
  },
  { id: 'a2', name: 'Bakery', sortOrder: 2, translations: [] },
  { id: 'a3', name: 'Dairy & eggs', sortOrder: 3, translations: [] },
];

function stub() {
  const api = stubApi({
    'PUT /api/admin/catalog/aisles/order': () => Response.json([]),
  });
  vi.stubGlobal('fetch', api.fetchMock);
  return api.calls;
}

describe('AisleList', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the Aisles in shop order, in the current language', () => {
    stub();
    renderWithProviders(
      <AisleList aisles={aisles} onCreate={vi.fn()} onEdit={vi.fn()} />,
      { locale: 'ro' },
    );
    const list = screen.getByRole('list', { name: /Raioane/ });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('Legume și fructe'),
      expect.stringContaining('Bakery'),
      expect.stringContaining('Dairy & eggs'),
    ]);
  });

  it('moves an Aisle up or down with buttons, sending the whole new order', async () => {
    const calls = stub();
    renderWithProviders(
      <AisleList aisles={aisles} onCreate={vi.fn()} onEdit={vi.fn()} />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Move Bakery up' }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      key: 'PUT /api/admin/catalog/aisles/order',
      body: { ids: ['a2', 'a1', 'a3'] },
    });

    await user.click(
      screen.getByRole('button', { name: 'Move Fruit & veg down' }),
    );
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].body).toEqual({ ids: ['a2', 'a1', 'a3'] });
  });

  it('works from the keyboard, and keeps the ends focusable but inert', async () => {
    const calls = stub();
    renderWithProviders(
      <AisleList aisles={aisles} onCreate={vi.fn()} onEdit={vi.fn()} />,
    );
    const user = userEvent.setup();

    const firstUp = screen.getByRole('button', { name: 'Move Fruit & veg up' });
    const lastDown = screen.getByRole('button', {
      name: 'Move Dairy & eggs down',
    });
    expect(firstUp).toHaveAttribute('aria-disabled', 'true');
    expect(lastDown).toHaveAttribute('aria-disabled', 'true');
    await user.click(firstUp);
    await user.click(lastDown);
    expect(calls).toEqual([]);

    screen.getByRole('button', { name: 'Move Dairy & eggs up' }).focus();
    await user.keyboard('{Enter}');
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ ids: ['a1', 'a3', 'a2'] });
  });

  it('opens an Aisle to edit and offers a new one', async () => {
    stub();
    const onCreate = vi.fn();
    const onEdit = vi.fn();
    renderWithProviders(
      <AisleList aisles={aisles} onCreate={onCreate} onEdit={onEdit} />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit Aisle Bakery' }));
    expect(onEdit).toHaveBeenCalledWith('a2');
    await user.click(screen.getByRole('button', { name: 'New Aisle' }));
    expect(onCreate).toHaveBeenCalled();
  });

  it('shows a translated error when the order is out of date', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        'PUT /api/admin/catalog/aisles/order': () =>
          Response.json(
            { code: 'catalog.aisle_order_stale', params: {} },
            { status: 409 },
          ),
      }).fetchMock,
    );
    renderWithProviders(
      <AisleList aisles={aisles} onCreate={vi.fn()} onEdit={vi.fn()} />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Move Bakery up' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Aisles changed/,
    );
  });
});
