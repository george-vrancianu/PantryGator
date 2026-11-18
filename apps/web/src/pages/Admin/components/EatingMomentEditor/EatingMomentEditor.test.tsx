import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminEatingMoment } from '@/lib/admin';
import { renderWithProviders, stubApi } from '@/test/render';
import { EatingMomentEditor } from './EatingMomentEditor';

const lunch: AdminEatingMoment = {
  id: 'e3',
  name: 'Lunch',
  sortOrder: 3,
  archived: false,
  translations: [],
};

describe('EatingMomentEditor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates an Eating Moment by name, with no Delete', async () => {
    const { fetchMock, calls } = stubApi({
      'POST /api/admin/catalog/eating-moments': () =>
        Response.json({ id: 'new' }, { status: 201 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    renderWithProviders(<EatingMomentEditor onDone={onDone} />);
    const user = userEvent.setup();

    expect(
      screen.getByRole('heading', { name: 'New Eating Moment' }),
    ).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    await user.type(screen.getByLabelText(/Name \(English\)/), ' Dinner ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls[0]).toMatchObject({
      key: 'POST /api/admin/catalog/eating-moments',
      body: { name: 'Dinner' },
    });
  });

  it('renames an Eating Moment', async () => {
    const { fetchMock, calls } = stubApi({
      'PATCH /api/admin/catalog/eating-moments/e3': () => Response.json(lunch),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    renderWithProviders(<EatingMomentEditor moment={lunch} onDone={onDone} />);
    const user = userEvent.setup();

    const field = screen.getByLabelText(/Name \(English\)/);
    await user.clear(field);
    await user.type(field, 'Midday meal');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls[0].body).toEqual({ name: 'Midday meal' });
  });

  it('translates the name without Synonyms', async () => {
    const { fetchMock, calls } = stubApi({
      'POST /api/admin/catalog/translations': () =>
        Response.json({}, { status: 201 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<EatingMomentEditor moment={lunch} onDone={vi.fn()} />);
    const user = userEvent.setup();

    expect(screen.queryByText(/Synonym/)).toBeNull();
    await user.type(screen.getByLabelText('Name (Romanian)'), 'Prânz');
    await user.click(
      screen.getByRole('button', { name: 'Save Romanian name' }),
    );
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({
      entityType: 'eating_moment',
      entityId: 'e3',
      locale: 'ro',
      kind: 'name',
      value: 'Prânz',
    });
  });

  it('archives and unarchives', async () => {
    const { fetchMock, calls } = stubApi({
      'POST /api/admin/catalog/eating-moments/e3/archive': () =>
        Response.json({}),
      'POST /api/admin/catalog/eating-moments/e3/unarchive': () =>
        Response.json({}),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    renderWithProviders(<EatingMomentEditor moment={lunch} onDone={onDone} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    await vi.waitFor(() =>
      expect(calls.map((c) => c.key)).toContain(
        'POST /api/admin/catalog/eating-moments/e3/archive',
      ),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it('offers Unarchive for an archived moment', async () => {
    const { fetchMock, calls } = stubApi({
      'POST /api/admin/catalog/eating-moments/e3/unarchive': () =>
        Response.json({}),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <EatingMomentEditor
        moment={{ ...lunch, archived: true }}
        onDone={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    expect(screen.getByText(/archived/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unarchive' }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
  });
});
