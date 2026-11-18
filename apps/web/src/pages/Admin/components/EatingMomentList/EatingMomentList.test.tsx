import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminEatingMoment } from '@/lib/admin';
import { renderWithProviders, stubApi } from '@/test/render';
import { EatingMomentList } from './EatingMomentList';

const moments: AdminEatingMoment[] = [
  {
    id: 'e1',
    name: 'Breakfast',
    sortOrder: 1,
    archived: false,
    translations: [
      { id: 't1', locale: 'ro', kind: 'name', value: 'Mic dejun' },
    ],
  },
  {
    id: 'e2',
    name: 'Before bed',
    sortOrder: 2,
    archived: true,
    translations: [],
  },
  { id: 'e3', name: 'Lunch', sortOrder: 3, archived: false, translations: [] },
];

function stub() {
  const api = stubApi({
    'PUT /api/admin/catalog/eating-moments/order': () => Response.json([]),
  });
  vi.stubGlobal('fetch', api.fetchMock);
  return api.calls;
}

describe('EatingMomentList', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the Eating Moments in order, in the current language, marking archived ones', () => {
    stub();
    renderWithProviders(
      <EatingMomentList
        moments={moments}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
      />,
      { locale: 'ro' },
    );
    const list = screen.getByRole('list', { name: /Momente/ });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Mic dejun');
    expect(items[1]).toHaveTextContent('Before bed');
    expect(items[1]).toHaveTextContent(/arhivat/i);
  });

  it('moves a moment with buttons, sending every id including archived ones', async () => {
    const calls = stub();
    renderWithProviders(
      <EatingMomentList
        moments={moments}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Move Lunch up' }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      key: 'PUT /api/admin/catalog/eating-moments/order',
      body: { ids: ['e1', 'e3', 'e2'] },
    });
    expect(
      screen.getByRole('button', { name: 'Move Breakfast up' }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('says so when there are no Eating Moments yet', () => {
    stub();
    renderWithProviders(
      <EatingMomentList moments={[]} onCreate={vi.fn()} onEdit={vi.fn()} />,
    );
    expect(screen.getByText('No Eating Moments yet.')).toBeInTheDocument();
  });

  it('opens a moment to edit and offers a new one', async () => {
    stub();
    const onCreate = vi.fn();
    const onEdit = vi.fn();
    renderWithProviders(
      <EatingMomentList
        moments={moments}
        onCreate={onCreate}
        onEdit={onEdit}
      />,
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: 'Edit Eating Moment Lunch' }),
    );
    expect(onEdit).toHaveBeenCalledWith('e3');
    await user.click(screen.getByRole('button', { name: 'New Eating Moment' }));
    expect(onCreate).toHaveBeenCalled();
  });

  it('shows a translated error when the order is out of date', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        'PUT /api/admin/catalog/eating-moments/order': () =>
          Response.json(
            { code: 'catalog.eating_moment_order_stale', params: {} },
            { status: 409 },
          ),
      }).fetchMock,
    );
    renderWithProviders(
      <EatingMomentList
        moments={moments}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Move Lunch up' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Eating Moments changed/,
    );
  });
});
