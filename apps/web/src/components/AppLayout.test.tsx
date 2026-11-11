import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  openReady,
  resetVoiceEnvironment,
  stubVoiceFetch,
  talkButton,
  voiceAction,
  voiceIngredient,
} from '../test/voice';
import { holdLongEnough, pressDown, useVoiceTimers } from '../test/voiceHold';
import { VOICE_LAYER } from '../lib/voicePlacement';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paintedColour } from '@pocket-pantry/ui/test/colour';
import { renderWithProviders, stubApi } from '../test/render';
import { authoredCss } from '../test/stickyHeader';
import { AppLayout } from './AppLayout';

function renderAt(route: string) {
  return renderAtView(route);
}

function renderAtView(route: string) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<p>home</p>} />
        <Route path="/customise" element={<p>customise</p>} />
        <Route path="/scan" element={<p>camera</p>} />
        <Route path="/pantry" element={<p>pantry</p>} />
        <Route path="/recipes" element={<p>recipes</p>} />
        <Route path="/shopping" element={<p>shopping</p>} />
        <Route path="/shopping/staples" element={<p>staples</p>} />
      </Route>
    </Routes>,
    { route },
  );
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('AppLayout Dock', () => {
  it('renders no Dock navigation or links behind the camera on /scan', () => {
    renderAt('/scan');
    expect(screen.getByText('camera')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('still renders the Dock on other screens', () => {
    renderAt('/pantry');
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('shows no Dock on /customise', () => {
    renderAt('/customise');
    expect(screen.getByText('customise')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('shows five slots: Home, Shopping, the camera, Pantry and Recipes, in that order', () => {
    renderAt('/recipes');
    const dock = within(screen.getByRole('navigation'));
    expect(
      dock.getAllByRole('link').map((l) => l.getAttribute('href')),
    ).toEqual(['/', '/shopping', '/scan', '/pantry', '/recipes']);
    expect(dock.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(dock.queryByRole('link', { name: 'Scan' })).toBeNull();
  });

  it.each([
    ['/', 'Home'],
    ['/shopping', 'Shopping'],
    ['/pantry', 'Pantry'],
    ['/recipes', 'Recipes'],
  ])('announces the current page on %s as %s', (route, name) => {
    renderAt(route);
    const current = screen
      .getAllByRole('link', { current: 'page' })
      .map((l) => l.textContent);
    expect(current).toEqual([name]);
  });

  it('highlights the section tab on its nested screens', () => {
    renderAt('/shopping/staples');
    // Staples sits under the Shopping section.
    expect(screen.getByRole('link', { current: 'page' })).toHaveTextContent(
      'Shopping',
    );
  });

  it('opens the camera from the camera half', () => {
    renderAt('/recipes');
    expect(screen.getByRole('link', { name: 'Camera' })).toHaveAttribute(
      'href',
      '/scan',
    );
  });

  it('leaves 132px at the bottom of every page for the Dock and its capsule, more where the home indicator is taller', () => {
    const pageCss = () =>
      authoredCss(screen.getByRole('main').parentElement as HTMLElement);
    const { unmount } = renderAtView('/pantry');
    // 104 + max(28, inset) is 132 with no inset.
    expect(pageCss()).toContain(
      'padding-bottom:calc(max(28px, env(safe-area-inset-bottom, 0px)) + 104px)',
    );
    unmount();
    renderAtView('/recipes');
    expect(pageCss()).toContain(
      'padding-bottom:calc(max(28px, env(safe-area-inset-bottom, 0px)) + 104px)',
    );
  });

  it('paints the dock and its tabs from the active Theme', () => {
    localStorage.setItem(
      'pp.appearance',
      JSON.stringify({ theme: 'dark', matchSystem: false }),
    );
    renderAt('/pantry');
    const dock = screen.getByRole('navigation');
    expect(paintedColour(dock, 'background-color')).toBe('RGBA(25,33,28,.9)');

    const active = screen.getByRole('link', { current: 'page' });
    expect(paintedColour(active, 'background-color')).toBe('#1F3A2A');
    expect(paintedColour(active, 'color')).toBe('#A9EDBD');

    const inactive = screen.getByRole('link', { name: /shopping/i });
    expect(paintedColour(inactive, 'background-color')).toBe(
      'RGBA(0, 0, 0, 0)',
    );
    expect(paintedColour(inactive, 'color')).toBe('#97A69B');
  });
});

describe('AppLayout Voice Note host', () => {
  beforeEach(() => {
    resetVoiceEnvironment();
    const { fetchMock } = stubApi({
      'GET /api/voice/config': () => Response.json({ configured: true }),
    });
    stubVoiceFetch(fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['/shopping', '/pantry', '/', '/recipes', '/shopping/staples'])(
    'shows the mic once on %s',
    async (route) => {
      renderAt(route);
      expect(await talkButton()).toBeInTheDocument();
      expect(
        screen.getAllByRole('button', { name: /hold to record a voice note/i }),
      ).toHaveLength(1);
    },
  );

  it.each(['/shopping', '/pantry', '/recipes'])(
    'shows no Spoken Language chip above the Dock on %s',
    async (route) => {
      renderAt(route);
      await talkButton();
      expect(
        screen.queryByRole('button', { name: /Spoken Language/ }),
      ).toBeNull();
    },
  );

  it('reserves room for the mic capsule above the Dock when the mic shows', async () => {
    renderAt('/pantry');
    await talkButton();
    // jsdom drops calc() with env() from computed style, so read the authored rule text.
    const rules = authoredCss(
      screen.getByRole('main').parentElement as HTMLElement,
    );
    // Just clear of the capsule: Dock 28 + 76 + 24 on phones, 28 + 84 + 24 from md; no chip row. The 28 grows with the bottom inset.
    expect(rules).toContain(
      'padding-bottom:calc(max(28px, env(safe-area-inset-bottom, 0px)) + 100px)',
    );
    expect(rules).toContain(
      'padding-bottom:calc(max(28px, env(safe-area-inset-bottom, 0px)) + 108px)',
    );
    expect(rules).not.toMatch(/calc\(36px/);
  });

  it.each(['/scan', '/customise'])(
    'shows no mic on %s, where there is no Dock',
    async (route) => {
      const { queryClient } = renderAt(route);
      await waitFor(() =>
        expect(queryClient.getQueryState(['voice', 'config'])?.status).toBe(
          'success',
        ),
      );
      expect(
        screen.queryByRole('button', { name: /hold to record a voice note/i }),
      ).toBeNull();
    },
  );

  it.each(['/shopping', '/pantry', '/recipes'])(
    'puts the mic in the Dock, above the camera, on %s',
    async (route) => {
      renderAt(route);
      const mic = await talkButton();
      const dock = screen.getByRole('navigation');
      expect(dock).toContainElement(mic);
      const camera = within(dock).getByRole('link', { name: 'Camera' });
      expect(
        mic.compareDocumentPosition(camera) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );

  it('lifts the Dock above the scrim while the mic is held, so the mic is not dimmed', async () => {
    renderAt('/shopping');
    const dock = screen.getByRole('navigation');
    expect(getComputedStyle(dock).zIndex).toBe('10');
    pressDown(await talkButton());
    await screen.findByText("Gator's listening");
    expect(Number(getComputedStyle(dock).zIndex)).toBeGreaterThan(
      VOICE_LAYER.scrim,
    );
  });

  it('keeps the camera next to the mic on a page with no Default List', async () => {
    renderAt('/recipes');
    expect(await talkButton()).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Camera' })).toBeInTheDocument();
  });
});

describe('AppLayout Dock when voice is not configured', () => {
  beforeEach(() => {
    resetVoiceEnvironment();
    const { fetchMock } = stubApi({
      'GET /api/voice/config': () => Response.json({ configured: false }),
    });
    stubVoiceFetch(fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['/shopping', '/pantry'])(
    'shows only the camera on %s',
    async (route) => {
      const { queryClient } = renderAt(route);
      await waitFor(() =>
        expect(queryClient.getQueryState(['voice', 'config'])?.status).toBe(
          'success',
        ),
      );
      expect(screen.getByRole('link', { name: 'Camera' })).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /hold to record a voice note/i }),
      ).toBeNull();
    },
  );
});

describe('AppLayout Voice Notes off the Shopping List and the Pantry', () => {
  const bread = voiceIngredient('ing-bread', 'Bread');
  let applied: Record<string, unknown>[];
  let sent: FormData[];

  beforeEach(() => {
    useVoiceTimers();
    resetVoiceEnvironment();
    applied = [];
    const { fetchMock } = stubApi({
      'GET /api/voice/config': () => Response.json({ configured: true }),
      'GET /api/catalog/search': () => Response.json({ results: [bread] }),
      'GET /api/catalog/aisles': () => Response.json({ aisles: [] }),
      'POST /api/voice': () =>
        Response.json(
          {
            transcript: 'got the bread',
            actions: [
              voiceAction({
                target: 'shopping',
                op: 'check',
                text: 'bread',
                ingredient: bread,
              }),
            ],
          },
          { status: 201 },
        ),
      'POST /api/voice/apply': () =>
        Response.json(
          {
            applied: [
              {
                actionId: 'a1',
                list: 'shopping',
                rowId: 'r1',
                alreadyDone: false,
              },
            ],
            skipped: [],
          },
          { status: 201 },
        ),
    });
    ({ sent } = stubVoiceFetch(fetchMock, (input, init) => {
      if (
        String(input).endsWith('/voice/apply') &&
        typeof init?.body === 'string'
      ) {
        applied.push(JSON.parse(init.body) as Record<string, unknown>);
      }
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function recordNote() {
    const button = await talkButton();
    pressDown(button);
    await screen.findByText("Gator's listening");
    await holdLongEnough();
    fireEvent.pointerUp(button);
    return openReady();
  }

  it.each([
    ['/shopping', 'shopping'],
    ['/pantry', 'pantry'],
    ['/', 'none'],
    ['/recipes', 'none'],
    ['/shopping/staples', 'none'],
  ])('sends the Default List of %s as %s', async (route, target) => {
    renderAt(route);
    await recordNote();
    expect(sent).toHaveLength(1);
    expect(sent[0].get('defaultTarget')).toBe(target);
  });

  it('tells the Member to name a list while listening off the lists', async () => {
    renderAt('/recipes');
    pressDown(await talkButton());
    await screen.findByText("Gator's listening");
    // The refresh loader's own status region sits empty beside it.
    expect(
      screen.getAllByRole('status').filter((el) => el.textContent !== ''),
    ).toEqual([
      expect.objectContaining({
        textContent: expect.stringContaining(
          'Say which list: “on the list” or “in the pantry”.',
        ),
      }),
    ]);
  });

  it('opens Review over the current page and applies with the usual toast, without navigating', async () => {
    renderAt('/recipes');
    const dialog = within(await recordNote());
    expect(screen.getByText('recipes')).toBeInTheDocument();

    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 1 change' }),
    );

    await waitFor(() => expect(applied).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('recipes')).toBeInTheDocument();
    expect(await screen.findByText('1 applied')).toBeVisible();
  });
});

describe('AppLayout Review for actions that need a list', () => {
  const milk = voiceIngredient('ing-milk', 'Milk');
  const eggs = voiceIngredient('ing-eggs', 'Eggs');
  let note: Record<string, unknown>[];
  let applied: { actions: Record<string, unknown>[] }[];
  let voiceReads: number;

  const batch = (id: string, expiresOn: string | null, quantity = 1) => ({
    id,
    name: 'Milk',
    quantity,
    unit: 'l',
    location: 'fridge',
    expiresOn,
  });
  const shoppingSide = (id: string, op: string, ingredient: object) =>
    voiceAction({
      id,
      target: 'shopping',
      op,
      text: 'milk',
      ingredient,
      rows:
        op === 'remove'
          ? {
              shoppingItem: {
                id: 'i1',
                name: 'Milk',
                quantity: 2,
                unit: 'pcs',
                checked: false,
              },
            }
          : {},
    });
  /** A bare add or remove the server could not give a list. */
  const needsList = (
    id: string,
    op: 'add' | 'remove',
    ingredient: object,
    pantry: Record<string, unknown> = {},
    shopping: Record<string, unknown> = {},
  ) =>
    voiceAction({
      id,
      status: 'needsList',
      target: null,
      op,
      text: 'milk',
      ingredient,
      byList: {
        shopping: { ...shoppingSide(id, op, ingredient), ...shopping },
        pantry: voiceAction({
          id,
          target: 'pantry',
          op,
          text: 'milk',
          ingredient,
          scope: op === 'remove' ? 'one' : null,
          rows: op === 'remove' ? { batches: [batch('b1', '2099-05-20')] } : {},
          defaults: { location: 'fridge' },
          ...pantry,
        }),
      },
    });

  beforeEach(() => {
    useVoiceTimers();
    resetVoiceEnvironment();
    applied = [];
    voiceReads = 0;
    const { fetchMock } = stubApi({
      'GET /api/voice/config': () => Response.json({ configured: true }),
      'GET /api/catalog/search': () => Response.json({ results: [milk] }),
      'GET /api/catalog/aisles': () => Response.json({ aisles: [] }),
      'POST /api/voice': () => {
        voiceReads += 1;
        return Response.json(
          { transcript: 'milk', actions: note },
          { status: 201 },
        );
      },
      'POST /api/voice/apply': () =>
        Response.json({ applied: [], skipped: [] }, { status: 201 }),
    });
    stubVoiceFetch(fetchMock, (input, init) => {
      if (
        String(input).endsWith('/voice/apply') &&
        typeof init?.body === 'string'
      ) {
        applied.push(JSON.parse(init.body) as (typeof applied)[number]);
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function openReview(actions: Record<string, unknown>[]) {
    note = actions;
    renderAt('/recipes');
    const button = await talkButton();
    pressDown(button);
    await screen.findByText("Gator's listening");
    await holdLongEnough();
    fireEvent.pointerUp(button);
    return within(await openReady());
  }
  const pickerOf = (dialog: ReturnType<typeof within>, name: string) =>
    within(dialog.getByRole('group', { name: `List for ${name}` }));
  const sectionOf = (dialog: ReturnType<typeof within>, name: string) =>
    within(dialog.getByRole('region', { name }));

  it('shows a Shopping List / Pantry picker and holds Apply back until a list is picked', async () => {
    const dialog = await openReview([needsList('a1', 'add', milk)]);

    const picker = pickerOf(dialog, 'Milk');
    expect(
      picker.getByRole('button', { name: 'Shopping List' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(picker.getByRole('button', { name: 'Pantry' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(
      dialog.getByRole('button', { name: 'Pick a list first' }),
    ).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(
      dialog.getByRole('button', { name: 'Pick a list first' }),
    );
    expect(applied).toHaveLength(0);
  });

  it('moves the action under the picked list at once, without a request, and lets the pick change', async () => {
    const dialog = await openReview([needsList('a1', 'add', milk)]);
    expect(voiceReads).toBe(1);

    await userEvent.click(
      pickerOf(dialog, 'Milk').getByRole('button', { name: 'Pantry' }),
    );
    expect(sectionOf(dialog, 'Pantry').getByText('Milk')).toBeInTheDocument();
    expect(dialog.queryByRole('region', { name: 'Shopping List' })).toBeNull();
    expect(
      dialog.getByRole('button', { name: 'Apply 1 change' }),
    ).not.toHaveAttribute('aria-disabled');

    await userEvent.click(
      pickerOf(dialog, 'Milk').getByRole('button', { name: 'Shopping List' }),
    );
    expect(
      sectionOf(dialog, 'Shopping List').getByText('Milk'),
    ).toBeInTheDocument();
    expect(dialog.queryByRole('region', { name: 'Pantry' })).toBeNull();
    expect(voiceReads).toBe(1);
  });

  it('shows the Batch a Pantry removal takes, with its expiry, once Pantry is picked', async () => {
    const dialog = await openReview([needsList('a1', 'remove', milk)]);
    await userEvent.click(
      pickerOf(dialog, 'Milk').getByRole('button', { name: 'Pantry' }),
    );
    const [row] = sectionOf(dialog, 'Pantry').getAllByRole('listitem');
    expect(row).toHaveTextContent(/2099/);
  });

  it('asks which Batch to use when the picked Pantry removal needs one', async () => {
    const dialog = await openReview([
      needsList('a1', 'remove', milk, {
        status: 'needsBatch',
        quantity: 5,
        unit: 'l',
        rows: {
          batches: [batch('b1', '2099-05-20'), batch('b2', '2098-01-02')],
        },
      }),
    ]);
    await userEvent.click(
      pickerOf(dialog, 'Milk').getByRole('button', { name: 'Pantry' }),
    );
    const group = dialog.getByRole('radiogroup', {
      name: 'Which batch did you use up?',
    });
    expect(within(group).getAllByRole('radio')).toHaveLength(2);
    expect(
      dialog.getByRole('button', { name: 'Pick a batch first' }),
    ).toBeInTheDocument();
  });

  it('keeps the picker on a pick that finds nothing, so the pick can be changed', async () => {
    const action = needsList(
      'a1',
      'remove',
      milk,
      {},
      { status: 'notFound', rows: {} },
    );
    const dialog = await openReview([action]);

    await userEvent.click(
      pickerOf(dialog, 'Milk').getByRole('button', { name: 'Shopping List' }),
    );
    expect(dialog.getByText('No Milk on your list.')).toBeInTheDocument();
    expect(
      dialog.getByRole('button', { name: 'Shopping List' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(
      pickerOf(dialog, 'Milk').getByRole('button', { name: 'Pantry' }),
    );
    const [row] = sectionOf(dialog, 'Pantry').getAllByRole('listitem');
    expect(row).toHaveTextContent(/2099/);
  });

  it('drops an amount typed for one list when the pick changes', async () => {
    const dialog = await openReview([
      needsList('a1', 'add', milk, { quantity: 2, unit: 'l' }),
    ]);
    const picker = () => pickerOf(dialog, 'Milk');
    await userEvent.click(picker().getByRole('button', { name: 'Pantry' }));
    await userEvent.click(
      sectionOf(dialog, 'Pantry').getByRole('button', { expanded: false }),
    );
    const amount = dialog.getByRole('textbox', { name: /^Amount of Milk,/ });
    await userEvent.clear(amount);
    await userEvent.type(amount, '9');

    await userEvent.click(
      picker().getByRole('button', { name: 'Shopping List' }),
    );
    await userEvent.click(picker().getByRole('button', { name: 'Pantry' }));
    // The row stays open across the swap, now showing the server's amount.
    expect(
      dialog.getByRole('textbox', { name: /^Amount of Milk,/ }),
    ).toHaveValue('2');
  });

  it('hides "Put all on" with only one action needing a list', async () => {
    const dialog = await openReview([needsList('a1', 'add', milk)]);
    expect(dialog.queryByRole('group', { name: 'Put all on' })).toBeNull();
  });

  it('puts every action on the chosen list, and applies each to its picked list', async () => {
    const dialog = await openReview([
      needsList('a1', 'add', milk),
      needsList('a2', 'add', eggs),
    ]);
    const all = within(dialog.getByRole('group', { name: 'Put all on' }));
    await userEvent.click(all.getByRole('button', { name: 'Pantry' }));
    expect(
      dialog.getByRole('button', { name: 'Apply 2 changes' }),
    ).not.toHaveAttribute('aria-disabled');
    expect(sectionOf(dialog, 'Pantry')).toBeTruthy();
    expect(dialog.queryByRole('region', { name: 'Shopping List' })).toBeNull();

    await userEvent.click(
      pickerOf(dialog, 'Eggs').getByRole('button', { name: 'Shopping List' }),
    );
    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 2 changes' }),
    );
    await waitFor(() => expect(applied).toHaveLength(1));
    expect(applied[0].actions.map((a) => [a.id, a.target, a.op])).toEqual([
      ['a1', 'pantry', 'add'],
      ['a2', 'shopping', 'add'],
    ]);
  });

  it('opens the Batch picker of the first action that needs one when "Put all on" lands on Pantry', async () => {
    const dialog = await openReview([
      needsList('a1', 'add', milk),
      needsList('a2', 'remove', eggs, {
        status: 'needsBatch',
        quantity: 5,
        unit: 'pcs',
        rows: {
          batches: [batch('b1', '2099-05-20'), batch('b2', '2098-01-02')],
        },
      }),
    ]);
    const all = within(dialog.getByRole('group', { name: 'Put all on' }));
    await userEvent.click(all.getByRole('button', { name: 'Pantry' }));
    const group = dialog.getByRole('radiogroup', {
      name: 'Which batch did you use up?',
    });
    expect(within(group).getAllByRole('radio')).toHaveLength(2);
    expect(document.activeElement).toBe(
      document.querySelector('[data-voice-picker="a2"]'),
    );
  });

  it('keeps an amount typed on an action that has no list to pick when "Put all on" is used', async () => {
    const bread = voiceIngredient('ing-bread', 'Bread');
    const dialog = await openReview([
      voiceAction({
        id: 'r1',
        target: 'shopping',
        op: 'add',
        text: 'bread',
        ingredient: bread,
        quantity: 2,
        unit: 'pcs',
      }),
      needsList('a1', 'add', milk),
      needsList('a2', 'add', eggs),
    ]);
    await userEvent.click(
      sectionOf(dialog, 'Shopping List').getAllByRole('button', {
        expanded: false,
      })[0],
    );
    const amount = dialog.getByRole('textbox', { name: /^Amount of Bread,/ });
    await userEvent.clear(amount);
    await userEvent.type(amount, '9');

    const all = within(dialog.getByRole('group', { name: 'Put all on' }));
    await userEvent.click(all.getByRole('button', { name: 'Pantry' }));
    expect(
      dialog.getByRole('textbox', { name: /^Amount of Bread,/ }),
    ).toHaveValue('9');
  });
});
