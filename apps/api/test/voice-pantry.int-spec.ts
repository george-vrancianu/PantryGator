import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DATABASE } from '../src/database/database.constants';
import type { Database } from '../src/database/database.types';
import { unmatchedEntries } from '../src/database/schema';
import { seedId } from '../src/catalog/seed/seed-catalog';
import { createTestApp, TEST_ORIGIN } from './support/create-test-app';

type Batch = {
  id: string;
  name: string;
  ingredientId: string | null;
  quantity: number | null;
  unit: string | null;
  location: string;
  expiryDate: string | null;
};
type BatchRow = {
  id: string;
  expiresOn: string | null;
  take?: number | null;
};
type Action = {
  id: string;
  status: string;
  target: string;
  op: string;
  text: string;
  ingredient: { id: string } | null;
  name: string | null;
  quantity: number | null;
  unit: string | null;
  scope: string | null;
  expiresOn: string | null;
  noExpiry: boolean;
  location: string | null;
  rows: { batches?: BatchRow[]; shoppingFallback?: boolean };
  defaults: { location?: string; expiresOn?: string };
};
type Applied = {
  applied: {
    actionId: string;
    list: 'shopping' | 'pantry';
    rowId?: string;
    rowIds?: string[];
    alreadyDone: boolean;
  }[];
  skipped: { id: string; reason: string }[];
};

const TODAY = '2026-10-16';
const milk = seedId.ingredient('milk');
const rice = seedId.ingredient('rice');
const yogurt = seedId.ingredient('yogurt');

