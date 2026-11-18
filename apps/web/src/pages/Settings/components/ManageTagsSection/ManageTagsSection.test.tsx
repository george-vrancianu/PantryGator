import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { ManageTagsSection } from './ManageTagsSection';

type Tag = { id: string; name: string; recipeCount: number };

/** A stateful stand-in for the API: the list the Family sees, changed by the calls. */
function stubTags(initial: Tag[]) {
  let current = initial;
  const deleted = {
    tag: { id: 'roast', name: 'Sunday roast' },
    recipeIds: ['r1', 'r2'],
    recipeCount: 2,
  };
  const { fetchMock, calls } = stubApi({
    'GET /api/recipes/tags/family': () => Response.json(current),
    'DELETE /api/recipes/tags/roast': () => {
      current = current.filter((t) => t.id !== 'roast');
      return Response.json(deleted);
    },
    'POST /api/recipes/tags/restore': () => {
      current = [...initial];
      return Response.json({ ...initial[0], restoredLinks: 2 });
    },
  });
  return { fetchMock, calls };
}

const TAGS: Tag[] = [
  { id: 'roast', name: 'Sunday roast', recipeCount: 2 },
  { id: 'quick', name: 'Quick', recipeCount: 1 },
  { id: 'spare', name: 'Spare', recipeCount: 0 },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ManageTagsSection', () => {
  it('lists the Family Tags with how many Recipes use each', async () => {
    const { fetchMock } = stubTags(TAGS);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ManageTagsSection />);
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('Sunday roast')).toBeInTheDocument();
    expect(within(items[0]).getByText('2 Recipes')).toBeInTheDocument();
    expect(within(items[1]).getByText('1 Recipe')).toBeInTheDocument();
    expect(within(items[2]).getByText('0 Recipes')).toBeInTheDocument();
  });

  it('renames inline', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = stubApi({
      'GET /api/recipes/tags/family': () => Response.json(TAGS),
      'PATCH /api/recipes/tags/quick': () =>
        Response.json({
          id: 'quick',
          name: 'Fast',
          recipeCount: 1,
          merged: false,
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ManageTagsSection />);
    await user.click(
      await screen.findByRole('button', { name: 'Rename Quick' }),
    );
    const field = screen.getByRole('textbox', { name: 'Tag name' });
    await user.clear(field);
    await user.type(field, 'Fast');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'PATCH /api/recipes/tags/quick')?.body,
      ).toEqual({ name: 'Fast', merge: false }),
    );
    // The edit closes and the list is fetched again (Tag pickers and Recipes share the key).
    await vi.waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Tag name' })).toBeNull(),
    );
    expect(
      calls.filter((c) => c.key === 'GET /api/recipes/tags/family').length,
    ).toBeGreaterThan(1);
  });

  it('asks before merging into a name that exists, then re-sends with the merge flag', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const { fetchMock, calls } = stubApi({
      'GET /api/recipes/tags/family': () => Response.json(TAGS),
      'PATCH /api/recipes/tags/spare': () => {
        attempt += 1;
        return attempt === 1
          ? Response.json(
              { code: 'tags.name_taken', params: { id: 'quick' } },
              { status: 409 },
            )
          : Response.json({
              id: 'quick',
              name: 'Quick',
              recipeCount: 1,
              merged: true,
            });
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ManageTagsSection />);
    await user.click(
      await screen.findByRole('button', { name: 'Rename Spare' }),
    );
    const field = screen.getByRole('textbox', { name: 'Tag name' });
    await user.clear(field);
    await user.type(field, 'quick');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/already exists/)).toBeInTheDocument();
    const sent = () =>
      calls.filter((c) => c.key === 'PATCH /api/recipes/tags/spare');
    expect(sent()).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: 'Merge' }));
    await vi.waitFor(() => expect(sent()).toHaveLength(2));
    expect(sent()[1].body).toEqual({ name: 'quick', merge: true });
  });

  it('cancelling the merge sends nothing more', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = stubApi({
      'GET /api/recipes/tags/family': () => Response.json(TAGS),
      'PATCH /api/recipes/tags/spare': () =>
        Response.json(
          { code: 'tags.name_taken', params: { id: 'quick' } },
          { status: 409 },
        ),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ManageTagsSection />);
    await user.click(
      await screen.findByRole('button', { name: 'Rename Spare' }),
    );
    const field = screen.getByRole('textbox', { name: 'Tag name' });
    await user.clear(field);
    await user.type(field, 'quick');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(
      calls.filter((c) => c.key === 'PATCH /api/recipes/tags/spare'),
    ).toHaveLength(1);
  });

  it('shows another rename error in the section', async () => {
    const user = userEvent.setup();
    const { fetchMock } = stubApi({
      'GET /api/recipes/tags/family': () => Response.json(TAGS),
      'PATCH /api/recipes/tags/spare': () =>
        Response.json(
          { code: 'tags.name_too_long', params: { max: 30 } },
          { status: 400 },
        ),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ManageTagsSection />);
    await user.click(
      await screen.findByRole('button', { name: 'Rename Spare' }),
    );
    await user.type(screen.getByRole('textbox', { name: 'Tag name' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A Tag name can be at most 30 characters.',
    );
  });

  it('deletes with a polite Undo toast that restores the Tag and its links', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = stubTags(TAGS);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ManageTagsSection />);
    await user.click(
      await screen.findByRole('button', { name: 'Delete Sunday roast' }),
    );
    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('Deleted ‘Sunday roast’ from 2 Recipes');
    expect(screen.queryByText('Sunday roast')).toBeNull();
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/recipes/tags/restore')?.body,
      ).toEqual({
        id: 'roast',
        name: 'Sunday roast',
        recipeIds: ['r1', 'r2'],
      }),
    );
    expect(await screen.findByText('Sunday roast')).toBeInTheDocument();
  });
});
