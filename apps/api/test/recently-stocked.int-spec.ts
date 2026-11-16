import { jest } from '@jest/globals';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { seedId } from '../src/catalog/seed/seed-catalog';
import { createTestApp, TEST_ORIGIN } from './support/create-test-app';
import { storeUiLanguage } from './support/stored-language';

type Stocked = {
  id: string;
  name: string;
  lastStockedAt: string;
  inPantry: boolean;
  defaultUnit: string;
  leafCategory: { id: string; name: string };
  parentCategory: { aisle: { id: string; name: string } };
  defaults: { expiryDays: number | null; location: string | null };
};

const MINUTE = 60_000;

describe('Recently Stocked (integration)', () => {
  let app: NestFastifyApplication;
  let counter = 0;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function signUp() {
    const response = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('origin', TEST_ORIGIN)
      .set(
        'x-forwarded-for',
        `10.7.${Math.floor(counter / 250)}.${counter % 250}`,
      )
      .send({
        name: 'Recent',
        email: `recent-${Date.now()}-${++counter}@example.com`,
        password: 'correct-horse-battery-staple',
      })
      .expect(200);
    return [response.headers['set-cookie'] ?? []]
      .flat()
      .map((c) => c.split(';')[0])
      .join('; ');
  }

  const api = (
    method: 'get' | 'post' | 'delete',
    cookie: string,
    path: string,
  ) =>
    request(app.getHttpServer())
      [method](`/api${path}`)
      .set('origin', TEST_ORIGIN)
      .set('cookie', cookie);

  async function after<T>(offsetMs: number, action: () => Promise<T>) {
    const real = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(real + offsetMs);
    try {
      return await action();
    } finally {
      clock.mockRestore();
    }
  }

  const addBatch = async (cookie: string, body: object) =>
    (
      await api('post', cookie, '/pantry/batches?locale=en')
        .send({ quantity: 1, unit: 'pcs', location: 'fridge', ...body })
        .expect(201)
    ).body as { id: string };
  const recent = async (cookie: string, query = 'locale=en') =>
    (await api('get', cookie, `/pantry/recently-stocked?${query}`).expect(200))
      .body as { ingredients: Stocked[] };

  const milk = seedId.ingredient('milk');
  const parmesan = seedId.ingredient('parmesan');
  const butter = seedId.ingredient('butter');

  it('lists the Ingredients newest stocked first, with a tile payload', async () => {
    const cookie = await signUp();
    await after(0, () => addBatch(cookie, { ingredientId: milk }));
    await after(MINUTE, () => addBatch(cookie, { ingredientId: parmesan }));
    await after(2 * MINUTE, () => addBatch(cookie, { ingredientId: butter }));

    const { ingredients } = await recent(cookie);

    expect(ingredients.map((i) => i.id)).toEqual([butter, parmesan, milk]);
    const stockedMilk = ingredients[2];
    expect(stockedMilk.name).toBe('Milk');
    expect(stockedMilk.inPantry).toBe(true);
    expect(stockedMilk.defaultUnit).toBeTruthy();
    expect(stockedMilk.leafCategory.name).toBeTruthy();
    expect(stockedMilk.parentCategory.aisle.name).toBeTruthy();
    expect(stockedMilk.defaults).toHaveProperty('expiryDays');
    expect(new Date(ingredients[0].lastStockedAt).getTime()).toBeGreaterThan(
      new Date(ingredients[2].lastStockedAt).getTime(),
    );
  });

  it('moves a re-stocked Ingredient back to the top', async () => {
    const cookie = await signUp();
    await after(0, () => addBatch(cookie, { ingredientId: milk }));
    await after(MINUTE, () => addBatch(cookie, { ingredientId: parmesan }));
    await after(2 * MINUTE, () => addBatch(cookie, { ingredientId: milk }));

    const { ingredients } = await recent(cookie);
    expect(ingredients.map((i) => i.id)).toEqual([milk, parmesan]);
  });

  it('respects the limit, defaulting to 8', async () => {
    const cookie = await signUp();
    await after(0, () => addBatch(cookie, { ingredientId: milk }));
    await after(MINUTE, () => addBatch(cookie, { ingredientId: parmesan }));
    await after(2 * MINUTE, () => addBatch(cookie, { ingredientId: butter }));

    const limited = await recent(cookie, 'locale=en&limit=2');
    expect(limited.ingredients.map((i) => i.id)).toEqual([butter, parmesan]);

    await api('get', cookie, '/pantry/recently-stocked?limit=0').expect(400);
    await api('get', cookie, '/pantry/recently-stocked?limit=51').expect(400);
  });

  it('caps at 8 when no limit is given', async () => {
    const cookie = await signUp();
    const found = (
      await api('get', cookie, '/catalog/search?q=a&locale=en&limit=12').expect(
        200,
      )
    ).body as { results: Array<{ id: string }> };
    expect(found.results.length).toBeGreaterThanOrEqual(10);
    for (const [index, result] of found.results.slice(0, 10).entries()) {
      await after(index * MINUTE, () =>
        addBatch(cookie, { ingredientId: result.id }),
      );
    }
    expect((await recent(cookie)).ingredients).toHaveLength(8);
  });

  it('reports inPantry from the current Batches', async () => {
    const cookie = await signUp();
    const gone = await after(0, () => addBatch(cookie, { ingredientId: milk }));
    await after(MINUTE, () => addBatch(cookie, { ingredientId: parmesan }));
    await after(20 * MINUTE, () =>
      api('delete', cookie, `/pantry/batches/${gone.id}`).expect(204),
    );

    const { ingredients } = await recent(cookie);
    expect(ingredients.map((i) => [i.id, i.inPantry])).toEqual([
      [parmesan, true],
      [milk, false],
    ]);
  });

  it('is scoped to the Family', async () => {
    const mine = await signUp();
    const theirs = await signUp();
    await addBatch(mine, { ingredientId: milk });
    await addBatch(theirs, { ingredientId: parmesan });

    expect((await recent(mine)).ingredients.map((i) => i.id)).toEqual([milk]);
    expect((await recent(theirs)).ingredients.map((i) => i.id)).toEqual([
      parmesan,
    ]);
  });

  it('is shared by the Family: another Member sees the stock', async () => {
    const owner = await signUp();
    const member = await signUp();
    const { inviteCode } = (await api('get', owner, '/family').expect(200))
      .body as { inviteCode: string };
    await api('post', member, '/family/join')
      .send({ code: inviteCode })
      .expect(201);
    await addBatch(owner, { ingredientId: milk });

    expect((await recent(member)).ingredients.map((i) => i.id)).toEqual([milk]);
  });

  it('leaves out Unmatched Batches', async () => {
    const cookie = await signUp();
    await addBatch(cookie, { rawName: 'Grandma special sauce' });
    expect((await recent(cookie)).ingredients).toEqual([]);

    await addBatch(cookie, { ingredientId: milk });
    expect((await recent(cookie)).ingredients.map((i) => i.id)).toEqual([milk]);
  });

  it('names Ingredients in the requested locale', async () => {
    const cookie = await signUp();
    await addBatch(cookie, { ingredientId: milk });
    await storeUiLanguage(app, cookie, 'ro');
    const ro = await recent(cookie);
    expect(ro.ingredients[0].name).toBe('Lapte');
  });

  describe('last stocked (Pantry Health lights)', () => {
    const lastStocked = async (cookie: string) =>
      (await api('get', cookie, '/pantry/last-stocked').expect(200)).body as {
        lastStockedAt: string | null;
      };

    it('is null for a Family with no Batches', async () => {
      const cookie = await signUp();
      expect(await lastStocked(cookie)).toEqual({ lastStockedAt: null });
    });

    it('counts a Batch that was stocked and then used up', async () => {
      const cookie = await signUp();
      const real = Date.now();
      const gone = await after(0, () =>
        addBatch(cookie, { ingredientId: milk }),
      );
      await after(20 * MINUTE, () =>
        api('delete', cookie, `/pantry/batches/${gone.id}`).expect(204),
      );

      const { lastStockedAt } = await lastStocked(cookie);
      expect(lastStockedAt).not.toBeNull();
      expect(
        Math.abs(new Date(lastStockedAt as string).getTime() - real),
      ).toBeLessThan(MINUTE);
    });

    it('counts an Unmatched Batch, which Stock history does not track', async () => {
      const cookie = await signUp();
      const real = Date.now();
      await after(0, () => addBatch(cookie, { ingredientId: milk }));
      await after(5 * MINUTE, () =>
        addBatch(cookie, { rawName: 'Grandma special sauce' }),
      );

      const { lastStockedAt } = await lastStocked(cookie);
      expect(
        Math.abs(
          new Date(lastStockedAt as string).getTime() - (real + 5 * MINUTE),
        ),
      ).toBeLessThan(MINUTE);
    });

    it('takes the later of Stock history and the newest Batch', async () => {
      const cookie = await signUp();
      const real = Date.now();
      await after(0, () =>
        addBatch(cookie, { rawName: 'Grandma special sauce' }),
      );
      const stocked = await after(3 * MINUTE, () =>
        addBatch(cookie, { ingredientId: milk }),
      );
      await after(30 * MINUTE, () =>
        api('delete', cookie, `/pantry/batches/${stocked.id}`).expect(204),
      );

      // The used-up Batch is newer than the Unmatched one still in the Pantry.
      const { lastStockedAt } = await lastStocked(cookie);
      expect(
        Math.abs(
          new Date(lastStockedAt as string).getTime() - (real + 3 * MINUTE),
        ),
      ).toBeLessThan(MINUTE);
    });

    it('is scoped to the Family', async () => {
      const mine = await signUp();
      const theirs = await signUp();
      await addBatch(mine, { ingredientId: milk });
      expect(await lastStocked(theirs)).toEqual({ lastStockedAt: null });
    });

    it('requires a signed-in Member', async () => {
      await request(app.getHttpServer())
        .get('/api/pantry/last-stocked')
        .set('origin', TEST_ORIGIN)
        .expect(401);
    });
  });

  it('requires a signed-in Member', async () => {
    await request(app.getHttpServer())
      .get('/api/pantry/recently-stocked')
      .set('origin', TEST_ORIGIN)
      .expect(401);
  });
});