describe('Voice Notes on the Pantry (integration)', () => {
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
      transcribe: () => Promise.resolve({ text: 'a note' }),
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
        name: `VP ${n}`,
        email: `voice-pantry-${Date.now()}-${n}@example.com`,
        password: 'correct-horse-staple',
      })
      .expect(200);
    return [response.headers['set-cookie'] ?? []]
      .flat()
      .map((c) => c.split(';')[0])
      .join('; ');
  }

  const api = (method: 'get' | 'post' | 'put', cookie: string, path: string) =>
    request(app.getHttpServer())
      [method](`/api${path}`)
      .set('origin', TEST_ORIGIN)
      .set('cookie', cookie);

  const model = (overrides: Record<string, unknown>) => ({
    target: 'pantry',
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
  const spoken = (id: string, overrides: Record<string, unknown> = {}) =>
    model({ matchedIngredientId: id, matchConfidence: 0.95, ...overrides });

  const readNote = async (cookie: string, actions: object[]) => {
    reading = { actions, unsupported: [] };
    const response = await api('post', cookie, '/voice')
      .field('spokenLanguage', 'en')
      .field('locale', 'en')
      .field('defaultTarget', 'pantry')
      .field('today', TODAY)
      .field('durationMs', '3000')
      .attach('audio', Buffer.from('a'), {
        filename: 'n.webm',
        contentType: 'audio/webm',
      })
      .expect(201);
    return (response.body as { actions: Action[] }).actions;
  };
  /** What Review sends back for a resolved action. */
  const asSent = (action: Action, extra: Record<string, unknown> = {}) => ({
    id: action.id,
    target: action.target,
    op: action.op,
    text: action.text,
    ingredientId: action.ingredient?.id ?? null,
    name: action.name,
    quantity: action.quantity,
    unit: action.unit,
    scope: action.scope,
    expiresOn: action.expiresOn,
    noExpiry: action.noExpiry,
    location: action.location,
    batchIds: (action.rows.batches ?? []).map((b) => b.id),
    ...extra,
  });
  const apply = async (cookie: string, actions: object[]) =>
    (
      await api('post', cookie, '/voice/apply')
        .send({ actions, locale: 'en', today: TODAY })
        .expect(201)
    ).body as Applied;
  const pantry = async (cookie: string) =>
    (await api('get', cookie, '/pantry?locale=en').expect(200)).body as {
      batches: Batch[];
      runningLow: string[];
    };
  const stock = async (cookie: string, body: Record<string, unknown>) =>
    (
      await api('post', cookie, '/pantry/batches?locale=en')
        .send(body)
        .expect(201)
    ).body as Batch;
  const inPantry = async (cookie: string, ingredientId: string) =>
    (
      (
        await api('get', cookie, '/pantry/recently-stocked?locale=en').expect(
          200,
        )
      ).body as { ingredients: { id: string; inPantry: boolean }[] }
    ).ingredients.find((i) => i.id === ingredientId)?.inPantry;
  const shopping = async (cookie: string) =>
    (
      (await api('get', cookie, '/shopping-list?locale=en').expect(200))
        .body as { groups: { items: { name: string }[] }[] }
    ).groups.flatMap((g) => g.items.map((i) => i.name));

  describe('adds', () => {
    it('takes the spoken quantity, unit, Location and expiry', async () => {
      const cookie = await signUp();
      const [action] = await readNote(cookie, [
        spoken(yogurt, {
          op: 'add',
          quantity: 2,
          unit: 'pcs',
          location: 'fridge',
          expiresOn: '2026-10-23',
        }),
      ]);
      expect(action).toMatchObject({
        status: 'ready',
        target: 'pantry',
        quantity: 2,
        unit: 'pcs',
        location: 'fridge',
        expiresOn: '2026-10-23',
      });
      const result = await apply(cookie, [asSent(action)]);
      const { batches } = await pantry(cookie);
      expect(batches).toMatchObject([
        {
          ingredientId: yogurt,
          quantity: 2,
          unit: 'pcs',
          location: 'fridge',
          expiryDate: '2026-10-23',
        },
      ]);
      expect(result.applied).toEqual([
        {
          actionId: action.id,
          list: 'pantry',
          rowId: batches[0].id,
          alreadyDone: false,
        },
      ]);
    });

    it('shows the manual add defaults for an unspoken Location and expiry, and applies them', async () => {
      const cookie = await signUp();
      const manual = await stock(cookie, { ingredientId: rice });
      const [action] = await readNote(cookie, [spoken(rice)]);
      expect(action.location).toBeNull();
      expect(action.expiresOn).toBeNull();
      expect(action.defaults.location).toBe(manual.location);
      // The manual add counts from the server clock; the Voice Note from the Member's today.
      expect(action.defaults.expiresOn).toBeDefined();
      await apply(cookie, [
        asSent(action, {
          location: action.defaults.location,
          expiresOn: action.defaults.expiresOn,
        }),
      ]);
      const batches = (await pantry(cookie)).batches;
      expect(batches).toHaveLength(2);
      expect(batches.every((b) => b.location === manual.location)).toBe(true);
    });

    it('applies a blank Location and expiry as the same defaults', async () => {
      const cookie = await signUp();
      const [action] = await readNote(cookie, [spoken(rice)]);
      await apply(cookie, [asSent(action)]);
      const [batch] = (await pantry(cookie)).batches;
      expect(batch.location).toBe(action.defaults.location);
      expect(batch.expiryDate).toBe(action.defaults.expiresOn);
    });

    it('uses the Member-edited Location and expiry from Review', async () => {
      const cookie = await signUp();
      const [action] = await readNote(cookie, [spoken(rice)]);
      await apply(cookie, [
        asSent(action, { location: 'freezer', expiresOn: '2027-01-01' }),
      ]);
      expect((await pantry(cookie)).batches[0]).toMatchObject({
        location: 'freezer',
        expiryDate: '2027-01-01',
      });
    });

    it('leaves the Batch undated for "no expiry"', async () => {
      const cookie = await signUp();
      const [action] = await readNote(cookie, [
        spoken(yogurt, { noExpiry: true, expiresOn: '2026-10-20' }),
      ]);
      expect(action).toMatchObject({ noExpiry: true, expiresOn: null });
      // The default stays visible so Review can offer it back.
      expect(action.defaults.expiresOn).toEqual(expect.any(String));
      await apply(cookie, [asSent(action)]);
      expect((await pantry(cookie)).batches[0].expiryDate).toBeNull();
    });

    it.each([
      ['not on the calendar', '2026-02-31'],
      ['in the past', '2026-10-15'],
      ['more than five years ahead', '2031-10-17'],
    ])('drops a spoken date %s', async (_label, date) => {
      const cookie = await signUp();
      const [action] = await readNote(cookie, [
        spoken(yogurt, { expiresOn: date }),
      ]);
      expect(action.expiresOn).toBeNull();
    });

    it('keeps today and the last day of five years ahead', async () => {
      const cookie = await signUp();
      const actions = await readNote(cookie, [
        spoken(yogurt, { expiresOn: TODAY }),
        spoken(yogurt, { expiresOn: '2031-10-16' }),
      ]);
      expect(actions.map((a) => a.expiresOn)).toEqual([TODAY, '2031-10-16']);
    });

    it('adds an Unmatched name as an Unmatched Batch', async () => {
      const cookie = await signUp();
      const [action] = await readNote(cookie, [
        model({
          fallbackIngredientName: 'Quinoa crackers',
          quantity: 1,
          location: 'cupboard',
        }),
      ]);
      expect(action).toMatchObject({
        ingredient: null,
        name: 'Quinoa crackers',
      });
      const result = await apply(cookie, [asSent(action)]);
      const [queued] = await app
        .get<Database>(DATABASE)
        .select()
        .from(unmatchedEntries)
        .where(eq(unmatchedEntries.batchId, result.applied[0].rowId as string));
      expect(queued).toMatchObject({
        rawName: 'Quinoa crackers',
        source: 'voice',
      });
      expect((await pantry(cookie)).batches).toMatchObject([
        {
          name: 'Quinoa crackers',
          ingredientId: null,
          quantity: 1,
          unit: 'pcs',
          location: 'cupboard',
        },
      ]);
    });

    it('has no default Location for an Unmatched name, so Apply skips it until one is chosen', async () => {
      const cookie = await signUp();
      await api(
        'put',
        cookie,
        `/settings/family/expiry-overrides/${seedId.parent('other')}`,
      )
        .send({ days: 10 })
        .expect(200);
      const [action] = await readNote(cookie, [
        model({ fallbackIngredientName: 'Quinoa crackers' }),
      ]);
      expect(action.defaults.location).toBeUndefined();
      // The "Other" category's Default Expiry, as Apply would use.
      expect(action.defaults.expiresOn).toBe('2026-10-26');
      const result = await apply(cookie, [asSent(action)]);
      expect(result.skipped).toEqual([
        { id: action.id, reason: 'pantry.location_required' },
      ]);
    });

    it('writes nothing until Apply', async () => {
      const cookie = await signUp();
      await readNote(cookie, [spoken(rice)]);
      expect((await pantry(cookie)).batches).toEqual([]);
    });
  });

  describe('removals', () => {
    const stockMilk = (cookie: string, extra: Record<string, unknown>) =>
      stock(cookie, { ingredientId: milk, ...extra });
    const remove = (overrides: Record<string, unknown> = {}) =>
      spoken(milk, { op: 'remove', scope: 'one', ...overrides });

    it('takes the one Batch expiring soonest, undated last, and shows it', async () => {
      const cookie = await signUp();
      await stockMilk(cookie, { expiryDate: null });
      const later = await stockMilk(cookie, { expiryDate: '2026-11-20' });
      const soonest = await stockMilk(cookie, { expiryDate: '2026-10-20' });
      const [action] = await readNote(cookie, [remove()]);
      expect(action.status).toBe('ready');
      expect(action.rows.batches).toMatchObject([
        { id: soonest.id, expiresOn: '2026-10-20', take: null },
      ]);
      await apply(cookie, [asSent(action)]);
      const ids = (await pantry(cookie)).batches.map((b) => b.id);
      expect(ids).toHaveLength(2);
      expect(ids).toContain(later.id);
      expect(ids).not.toContain(soonest.id);
    });

    it('takes the undated Batch when it is the only one', async () => {
      const cookie = await signUp();
      const only = await stockMilk(cookie, { expiryDate: null });
      const [action] = await readNote(cookie, [remove()]);
      expect(action.rows.batches?.[0]).toMatchObject({
        id: only.id,
        expiresOn: null,
      });
    });

    it('takes every Batch for "out of"', async () => {
      const cookie = await signUp();
      await stockMilk(cookie, { expiryDate: '2026-10-20' });
      await stockMilk(cookie, { expiryDate: null });
      const [action] = await readNote(cookie, [remove({ scope: 'all' })]);
      expect(action.rows.batches).toHaveLength(2);
      await apply(cookie, [asSent(action)]);
      expect((await pantry(cookie)).batches).toEqual([]);
    });

    it('subtracts across Batches soonest first, deleting those reaching zero', async () => {
      const cookie = await signUp();
      const a = await stock(cookie, {
        ingredientId: rice,
        quantity: 300,
        unit: 'g',
        expiryDate: '2026-10-20',
      });
      const b = await stock(cookie, {
        ingredientId: rice,
        quantity: 400,
        unit: 'g',
        expiryDate: '2026-11-20',
      });
      const [action] = await readNote(cookie, [
        spoken(rice, { op: 'remove', scope: 'one', quantity: 500, unit: 'g' }),
      ]);
      expect(action.status).toBe('ready');
      expect(action.rows.batches).toMatchObject([
        { id: a.id, take: null },
        { id: b.id, take: 200 },
      ]);
      await apply(cookie, [asSent(action)]);
      expect((await pantry(cookie)).batches).toMatchObject([
        { id: b.id, quantity: 200, unit: 'g' },
      ]);
    });

    it('subtracts grams from a kilogram Batch and keeps its unit', async () => {
      const cookie = await signUp();
      const a = await stock(cookie, {
        ingredientId: rice,
        quantity: 1,
        unit: 'kg',
      });
      const [action] = await readNote(cookie, [
        spoken(rice, { op: 'remove', scope: 'one', quantity: 500, unit: 'g' }),
      ]);
      expect(action.status).toBe('ready');
      expect(action.rows.batches).toMatchObject([{ id: a.id, take: 0.5 }]);
      await apply(cookie, [asSent(action)]);
      expect((await pantry(cookie)).batches).toMatchObject([
        { id: a.id, quantity: 0.5, unit: 'kg' },
      ]);
    });

    it('subtracts from a picked Batch when the amount fits, and shows what picking does', async () => {
      const cookie = await signUp();
      const a = await stock(cookie, {
        ingredientId: rice,
        quantity: 300,
        unit: 'g',
        expiryDate: '2026-10-20',
      });
      const b = await stock(cookie, {
        ingredientId: rice,
        quantity: 2,
        unit: 'kg',
        expiryDate: '2026-11-20',
      });
      const c = await stock(cookie, { ingredientId: rice });
      const [action] = await readNote(cookie, [
        spoken(rice, { op: 'remove', scope: 'one', quantity: 500, unit: 'g' }),
      ]);
      // The Batch without an amount makes Review ask which one.
      expect(action.status).toBe('needsBatch');
      const takes = Object.fromEntries(
        (action.rows.batches ?? []).map((r) => [r.id, r.take]),
      );
      expect(takes).toEqual({ [a.id]: null, [b.id]: 0.5, [c.id]: null });
      await apply(cookie, [asSent(action, { batchId: b.id, batchIds: [] })]);
      const left = (await pantry(cookie)).batches;
      expect(left.map((x) => x.id).sort()).toEqual([a.id, b.id, c.id].sort());
      expect(left.find((x) => x.id === b.id)).toMatchObject({
        quantity: 1.5,
        unit: 'kg',
      });
    });

    it.each([
      ['another unit', { quantity: 1, unit: 'l' }],
      ['more than there is', { quantity: 5000, unit: 'g' }],
    ])('needs a Batch picked when the amount is %s', async (_l, amount) => {
      const cookie = await signUp();
      const a = await stock(cookie, {
        ingredientId: rice,
        quantity: 300,
        unit: 'g',
        expiryDate: '2026-10-20',
      });
      const b = await stock(cookie, {
        ingredientId: rice,
        quantity: 400,
        unit: 'g',
        expiryDate: '2026-11-20',
      });
      const [action] = await readNote(cookie, [
        spoken(rice, { op: 'remove', scope: 'one', ...amount }),
      ]);
      expect(action.status).toBe('needsBatch');
      expect(action.rows.batches?.map((r: { id: string }) => r.id)).toEqual([
        a.id,
        b.id,
      ]);
      // Without a pick, Apply does nothing.
      const none = await apply(cookie, [asSent(action, { batchIds: [] })]);
      expect(none.skipped).toEqual([
        { id: action.id, reason: 'voice.batch_required' },
      ]);
      // With a pick, that Batch goes.
      await apply(cookie, [asSent(action, { batchId: b.id, batchIds: [] })]);
      expect((await pantry(cookie)).batches.map((x) => x.id)).toEqual([a.id]);
    });

    it('is Not found when the Pantry has none of it', async () => {
      const cookie = await signUp();
      const [action] = await readNote(cookie, [remove()]);
      expect(action).toMatchObject({ status: 'notFound', rows: {} });
    });

    it('removes an Unmatched Batch by name', async () => {
      const cookie = await signUp();
      await stock(cookie, { rawName: 'Quinoa crackers', location: 'cupboard' });
      const [action] = await readNote(cookie, [
        model({
          op: 'remove',
          scope: 'one',
          fallbackIngredientName: 'quinoa crackers',
        }),
      ]);
      expect(action.status).toBe('ready');
      await apply(cookie, [asSent(action)]);
      expect((await pantry(cookie)).batches).toEqual([]);
    });

    it('leaves the Ingredient Used Up and clears its Running low flag when the last Batch goes', async () => {
      const cookie = await signUp();
      await stockMilk(cookie, {});
      await api('put', cookie, `/pantry/running-low/${milk}`).expect(204);
      const [action] = await readNote(cookie, [remove()]);
      await apply(cookie, [asSent(action)]);
      const after = await pantry(cookie);
      expect(after.batches).toEqual([]);
      expect(after.runningLow).toEqual([]);
      expect(await inPantry(cookie, milk)).toBe(false);
    });

    it('keeps Running low when only part of the stock goes', async () => {
      const cookie = await signUp();
      await stock(cookie, { ingredientId: rice, quantity: 500, unit: 'g' });
      await api('put', cookie, `/pantry/running-low/${rice}`).expect(204);
      const [action] = await readNote(cookie, [
        spoken(rice, { op: 'remove', scope: 'one', quantity: 100, unit: 'g' }),
      ]);
      await apply(cookie, [asSent(action)]);
      const after = await pantry(cookie);
      expect(after.batches[0].quantity).toBe(400);
      expect(after.runningLow).toEqual([rice]);
      expect(await inPantry(cookie, rice)).toBe(true);
    });

    it('reports the Batch it subtracted from', async () => {
      const cookie = await signUp();
      const bag = await stock(cookie, {
        ingredientId: rice,
        quantity: 500,
        unit: 'g',
      });
      const [action] = await readNote(cookie, [
        spoken(rice, { op: 'remove', scope: 'one', quantity: 100, unit: 'g' }),
      ]);
      const result = await apply(cookie, [asSent(action)]);
      expect(result.applied).toEqual([
        {
          actionId: action.id,
          list: 'pantry',
          rowId: bag.id,
          rowIds: [bag.id],
          alreadyDone: false,
        },
      ]);
    });

    it('points a whole-Batch removal at a Batch of the Ingredient that is left', async () => {
      const cookie = await signUp();
      await stockMilk(cookie, { expiryDate: '2026-10-20' });
      const later = await stockMilk(cookie, { expiryDate: '2026-11-20' });
      const [action] = await readNote(cookie, [remove()]);
      const result = await apply(cookie, [asSent(action)]);
      expect(result.applied).toEqual([
        {
          actionId: action.id,
          list: 'pantry',
          rowId: later.id,
          rowIds: [later.id],
          alreadyDone: false,
        },
      ]);
      expect((await pantry(cookie)).batches.map((x) => x.id)).toEqual([
        later.id,
      ]);
    });

    it('reports the one surviving Batch a removal across several Batches changed', async () => {
      const cookie = await signUp();
      await stock(cookie, {
        ingredientId: rice,
        quantity: 300,
        unit: 'g',
        expiryDate: '2099-10-20',
      });
      await stock(cookie, {
        ingredientId: rice,
        quantity: 200,
        unit: 'g',
        expiryDate: '2099-11-01',
      });
      const third = await stock(cookie, {
        ingredientId: rice,
        quantity: 400,
        unit: 'g',
        expiryDate: '2099-11-20',
      });
      const [action] = await readNote(cookie, [
        spoken(rice, { op: 'remove', scope: 'one', quantity: 600, unit: 'g' }),
      ]);
      const result = await apply(cookie, [asSent(action)]);
      // Two Batches are deleted (they cannot flash); only the reduced one is left changed.
      expect(result.applied).toEqual([
        {
          actionId: action.id,
          list: 'pantry',
          rowId: third.id,
          rowIds: [third.id],
          alreadyDone: false,
        },
      ]);
      expect((await pantry(cookie)).batches).toMatchObject([
        { id: third.id, quantity: 300 },
      ]);
    });

    it('reports a surviving Batch in every Location a removal across Locations changed', async () => {
      const cookie = await signUp();
      await stock(cookie, {
        ingredientId: rice,
        quantity: 300,
        unit: 'g',
        location: 'cupboard',
        expiryDate: '2099-10-20',
      });
      const fridge = await stock(cookie, {
        ingredientId: rice,
        quantity: 200,
        unit: 'g',
        location: 'fridge',
        expiryDate: '2099-11-01',
      });
      const cupboard = await stock(cookie, {
        ingredientId: rice,
        quantity: 500,
        unit: 'g',
        location: 'cupboard',
        expiryDate: '2099-11-20',
      });
      const [action] = await readNote(cookie, [
        spoken(rice, { op: 'remove', scope: 'one', quantity: 400, unit: 'g' }),
      ]);
      const result = await apply(cookie, [asSent(action)]);
      // The reduced Batch leads (rowId), then the Location whose Batch was only deleted.
      expect(result.applied).toEqual([
        {
          actionId: action.id,
          list: 'pantry',
          rowId: fridge.id,
          rowIds: [fridge.id, cupboard.id],
          alreadyDone: false,
        },
      ]);
    });

    it('reports a survivor per Location for Batches picked in Review', async () => {
      const cookie = await signUp();
      const gone = await stockMilk(cookie, { location: 'fridge' });
      const fridgeLeft = await stockMilk(cookie, { location: 'fridge' });
      const freezerGone = await stockMilk(cookie, { location: 'freezer' });
      const freezerLeft = await stockMilk(cookie, { location: 'freezer' });
      const [action] = await readNote(cookie, [remove({ scope: 'all' })]);
      const result = await apply(cookie, [
        asSent(action, {
          batchId: null,
          batchIds: [gone.id, freezerGone.id],
        }),
      ]);
      expect(result.applied).toHaveLength(1);
      expect([...(result.applied[0].rowIds ?? [])].sort()).toEqual(
        [fridgeLeft.id, freezerLeft.id].sort(),
      );
      expect(result.applied[0].rowId).toBe(result.applied[0].rowIds?.[0]);
    });

    it('does not point at a Location the removal never touched', async () => {
      const cookie = await signUp();
      await stockMilk(cookie, { location: 'fridge', expiryDate: '2026-10-20' });
      await stockMilk(cookie, {
        location: 'freezer',
        expiryDate: '2026-11-01',
      });
      const fridgeLater = await stockMilk(cookie, {
        location: 'fridge',
        expiryDate: '2026-11-20',
      });
      const [action] = await readNote(cookie, [remove()]);
      const result = await apply(cookie, [asSent(action)]);
      expect(result.applied).toEqual([
        {
          actionId: action.id,
          list: 'pantry',
          rowId: fridgeLater.id,
          rowIds: [fridgeLater.id],
          alreadyDone: false,
        },
      ]);
    });

    it('reports no row when the removal empties the Ingredient', async () => {
      const cookie = await signUp();
      await stockMilk(cookie, {});
      const [action] = await readNote(cookie, [remove()]);
      const result = await apply(cookie, [asSent(action)]);
      expect(result.applied).toEqual([
        { actionId: action.id, list: 'pantry', alreadyDone: false },
      ]);
    });

    it('skips a Batch that is already gone and still applies the rest', async () => {
      const cookie = await signUp();
      const gone = await stockMilk(cookie, {});
      const left = await stock(cookie, {
        ingredientId: rice,
        quantity: 500,
        unit: 'g',
      });
      const actions = await readNote(cookie, [
        remove(),
        spoken(rice, { op: 'remove', scope: 'one', quantity: 100, unit: 'g' }),
      ]);
      await api('post', cookie, '/pantry/batches/bulk-delete')
        .send({ ids: [gone.id] })
        .expect(204);
      const result = await apply(
        cookie,
        actions.map((a) => asSent(a)),
      );
      expect(result).toEqual({
        applied: [
          {
            actionId: actions[1].id,
            list: 'pantry',
            rowId: left.id,
            rowIds: [left.id],
            alreadyDone: false,
          },
        ],
        skipped: [{ id: actions[0].id, reason: 'pantry.batch_not_found' }],
      });
      expect((await pantry(cookie)).batches[0].quantity).toBe(400);
    });

    describe('Batch ids sent by the client', () => {
      it("does not remove another Ingredient's Batch under a forged id", async () => {
        const cookie = await signUp();
        await stockMilk(cookie, {});
        const ricebag = await stock(cookie, {
          ingredientId: rice,
          quantity: 500,
          unit: 'g',
        });
        const [action] = await readNote(cookie, [remove()]);
        const result = await apply(cookie, [
          asSent(action, { batchId: ricebag.id, batchIds: [] }),
        ]);
        expect(result).toEqual({
          applied: [],
          skipped: [{ id: action.id, reason: 'pantry.batch_not_found' }],
        });
        expect((await pantry(cookie)).batches).toHaveLength(2);
      });

      it("cannot use another Family's Batch", async () => {
        const mine = await signUp();
        const theirs = await signUp();
        const theirMilk = await stockMilk(theirs, {});
        const [action] = await readNote(mine, [remove()]);
        const result = await apply(mine, [
          asSent(action, { batchId: theirMilk.id, batchIds: [] }),
        ]);
        expect(result).toEqual({
          applied: [],
          skipped: [{ id: action.id, reason: 'pantry.batch_not_found' }],
        });
        expect((await pantry(theirs)).batches).toHaveLength(1);
      });
    });
  });

  describe('Running low', () => {
    const low = (id: string, overrides: Record<string, unknown> = {}) =>
      spoken(id, { op: 'runningLow', ...overrides });

    it('flags the Ingredient when the Pantry has a Batch', async () => {
      const cookie = await signUp();
      await stock(cookie, { ingredientId: rice });
      const [action] = await readNote(cookie, [low(rice)]);
      expect(action.status).toBe('ready');
      expect(action.rows.batches).toHaveLength(1);
      const result = await apply(cookie, [asSent(action)]);
      const { batches, runningLow } = await pantry(cookie);
      expect(runningLow).toEqual([rice]);
      expect(await shopping(cookie)).toEqual([]);
      expect(result.applied).toEqual([
        {
          actionId: action.id,
          list: 'pantry',
          rowId: batches[0].id,
          alreadyDone: false,
        },
      ]);
      const again = await apply(cookie, [asSent(action)]);
      expect(again.applied).toMatchObject([
        { list: 'pantry', rowId: batches[0].id, alreadyDone: true },
      ]);
    });

    it('is Not found for an Unmatched name', async () => {
      const cookie = await signUp();
      await stock(cookie, { rawName: 'Quinoa crackers', location: 'cupboard' });
      const [action] = await readNote(cookie, [
        model({ op: 'runningLow', fallbackIngredientName: 'Quinoa crackers' }),
      ]);
      expect(action.status).toBe('notFound');
      expect(await shopping(cookie)).toEqual([]);
    });

    it('becomes a Shopping List add when there is no Batch', async () => {
      const cookie = await signUp();
      const [action] = await readNote(cookie, [low(rice)]);
      expect(action).toMatchObject({
        status: 'ready',
        rows: { shoppingFallback: true },
      });
      const result = await apply(cookie, [asSent(action)]);
      expect((await pantry(cookie)).runningLow).toEqual([]);
      expect(await shopping(cookie)).toEqual(['Rice']);
      // The fallback lands on the Shopping List, so it is reported there.
      expect(result.applied).toMatchObject([
        { actionId: action.id, list: 'shopping', alreadyDone: false },
      ]);
      expect(result.applied[0].rowId).toEqual(expect.any(String));
    });
  });
});
