import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bubbleSays,
  openReady,
  mic,
  recordAndSend,
  resetVoiceEnvironment,
  stubVoiceFetch,
  voiceAction,
  voiceIngredient as ingredient,
} from '../../test/voice';
import { resetRowFlash } from '../../lib/rowFlash';
import {
  holdLongEnough,
  pressDown,
  useVoiceTimers,
} from '../../test/voiceHold';
import {
  locationToggle,
  pickLocation,
  pressedLocation,
} from '../../test/location';
import { renderInAppLayout, stubApi } from '../../test/render';
import { PantryPage } from './PantryPage';

const yogurt = ingredient('ing-yogurt', 'Yogurt');
const rice = ingredient('ing-rice', 'Rice');

const action = (overrides: Record<string, unknown>) =>
  voiceAction({ text: 'yogurt', ingredient: yogurt, ...overrides });

const riceBatch = (id: string, quantity: number, expiresOn: string | null) => ({
  id,
  name: 'Rice',
  quantity,
  unit: 'g',
  location: 'cupboard',
  expiresOn,
});

describe('Voice Notes on the Pantry page', () => {
  let applied: Record<string, unknown>[];
  let pantryFetches: number;

  function setup(
    actions: unknown[],
    apply: () => Response = () =>
      Response.json(
        {
          applied: [
            { actionId: 'a1', list: 'pantry', rowId: 'b1', alreadyDone: false },
          ],
          skipped: [],
        },
        { status: 201 },
      ),
    batches: unknown[] = [],
    /** How the first Voice Note read ends: it answers, the network fails, or it never settles. */
    firstRead: 'answers' | 'fails' | 'hangs' = 'answers',
  ) {
    let reads = 0;
    applied = [];
    pantryFetches = 0;
    const { fetchMock } = stubApi({
      'GET /api/pantry/recently-stocked': () =>
        Response.json({ ingredients: [] }),
      'GET /api/pantry': () => {
        pantryFetches += 1;
        return Response.json({ batches, runningLow: [] });
      },
      'GET /api/voice/config': () => Response.json({ configured: true }),
      'GET /api/catalog/search': () =>
        Response.json({ results: [yogurt, rice] }),
      'POST /api/voice': () => {
        reads += 1;
        // A network error is tried once more by itself.
        if (reads <= 2 && firstRead === 'fails') {
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        if (reads === 1 && firstRead === 'hangs')
          return new Promise<Response>(() => {});
        return Response.json(
          { transcript: 'a note about the pantry', actions },
          { status: 201 },
        );
      },
      'POST /api/voice/apply': () => apply(),
    });
    return stubVoiceFetch(fetchMock, (input, init) => {
      if (
        String(input).endsWith('/voice/apply') &&
        typeof init?.body === 'string'
      ) {
        applied.push(JSON.parse(init.body) as Record<string, unknown>);
      }
    });
  }

  async function openReview() {
    renderInAppLayout(<PantryPage />, '/pantry');
    const button = await screen.findByRole('button', {
      name: /hold to record a voice note/i,
    });
    pressDown(button);
    await screen.findByText("Gator's listening");
    await holdLongEnough();
    fireEvent.pointerUp(button);
    return openReady();
  }

  beforeEach(() => {
    useVoiceTimers();
    // `inDays` and the app both read today: pin it so the dates do not depend on the day the suite runs.
    vi.setSystemTime(new Date(2026, 9, 19, 12));
    resetVoiceEnvironment();
    resetRowFlash();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('has no Spoken Language chip above the Dock', async () => {
    setup([]);
    renderInAppLayout(<PantryPage />, '/pantry');
    await screen.findByRole('button', { name: /hold to record a voice note/i });
    expect(
      screen.queryByRole('button', { name: /Spoken Language/ }),
    ).toBeNull();
  });

  it('shows a note that failed on the Shopping List here too, and retries it for its own page', async () => {
    // Recorded on the Shopping List, then the Member moved to the Pantry (not a reload).
    const { sent } = setup([], undefined, [], 'fails');
    await recordAndSend({
      spokenLanguage: 'ro',
      defaultTarget: 'shopping',
    });
    renderInAppLayout(<PantryPage />, '/pantry');

    await bubbleSays('1 could not be read');
    fireEvent.click(screen.getByRole('button', { name: /Open Review/ }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Review',
    });

    await userEvent.click(
      within(dialog).getByRole('button', { name: /^Retry:/ }),
    );
    await userEvent.keyboard('{Escape}');

    expect(await openReady()).toBeVisible();
    expect(sent[0].get('spokenLanguage')).toBe('ro');
    expect(sent[0].get('defaultTarget')).toBe('shopping');
  });

  it('keeps the voice button and a read going while a Batch is added, the bubble stepping aside', async () => {
    setup([], undefined, [], 'hangs');
    await recordAndSend({
      spokenLanguage: 'en',
      defaultTarget: 'pantry',
    });
    renderInAppLayout(<PantryPage />, '/pantry');
    await screen.findByRole('button', {
      name: 'Gator is working: 1 being read. Open Review',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Add batch' }));

    // The sheet sits over the page: the voice button stays rendered behind its scrim.
    await screen.findByRole('dialog', { name: 'Add to Pantry' });
    expect(
      screen.getByRole('button', {
        name: /hold to record a voice note/i,
        hidden: true,
      }),
    ).toBeInTheDocument();
    // The bubble gives way to a Sheet.
    expect(
      screen.queryByRole('button', {
        name: 'Gator is working: 1 being read. Open Review',
        hidden: true,
      }),
    ).toBeNull();
  });

  it('puts the voice button on the Pantry page and records for the Pantry', async () => {
    const { sent } = setup([]);
    await openReview();
    expect(sent[0].get('defaultTarget')).toBe('pantry');
  });

  it('shows the Pantry examples in the microphone intro, and records nothing', async () => {
    setup([]);
    mic.permission.mockResolvedValue('prompt');
    renderInAppLayout(<PantryPage />, '/pantry');

    pressDown(
      await screen.findByRole('button', {
        name: /hold to record a voice note/i,
      }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('We finished the milk');
    expect(dialog).toHaveTextContent('Marks rice running low');
    expect(dialog).not.toHaveTextContent('Goes straight to the Pantry');
    expect(mic.start).not.toHaveBeenCalled();
  });

  /** The date `days` from now as YYYY-MM-DD, worked out apart from the app's own helper. */
  const inDays = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
  const rowOf = (dialog: ReturnType<typeof within>, name: string) =>
    dialog.getByText(name, { selector: 'b' }).closest('li') as HTMLElement;
  const headerOf = (row: HTMLElement) =>
    within(row)
      .getAllByRole('button')
      .find((b) => b.hasAttribute('aria-expanded')) as HTMLElement;
  const header = (dialog: ReturnType<typeof within>, name: string) =>
    headerOf(rowOf(dialog, name));

  it('tells the Member the note goes to the Pantry while listening', async () => {
    setup([]);
    renderInAppLayout(<PantryPage />, '/pantry');
    pressDown(
      await screen.findByRole('button', {
        name: /hold to record a voice note/i,
      }),
    );
    expect(await screen.findByText("Gator's listening")).toBeVisible();
    // The refresh loader's live region is also a status, empty at rest.
    const note = screen
      .getAllByRole('status')
      .find((status) => status.textContent !== '');
    expect(note).toHaveTextContent(
      'Goes to your Pantry. Say “on the list” for the Shopping List.',
    );
  });

  it('names the Location and expiry an add will use, marking the ones nobody said', async () => {
    setup([
      action({
        quantity: 2,
        unit: 'pcs',
        defaults: { location: 'fridge', expiresOn: '2099-05-20' },
      }),
      action({
        id: 'a2',
        ingredient: rice,
        text: 'rice in the cupboard until June',
        location: 'cupboard',
        expiresOn: '2099-06-01',
      }),
      action({
        id: 'a3',
        ingredient: ingredient('ing-salt', 'Salt'),
        text: 'salt, no expiry',
        location: 'spices',
        noExpiry: true,
      }),
    ]);
    const dialog = within(await openReview());
    await dialog.findByText('Yogurt', { selector: 'b' });

    expect(rowOf(dialog, 'Yogurt').textContent).toMatch(
      /^Add Yogurt2 pcs · Fridge · usual · expires .*2099 · default$/,
    );
    expect(rowOf(dialog, 'Rice').textContent).toMatch(
      /^Add RiceNo amount · Cupboard · expires .*2099$/,
    );
    expect(rowOf(dialog, 'Salt').textContent).toBe(
      'Add SaltNo amount · Spices · no expiry',
    );
    // The marked ones have a dotted underline; the ones said aloud do not.
    expect(dialog.getAllByText(/usual|default/)).toHaveLength(2);

    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 3 changes' }),
    );
    await waitFor(() => expect(applied).toHaveLength(1));
    expect(applied[0]).toMatchObject({
      today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
      actions: [
        {
          id: 'a1',
          target: 'pantry',
          op: 'add',
          location: 'fridge',
          expiresOn: '2099-05-20',
          quantity: 2,
          unit: 'pcs',
        },
        { id: 'a2', location: 'cupboard', expiresOn: '2099-06-01' },
        { id: 'a3', location: 'spices', expiresOn: null, noExpiry: true },
      ],
    });
  });

  /** Opens the open row's expiry sheet, taps `name` in it and closes it with Done. */
  async function pickInExpirySheet(
    dialog: ReturnType<typeof within>,
    name: string | RegExp,
  ) {
    await userEvent.click(dialog.getByRole('button', { name: /^Expires,/ }));
    const sheet = within(
      await screen.findByRole('dialog', { name: 'Expires' }),
    );
    await userEvent.click(sheet.getByRole('button', { name }));
    await userEvent.click(sheet.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Expires' })).toBeNull(),
    );
  }

  it('sends a picked Location, a quick-pick expiry and No expiry', async () => {
    setup([
      action({ defaults: { location: 'fridge', expiresOn: '2099-05-20' } }),
      action({
        id: 'a2',
        ingredient: rice,
        text: 'rice',
        defaults: { location: 'cupboard', expiresOn: '2099-05-20' },
      }),
    ]);
    const dialog = within(await openReview());

    await userEvent.click(header(dialog, 'Yogurt'));
    // Nobody said a Location: the Catalog default shows pressed, with the note under it.
    const panel = screen.getByRole('dialog');
    expect(pressedLocation(panel)).toBe('Fridge');
    expect(dialog.getByText(/^Not said, so the usual place/)).toBeVisible();
    await pickLocation(userEvent.setup(), 'Freezer', panel);
    expect(pressedLocation(panel)).toBe('Freezer');
    expect(dialog.queryByText(/^Not said, so the usual place/)).toBeNull();
    expect(rowOf(dialog, 'Yogurt').textContent).toContain('Freezer · expires');
    expect(rowOf(dialog, 'Yogurt').textContent).not.toContain('usual');
    await pickInExpirySheet(dialog, /^3 days/);
    expect(dialog.queryByText(/Default Expiry for this/)).toBeNull();

    await userEvent.click(header(dialog, 'Rice'));
    await pickInExpirySheet(dialog, 'No expiry');
    expect(rowOf(dialog, 'Rice').textContent).toContain('no expiry');

    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 2 changes' }),
    );
    await waitFor(() => expect(applied).toHaveLength(1));
    expect(applied[0]).toMatchObject({
      actions: [
        {
          id: 'a1',
          location: 'freezer',
          expiresOn: inDays(3),
          noExpiry: false,
        },
        { id: 'a2', location: 'cupboard', expiresOn: null, noExpiry: true },
      ],
    });
  });

  it('picks an expiry in the existing date sheet', async () => {
    setup([
      action({ defaults: { location: 'fridge', expiresOn: '2099-05-20' } }),
    ]);
    const dialog = within(await openReview());
    await userEvent.click(header(dialog, 'Yogurt'));
    expect(
      dialog.getByText(/Default Expiry for this Ingredient/),
    ).toBeVisible();

    await userEvent.click(dialog.getByRole('button', { name: /^Expires,/ }));
    const sheet = within(
      await screen.findByRole('dialog', { name: 'Expires' }),
    );
    await userEvent.click(sheet.getByRole('button', { name: /^1 month/ }));
    await userEvent.click(sheet.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Expires' })).toBeNull(),
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Apply 1 change' }),
    );
    await waitFor(() => expect(applied).toHaveLength(1));
    expect(applied[0]).toMatchObject({
      actions: [{ id: 'a1', expiresOn: inDays(30), noExpiry: false }],
    });
  });

  it('holds Apply back for an add with no Location, opened and focused, until one is picked', async () => {
    setup([action({ ingredient: null, name: 'Quinoa crackers' })]);
    const dialog = within(await openReview());

    const apply = await dialog.findByRole('button', {
      name: 'Pick a place first',
    });
    expect(apply).toHaveAttribute('aria-disabled', 'true');
    expect(header(dialog, 'Quinoa crackers')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(rowOf(dialog, 'Quinoa crackers').textContent).toContain(
      'Pick a place',
    );
    await waitFor(() =>
      expect(dialog.getByRole('button', { name: 'Fridge' })).toHaveFocus(),
    );
    // No Location said and no Catalog default: nothing is pressed yet.
    expect(
      within(locationToggle(screen.getByRole('dialog')))
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-pressed')),
    ).toEqual(['false', 'false', 'false', 'false']);

    // Tapping the held-back Apply sends focus back to the picker.
    (document.activeElement as HTMLElement).blur();
    await userEvent.click(apply);
    expect(dialog.getByRole('button', { name: 'Fridge' })).toHaveFocus();
    expect(applied).toHaveLength(0);

    await userEvent.click(dialog.getByRole('button', { name: 'Cupboard' }));
    expect(
      dialog.getByRole('button', { name: 'Apply 1 change' }),
    ).not.toHaveAttribute('aria-disabled');
  });

  it("takes the new Match's Location when an Unmatched add gets matched", async () => {
    setup([action({ ingredient: null, name: 'Quinoa crackers' })]);
    const dialog = within(await openReview());
    await dialog.findByRole('button', { name: 'Pick a place first' });

    await userEvent.click(
      dialog.getByRole('button', {
        name: 'Change Ingredient: Quinoa crackers',
      }),
    );
    await userEvent.click(await screen.findByText('Rice'));

    await waitFor(() =>
      expect(
        dialog.getByRole('button', { name: 'Apply 1 change' }),
      ).toBeEnabled(),
    );
    expect(dialog.getByRole('button', { name: 'Fridge' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(rowOf(dialog, 'Rice').textContent).toContain('Fridge · usual');
  });

  it('says what a removal takes: one Batch, all of them, or an amount from several', async () => {
    const batches = [
      { ...riceBatch('b1', 1, '2099-05-20'), name: 'Milk', unit: 'l', take: 1 },
    ];
    const milk = ingredient('ing-milk', 'Milk');
    setup([
      action({
        id: 'a1',
        op: 'remove',
        ingredient: milk,
        text: 'finished the milk',
        scope: 'one',
        rows: { batches },
      }),
      action({
        id: 'a2',
        op: 'remove',
        ingredient: ingredient('ing-eggs', 'Eggs'),
        text: 'out of eggs',
        scope: 'all',
        rows: {
          batches: [
            { ...riceBatch('e1', 6, '2099-05-20'), unit: 'pcs', take: null },
            { ...riceBatch('e2', 10, null), unit: 'pcs', take: null },
          ],
        },
      }),
      action({
        id: 'a3',
        op: 'remove',
        ingredient: rice,
        text: 'used 500 g of rice',
        quantity: 500,
        unit: 'g',
        scope: 'one',
        rows: {
          batches: [
            { ...riceBatch('b1', 300, '2099-05-20'), take: null },
            { ...riceBatch('b2', 400, null), take: 200 },
          ],
        },
      }),
    ]);
    const dialog = within(await openReview());
    await dialog.findByText('Milk', { selector: 'b' });

    expect(rowOf(dialog, 'Milk').textContent).toMatch(
      /^Remove MilkTakes 1 L · .*2099, expiring soonest$/,
    );
    expect(rowOf(dialog, 'Eggs').textContent).toBe(
      'Remove all EggsTakes all 2 batches · 16 pcs',
    );
    expect(rowOf(dialog, 'Rice').textContent).toBe(
      'Use RiceTakes 500 g from 2 batches, soonest first',
    );

    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 3 changes' }),
    );
    await waitFor(() => expect(applied).toHaveLength(1));
    expect(applied[0]).toMatchObject({
      actions: [
        { id: 'a1', op: 'remove', batchId: null, batchIds: ['b1'] },
        { id: 'a2', scope: 'all', batchIds: ['e1', 'e2'] },
        { id: 'a3', quantity: 500, batchIds: ['b1', 'b2'] },
      ],
    });
  });

  it('asks which Batch when the amount does not fit, soonest first, and holds Apply until one is picked', async () => {
    setup([
      action({
        op: 'remove',
        status: 'needsBatch',
        ingredient: rice,
        text: 'used 5 kg of rice',
        quantity: 5,
        unit: 'kg',
        rows: {
          batches: [
            riceBatch('b1', 300, '2099-05-20'),
            riceBatch('b2', 400, null),
            riceBatch('b3', 100, '2098-01-02'),
          ],
        },
      }),
    ]);
    const dialog = within(await openReview());

    const apply = await dialog.findByRole('button', {
      name: 'Pick a batch first',
    });
    expect(apply).toHaveAttribute('aria-disabled', 'true');
    expect(header(dialog, 'Rice').textContent).toBe(
      "Use Rice5 kg doesn't fit batches counted in g · pick one",
    );
    expect(header(dialog, 'Rice')).toHaveAttribute('aria-expanded', 'true');

    const group = within(
      dialog.getByRole('radiogroup', { name: 'Which batch did you use up?' }),
    );
    const radios = group.getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual([
      'b3',
      'b1',
      'b2',
    ]);
    await waitFor(() => expect(radios[0]).toHaveFocus());

    await userEvent.click(radios[1]);
    expect(
      dialog.getByRole('button', { name: 'Apply 1 change' }),
    ).not.toHaveAttribute('aria-disabled');
    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 1 change' }),
    );
    await waitFor(() => expect(applied).toHaveLength(1));
    expect(applied[0]).toMatchObject({
      actions: [{ op: 'remove', batchId: 'b1', batchIds: [] }],
    });
  });

  it('explains a Running low, and one that becomes a Shopping List add', async () => {
    setup([
      action({
        id: 'a1',
        op: 'runningLow',
        ingredient: rice,
        text: 'running low on rice',
        rows: {},
      }),
      action({
        id: 'a2',
        op: 'runningLow',
        ingredient: ingredient('ing-butter', 'Butter'),
        text: 'butter is running low',
        rows: { shoppingFallback: true },
      }),
    ]);
    const dialog = within(await openReview());
    await dialog.findByText('Rice', { selector: 'b' });
    expect(rowOf(dialog, 'Rice').textContent).toBe(
      'Running low RiceShows in Suggestions until a new batch arrives',
    );
    expect(rowOf(dialog, 'Butter').textContent).toBe(
      'Add ButterNo amount · no Butter in the Pantry, so it goes on the list',
    );
  });

  it("lists a removal with nothing to take under Couldn't apply", async () => {
    setup([
      action({
        op: 'remove',
        status: 'notFound',
        ingredient: rice,
        text: 'rice',
      }),
    ]);
    const dialog = within(await openReview());
    const couldnt = within(
      await dialog.findByRole('region', { name: "Couldn't apply" }),
    );
    expect(couldnt.getByText('No Rice in your Pantry.')).toBeVisible();
    expect(dialog.getByText('Nothing to apply')).toBeVisible();
  });

  it('refreshes the Pantry after Apply and names what was skipped', async () => {
    setup(
      [action({ defaults: { location: 'fridge', expiresOn: '2099-05-20' } })],
      () =>
        Response.json(
          {
            applied: [],
            skipped: [{ id: 'a1', reason: 'pantry.batch_not_found' }],
          },
          { status: 201 },
        ),
    );
    const dialog = within(await openReview());
    const before = pantryFetches;
    await userEvent.click(
      await dialog.findByRole('button', { name: 'Apply 1 change' }),
    );
    await waitFor(() => expect(pantryFetches).toBeGreaterThan(before));
    // The skipped name is lowercased to read after "skipped:".
    expect(
      await screen.findByText(
        /^0 applied, 1 skipped: yogurt no longer in Pantry$/,
      ),
    ).toBeTruthy();
  });

  it('names the Pantry first on its own page when both lists changed', async () => {
    setup(
      [
        action({ defaults: { location: 'fridge', expiresOn: '2099-05-20' } }),
        action({
          id: 'a2',
          text: 'rice',
          ingredient: rice,
          defaults: { location: 'cupboard', expiresOn: '2099-05-20' },
        }),
        action({
          id: 'a3',
          target: 'shopping',
          text: 'eggs',
          name: 'Eggs',
          ingredient: null,
        }),
      ],
      () =>
        Response.json(
          {
            applied: [
              {
                actionId: 'a3',
                list: 'shopping',
                rowId: 'i1',
                alreadyDone: false,
              },
              {
                actionId: 'a1',
                list: 'pantry',
                rowId: 'b1',
                alreadyDone: false,
              },
              {
                actionId: 'a2',
                list: 'pantry',
                rowId: 'b2',
                alreadyDone: false,
              },
            ],
            skipped: [],
          },
          { status: 201 },
        ),
    );
    const dialog = within(await openReview());
    await userEvent.click(
      await dialog.findByRole('button', { name: 'Apply 3 changes' }),
    );
    expect(
      await screen.findByText('3 applied: 2 in the Pantry, 1 on the list'),
    ).toBeVisible();
  });

  it('flashes the Pantry row of the Batch Apply touched, and puts focus on the voice button', async () => {
    const stocked = {
      id: 'b1',
      name: 'Yogurt',
      ingredientId: 'ing-yogurt',
      unmatched: false,
      aisle: null,
      amountScale: null,
      defaultUnit: null,
      defaultExpiryDays: null,
      quantity: 2,
      unit: 'pcs',
      location: 'fridge',
      expiryDate: null,
      productDescription: null,
      createdAt: '2026-10-01T00:00:00Z',
    };
    setup(
      [action({ defaults: { location: 'fridge', expiresOn: '2099-05-20' } })],
      undefined,
      [stocked, { ...stocked, id: 'b9', name: 'Milk', ingredientId: 'm' }],
    );
    const dialog = within(await openReview());
    await userEvent.click(
      await dialog.findByRole('button', { name: 'Apply 1 change' }),
    );
    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll('[data-row-flash]')).map((el) =>
          el.closest('li')?.textContent?.slice(0, 6),
        ),
      ).toEqual(['Yogurt']),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /hold to record a voice note/i }),
      ).toHaveFocus(),
    );
  });

  it('flashes the roll-up row of every Location a removal changed', async () => {
    const stocked = {
      id: 'r1',
      name: 'Yogurt',
      ingredientId: 'ing-yogurt',
      unmatched: false,
      aisle: null,
      amountScale: null,
      defaultUnit: null,
      defaultExpiryDays: null,
      quantity: 2,
      unit: 'pcs',
      location: 'fridge',
      expiryDate: null,
      productDescription: null,
      createdAt: '2026-10-01T00:00:00Z',
    };
    setup(
      [action({ defaults: { location: 'fridge', expiresOn: '2099-05-20' } })],
      () =>
        Response.json(
          {
            applied: [
              {
                actionId: 'a1',
                list: 'pantry',
                rowId: 'r1',
                rowIds: ['r1', 'r2'],
                alreadyDone: false,
              },
            ],
            skipped: [],
          },
          { status: 201 },
        ),
      [
        stocked,
        { ...stocked, id: 'r2', location: 'freezer' },
        { ...stocked, id: 'r9', name: 'Milk', ingredientId: 'm' },
      ],
    );
    const dialog = within(await openReview());
    await userEvent.click(
      await dialog.findByRole('button', { name: 'Apply 1 change' }),
    );
    for (const section of [/^Fridge/, /^Freezer/]) {
      const region = await screen.findByRole('region', { name: section });
      await waitFor(() =>
        expect(region.querySelectorAll('[data-row-flash]')).toHaveLength(1),
      );
    }
  });
});
