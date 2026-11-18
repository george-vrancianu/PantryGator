import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  openReady,
  resetVoiceEnvironment,
  stubVoiceFetch,
  talkButton,
  voiceAction,
  voiceIngredient,
} from '../../test/voice';
import {
  holdLongEnough,
  pressDown,
  useVoiceTimers,
} from '../../test/voiceHold';
import { renderInAppLayout, stubApi } from '../../test/render';
import { PantryPage } from '../../pages/Pantry/PantryPage';
import { ShoppingPage } from '../../pages/Shopping/ShoppingPage';

const milk = voiceIngredient('ing-milk', 'Milk');
const butter = voiceIngredient('ing-butter', 'Butter');

const answers = [
  {
    id: 'q1',
    kind: 'yes',
    text: 'do we have milk',
    name: null,
    ingredient: milk,
    totals: [{ unit: 'l', quantity: 2 }],
    locations: ['fridge'],
    expiringSoon: false,
    runningLow: false,
  },
  {
    id: 'q2',
    kind: 'no',
    text: 'and butter',
    ingredient: butter,
    onShoppingList: false,
  },
];

describe('the answer sheet for Pantry Questions', () => {
  let sent: FormData[];
  let calls: string[];
  let applyPayloads: {
    actions: {
      id: string;
      target?: string;
      text?: string;
      op?: string;
      ingredientId?: string | null;
      name?: string | null;
      quantity?: number | null;
    }[];
  }[];

  function setup(
    body: Record<string, unknown>,
    onList: { ingredientId: string | null; name: string }[] = [],
    listGate: Promise<unknown> = Promise.resolve(),
  ) {
    // The Shopping List as the server holds it: the apply stub adds to it.
    const items = [...onList];
    calls = [];
    applyPayloads = [];
    const { fetchMock } = stubApi({
      'GET /api/shopping-list': async () => {
        await listGate;
        return Response.json({
          id: 'l1',
          groups: items.length
            ? [
                {
                  aisle: null,
                  items: items.map((item, i) => ({
                    id: `item-${i}`,
                    quantity: null,
                    unit: null,
                    checked: i % 2 === 1,
                    unmatched: item.ingredientId === null,
                    ...item,
                  })),
                },
              ]
            : [],
          summary: { remaining: items.length, checked: 0 },
        });
      },
      'GET /api/pantry/recently-stocked': () =>
        Response.json({ ingredients: [] }),
      'GET /api/pantry': () => Response.json({ batches: [], runningLow: [] }),
      'GET /api/voice/config': () => Response.json({ configured: true }),
      'POST /api/voice': () =>
        Response.json(
          { transcript: 'Do we have milk and butter?', ...body },
          { status: 201 },
        ),
      'POST /api/voice/apply': () => {
        for (const a of applyPayloads.at(-1)?.actions ?? []) {
          items.push({
            ingredientId: a.ingredientId ?? null,
            name: a.text ?? '',
          });
        }
        return Response.json({
          applied: (applyPayloads.at(-1)?.actions ?? []).map((a) => ({
            actionId: a.id,
            list: 'shopping',
            rowId: `row-${a.id}`,
            alreadyDone: false,
          })),
          skipped: [],
        });
      },
    });
    ({ sent } = stubVoiceFetch(fetchMock, (input, init) => {
      calls.push(String(input));
      if (
        String(input).endsWith('/voice/apply') &&
        typeof init?.body === 'string'
      ) {
        applyPayloads.push(JSON.parse(init.body));
      }
    }));
  }

  async function ask(page: ReactElement, path: string) {
    renderInAppLayout(page, path);
    const button = await talkButton();
    pressDown(button);
    await screen.findByText("Gator's listening");
    await holdLongEnough();
    fireEvent.pointerUp(button);
    return openReady();
  }

  beforeEach(() => {
    useVoiceTimers();
    resetVoiceEnvironment();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    ['the Pantry page', <PantryPage key="p" />, '/pantry', 'pantry'],
    [
      'the Shopping List page',
      <ShoppingPage key="s" />,
      '/shopping',
      'shopping',
    ],
    ['a page with no Default List', <p key="h">home</p>, '/', 'none'],
  ])(
    'opens from %s with a row per Ingredient instead of Review, and Done sends nothing',
    async (_name, page, path, target) => {
      setup({ actions: [], answers });
      const dialog = within(await ask(page, path));

      expect(sent[0].get('defaultTarget')).toBe(target);
      expect(
        dialog.getByRole('heading', { name: 'Your Pantry' }),
      ).toBeVisible();
      expect(dialog.queryByRole('heading', { name: 'Review' })).toBeNull();
      expect(dialog.getByText('What I heard')).toBeVisible();
      const rows = dialog.getAllByRole('listitem');
      expect(rows).toHaveLength(2);
      expect(within(rows[0]).getByText('Milk')).toBeVisible();
      expect(rows[0]).toHaveTextContent('In your Pantry');
      expect(within(rows[1]).getByText('Butter')).toBeVisible();
      expect(rows[1]).toHaveTextContent('Not in your Pantry');

      await userEvent.click(dialog.getByRole('button', { name: 'Done' }));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(calls.some((url) => url.endsWith('/voice/apply'))).toBe(false);
    },
  );

  // Spec: #461. The rows show the details the Assistant speaks; an off-page case (Home, no Default List).
  it('shows the details of each answer kind', async () => {
    const eggs = voiceIngredient('ing-eggs', 'Eggs');
    const flour = voiceIngredient('ing-flour', 'Flour');
    setup({
      actions: [],
      answers: [
        {
          id: 'q1',
          kind: 'yes',
          text: 'milk',
          ingredient: milk,
          totals: [
            { unit: 'ml', quantity: 500 },
            { unit: 'l', quantity: 1.5 },
          ],
          locations: ['fridge', 'freezer'],
          expiringSoon: true,
          runningLow: true,
        },
        {
          id: 'q2',
          kind: 'yes',
          text: 'salt',
          ingredient: voiceIngredient('ing-salt', 'Salt'),
          totals: [],
          locations: [],
          expiringSoon: false,
          runningLow: false,
        },
        {
          id: 'q3',
          kind: 'onlyExpired',
          text: 'eggs',
          ingredient: eggs,
          onShoppingList: true,
        },
        {
          id: 'q4',
          kind: 'no',
          text: 'butter',
          ingredient: butter,
          onShoppingList: false,
        },
        {
          id: 'q5',
          kind: 'no',
          text: 'flour',
          ingredient: flour,
          onShoppingList: true,
        },
      ],
    });
    const dialog = within(await ask(<p>home</p>, '/'));
    const rows = dialog.getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent('In your Pantry');
    expect(rows[0]).toHaveTextContent('500 ml · 1.5 L · Fridge · Freezer');
    expect(rows[0]).toHaveTextContent('Expiring soon');
    expect(rows[0]).toHaveTextContent('Running low');
    expect(rows[1]).toHaveTextContent('In your Pantry');
    expect(rows[1]).not.toHaveTextContent('Expiring soon');
    expect(rows[1]).not.toHaveTextContent('Running low');
    expect(rows[2]).toHaveTextContent('Only expired');
    expect(rows[2]).toHaveTextContent('Already on your Shopping List');
    expect(rows[3]).toHaveTextContent('Not in your Pantry');
    expect(rows[3]).not.toHaveTextContent('Shopping List');
    expect(rows[4]).toHaveTextContent('Already on your Shopping List');
  });

  // Spec: #462. A name with no Match is an answer too: the sheet opens, never Review.
  it('shows a not sure row beside matched ones, by the asked name, off-page (Home)', async () => {
    setup({
      actions: [],
      answers: [
        answers[0],
        {
          id: 'q2',
          kind: 'notSure',
          text: 'and zorblax',
          ingredient: null,
          name: 'zorblax',
        },
        {
          id: 'q3',
          kind: 'yes',
          text: 'quux',
          ingredient: null,
          name: 'quux',
          totals: [{ unit: 'pcs', quantity: 3 }],
          locations: ['cupboard'],
          expiringSoon: false,
          runningLow: false,
        },
      ],
    });
    const dialog = within(await ask(<p>home</p>, '/'));

    expect(dialog.getByRole('heading', { name: 'Your Pantry' })).toBeVisible();
    expect(dialog.queryByRole('heading', { name: 'Review' })).toBeNull();
    const rows = dialog.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('zorblax');
    expect(rows[1]).toHaveTextContent('Not sure');
    expect(rows[1]).not.toHaveTextContent('Not in your Pantry');
    expect(rows[2]).toHaveTextContent('quux');
    expect(rows[2]).toHaveTextContent('In your Pantry');
    expect(rows[2]).toHaveTextContent('3 pcs · Cupboard');
  });

  describe('a note with actions and answers', () => {
    const eggs = voiceIngredient('ing-eggs', 'Eggs');
    const applyBodies = () =>
      calls.filter((url) => url.endsWith('/voice/apply')).length;

    it.each([
      [
        'the Pantry page',
        <PantryPage key="p" />,
        '/pantry',
        'pantry',
        'Pantry',
      ],
      [
        'the Shopping List page',
        <ShoppingPage key="s" />,
        '/shopping',
        'shopping',
        'Shopping List',
      ],
    ])(
      'opens Review from %s with the answer card above the rows; Apply sends only the actions',
      async (_name, page, path, target, list) => {
        setup({
          actions: [
            voiceAction({
              text: 'eggs',
              target,
              ingredient: eggs,
              quantity: 6,
              unit: 'pcs',
              defaults: { location: 'fridge' },
            }),
          ],
          answers,
        });
        const dialog = within(await ask(page, path));

        expect(dialog.getByRole('heading', { name: 'Review' })).toBeVisible();
        const card = dialog.getByRole('region', { name: 'Your Pantry' });
        const rows = within(card).getAllByRole('listitem');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent('Milk');
        expect(rows[0]).toHaveTextContent('In your Pantry');
        expect(rows[1]).toHaveTextContent('Not in your Pantry');
        // No editing, no removing: the card has no fields, and its one button adds to the Shopping List (#464).
        expect(
          within(card)
            .getAllByRole('button')
            .map((b) => b.textContent),
        ).toEqual(['Add 1 to the Shopping List']);
        expect(within(card).queryAllByRole('textbox')).toHaveLength(0);
        // Above the Voice Action rows.
        const rowsGroup = dialog.getByRole('region', { name: list });
        expect(
          card.compareDocumentPosition(rowsGroup) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(dialog.queryByText('“do we have milk”')).toBeNull();

        await userEvent.click(
          dialog.getByRole('button', { name: 'Apply 1 change' }),
        );
        await act(() => vi.advanceTimersByTimeAsync(10));
        expect(applyBodies()).toBe(1);
        expect(applyPayloads).toHaveLength(1);
        expect(
          applyPayloads[0].actions.map((a: { id: string }) => a.id),
        ).toEqual(['a1']);
        expect(JSON.stringify(applyPayloads[0])).not.toContain('q1');
      },
    );

    it('keeps the card beside a needsList action off-page, and Apply sends only the action once a list is picked', async () => {
      const side = (list: string) =>
        voiceAction({
          id: 'a1',
          target: list,
          text: 'eggs',
          ingredient: eggs,
          defaults: { location: 'fridge' },
        });
      setup({
        actions: [
          voiceAction({
            id: 'a1',
            status: 'needsList',
            target: null,
            text: 'eggs',
            ingredient: eggs,
            byList: { shopping: side('shopping'), pantry: side('pantry') },
          }),
        ],
        answers,
      });
      const dialog = within(await ask(<p>home</p>, '/'));

      expect(sent[0].get('defaultTarget')).toBe('none');
      const card = dialog.getByRole('region', { name: 'Your Pantry' });
      expect(within(card).getAllByRole('listitem')).toHaveLength(2);
      expect(
        dialog.getByRole('button', { name: 'Pick a list first' }),
      ).toBeEnabled();

      await userEvent.click(
        within(dialog.getByRole('group', { name: 'List for Eggs' })).getByRole(
          'button',
          { name: 'Shopping List' },
        ),
      );
      // The card is still there after the pick.
      expect(
        within(
          dialog.getByRole('region', { name: 'Your Pantry' }),
        ).getAllByRole('listitem'),
      ).toHaveLength(2);
      await userEvent.click(
        dialog.getByRole('button', { name: 'Apply 1 change' }),
      );
      await act(() => vi.advanceTimersByTimeAsync(10));
      expect(applyPayloads).toHaveLength(1);
      expect(applyPayloads[0].actions.map((a) => [a.id, a.target])).toEqual([
        ['a1', 'shopping'],
      ]);
      expect(JSON.stringify(applyPayloads[0])).not.toContain('q1');
    });
  });

  // Spec: #464. "Add N to the Shopping List" on the sheet and on the Review answer card.
  describe('Add N to the Shopping List', () => {
    const eggs = voiceIngredient('ing-eggs', 'Eggs');
    const flour = voiceIngredient('ing-flour', 'Flour');
    const rice = voiceIngredient('ing-rice', 'Rice');
    const oil = voiceIngredient('ing-oil', 'Oil');
    const yes = (id: string, ingredient: typeof milk, runningLow: boolean) => ({
      id,
      kind: 'yes',
      text: ingredient.name,
      ingredient,
      totals: [{ unit: 'l', quantity: 1 }],
      locations: ['fridge'],
      expiringSoon: false,
      runningLow,
    });
    const short = (
      id: string,
      kind: 'no' | 'onlyExpired',
      ingredient: typeof milk,
      onShoppingList: boolean,
    ) => ({ id, kind, text: ingredient.name, ingredient, onShoppingList });
    // Counted: butter (no), eggs (only expired), rice (Running low). Skipped: milk (plain yes),
    // flour (no, on the list), oil (Running low, on the list).
    const mixed = [
      yes('q1', milk, false),
      short('q2', 'no', butter, false),
      short('q3', 'onlyExpired', eggs, false),
      short('q4', 'no', flour, true),
      yes('q5', rice, true),
      yes('q6', oil, true),
    ];
    const onList = [{ ingredientId: 'ing-oil', name: 'Oil' }];
    const addButton = (n: number) =>
      screen.findByRole('button', { name: `Add ${n} to the Shopping List` });

    it.each([
      ['the Pantry page', <PantryPage key="p" />, '/pantry'],
      ['the Shopping List page', <ShoppingPage key="s" />, '/shopping'],
      ['a page with no Default List', <p key="h">home</p>, '/'],
    ])(
      'adds the no, only expired and Running low Ingredients not on the list from the sheet on %s',
      async (_name, page, path) => {
        setup({ actions: [], answers: mixed }, onList);
        const dialog = within(await ask(page, path));

        await userEvent.click(await addButton(3));
        await act(() => vi.advanceTimersByTimeAsync(10));

        expect(applyPayloads).toHaveLength(1);
        expect(
          applyPayloads[0].actions.map((a) => [
            a.target,
            a.op,
            a.ingredientId,
            a.name,
            a.quantity,
          ]),
        ).toEqual([
          ['shopping', 'add', 'ing-butter', null, null],
          ['shopping', 'add', 'ing-eggs', null, null],
          ['shopping', 'add', 'ing-rice', null, null],
        ]);
        expect(await screen.findByText('3 applied')).toBeVisible();
        expect(
          screen.getByText('3 applied').closest('[role="status"]'),
        ).not.toBeNull();
        // No Undo (ADR 0017), and the sheet stays; the button is gone as nothing is left to add.
        expect(screen.queryByRole('button', { name: /undo/i })).toBeNull();
        expect(
          dialog.queryByRole('button', { name: /to the Shopping List/ }),
        ).toBeNull();
        expect(
          dialog.getByRole('heading', { name: 'Your Pantry' }),
        ).toHaveFocus();
        expect(dialog.getAllByRole('listitem')).toHaveLength(6);
      },
    );

    it('counts one Ingredient, and says so in the singular', async () => {
      setup({ actions: [], answers: [short('q1', 'no', butter, false)] });
      await ask(<p>home</p>, '/');
      expect(await addButton(1)).toBeVisible();
    });

    // Spec: #462. An answer with no Match is added by its name; not sure is never offered.
    it('adds an Unmatched short name by its name, and skips not sure and the ones on the list', async () => {
      const unmatched = (id: string, name: string, extra: object) => ({
        id,
        text: name,
        ingredient: null,
        name,
        ...extra,
      });
      setup({
        actions: [],
        answers: [
          unmatched('q1', 'zorblax', { kind: 'notSure' }),
          unmatched('q2', 'quux', {
            kind: 'onlyExpired',
            onShoppingList: false,
          }),
          unmatched('q3', 'kale', {
            kind: 'onlyExpired',
            onShoppingList: true,
          }),
        ],
      });
      const dialog = within(await ask(<p>home</p>, '/'));

      await userEvent.click(await addButton(1));
      await act(() => vi.advanceTimersByTimeAsync(10));

      expect(applyPayloads).toHaveLength(1);
      expect(
        applyPayloads[0].actions.map((a) => [
          a.target,
          a.op,
          a.ingredientId,
          a.name,
        ]),
      ).toEqual([['shopping', 'add', null, 'quux']]);
      expect(await screen.findByText('1 applied')).toBeVisible();
      expect(screen.queryByRole('button', { name: /undo/i })).toBeNull();
      expect(dialog.getAllByRole('listitem')).toHaveLength(3);
    });

    it('is hidden when nothing is short or everything is on the list already', async () => {
      setup(
        {
          actions: [],
          answers: [
            yes('q1', milk, false),
            short('q2', 'no', flour, true),
            short('q3', 'onlyExpired', eggs, true),
            yes('q4', oil, true),
          ],
        },
        onList,
      );
      const dialog = within(await ask(<p>home</p>, '/'));
      await act(() => vi.advanceTimersByTimeAsync(10));
      expect(dialog.getAllByRole('listitem')).toHaveLength(4);
      expect(
        dialog.queryByRole('button', { name: /to the Shopping List/ }),
      ).toBeNull();
    });

    it('shows the added rows on the Shopping List page after the add', async () => {
      setup({ actions: [], answers: [short('q1', 'no', butter, false)] });
      await ask(<ShoppingPage />, '/shopping');
      expect(screen.queryByText('Butter', { selector: 'p, span' })).toBeNull();

      await userEvent.click(await addButton(1));
      await act(() => vi.advanceTimersByTimeAsync(10));

      await waitFor(() =>
        expect(
          calls.filter((url) => url.includes('/shopping-list')).length,
        ).toBeGreaterThan(1),
      );
      expect(
        (await screen.findAllByText('Butter')).some(
          (el) => !el.closest('[role="dialog"]'),
        ),
      ).toBe(true);
    });

    it('waits for the Shopping List before offering the button, so Running low is not overcounted', async () => {
      let release: () => void = () => {};
      setup(
        {
          actions: [],
          answers: [short('q1', 'no', butter, false), yes('q2', oil, true)],
        },
        onList,
        new Promise<void>((resolve) => (release = resolve)),
      );
      const dialog = within(await ask(<p>home</p>, '/'));
      expect(dialog.getAllByRole('listitem')).toHaveLength(2);
      expect(
        dialog.queryByRole('button', { name: /to the Shopping List/ }),
      ).toBeNull();

      release();
      await act(() => vi.advanceTimersByTimeAsync(10));
      expect(await addButton(1)).toBeVisible();
    });

    it('adds from the Review answer card without applying or discarding the other Voice Actions', async () => {
      const side = (list: string) =>
        voiceAction({
          id: 'a2',
          target: list,
          text: 'honey',
          ingredient: eggs,
          defaults: { location: 'fridge' },
        });
      setup(
        {
          actions: [
            voiceAction({
              id: 'a1',
              target: 'shopping',
              text: 'bread',
              ingredient: flour,
            }),
            voiceAction({
              id: 'a2',
              status: 'needsList',
              target: null,
              text: 'honey',
              ingredient: eggs,
              byList: { shopping: side('shopping'), pantry: side('pantry') },
            }),
          ],
          answers: mixed,
        },
        onList,
      );
      const dialog = within(await ask(<p>home</p>, '/'));
      const card = within(dialog.getByRole('region', { name: 'Your Pantry' }));

      await userEvent.click(
        card.getByRole('button', { name: 'Add 3 to the Shopping List' }),
      );
      await act(() => vi.advanceTimersByTimeAsync(10));

      // Only the three adds went out: not a1, not the undecided a2.
      expect(applyPayloads).toHaveLength(1);
      expect(applyPayloads[0].actions.map((a) => a.ingredientId)).toEqual([
        'ing-butter',
        'ing-eggs',
        'ing-rice',
      ]);
      expect(await screen.findByText('3 applied')).toBeVisible();
      // Review and the card are still there, with the rows untouched and no discard toast.
      expect(dialog.getByRole('heading', { name: 'Review' })).toBeVisible();
      expect(card.getAllByRole('listitem')).toHaveLength(6);
      expect(
        card.queryByRole('button', { name: /to the Shopping List/ }),
      ).toBeNull();
      expect(
        dialog.getByRole('button', { name: 'Pick a list first' }),
      ).toBeEnabled();
      expect(screen.queryByText(/Discarded/)).toBeNull();
      expect(applyBodies()).toBe(1);

      // The rest is still ready to apply once a list is picked.
      await userEvent.click(
        within(dialog.getByRole('group', { name: 'List for Eggs' })).getByRole(
          'button',
          {
            name: 'Shopping List',
          },
        ),
      );
      await userEvent.click(
        dialog.getByRole('button', { name: 'Apply 2 changes' }),
      );
      await act(() => vi.advanceTimersByTimeAsync(10));
      expect(applyPayloads).toHaveLength(2);
      expect(applyPayloads[1].actions.map((a) => a.id)).toEqual(['a1', 'a2']);
    });

    // After the add, "Nothing was changed" would be false: the sheet drops its subline and Discard its hint.
    it('drops the "Nothing was changed" subline from the sheet after the add', async () => {
      setup({ actions: [], answers: mixed }, onList);
      const dialog = within(await ask(<p>home</p>, '/'));
      expect(dialog.getByText('Nothing was changed')).toBeVisible();

      await userEvent.click(await addButton(3));
      await act(() => vi.advanceTimersByTimeAsync(10));

      expect(await screen.findByText('3 applied')).toBeVisible();
      expect(dialog.queryByText('Nothing was changed')).toBeNull();
    });

    it('does not say "Nothing was changed" when Review is discarded after the add', async () => {
      setup(
        {
          actions: [
            voiceAction({ id: 'a1', target: 'shopping', text: 'bread' }),
          ],
          answers: mixed,
        },
        onList,
      );
      const dialog = within(await ask(<p>home</p>, '/'));
      const card = within(dialog.getByRole('region', { name: 'Your Pantry' }));

      await userEvent.click(
        card.getByRole('button', { name: 'Add 3 to the Shopping List' }),
      );
      await act(() => vi.advanceTimersByTimeAsync(10));
      expect(await screen.findByText('3 applied')).toBeVisible();

      await userEvent.click(dialog.getByRole('button', { name: 'Discard' }));
      await userEvent.click(dialog.getByRole('button', { name: 'Discard' }));
      await act(() => vi.advanceTimersByTimeAsync(10));

      expect(await screen.findByText('Voice Note discarded')).toBeVisible();
      expect(screen.queryByText(/Nothing was changed/)).toBeNull();
    });

    const applyBodies = () =>
      calls.filter((url) => url.endsWith('/voice/apply')).length;
  });

  it('puts focus back on the voice button after Done', async () => {
    setup({ actions: [], answers });
    const dialog = within(await ask(<p>home</p>, '/'));
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }));
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(await talkButton()).toHaveFocus();
  });

  it('closes on a scrim tap without applying anything', async () => {
    setup({ actions: [], answers });
    await ask(<p>home</p>, '/');
    fireEvent.click(document.querySelector('.MuiBackdrop-root')!);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.some((url) => url.endsWith('/voice/apply'))).toBe(false);
  });
});
