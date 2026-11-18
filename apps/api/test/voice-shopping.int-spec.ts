import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import { DATABASE } from '../src/database/database.constants';
import type { Database } from '../src/database/database.types';
import {
  recipes,
  shoppingItemSourceRecipes,
  unmatchedEntries,
} from '../src/database/schema';
import { seedId } from '../src/catalog/seed/seed-catalog';
import { createTestApp, TEST_ORIGIN } from './support/create-test-app';

type Item = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
  unmatched: boolean;
};

describe('Shopping List Voice Actions (integration)', () => {
  let app: NestFastifyApplication;
  let reading: { actions: object[]; unsupported: string[] };
  let counter = 0;

  beforeAll(async () => {
    const ai = {
      generate: () =>
        Promise.resolve({
          data: { spokenLanguage: null, ...reading },
          requestId: 'req-1',
        }),
    };
    const transcription = {
      isConfigured: () => true,
      transcribe: () => Promise.resolve({ text: 'spoken' }),
    };
    app = await createTestApp([], ai, undefined, undefined, transcription);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    reading = { actions: [], unsupported: [] };
  });

  async function signUp() {
    const n = ++counter;
    const response = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('origin', TEST_ORIGIN)
      .set('x-forwarded-for', `10.16.${Math.floor(n / 250)}.${n % 250}`)
      .send({
        name: `VoiceShop ${n}`,
        email: `voice-shop-${Date.now()}-${n}@example.com`,
        password: 'correct-horse-staple',
      })
      .expect(200);
    return [response.headers['set-cookie'] ?? []]
      .flat()
      .map((c) => c.split(';')[0])
      .join('; ');
  }

  const note = (cookie: string) =>
    request(app.getHttpServer())
      .post('/api/voice')
      .set('origin', TEST_ORIGIN)
      .set('cookie', cookie)
      .field('spokenLanguage', 'en')
      .field('locale', 'en')
      .field('defaultTarget', 'shopping')
      .field('today', '2026-10-16')
      .field('durationMs', '3000')
      .attach('audio', Buffer.from('fake-audio'), {
        filename: 'note.webm',
        contentType: 'audio/webm',
      });

  const apply = (cookie: string, actions: object[]) =>
    request(app.getHttpServer())
      .post('/api/voice/apply')
      .set('origin', TEST_ORIGIN)
      .set('cookie', cookie)
      .send({ actions, locale: 'en' });

  const list = async (cookie: string) =>
    (
      (
        await request(app.getHttpServer())
          .get('/api/shopping-list?locale=en')
          .set('origin', TEST_ORIGIN)
          .set('cookie', cookie)
          .expect(200)
      ).body as { groups: { items: Item[] }[] }
    ).groups.flatMap((g) => g.items);

  const addItem = (cookie: string, body: object) =>
    request(app.getHttpServer())
      .post('/api/shopping-list/items?locale=en')
      .set('origin', TEST_ORIGIN)
      .set('cookie', cookie)
      .send(body)
      .expect(200);

  const model = (overrides: Record<string, unknown>) => ({
    target: 'shopping',
    op: 'add',
    spokenText: 'x',
    matchedIngredientId: null,
    matchConfidence: 0,
    fallbackIngredientName: 'X',
    spokenName: 'X',
    quantity: null,
    unit: null,
    scope: null,
    expiresOn: null,
    noExpiry: false,
    location: null,
    ...overrides,
  });
  const eggsModel = (op: string, extra: Record<string, unknown> = {}) =>
    model({
      op,
      spokenText: 'eggs',
      matchedIngredientId: seedId.ingredient('eggs'),
      matchConfidence: 0.95,
      fallbackIngredientName: 'Eggs',
      ...extra,
    });

  const action = (op: string, fields: Record<string, unknown>, id = 'a1') => ({
    id,
    target: 'shopping',
    op,
    ingredientId: null,
    name: null,
    quantity: null,
    unit: null,
    ...fields,
  });
  const EGGS = { ingredientId: seedId.ingredient('eggs') };
  const MILK = { ingredientId: seedId.ingredient('milk') };

  const read = async (cookie: string) =>
    (
      (await note(cookie).expect(201)).body as {
        actions: Record<string, unknown>[];
      }
    ).actions;

  describe('reading', () => {
    it('resolves each op to the Shopping Item the server found', async () => {
      const cookie = await signUp();
      await addItem(cookie, { ingredientId: seedId.ingredient('eggs') });
      await addItem(cookie, { name: 'Quinoa crackers' });
      reading = {
        actions: [
          eggsModel('setQuantity', { quantity: 12 }),
          eggsModel('check'),
          eggsModel('uncheck'),
          eggsModel('remove', { scope: 'one' }),
          model({
            op: 'remove',
            spokenText: 'quinoa crackers',
            fallbackIngredientName: 'quinoa  Crackers',
          }),
        ],
        unsupported: [],
      };
      const actions = await read(cookie);
      expect(actions.map((a) => [a.op, a.status])).toEqual([
        ['setQuantity', 'ready'],
        ['check', 'ready'],
        ['uncheck', 'ready'],
        ['remove', 'ready'],
        ['remove', 'ready'],
      ]);
      for (const a of actions) {
        expect(
          (a.rows as { shoppingItem: unknown }).shoppingItem,
        ).not.toBeNull();
      }
      expect(actions[0]).toMatchObject({ quantity: 12, unit: null });
    });

    it('shows a check for something not on the list as an add (no row), ready', async () => {
      const cookie = await signUp();
      reading = { actions: [eggsModel('check')], unsupported: [] };
      const [a] = await read(cookie);
      expect(a).toMatchObject({
        op: 'check',
        status: 'ready',
        rows: { shoppingItem: null },
      });
    });

    it('previews an add merging into the same line the apply merges into: the oldest compatible one', async () => {
      const cookie = await signUp();
      await addItem(cookie, { ...EGGS, quantity: 500, unit: 'g' });
      await addItem(cookie, { ...EGGS, quantity: 2, unit: 'pcs' });
      const [oldest, second] = await list(cookie);
      // setAmount can leave two compatible lines of one Ingredient; the newer one becomes grams too.
      await request(app.getHttpServer())
        .put(`/api/shopping-list/items/${second.id}/amount?locale=en`)
        .set('origin', TEST_ORIGIN)
        .set('cookie', cookie)
        .send({ quantity: 100, unit: 'g' })
        .expect(200);
      reading = {
        actions: [eggsModel('add', { quantity: 1, unit: 'kg' })],
        unsupported: [],
      };
      const [a] = await read(cookie);
      expect((a.rows as { shoppingItem: { id: string } }).shoppingItem.id).toBe(
        oldest.id,
      );

      await apply(cookie, [
        action('add', { ...EGGS, quantity: 1, unit: 'kg' }),
      ]);
      const lines = await list(cookie);
      expect(lines.find((l) => l.id === oldest.id)).toMatchObject({
        quantity: 1500,
        unit: 'g',
      });
      expect(lines.find((l) => l.id === second.id)?.quantity).toBe(100);
    });

    it('reports Not found for set quantity, uncheck and remove with nothing to act on', async () => {
      const cookie = await signUp();
      reading = {
        actions: [
          eggsModel('setQuantity', { quantity: 12 }),
          eggsModel('uncheck'),
          eggsModel('remove'),
        ],
        unsupported: [],
      };
      const actions = await read(cookie);
      expect(actions.map((a) => a.status)).toEqual([
        'notFound',
        'notFound',
        'notFound',
      ]);
      expect(actions[2]).toMatchObject({ text: 'eggs', op: 'remove' });
    });

    it('prefers the exact name hit over a low-confidence proposed Ingredient', async () => {
      const cookie = await signUp();
      reading = {
        actions: [
          model({
            op: 'check',
            spokenText: 'eggs',
            fallbackIngredientName: 'Eggs',
            matchedIngredientId: seedId.ingredient('milk'),
            matchConfidence: 0.2,
          }),
        ],
        unsupported: [],
      };
      const [a] = await read(cookie);
      expect(a).toMatchObject({
        ingredient: { id: seedId.ingredient('eggs') },
      });
    });
  });

  const done = (
    actionId: string,
    rowId: string | undefined,
    alreadyDone = false,
  ) => ({
    actionId,
    list: 'shopping',
    ...(rowId === undefined ? {} : { rowId }),
    alreadyDone,
  });

  describe('applying', () => {
    it('sets the quantity of a matched item', async () => {
      const cookie = await signUp();
      await addItem(cookie, { ...EGGS, quantity: 6, unit: 'pcs' });
      const [item] = await list(cookie);
      const res = await apply(cookie, [
        action('setQuantity', { ...EGGS, quantity: 12, unit: 'pcs' }),
        action('setQuantity', { ...EGGS, quantity: 12, unit: 'pcs' }, 'again'),
      ]).expect(201);
      expect(res.body).toEqual({
        applied: [done('a1', item.id), done('again', item.id, true)],
        skipped: [],
      });
      expect(await list(cookie)).toMatchObject([{ quantity: 12, unit: 'pcs' }]);
    });

    it('checks and unchecks an Unmatched item by the same normalised name', async () => {
      const cookie = await signUp();
      await addItem(cookie, { name: 'Quinoa Crackers' });
      const [item] = await list(cookie);
      await apply(cookie, [
        action('check', { name: ' quinoa  crackers ' }),
      ]).expect(201);
      expect(await list(cookie)).toMatchObject([{ checked: true }]);
      const res = await apply(cookie, [
        action('uncheck', { name: 'QUINOA CRACKERS' }),
      ]).expect(201);
      expect(res.body).toEqual({
        applied: [done('a1', item.id)],
        skipped: [],
      });
      expect(await list(cookie)).toMatchObject([{ checked: false }]);
    });

    it('a check with a quantity also sets the quantity', async () => {
      const cookie = await signUp();
      await addItem(cookie, { ...MILK, quantity: 1, unit: 'l' });
      await apply(cookie, [
        action('check', { ...MILK, quantity: 2, unit: 'l' }),
      ]).expect(201);
      expect(await list(cookie)).toMatchObject([
        { checked: true, quantity: 2, unit: 'l' },
      ]);
    });

    it('a check for an item not on the list adds it already checked', async () => {
      const cookie = await signUp();
      const res = await apply(cookie, [
        action('check', { ...MILK, quantity: 2, unit: 'pcs' }, 'm'),
        action('check', { name: 'Brand X rolls' }, 'u'),
      ]).expect(201);
      const items = await list(cookie);
      expect(res.body).toEqual({
        applied: [
          done('m', items.find((i) => i.quantity === 2)?.id),
          done('u', items.find((i) => i.name === 'Brand X rolls')?.id),
        ],
        skipped: [],
      });
      expect(items).toHaveLength(2);
      expect(items.every((i) => i.checked)).toBe(true);
      expect(items.find((i) => i.name === 'Brand X rolls')?.unmatched).toBe(
        true,
      );
      expect(items.find((i) => i.quantity === 2)).toBeDefined();
    });

    it('queues the Unmatched names of an add and of a check from a Voice Note as source voice', async () => {
      const cookie = await signUp();
      const res = await apply(cookie, [
        action('add', { name: 'Voice added rolls' }, 'add'),
        action('check', { name: 'Voice checked rolls' }, 'chk'),
      ]).expect(201);
      const ids = (res.body as { applied: { rowId: string }[] }).applied.map(
        (a) => a.rowId,
      );
      expect(ids).toHaveLength(2);
      const rows = await app
        .get<Database>(DATABASE)
        .select()
        .from(unmatchedEntries)
        .where(inArray(unmatchedEntries.shoppingItemId, ids));
      expect(rows.map((r) => [r.rawName, r.source]).sort()).toEqual([
        ['Voice added rolls', 'voice'],
        ['Voice checked rolls', 'voice'],
      ]);
    });

    it('removes the item from the list', async () => {
      const cookie = await signUp();
      await addItem(cookie, EGGS);
      const [item] = await list(cookie);
      const res = await apply(cookie, [action('remove', EGGS)]).expect(201);
      expect(res.body).toEqual({
        applied: [done('a1', item.id)],
        skipped: [],
      });
      expect(await list(cookie)).toEqual([]);
      const view = await request(app.getHttpServer())
        .get('/api/shopping-list?locale=en')
        .set('origin', TEST_ORIGIN)
        .set('cookie', cookie)
        .expect(200);
      expect(view.body).toMatchObject({ groups: [] });
    });

    it('counts an action already satisfied as applied', async () => {
      const cookie = await signUp();
      await addItem(cookie, EGGS);
      const [item] = await list(cookie);
      await apply(cookie, [action('check', EGGS)]).expect(201);
      const res = await apply(cookie, [
        action('check', EGGS, 'checked-already'),
        action('uncheck', EGGS, 'u1'),
        action('uncheck', EGGS, 'unchecked-already'),
        action('remove', EGGS, 'r1'),
        action('remove', EGGS, 'removed-already'),
      ]).expect(201);
      expect(res.body).toEqual({
        applied: [
          done('checked-already', item.id, true),
          done('u1', item.id),
          done('unchecked-already', item.id, true),
          done('r1', item.id),
          // Already gone: nothing left to point at.
          done('removed-already', undefined, true),
        ],
        skipped: [],
      });
      expect(await list(cookie)).toEqual([]);
    });

    it('skips what can no longer happen with a reason and still applies the rest', async () => {
      const cookie = await signUp();
      await addItem(cookie, MILK);
      const [milk] = await list(cookie);
      const res = await apply(cookie, [
        action('setQuantity', { ...EGGS, quantity: 12, unit: 'pcs' }, 'gone-q'),
        action('uncheck', EGGS, 'gone-u'),
        action('setQuantity', EGGS, 'no-qty'),
        action('check', MILK, 'ok'),
      ]).expect(201);
      expect(res.body).toEqual({
        applied: [done('ok', milk.id)],
        skipped: [
          { id: 'gone-q', reason: 'voice.item_not_found' },
          { id: 'gone-u', reason: 'voice.item_not_found' },
          { id: 'no-qty', reason: 'voice.invalid_action' },
        ],
      });
      expect(await list(cookie)).toMatchObject([{ checked: true }]);
    });

    it("keeps the item's own unit when none was spoken (set quantity and check)", async () => {
      const cookie = await signUp();
      await addItem(cookie, { ...MILK, quantity: 1, unit: 'kg' });
      await addItem(cookie, { ...EGGS, quantity: 1, unit: 'kg' });
      await apply(cookie, [
        action('setQuantity', { ...MILK, quantity: 2 }, 'q'),
        action('check', { ...EGGS, quantity: 3 }, 'c'),
      ]).expect(201);
      const items = await list(cookie);
      expect(items.map((i) => [i.quantity, i.unit, i.checked]).sort()).toEqual([
        [2, 'kg', false],
        [3, 'kg', true],
      ]);
    });

    it("removing by voice drops the item's Source Recipes like removing by hand", async () => {
      const cookie = await signUp();
      await addItem(cookie, EGGS);
      const db = app.get<Database>(DATABASE);
      const [recipe] = await db
        .select({ id: recipes.id })
        .from(recipes)
        .limit(1);
      const [item] = await list(cookie);
      await db
        .insert(shoppingItemSourceRecipes)
        .values({ shoppingItemId: item.id, recipeId: recipe.id });
      await apply(cookie, [action('remove', EGGS)]).expect(201);
      expect(await list(cookie)).toEqual([]);
      expect(
        await db
          .select()
          .from(shoppingItemSourceRecipes)
          .where(eq(shoppingItemSourceRecipes.shoppingItemId, item.id)),
      ).toEqual([]);
    });

    it('a check whose item vanished between Review and Apply becomes an add that is already checked', async () => {
      const cookie = await signUp();
      await addItem(cookie, EGGS);
      reading = { actions: [eggsModel('check')], unsupported: [] };
      const [read1] = await read(cookie);
      expect(
        (read1.rows as { shoppingItem: unknown }).shoppingItem,
      ).not.toBeNull();
      const [item] = await list(cookie);
      await request(app.getHttpServer())
        .delete(`/api/shopping-list/items/${item.id}?locale=en`)
        .set('origin', TEST_ORIGIN)
        .set('cookie', cookie)
        .expect(200);
      const res = await apply(cookie, [action('check', EGGS)]).expect(201);
      const [added] = await list(cookie);
      expect(res.body).toEqual({
        applied: [done('a1', added.id)],
        skipped: [],
      });
      expect(added).toMatchObject({ checked: true });
    });

    it("never touches another Family's list", async () => {
      const a = await signUp();
      const b = await signUp();
      await addItem(a, EGGS);
      const res = await apply(b, [action('remove', EGGS)]).expect(201);
      expect(res.body).toEqual({
        applied: [done('a1', undefined, true)],
        skipped: [],
      });
      expect(await list(a)).toHaveLength(1);
    });
  });
});
