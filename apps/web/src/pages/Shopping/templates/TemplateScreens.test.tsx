import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Unit } from '@/lib/catalog';
import type { Template, TemplateLine } from '@/lib/shoppingTemplates';
import { renderWithProviders, stubApi } from '@/test/render';
import { TemplateEditorPage } from './TemplateEditorPage';
import { TemplatesPage } from './TemplatesPage';

const dairy = { id: 'a4', name: 'Dairy & eggs', sortOrder: 4 };
const milk = {
  id: 'l1',
  ingredientId: 'milk-id',
  name: 'Milk',
  quantity: 1,
  unit: 'l' as const,
  unmatched: false,
  inPantry: false,
  aisle: dairy,
};
const taco: Template = { id: 't1', name: 'Taco night', lines: [milk] };

describe('Shopping Template screens', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('lists templates and creates a new one', async () => {
    const { fetchMock, calls } = stubApi({
      'GET /api/shopping-templates': () =>
        Response.json({
          templates: [
            {
              id: 't1',
              name: 'Taco night',
              lineCount: 1,
              previewNames: ['Milk'],
            },
          ],
        }),
      'POST /api/shopping-templates': () =>
        Response.json({ id: 't2', name: 'Weekly', lines: [] }, { status: 201 }),
      'GET /api/shopping-templates/t2': () =>
        Response.json({ id: 't2', name: 'Weekly', lines: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/" element={<TemplatesPage />} />
        <Route
          path="/shopping/templates/:id"
          element={<TemplateEditorPage />}
        />
      </Routes>,
    );
    const user = userEvent.setup();

    expect(await screen.findByText('1 line')).toBeVisible();
    await user.type(screen.getByLabelText('New template name'), 'Weekly');
    await user.click(screen.getByRole('button', { name: 'Create template' }));

    expect(await screen.findByLabelText('Name')).toHaveValue('Weekly');
    expect(
      calls.find((c) => c.key === 'POST /api/shopping-templates')?.body,
    ).toEqual({ name: 'Weekly' });
  });

  /** A Template that keeps what is PATCHed, as the API does (a line is matched back by its Ingredient). */
  function statefulTemplate(initial: TemplateLine[]) {
    const catalog = new Map(initial.map((l) => [l.ingredientId, l]));
    let lines = initial;
    let seq = 0;
    const fail = { next: false };
    const stub = stubApi({
      'GET /api/shopping-templates/t1': () => Response.json({ ...taco, lines }),
      'PATCH /api/shopping-templates/t1': () => {
        if (fail.next) {
          fail.next = false;
          return Response.json(
            { code: 'unknown', params: {} },
            { status: 500 },
          );
        }
        const body = stub.calls.at(-1)?.body as {
          lines?: Array<{
            ingredientId: string;
            quantity?: number;
            unit?: Unit;
          }>;
        };
        if (body.lines) {
          lines = body.lines.map((l) => ({
            ...catalog.get(l.ingredientId)!,
            id: `n${++seq}`,
            quantity: l.quantity ?? null,
            unit: l.unit ?? null,
          }));
        }
        return Response.json({ ...taco, lines });
      },
    });
    vi.stubGlobal('fetch', stub.fetchMock);
    return { ...stub, fail };
  }
  const patches = (calls: Array<{ key: string; body: unknown }>) =>
    calls
      .filter((c) => c.key === 'PATCH /api/shopping-templates/t1')
      .map((c) => c.body);
  const renderEditor = () =>
    renderWithProviders(
      <Routes>
        <Route path="/:id" element={<TemplateEditorPage />} />
        <Route path="/shopping/templates" element={<p>Templates list</p>} />
      </Routes>,
      { route: '/t1' },
    );
  const eggs: TemplateLine = {
    ...milk,
    id: 'l2',
    ingredientId: 'eggs-id',
    name: 'Eggs',
    quantity: 6,
    unit: null,
  };
  const bread: TemplateLine = {
    ...milk,
    id: 'l3',
    ingredientId: 'bread-id',
    name: 'Bread',
    quantity: null,
    unit: null,
  };
  const removeLine = async (
    user: ReturnType<typeof userEvent.setup>,
    name: string,
  ) => {
    act(() => screen.getByRole('group', { name }).focus());
    await user.keyboard('{Delete}');
    await user.click(screen.getByRole('button', { name: 'Remove' }));
  };

  it('removes a line at once, with Undo that puts it back in its place', async () => {
    const { calls } = statefulTemplate([milk, eggs, bread]);
    renderEditor();
    const user = userEvent.setup();
    await screen.findByRole('group', { name: 'Eggs' });

    await removeLine(user, 'Eggs');

    expect(await screen.findByText('Removed Eggs')).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Eggs' })).toBeNull(),
    );
    expect(patches(calls)).toEqual([
      {
        lines: [
          { ingredientId: 'milk-id', quantity: 1, unit: 'l' },
          { ingredientId: 'bread-id' },
        ],
      },
    ]);

    await user.dblClick(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(patches(calls)).toHaveLength(2));
    expect(patches(calls)[1]).toEqual({
      lines: [
        { ingredientId: 'milk-id', quantity: 1, unit: 'l' },
        { ingredientId: 'eggs-id', quantity: 6 },
        { ingredientId: 'bread-id' },
      ],
    });
    const names = (await screen.findAllByRole('group')).map((g) =>
      g.getAttribute('aria-label'),
    );
    expect(names).toEqual(['Milk', 'Eggs', 'Bread']);
    expect(patches(calls)).toHaveLength(2);
  });

  it('does not bring a removed line back when a second one is swiped during its fly-off', async () => {
    const { calls, fetchMock } = statefulTemplate([milk, eggs, bread]);
    // A slow save: the second row's removal finishes while the first one is still in flight.
    let releaseSaves: () => void = () => undefined;
    const savesGate = new Promise<void>((resolve) => (releaseSaves = resolve));
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'PATCH'
        ? savesGate.then(() => fetchMock(input, init))
        : fetchMock(input, init),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderEditor();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await screen.findByRole('group', { name: 'Eggs' });
    const removeIn = async (name: string) => {
      const row = screen.getByRole('group', { name });
      act(() => row.focus());
      await user.keyboard('{Delete}');
      await user.click(within(row).getByRole('button', { name: 'Remove' }));
    };

    // Both before the first row has collapsed and saved.
    await removeIn('Eggs');
    await removeIn('Bread');
    // The first save stays in flight while both rows fly off and collapse.
    await act(() => vi.advanceTimersByTimeAsync(700));
    releaseSaves();

    await waitFor(() => expect(patches(calls)).toHaveLength(2));
    expect(patches(calls)[1]).toEqual({
      lines: [{ ingredientId: 'milk-id', quantity: 1, unit: 'l' }],
    });
    await waitFor(() =>
      expect(
        screen.getAllByRole('group').map((g) => g.getAttribute('aria-label')),
      ).toEqual(['Milk']),
    );
  });

  it('keeps a second row removal when the first save lands before its fly-off ends', async () => {
    const { calls } = statefulTemplate([milk, eggs, bread]);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderEditor();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await screen.findByRole('group', { name: 'Eggs' });

    const removeIn = async (name: string) => {
      const row = screen.getByRole('group', { name });
      act(() => row.focus());
      await user.keyboard('{Delete}');
      await user.click(within(row).getByRole('button', { name: 'Remove' }));
    };
    await removeIn('Eggs');
    // Eggs saves (and the lines get new ids) while Bread is still collapsing.
    await act(() => vi.advanceTimersByTimeAsync(150));
    await removeIn('Bread');
    await act(() => vi.advanceTimersByTimeAsync(1500));

    await waitFor(() => expect(patches(calls)).toHaveLength(2));
    expect(patches(calls)[1]).toEqual({
      lines: [{ ingredientId: 'milk-id', quantity: 1, unit: 'l' }],
    });
    await waitFor(() =>
      expect(
        screen.getAllByRole('group').map((g) => g.getAttribute('aria-label')),
      ).toEqual(['Milk']),
    );
  });

  it('removes the line with the right unit when two lines share an Ingredient', async () => {
    const milkCups: TemplateLine = { ...milk, id: 'l9', unit: 'pcs' };
    const { calls, fetchMock } = statefulTemplate([milk, milkCups, eggs]);
    let releaseSaves: () => void = () => undefined;
    const savesGate = new Promise<void>((resolve) => (releaseSaves = resolve));
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'PATCH'
        ? savesGate.then(() => fetchMock(input, init))
        : fetchMock(input, init),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderEditor();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await screen.findAllByRole('group', { name: 'Milk' });
    const [, cupRow] = screen.getAllByRole('group', { name: 'Milk' });
    act(() => screen.getByRole('group', { name: 'Eggs' }).focus());
    await user.keyboard('{Delete}');
    await user.click(
      within(screen.getByRole('group', { name: 'Eggs' })).getByRole('button', {
        name: 'Remove',
      }),
    );
    act(() => cupRow.focus());
    await user.keyboard('{Delete}');
    await user.click(within(cupRow).getByRole('button', { name: 'Remove' }));
    await act(() => vi.advanceTimersByTimeAsync(700));
    releaseSaves();

    await waitFor(() => expect(patches(calls)).toHaveLength(2));
    expect(patches(calls)[1]).toEqual({
      lines: [{ ingredientId: 'milk-id', quantity: 1, unit: 'l' }],
    });
  });

  it('does nothing when the line to remove is already gone', async () => {
    const { calls, fetchMock } = statefulTemplate([milk, eggs, bread]);
    let releaseSaves: () => void = () => undefined;
    const savesGate = new Promise<void>((resolve) => (releaseSaves = resolve));
    let first = true;
    vi.stubGlobal(
      'fetch',
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method !== 'PATCH') return fetchMock(input, init);
        await savesGate;
        await fetchMock(input, init);
        // The first save's reply says Eggs is gone too (removed elsewhere).
        if (first) {
          first = false;
          return Response.json({ ...taco, lines: [milk] });
        }
        return fetchMock(input, init);
      },
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderEditor();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await screen.findByRole('group', { name: 'Eggs' });
    for (const name of ['Bread', 'Eggs']) {
      const row = screen.getByRole('group', { name });
      act(() => row.focus());
      await user.keyboard('{Delete}');
      await user.click(within(row).getByRole('button', { name: 'Remove' }));
    }
    await act(() => vi.advanceTimersByTimeAsync(700));
    releaseSaves();
    await act(() => vi.advanceTimersByTimeAsync(700));

    expect(patches(calls)).toHaveLength(1);
    expect(screen.getByText('Removed Bread')).toBeVisible();
    expect(screen.queryByText('Removed Eggs')).toBeNull();
  });

  it('opens the sheet when a line is held for 500 ms', async () => {
    statefulTemplate([milk]);
    renderEditor();
    await screen.findByRole('group', { name: 'Milk' });
    const content = screen
      .getByRole('group', { name: 'Milk' })
      .querySelector('[data-swipe-row-content]') as HTMLElement;
    vi.useFakeTimers();

    fireEvent.pointerDown(content, { pointerId: 1, clientX: 50, clientY: 20 });
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(200));

    expect(screen.getByRole('dialog', { name: 'Milk' })).toBeVisible();
    vi.useRealTimers();
  });

  it('makes the row usable again when the removal fails to save', async () => {
    const { calls, fail } = statefulTemplate([milk, eggs]);
    renderEditor();
    const user = userEvent.setup();
    await screen.findByRole('group', { name: 'Eggs' });

    fail.next = true;
    await removeLine(user, 'Eggs');

    expect(await screen.findByRole('alert')).toBeVisible();
    const row = await screen.findByRole('group', { name: 'Eggs' });
    expect(row).toBeVisible();
    expect(screen.queryByText('Removed Eggs')).toBeNull();
    await waitFor(() => expect(row).not.toHaveAttribute('inert'));
    act(() => row.focus());
    await user.keyboard('{Delete}');
    expect(screen.getByRole('button', { name: 'Keep' })).toBeVisible();
    expect(patches(calls)).toHaveLength(1);
  });

  it('shows no x button on the lines', async () => {
    statefulTemplate([milk]);
    renderEditor();

    await screen.findByRole('group', { name: 'Milk' });
    // Only the hidden custom action for screen readers, which is not a tab stop.
    expect(screen.getByRole('button', { name: 'Remove Milk' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });

  it('leaves for the templates through Back', async () => {
    statefulTemplate([milk]);
    renderEditor();

    await screen.findByRole('group', { name: 'Milk' });
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      '/shopping/templates',
    );
  });

  it('commits a new name with the gold Save key, then leaves', async () => {
    const { calls } = statefulTemplate([milk]);
    renderEditor();
    const user = userEvent.setup();

    const name = await screen.findByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Burrito night');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Templates list')).toBeVisible();
    expect(patches(calls)).toEqual([{ name: 'Burrito night' }]);
  });

  it('leaves with Save without a PATCH when the name is unchanged', async () => {
    const { calls } = statefulTemplate([milk]);
    renderEditor();
    const user = userEvent.setup();

    await screen.findByLabelText('Name');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Templates list')).toBeVisible();
    expect(patches(calls)).toHaveLength(0);
  });

  it('stays on the page and shows the error when Save fails', async () => {
    const { calls, fail } = statefulTemplate([milk]);
    renderEditor();
    const user = userEvent.setup();

    const name = await screen.findByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Burrito night');
    fail.next = true;
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByText('Templates list')).toBeNull();
    expect(patches(calls)).toHaveLength(1);
  });

  it('commits the name on Enter in the field', async () => {
    const { calls } = statefulTemplate([milk]);
    renderEditor();
    const user = userEvent.setup();

    const name = await screen.findByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Burrito night{Enter}');

    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    expect(patches(calls)[0]).toEqual({ name: 'Burrito night' });
    expect(screen.queryByText('Templates list')).toBeNull();
  });

  it('disables the rows while a save is in flight', async () => {
    const two = [milk, eggs];
    let finish: () => void = () => undefined;
    const saved = new Promise<void>((resolve) => (finish = resolve));
    const { fetchMock, calls } = stubApi({
      'GET /api/shopping-templates/t1': () =>
        Response.json({ ...taco, lines: two }),
      'PATCH /api/shopping-templates/t1': () =>
        Response.json({ ...taco, lines: [eggs] }),
    });
    // Hold the save open so the in-flight state can be observed.
    vi.stubGlobal('fetch', async (...args: Parameters<typeof fetch>) => {
      const response = fetchMock(...args);
      if (args[1]?.method === 'PATCH') await saved;
      return response;
    });
    renderEditor();
    const user = userEvent.setup();
    await screen.findByRole('group', { name: 'Milk' });

    await removeLine(user, 'Milk');
    const other = screen.getByRole('group', { name: 'Eggs' });
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    act(() => other.focus());
    await user.keyboard('{Delete}');
    expect(within(other).queryByRole('button', { name: 'Keep' })).toBeNull();

    finish();
    await screen.findByText('Removed Milk');
    act(() => other.focus());
    await user.keyboard('{Delete}');
    expect(within(other).getByRole('button', { name: 'Keep' })).toBeVisible();
    expect(patches(calls)).toHaveLength(1);
  });

  it('takes the Undo toast down when the editor is left, so it cannot overwrite newer lines', async () => {
    const { calls } = statefulTemplate([milk, eggs]);
    renderEditor();
    const user = userEvent.setup();
    await screen.findByRole('group', { name: 'Eggs' });

    await removeLine(user, 'Eggs');
    expect(await screen.findByText('Removed Eggs')).toBeVisible();
    await user.click(
      screen.getAllByRole('button', { name: 'Add to list' }).at(-1)!,
    );
    await user.click(await screen.findByRole('button', { name: 'Back' }));

    await screen.findByRole('group', { name: 'Milk' });
    await waitFor(() => expect(screen.queryByText('Removed Eggs')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(patches(calls)).toHaveLength(1);
  });

  it('lets a save in flight land before Undo puts the line back on top of it', async () => {
    const { fetchMock, calls } = statefulTemplate([milk, eggs, bread]);
    let release: () => void = () => undefined;
    let gate: Promise<void> | null = null;
    vi.stubGlobal('fetch', async (...args: Parameters<typeof fetch>) => {
      if (args[1]?.method === 'PATCH' && gate) await gate;
      return fetchMock(...args);
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderEditor();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await screen.findByRole('group', { name: 'Eggs' });
    await removeLine(user, 'Eggs');
    await screen.findByText('Removed Eggs');

    // A newer edit is on its way when Undo is pressed.
    gate = new Promise<void>((resolve) => (release = resolve));
    act(() => screen.getByRole('group', { name: 'Milk' }).focus());
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Milk' });
    const field = within(dialog).getByLabelText(/^Amount of Milk/);
    await user.clear(field);
    await user.type(field, '2');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(patches(calls)).toHaveLength(1);

    gate = null;
    release();
    await waitFor(() => expect(patches(calls)).toHaveLength(3));
    expect(patches(calls)[1]).toEqual({
      lines: [
        { ingredientId: 'milk-id', quantity: 2, unit: 'l' },
        { ingredientId: 'bread-id' },
      ],
    });
    expect(patches(calls)[2]).toEqual({
      lines: [
        { ingredientId: 'milk-id', quantity: 2, unit: 'l' },
        { ingredientId: 'eggs-id', quantity: 6 },
        { ingredientId: 'bread-id' },
      ],
    });
  });

  it('moves focus to the empty text when the last line is removed', async () => {
    statefulTemplate([milk]);
    renderEditor();
    const user = userEvent.setup();
    await screen.findByRole('group', { name: 'Milk' });

    await removeLine(user, 'Milk');

    await waitFor(() =>
      expect(screen.getByText(/no lines yet/i)).toHaveFocus(),
    );
  });

  it('moves focus to the restored row when Undo refills an emptied Template', async () => {
    statefulTemplate([milk]);
    renderEditor();
    const user = userEvent.setup();
    await screen.findByRole('group', { name: 'Milk' });
    await removeLine(user, 'Milk');
    await waitFor(() =>
      expect(screen.getByText(/no lines yet/i)).toHaveFocus(),
    );

    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(await screen.findByRole('group', { name: 'Milk' })).toHaveFocus();
  });

  describe('adding a line with the shared search', () => {
    /** The Template stub, plus a Catalog search that answers `results` for every query. */
    const withSearch = (results: unknown[]) => {
      const stub = statefulTemplate([milk]);
      const answerTemplates = globalThis.fetch;
      vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), window.location.origin);
        if (url.pathname === '/api/catalog/search') {
          stub.calls.push({
            key: 'GET /api/catalog/search',
            search: url.search,
            body: undefined,
          });
          return Promise.resolve(Response.json({ results }));
        }
        return answerTemplates(input, init);
      });
      return stub;
    };
    /** The add-line form (the page has other "Add to list" buttons). */
    const addForm = () =>
      screen
        .getByRole('combobox', { name: 'Search ingredients' })
        .closest('form') as HTMLElement;
    const parmesan = {
      id: 'parmesan-id',
      name: 'Parmesan',
      defaultUnit: 'g',
      leafCategory: { id: 'hc', name: 'Hard cheese' },
      parentCategory: {
        id: 'd',
        name: 'Dairy',
        aisle: { id: 'aisle', name: 'Dairy & eggs' },
      },
      defaults: { expiryDays: 30, location: 'fridge' },
    };

    it('adds a typed name as an Unmatched line only through Use as typed', async () => {
      const { calls } = withSearch([]);
      renderEditor();
      const user = userEvent.setup();
      await screen.findByRole('group', { name: 'Milk' });

      const form = addForm();
      await user.type(
        screen.getByRole('combobox', { name: 'Search ingredients' }),
        'Dragon fruit',
      );
      const useTyped = await screen.findByRole('option', {
        name: /Use “Dragon fruit” as typed/,
      });
      expect(
        within(form).getByRole('button', { name: 'Add to list' }),
      ).toBeDisabled();
      await user.click(useTyped);
      await user.click(
        within(form).getByRole('button', { name: 'Add to list' }),
      );

      await waitFor(() => expect(patches(calls)).toHaveLength(1));
      expect(patches(calls)[0]).toEqual({
        lines: [
          { ingredientId: 'milk-id', quantity: 1, unit: 'l' },
          { name: 'Dragon fruit' },
        ],
      });
    });

    it('adds a picked Catalog match by its id', async () => {
      const { calls } = withSearch([parmesan]);
      renderEditor();
      const user = userEvent.setup();
      await screen.findByRole('group', { name: 'Milk' });

      const form = addForm();
      await user.type(
        screen.getByRole('combobox', { name: 'Search ingredients' }),
        'parm',
      );
      await user.click(await screen.findByRole('option', { name: /Parmesan/ }));
      await user.click(
        within(form).getByRole('button', { name: 'Add to list' }),
      );

      await waitFor(() => expect(patches(calls)).toHaveLength(1));
      expect(patches(calls)[0]).toMatchObject({
        lines: [
          { ingredientId: 'milk-id', quantity: 1, unit: 'l' },
          { ingredientId: 'parmesan-id' },
        ],
      });
    });
  });

  describe('editing the amount', () => {
    const openSheet = async (
      user: ReturnType<typeof userEvent.setup>,
      name = 'Milk',
    ) => {
      act(() => screen.getByRole('group', { name }).focus());
      await user.keyboard('{Enter}');
      return screen.findByRole('dialog', { name });
    };

    it('saves the lines with only that line changed', async () => {
      const { calls } = statefulTemplate([milk, eggs]);
      renderEditor();
      const user = userEvent.setup();
      await screen.findByRole('group', { name: 'Milk' });

      const dialog = await openSheet(user, 'Eggs');
      expect(within(dialog).getByText('from this template')).toBeVisible();
      const field = within(dialog).getByLabelText(/^Amount of Eggs/);
      expect(field).toHaveValue('6');
      await user.clear(field);
      await user.type(field, '12');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Updated Eggs')).toBeVisible();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(patches(calls)).toEqual([
        {
          lines: [
            { ingredientId: 'milk-id', quantity: 1, unit: 'l' },
            { ingredientId: 'eggs-id', quantity: 12 },
          ],
        },
      ]);
      expect(screen.getByText('12')).toBeVisible();
    });

    it('opens the removal confirmation from "Remove line"', async () => {
      const { calls } = statefulTemplate([milk]);
      renderEditor();
      const user = userEvent.setup();
      await screen.findByRole('group', { name: 'Milk' });

      const dialog = await openSheet(user);
      await user.click(
        within(dialog).getByRole('button', { name: 'Remove line' }),
      );

      const keep = await screen.findByRole('button', { name: 'Keep' });
      await waitFor(() => expect(keep).toHaveFocus());
      expect(patches(calls)).toEqual([]);
      await user.click(screen.getByRole('button', { name: 'Remove' }));
      expect(await screen.findByText('Removed Milk')).toBeVisible();
    });
  });

  it('deletes a template after confirming', async () => {
    const { fetchMock, calls } = stubApi({
      'GET /api/shopping-templates/t1': () => Response.json(taco),
      'DELETE /api/shopping-templates/t1': () =>
        new Response(null, { status: 204 }),
      'GET /api/shopping-templates': () => Response.json({ templates: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/shopping/templates" element={<TemplatesPage />} />
        <Route
          path="/shopping/templates/:id"
          element={<TemplateEditorPage />}
        />
      </Routes>,
      { route: '/shopping/templates/t1' },
    );
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Delete template' }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByLabelText('New template name')).toBeVisible();
    expect(calls.map((c) => c.key)).toContain(
      'DELETE /api/shopping-templates/t1',
    );
  });
});
