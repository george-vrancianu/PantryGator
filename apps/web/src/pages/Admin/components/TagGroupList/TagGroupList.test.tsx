import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminTagGroup } from '@/lib/admin';
import { renderWithProviders, stubApi } from '@/test/render';
import { TagGroupList } from './TagGroupList';

const groups: AdminTagGroup[] = [
  {
    id: 'g1',
    name: 'Meal',
    position: 1,
    translations: [{ id: 't1', locale: 'ro', kind: 'name', value: 'Masă' }],
  },
  { id: 'g2', name: 'Diet', position: 2, translations: [] },
  { id: 'g3', name: 'Cuisine', position: 3, translations: [] },
];

function stub() {
  const api = stubApi({
    'PUT /api/admin/catalog/tag-groups/order': () => Response.json([]),
  });
  vi.stubGlobal('fetch', api.fetchMock);
  return api.calls;
}

describe('TagGroupList', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the Tag Groups in order, in the current language', () => {
    stub();
    renderWithProviders(
      <TagGroupList groups={groups} onCreate={vi.fn()} onEdit={vi.fn()} />,
      { locale: 'ro' },
    );
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Masă');
    expect(items[1]).toHaveTextContent('Diet');
  });

  it('moves a Tag Group down, sending every id', async () => {
    const calls = stub();
    renderWithProviders(
      <TagGroupList groups={groups} onCreate={vi.fn()} onEdit={vi.fn()} />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Move Meal down' }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      key: 'PUT /api/admin/catalog/tag-groups/order',
      body: { ids: ['g2', 'g1', 'g3'] },
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Meal is now number 2 of 3.',
    );
  });

  it('opens the editor and the create form', async () => {
    stub();
    const onEdit = vi.fn();
    const onCreate = vi.fn();
    renderWithProviders(
      <TagGroupList groups={groups} onCreate={onCreate} onEdit={onEdit} />,
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: 'Edit Tag Group Diet' }),
    );
    expect(onEdit).toHaveBeenCalledWith('g2');
    await user.click(screen.getByRole('button', { name: 'New Tag Group' }));
    expect(onCreate).toHaveBeenCalled();
  });
});
