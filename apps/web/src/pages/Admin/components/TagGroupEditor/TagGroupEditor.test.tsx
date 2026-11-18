import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { TagGroupEditor } from './TagGroupEditor';

describe('TagGroupEditor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a Tag Group by name', async () => {
    const { fetchMock, calls } = stubApi({
      'POST /api/admin/catalog/tag-groups': () =>
        Response.json({ id: 'new' }, { status: 201 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    renderWithProviders(<TagGroupEditor onDone={onDone} />);
    const user = userEvent.setup();

    expect(
      screen.getByRole('heading', { name: 'New Tag Group' }),
    ).toHaveFocus();
    await user.type(screen.getByLabelText(/Name \(English\)/), ' Season ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls[0]).toMatchObject({
      key: 'POST /api/admin/catalog/tag-groups',
      body: { name: 'Season' },
    });
  });

  it('translates a Tag Group without Synonyms', async () => {
    const { fetchMock, calls } = stubApi({
      'POST /api/admin/catalog/translations': () =>
        Response.json({}, { status: 201 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <TagGroupEditor
        group={{ id: 'g1', name: 'Season', position: 1, translations: [] }}
        onDone={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    expect(screen.queryByText(/Synonym/)).toBeNull();
    await user.type(screen.getByLabelText('Name (Danish)'), 'Sæson');
    await user.click(screen.getByRole('button', { name: 'Save Danish name' }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({
      entityType: 'tag_group',
      entityId: 'g1',
      locale: 'da',
      kind: 'name',
      value: 'Sæson',
    });
  });

  it('explains why a Tag Group with Catalog Tags cannot be deleted', async () => {
    const { fetchMock } = stubApi({
      'DELETE /api/admin/catalog/tag-groups/g1': () =>
        Response.json(
          { code: 'catalog.tag_group_not_empty', params: {} },
          { status: 409 },
        ),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <TagGroupEditor
        group={{ id: 'g1', name: 'Season', position: 1, translations: [] }}
        onDone={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /still has Catalog Tags/,
    );
  });
});
