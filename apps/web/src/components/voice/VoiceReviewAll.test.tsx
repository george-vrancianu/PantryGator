import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// The fake voice environment registers its mocks, so it comes before anything that reaches the microphone.
import {
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
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '../../test/render';
import { AppLayout } from '../AppLayout';
import en from '../../i18n/locales/en/voice.json';
import ro from '../../i18n/locales/ro/voice.json';
import da from '../../i18n/locales/da/voice.json';

const bread = voiceIngredient('ing-bread', 'Bread');
const milk = voiceIngredient('ing-milk', 'Milk');
const eggs = voiceIngredient('ing-eggs', 'Eggs');

const shop = (id: string, ingredient: object, overrides = {}) =>
  voiceAction({
    id,
    target: 'shopping',
    op: 'add',
    text: id,
    ingredient,
    quantity: 1,
    unit: 'pcs',
    ...overrides,
  });
const pantry = (id: string, ingredient: object) =>
  voiceAction({
    id,
    target: 'pantry',
    op: 'add',
    text: id,
    ingredient,
    quantity: 1,
    unit: 'pcs',
    defaults: { location: 'fridge' },
  });
const undecided = (id: string, ingredient: object) =>
  voiceAction({
    id,
    status: 'needsList',
    target: null,
    op: 'add',
    text: id,
    ingredient,
    byList: { shopping: shop(id, ingredient), pantry: pantry(id, ingredient) },
  });

describe('Review all in the Voice Inbox', () => {
  let fake: ReturnType<typeof stubVoiceFetch>;
  let applied: { actions: Array<Record<string, unknown>> }[];
  let applyStatus: number;

  beforeEach(() => {
    useVoiceTimers();
    resetVoiceEnvironment();
    applied = [];
    applyStatus = 201;
    const { fetchMock } = stubApi({
      'GET /api/voice/config': () => Response.json({ configured: true }),
      'GET /api/catalog/search': () => Response.json({ results: [bread] }),
      'GET /api/catalog/aisles': () => Response.json({ aisles: [] }),
      'POST /api/voice/apply': () => {
        const last = applied[applied.length - 1];
        return applyStatus === 201
          ? Response.json(
              {
                applied: last.actions.map((a) => ({
                  actionId: a.id,
                  list: a.target,
                  rowId: `r-${String(a.id)}`,
                  alreadyDone: false,
                })),
                skipped: [],
              },
              { status: 201 },
            )
          : Response.json(
              { code: 'server_error', params: {} },
              { status: 500 },
            );
      },
    });
    fake = stubVoiceFetch(fetchMock, (input, init) => {
      if (String(input).endsWith('/voice/apply')) {
        applied.push(JSON.parse(init?.body as string) as never);
      }
    });
    fake.holdReads();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function speak(reads: number) {
    const button = await talkButton();
    pressDown(button);
    await screen.findByText("Gator's listening");
    await holdLongEnough();
    fireEvent.pointerUp(button);
    await waitFor(() => expect(fake.reads).toHaveLength(reads));
  }
  const reply = (
    index: number,
    transcript: string,
    actions: unknown[],
    answers: unknown[] = [],
  ) =>
    fake.reads[index].resolve(
      Response.json({ transcript, actions, answers }, { status: 201 }),
    );

  /** Two Voice Notes, answered out of order, with the sheet open. */
  async function twoNotes(first: unknown[], second: unknown[]) {
    render();
    await speak(1);
    await speak(2);
    reply(1, 'second note', second);
    reply(0, 'first note', first);
    await userEvent.click(
      await screen.findByRole('button', { name: /Open Review/ }),
    );
    return within(await screen.findByRole('dialog', { name: 'Review' }));
  }
  function render() {
    renderWithProviders(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/shopping" element={<p>shopping page</p>} />
        </Route>
      </Routes>,
      { route: '/shopping' },
    );
  }
  const reviewAll = async (
    sheet: ReturnType<typeof within>,
    count = 2,
  ): Promise<ReturnType<typeof within>> => {
    await userEvent.click(
      sheet.getByRole('button', { name: `Review all (${count})` }),
    );
    return within(await screen.findByRole('dialog', { name: 'Review all' }));
  };

  it('is offered only with two or more notes that have Voice Actions', async () => {
    render();
    await speak(1);
    await speak(2);
    reply(0, 'first note', [shop('a1', bread)]);
    // One note to review and one of only Pantry Questions: an answer sheet, not a Review.
    reply(
      1,
      'do we have milk',
      [],
      [
        {
          id: 'q1',
          kind: 'no',
          text: 'milk',
          ingredient: milk,
          onShoppingList: false,
        },
      ],
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Open Review/ }),
    );
    const sheet = within(await screen.findByRole('dialog', { name: 'Review' }));
    expect(sheet.queryByRole('button', { name: /Review all/ })).toBeNull();
  });

  it('does not count a note without Voice Actions toward Review all', async () => {
    render();
    await speak(1);
    await speak(2);
    reply(0, 'first note', [shop('a1', bread)]);
    reply(1, 'just chatting', []);
    await userEvent.click(
      await screen.findByRole('button', { name: /Open Review/ }),
    );
    const sheet = within(await screen.findByRole('dialog', { name: 'Review' }));
    expect(sheet.queryByRole('button', { name: /Review all/ })).toBeNull();
  });

  it('merges only the notes that have Voice Actions', async () => {
    render();
    await speak(1);
    await speak(2);
    reply(0, 'first note', [shop('a1', bread)]);
    reply(1, 'just chatting', []);
    await speak(3);
    reply(2, 'third note', [shop('a3', milk)]);
    await userEvent.click(
      await screen.findByRole('button', { name: /Open Review/ }),
    );
    const sheet = within(await screen.findByRole('dialog', { name: 'Review' }));
    const dialog = await reviewAll(sheet);
    expect(dialog.getByText(/first note/)).toBeVisible();
    expect(dialog.getByText(/third note/)).toBeVisible();
    expect(dialog.queryByText(/just chatting/)).toBeNull();
  });

  it('merges the notes in recording order: transcripts, one answer card, actions grouped by list, duplicates kept', async () => {
    const sheet = await twoNotes(
      [shop('a1', bread), pantry('a2', milk)],
      [shop('b1', bread), pantry('b2', eggs)],
    );
    const dialog = await reviewAll(sheet);

    const heard = within(dialog.getByRole('region', { name: 'What I heard' }));
    const lines = heard.getAllByRole('listitem');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent('first note');
    expect(lines[0]).toHaveTextContent('Shopping List');
    expect(lines[1]).toHaveTextContent('second note');

    // Bread is on both notes and stays twice.
    const shopping = within(
      dialog.getByRole('region', { name: 'Shopping List' }),
    );
    expect(shopping.getAllByText('Bread')).toHaveLength(2);
    const inPantry = within(dialog.getByRole('region', { name: 'Pantry' }));
    expect(inPantry.getAllByRole('listitem')).toHaveLength(2);
    expect(
      dialog.getByRole('button', { name: 'Apply 4 changes' }),
    ).toBeVisible();
  });

  it('shows one answer card holding the answers of every note', async () => {
    const answer = (id: string, ingredient: typeof bread) => ({
      id,
      kind: 'no',
      text: ingredient.name,
      ingredient,
      onShoppingList: false,
    });
    render();
    await speak(1);
    await speak(2);
    reply(0, 'first note', [shop('a1', bread)], [answer('q1', milk)]);
    reply(1, 'second note', [shop('b1', eggs)], [answer('q2', eggs)]);
    await userEvent.click(
      await screen.findByRole('button', { name: /Open Review/ }),
    );
    const dialog = await reviewAll(
      within(await screen.findByRole('dialog', { name: 'Review' })),
    );
    const cards = dialog.getAllByRole('region', { name: 'Your Pantry' });
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getAllByRole('listitem')).toHaveLength(2);
  });

  it('sends one apply request with every action in recording order, and removes every note on success', async () => {
    const sheet = await twoNotes(
      [shop('a1', bread), pantry('a2', milk)],
      [shop('b1', eggs)],
    );
    const dialog = await reviewAll(sheet);
    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 3 changes' }),
    );

    await waitFor(() => expect(applied).toHaveLength(1));
    expect(applied[0].actions.map((a) => a.id)).toEqual(['a1', 'a2', 'b1']);
    expect(await screen.findByText(/^3 applied/)).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Nothing is left in the Voice Inbox.
    expect(screen.queryByRole('button', { name: /^Open/ })).toBeNull();
    expect(screen.queryByText('2 in the background')).toBeNull();
  });

  it('keeps every note with its edits when Apply fails, and sends the edits on the next try', async () => {
    const sheet = await twoNotes([shop('a1', bread)], [shop('b1', eggs)]);
    const dialog = await reviewAll(sheet);

    await userEvent.click(
      within(
        dialog.getByRole('region', { name: 'Shopping List' }),
      ).getAllByRole('button', { expanded: false })[1],
    );
    const amount = dialog.getByRole('textbox', { name: /^Amount of Eggs,/ });
    await userEvent.clear(amount);
    await userEvent.type(amount, '9');

    applyStatus = 500;
    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 2 changes' }),
    );
    expect(await dialog.findByRole('alert')).toBeVisible();
    expect(
      dialog.getByRole('textbox', { name: /^Amount of Eggs,/ }),
    ).toHaveValue('9');

    applyStatus = 201;
    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 2 changes' }),
    );
    await waitFor(() => expect(applied).toHaveLength(2));
    expect(applied[1].actions.map((a) => [a.id, a.quantity])).toEqual([
      ['a1', 1],
      ['b1', 9],
    ]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('puts every action that needs a list, across notes, on the chosen list', async () => {
    const sheet = await twoNotes(
      [undecided('a1', bread), shop('a2', milk)],
      [undecided('b1', eggs)],
    );
    const dialog = await reviewAll(sheet);
    expect(
      dialog.getByRole('button', { name: 'Pick a list first' }),
    ).toBeEnabled();

    await userEvent.click(
      within(dialog.getByRole('group', { name: 'Put all on' })).getByRole(
        'button',
        { name: 'Pantry' },
      ),
    );
    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 3 changes' }),
    );
    await waitFor(() => expect(applied).toHaveLength(1));
    expect(applied[0].actions.map((a) => [a.id, a.target])).toEqual([
      ['a1', 'pantry'],
      ['a2', 'shopping'],
      ['b1', 'pantry'],
    ]);
  });

  it('asks once to discard and removes every merged note, applying nothing', async () => {
    const sheet = await twoNotes([shop('a1', bread)], [shop('b1', eggs)]);
    const dialog = await reviewAll(sheet);
    await userEvent.click(dialog.getByRole('button', { name: 'Discard' }));
    expect(dialog.getByText('Discard all these Voice Notes?')).toBeVisible();
    await userEvent.click(dialog.getByRole('button', { name: 'Discard' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Voice Notes discarded')).toBeVisible();
    expect(applied).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /^Open/ })).toBeNull();
    expect(screen.queryByText('2 in the background')).toBeNull();
  });

  it('refuses a merge over 50 Voice Actions with a message, and lets the notes be reviewed on their own', async () => {
    const many = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) => shop(`${prefix}${i}`, bread));
    const sheet = await twoNotes(many('a', 26), many('b', 25));
    await userEvent.click(
      sheet.getByRole('button', { name: 'Review all (2)' }),
    );

    expect(
      await sheet.findByText(/more than 50 changes for one Apply/),
    ).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Review all' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Review' })).toBeVisible();

    // The notes can still be reviewed one by one.
    await userEvent.click(
      sheet.getAllByRole('button', { name: /^Review: / })[1],
    );
    expect(await screen.findByRole('dialog', { name: 'Review' })).toBeVisible();
  });

  it('drops the refusal once the notes it was made for change', async () => {
    const many = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) => shop(`${prefix}${i}`, bread));
    render();
    await speak(1);
    await speak(2);
    // A third note waits behind the two being read.
    const button = await talkButton();
    pressDown(button);
    await screen.findByText("Gator's listening");
    await holdLongEnough();
    fireEvent.pointerUp(button);
    reply(0, 'first note', many('a', 26));
    reply(1, 'second note', many('b', 25));
    await userEvent.click(
      await screen.findByRole('button', { name: /Open Review/ }),
    );
    const sheet = within(await screen.findByRole('dialog', { name: 'Review' }));
    await userEvent.click(
      await sheet.findByRole('button', { name: 'Review all (2)' }),
    );
    expect(await sheet.findByText(/more than 50 changes/)).toBeVisible();

    // The third note is read: the refusal was about two notes.
    await waitFor(() => expect(fake.reads).toHaveLength(3));
    reply(2, 'third note', [shop('c1', milk)]);
    expect(
      await sheet.findByRole('button', { name: 'Review all (3)' }),
    ).toBeVisible();
    expect(sheet.queryByText(/more than 50 changes/)).toBeNull();
  });

  it('allows exactly 50 Voice Actions', async () => {
    const many = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) => shop(`${prefix}${i}`, bread));
    const sheet = await twoNotes(many('a', 25), many('b', 25));
    const dialog = await reviewAll(sheet);
    expect(
      dialog.getByRole('button', { name: 'Apply 50 changes' }),
    ).toBeVisible();
  });

  it('has its copy in English, Romanian and Danish', () => {
    for (const voice of [en, ro, da]) {
      expect(voice.inbox.reviewAll).toContain('{{count}}');
      expect(voice.inbox.reviewAllTooMany).toContain('{{max}}');
      expect(voice.review.titleAll).toBeTruthy();
      expect(voice.review.footer.confirmAll).toBeTruthy();
      expect(voice.review.footer.discardedAll).toBeTruthy();
    }
  });
});
