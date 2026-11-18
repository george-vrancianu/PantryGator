import { jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { openFoodFactsCache } from '../src/database/schema';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiException } from '../src/common/api-exception';
import { seedCatalog, seedId } from '../src/catalog/seed/seed-catalog';
import { DATABASE } from '../src/database/database.constants';
import type { Database } from '../src/database/database.types';
import type { OpenFoodFactsProduct } from '../src/barcode/open-food-facts.client';
import { freshBarcode } from './support/fresh-barcode';
import { client, signUp } from './support/admin-session';
import { createTestApp } from './support/create-test-app';

type Json = Record<string, unknown>;

const DAY = 24 * 60 * 60 * 1000;

const parmesan: OpenFoodFactsProduct = {
  productName: 'Parmesan',
  productNames: {},
  genericName: null,
  genericNames: {},
  quantity: '200 g',
};

// Spec: #342 / #347, ADR 0013. The Open Food Facts client is replaced and the
// clock (Date.now) is controlled, so no test reaches the network.
describe('Barcode Lookup cache (integration)', () => {
  let app: NestFastifyApplication;
  let a: ReturnType<typeof client>;
  let b: ReturnType<typeof client>;
  const stamp = Date.now();
  const asked: string[] = [];
  let found: OpenFoodFactsProduct | null = null;
  let failWith: Error | null = null;
  let now = 0;

  let code = '';

  beforeAll(async () => {
    app = await createTestApp([], undefined, undefined, {
      fetchProduct: (barcode) => {
        asked.push(barcode);
        if (failWith) return Promise.reject(failWith);
        return Promise.resolve(found);
      },
    });
    await seedCatalog(app.get<Database>(DATABASE));
    a = client(
      app,
      await signUp(app, `bcc-a-${stamp}@example.com`, 'A'),
      '/api',
    );
    b = client(
      app,
      await signUp(app, `bcc-b-${stamp}@example.com`, 'B'),
      '/api',
    );
  });

  beforeEach(() => {
    code = freshBarcode();
    asked.length = 0;
    found = parmesan;
    failWith = null;
    now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const lookup = (who: typeof a) =>
    who.get(`/barcode-lookup/${code}?locale=en`).expect(200);

  it('serves a second lookup, from another Family, from the cache', async () => {
    await lookup(a);
    now += 29 * DAY;
    const res = await lookup(b);
    expect(asked).toEqual([code]);
    expect(res.body).toMatchObject({
      found: true,
      productDescription: 'Parmesan',
      quantity: 200,
      unit: 'g',
    });
  });

  it('shares one cache entry between a UPC-A code and its EAN-13 form', async () => {
    const upcA = freshBarcode(12);
    await a.get(`/barcode-lookup/${upcA}?locale=en`).expect(200);
    await b.get(`/barcode-lookup/0${upcA}?locale=en`).expect(200);
    expect(asked).toEqual([`0${upcA}`]);
  });

  it('fetches a hit again once it is older than 30 days', async () => {
    await lookup(a);
    now += 30 * DAY + 1000;
    await lookup(a);
    expect(asked).toEqual([code, code]);
  });

  it('serves a not found from the cache for a day, then fetches again', async () => {
    found = null;
    expect((await lookup(a)).body).toEqual({ found: false });
    now += DAY - 1000;
    expect((await lookup(b)).body).toEqual({ found: false });
    expect(asked).toEqual([code]);

    found = parmesan;
    now += 2000;
    expect((await lookup(a)).body).toMatchObject({ found: true });
    expect(asked).toEqual([code, code]);
  });

  it('caches a product with no usable name as a not found, for a day', async () => {
    found = { ...parmesan, productName: null, productNames: { en: '  ' } };
    expect((await lookup(a)).body).toEqual({ found: false });
    now += 2 * DAY;
    found = parmesan;
    expect((await lookup(a)).body).toMatchObject({ found: true });
    expect(asked).toEqual([code, code]);
  });

  it('clamps the Product Description to the Batch limit of 200 characters', async () => {
    found = { ...parmesan, productName: 'P'.repeat(300) };
    const body = (await lookup(a)).body as { productDescription: string };
    expect(body.productDescription).toBe('P'.repeat(200));
  });

  it('keeps a hit in the cache for longer than a not found', async () => {
    await lookup(a);
    now += 2 * DAY;
    await lookup(a);
    expect(asked).toEqual([code]);
  });

  it('does not cache a failure', async () => {
    failWith = new ApiException(502, 'barcode.provider_unavailable');
    await a.get(`/barcode-lookup/${code}?locale=en`).expect(502);
    failWith = null;
    expect((await lookup(a)).body).toMatchObject({ found: true });
    expect(asked).toEqual([code, code]);
  });

  it('matches the Catalog per Family from the same cached product', async () => {
    const name = `Cache Synonym ${stamp}`;
    found = { ...parmesan, productName: name };
    expect(((await lookup(a)).body as Json).match).toBeNull();

    await b
      .post('/catalog/family-synonyms?locale=en', {
        name,
        ingredientId: seedId.ingredient('cheddar'),
      })
      .expect(201);

    expect(((await lookup(b)).body as Json).match).toMatchObject({
      id: seedId.ingredient('cheddar'),
    });
    expect(((await lookup(a)).body as Json).match).toBeNull();
    expect(asked).toEqual([code]);
  });

  describe('lazy sweep of expired rows (#899)', () => {
    const cacheRow = async (barcode: string) => {
      const rows = await app
        .get<Database>(DATABASE)
        .select()
        .from(openFoodFactsCache)
        .where(eq(openFoodFactsCache.barcode, barcode));
      return rows[0];
    };
    const seed = (
      barcode: string,
      product: OpenFoodFactsProduct | null,
      ageMs: number,
    ) =>
      app
        .get<Database>(DATABASE)
        .insert(openFoodFactsCache)
        .values({ barcode, product, fetchedAt: new Date(now - ageMs) });
    const settle = async (barcode: string, gone: boolean) => {
      for (let i = 0; i < 50; i++) {
        if (!(await cacheRow(barcode)) === gone) return;
        await new Promise((r) => setTimeout(r, 20));
      }
    };

    it('deletes expired hits and not-founds on a lookup, keeping fresh ones', async () => {
      now += 1000 * DAY; // past any earlier test's sweep
      const expiredHit = freshBarcode();
      const expiredMiss = freshBarcode();
      const freshHit = freshBarcode();
      const freshMiss = freshBarcode();
      await seed(expiredHit, parmesan, 31 * DAY);
      await seed(expiredMiss, null, 2 * DAY);
      await seed(freshHit, parmesan, 29 * DAY);
      await seed(freshMiss, null, DAY / 2);
      await lookup(a);
      await settle(expiredHit, true);
      await settle(expiredMiss, true);
      expect(await cacheRow(expiredHit)).toBeUndefined();
      expect(await cacheRow(expiredMiss)).toBeUndefined();
      expect(await cacheRow(freshHit)).toBeDefined();
      expect(await cacheRow(freshMiss)).toBeDefined();
    });

    it('does not fail the lookup when the sweep throws', async () => {
      now += 1000 * DAY; // past any earlier test's sweep
      const db = app.get<Database>(DATABASE);
      jest.spyOn(db, 'delete').mockImplementation(() => {
        throw new Error('boom');
      });
      await lookup(a);
    });
  });
});
