import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DATABASE } from '../src/database/database.constants';
import type { Database } from '../src/database/database.types';
import {
  recipes,
  shoppingItemSourceRecipes,
  shoppingLists,
  user,
} from '../src/database/schema';
import { ShoppingService } from '../src/shopping/shopping.service';
import { createTestApp, TEST_ORIGIN } from './support/create-test-app';
import { storeUiLanguage } from './support/stored-language';

type Item = {
  id: string;
  ingredientId: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
  unmatched: boolean;
};
type List = {
  id: string;
  groups: Array<{
    aisle: { id: string; name: string; sortOrder: number } | null;
    items: Item[];
  }>;
  summary: { remaining: number; checked: number };
};

describe('Shopping List (integration)', () => {
  let app: NestFastifyApplication;
  let database: Database;
  let counter = 0;

  beforeAll(async () => {
    app = await createTestApp();
    database = app.get<Database>(DATABASE);
    // The starter Catalog is seeded once by global-setup.mjs.
  });

  afterAll(async () => {
    await app.close();
  });

  async function signUp(name: string) {
    const email = `shopping-${Date.now()}-${++counter}@example.com`;
    const response = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('origin', TEST_ORIGIN)
      .set(
        'x-forwarded-for',
        `10.1.${Math.floor(counter / 250)}.${counter % 250}`,
      )
      .send({ name, email, password: 'correct-horse-battery-staple' })
      .expect(200);
    const cookie = [response.headers['set-cookie'] ?? []]
      .flat()
      .map((c) => c.split(';')[0])
      .join('; ');
    return {
      cookie,
      userId: (response.body as { user: { id: string } }).user.id,
    };
  }

  const call = (
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    cookie: string,
    path: string,
  ) =>
    request(app.getHttpServer())
      [method](`/api/shopping-list${path}`)
      .set('origin', TEST_ORIGIN)
      .set('cookie', cookie);

  // A signed-in request's `?locale=` is ignored: the stored UI Language decides.
  const getList = async (cookie: string, locale = 'en') => {
    await storeUiLanguage(app, cookie, locale);
    return (await call('get', cookie, '').expect(200)).body as List;
  };

  const add = async (
    cookie: string,
    body: Record<string, unknown>,
    locale = 'en',
  ) =>
    (
      await call('post', cookie, `/items?locale=${locale}`)
        .send(body)
        .expect(200)
    ).body as List;

  async function ingredientId(cookie: string, q: string) {
    const response = await request(app.getHttpServer())
      .get('/api/catalog/search')
      .query({ q })
      .set('origin', TEST_ORIGIN)
      .set('cookie', cookie)
      .expect(200);
    return (response.body as { results: Array<{ id: string }> }).results[0].id;
  }

  const items = (list: List) => list.groups.flatMap((g) => g.items);

  it('creates exactly one active list per Family, on demand', async () => {
    const { cookie, userId } = await signUp('Ana');

    const first = await getList(cookie);
    const second = await getList(cookie);

    expect(first.groups).toEqual([]);
    expect(first.summary).toEqual({ remaining: 0, checked: 0 });
    expect(second.id).toBe(first.id);
    const [self] = await database
      .select()
      .from(user)
      .where(eq(user.id, userId));
    const lists = await database
      .select()
      .from(shoppingLists)
      .where(eq(shoppingLists.familyId, self.familyId));
    expect(lists).toHaveLength(1);
    expect(lists[0].status).toBe('active');
  });

  describe('merge rules', () => {
    it('sums quantities when the unit agrees', async () => {
      const { cookie } = await signUp('Merge');
      const parmesan = await ingredientId(cookie, 'parmesan');

      await add(cookie, { ingredientId: parmesan, quantity: 200, unit: 'g' });
      const list = await add(cookie, {
        ingredientId: parmesan,
        quantity: 150,
        unit: 'g',
      });

      expect(items(list)).toHaveLength(1);
      expect(items(list)[0]).toMatchObject({
        name: 'Parmesan',
        quantity: 350,
        unit: 'g',
        unmatched: false,
      });
    });

    it('rejects a merge that would pass the quantity cap, leaving the line as it was', async () => {
      const { cookie } = await signUp('Cap');
      const parmesan = await ingredientId(cookie, 'parmesan');

      await add(cookie, {
        ingredientId: parmesan,
        quantity: 600_000,
        unit: 'g',
      });
      const rejected = await call('post', cookie, '/items').send({
        ingredientId: parmesan,
        quantity: 500_000,
        unit: 'g',
      });
      expect(rejected.status).toBe(400);
      expect((rejected.body as { code: string }).code).toBe(
        'shopping.quantity_too_large',
      );

      const list = await add(cookie, {
        ingredientId: parmesan,
        quantity: 400_000,
        unit: 'g',
      });
      expect(items(list)).toHaveLength(1);
      expect(items(list)[0].quantity).toBe(1_000_000);
    });

    it('merges a kg add into a ticked-off g line, keeping the line and its unit', async () => {
      const { cookie } = await signUp('KgOnG');
      const parmesan = await ingredientId(cookie, 'parmesan');
      const added = await add(cookie, {
        ingredientId: parmesan,
        quantity: 500,
        unit: 'g',
      });
      await call('patch', cookie, `/items/${items(added)[0].id}`)
        .send({ checked: true })
        .expect(200);

      const list = await add(cookie, {
        ingredientId: parmesan,
        quantity: 1,
        unit: 'kg',
      });

      expect(items(list)).toHaveLength(1);
      expect(items(list)[0]).toMatchObject({
        id: items(added)[0].id,
        quantity: 1500,
        unit: 'g',
        checked: false,
      });
    });

    it('merges a g add into a kg line and a ml add into an l line', async () => {
      const { cookie } = await signUp('Convert');
      const parmesan = await ingredientId(cookie, 'parmesan');
      const milk = await ingredientId(cookie, 'milk');

      await add(cookie, { ingredientId: parmesan, quantity: 1, unit: 'kg' });
      await add(cookie, { ingredientId: parmesan, quantity: 200, unit: 'g' });
      await add(cookie, { ingredientId: milk, quantity: 1, unit: 'l' });
      const list = await add(cookie, {
        ingredientId: milk,
        quantity: 200,
        unit: 'ml',
      });

      expect(
        items(list)
          .map((i) => [i.name, i.quantity, i.unit])
          .sort(),
      ).toEqual([
        ['Milk', 1.2, 'l'],
        ['Parmesan', 1.2, 'kg'],
      ]);
    });

    it('merges into the oldest line when several convertible lines exist', async () => {
      const { cookie } = await signUp('Oldest');
      const parmesan = await ingredientId(cookie, 'parmesan');
      const first = await add(cookie, {
        ingredientId: parmesan,
        quantity: 100,
        unit: 'g',
      });
      await call('post', cookie, '/items')
        .send({ ingredientId: parmesan, quantity: 1, unit: 'pcs' })
        .expect(200);

      const list = await add(cookie, {
        ingredientId: parmesan,
        quantity: 1,
        unit: 'kg',
      });

      expect(items(list).map((i) => [i.quantity, i.unit])).toEqual([
        [1100, 'g'],
        [1, 'pcs'],
      ]);
      expect(items(list)[0].id).toBe(items(first)[0].id);
    });

    it('rejects a converted merge that would pass the quantity cap', async () => {
      const { cookie } = await signUp('ConvCap');
      const parmesan = await ingredientId(cookie, 'parmesan');
      await add(cookie, {
        ingredientId: parmesan,
        quantity: 900_000,
        unit: 'g',
      });

      const rejected = await call('post', cookie, '/items').send({
        ingredientId: parmesan,
        quantity: 200,
        unit: 'kg',
      });

      expect(rejected.status).toBe(400);
      expect((rejected.body as { code: string }).code).toBe(
        'shopping.quantity_too_large',
      );
    });

    it('keeps separate lines when the units are in different dimensions', async () => {
      const { cookie } = await signUp('Units');
      const milk = await ingredientId(cookie, 'milk');

      await add(cookie, { ingredientId: milk, quantity: 1, unit: 'l' });
      await add(cookie, { ingredientId: milk, quantity: 200, unit: 'g' });
      const list = await add(cookie, {
        ingredientId: milk,
        quantity: 2,
        unit: 'pcs',
      });

      expect(items(list).map((i) => [i.quantity, i.unit])).toEqual([
        [1, 'l'],
        [200, 'g'],
        [2, 'pcs'],
      ]);
    });

    it('treats a missing unit as its own unit', async () => {
      const { cookie } = await signUp('NoUnit');
      const milk = await ingredientId(cookie, 'milk');

      await add(cookie, { ingredientId: milk });
      await add(cookie, { ingredientId: milk, quantity: 2, unit: 'l' });
      const list = await add(cookie, { ingredientId: milk });

      expect(items(list)).toHaveLength(2);
    });

    it('wants a checked item again when it is added again', async () => {
      const { cookie } = await signUp('Again');
      const milk = await ingredientId(cookie, 'milk');
      const added = await add(cookie, {
        ingredientId: milk,
        quantity: 1,
        unit: 'l',
      });
      await call('patch', cookie, `/items/${items(added)[0].id}`)
        .send({ checked: true })
        .expect(200);

      const list = await add(cookie, {
        ingredientId: milk,
        quantity: 1,
        unit: 'l',
      });

      expect(items(list)[0]).toMatchObject({ quantity: 2, checked: false });
    });
  });

  it('adds a name with no Catalog match as an Unmatched Shopping Item, merged by normalised name', async () => {
    const { cookie } = await signUp('Unmatched');

    await add(cookie, { name: 'Dragon fruit', quantity: 1, unit: 'pcs' });
    const list = await add(cookie, {
      name: '  dragon FRUIT ',
      quantity: 2,
      unit: 'pcs',
    });

    expect(items(list)).toEqual([
      expect.objectContaining({
        name: 'Dragon fruit',
        quantity: 3,
        unit: 'pcs',
        unmatched: true,
      }),
    ]);
    expect(list.groups[0].aisle).toBeNull();
  });

  it('rejects an add with neither or both of ingredientId and name', async () => {
    const { cookie } = await signUp('Invalid');
    const milk = await ingredientId(cookie, 'milk');

    await call('post', cookie, '/items').send({}).expect(400);
    await call('post', cookie, '/items')
      .send({ ingredientId: milk, name: 'Milk' })
      .expect(400);
    await call('post', cookie, '/items').send({ name: '!!!' }).expect(400);
    await call('post', cookie, '/items')
      .send({ ingredientId: '00000000-0000-4000-8000-00000000dead' })
      .expect(404);
  });

  it('groups by Aisle in shop order, Unmatched last, with localised names and a summary', async () => {
    const { cookie } = await signUp('Groups');
    await add(cookie, { name: 'Mystery sauce' });
    await add(cookie, { ingredientId: await ingredientId(cookie, 'milk') });
    await add(cookie, { ingredientId: await ingredientId(cookie, 'tomato') });
    const list = await add(cookie, {
      ingredientId: await ingredientId(cookie, 'parmesan'),
    });

    const ro = await getList(cookie, 'ro');
    expect(ro.groups.map((g) => g.aisle?.name ?? null)).toEqual([
      'Legume și fructe',
      'Lactate și ouă',
      null,
    ]);
    expect(ro.groups[1].items.map((i) => i.name).sort()).toEqual(
      ['Lapte', 'Parmezan'].sort(),
    );
    const orders = list.groups.flatMap((g) =>
      g.aisle ? [g.aisle.sortOrder] : [],
    );
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(list.summary).toEqual({ remaining: 4, checked: 0 });
  });

  it('checks, unchecks, and removes items, updating the summary', async () => {
    const { cookie } = await signUp('Check');
    const added = await add(cookie, {
      ingredientId: await ingredientId(cookie, 'milk'),
    });
    await add(cookie, { name: 'Cake' });
    const id = items(added)[0].id;

    const checked = (
      await call('patch', cookie, `/items/${id}`)
        .send({ checked: true })
        .expect(200)
    ).body as List;
    expect(checked.summary).toEqual({ remaining: 1, checked: 1 });
    expect(items(checked).find((i) => i.id === id)?.checked).toBe(true);

    const unchecked = (
      await call('patch', cookie, `/items/${id}`)
        .send({ checked: false })
        .expect(200)
    ).body as List;
    expect(unchecked.summary).toEqual({ remaining: 2, checked: 0 });

    const removed = (await call('delete', cookie, `/items/${id}`).expect(200))
      .body as List;
    expect(items(removed).map((i) => i.name)).toEqual(['Cake']);
  });

  describe('setting an amount', () => {
    it('replaces the quantity and unit, checked state untouched', async () => {
      const { cookie } = await signUp('Amount');
      const added = await add(cookie, {
        ingredientId: await ingredientId(cookie, 'milk'),
        quantity: 1,
        unit: 'l',
      });
      const id = items(added)[0].id;
      await call('patch', cookie, `/items/${id}`)
        .send({ checked: true })
        .expect(200);

      const updated = (
        await call('put', cookie, `/items/${id}/amount`)
          .send({ quantity: 500, unit: 'ml' })
          .expect(200)
      ).body as List;
      expect(items(updated)[0]).toMatchObject({
        id,
        quantity: 500,
        unit: 'ml',
        checked: true,
      });
      expect(updated.summary).toEqual({ remaining: 0, checked: 1 });

      const cleared = (
        await call('put', cookie, `/items/${id}/amount`).send({}).expect(200)
      ).body as List;
      expect(items(cleared)[0]).toMatchObject({ quantity: null, unit: null });
    });

    it('does not merge into a sibling, and a later add merges into the oldest duplicate', async () => {
      const { cookie } = await signUp('AmountDup');
      const milk = await ingredientId(cookie, 'milk');
      await add(cookie, { ingredientId: milk, quantity: 1, unit: 'l' });
      const two = await add(cookie, {
        ingredientId: milk,
        quantity: 500,
        unit: 'g',
      });
      const [litre, millilitres] = items(two);

      // The known exception to the merge rule: two lines now share an Ingredient and a unit.
      const duplicated = (
        await call('put', cookie, `/items/${millilitres.id}/amount`)
          .send({ quantity: 2, unit: 'l' })
          .expect(200)
      ).body as List;
      expect(items(duplicated).map((i) => i.quantity)).toEqual([1, 2]);

      const merged = await add(cookie, {
        ingredientId: milk,
        quantity: 5,
        unit: 'l',
      });
      expect(items(merged).map((i) => [i.id, i.quantity])).toEqual([
        [litre.id, 6],
        [millilitres.id, 2],
      ]);
    });

    it('validates like adding', async () => {
      const { cookie } = await signUp('AmountBad');
      const added = await add(cookie, { name: 'Cake' });
      const id = items(added)[0].id;
      const put = (body: object) =>
        call('put', cookie, `/items/${id}/amount`).send(body);
      await put({ quantity: 0 }).expect(400);
      await put({ quantity: -1 }).expect(400);
      await put({ quantity: 1_000_001 }).expect(400);
      await put({ quantity: '2' }).expect(400);
      await put({ quantity: 1, unit: 'cups' }).expect(400);
      await call('put', cookie, '/items/not-a-uuid/amount')
        .send({ quantity: 1 })
        .expect(400);
    });

    it('answers 404 for an unknown id and for another Family’s item', async () => {
      const owner = await signUp('AmountOwner');
      const stranger = await signUp('AmountStranger');
      const added = await add(owner.cookie, { name: 'Cake' });
      const id = items(added)[0].id;
      await call('put', stranger.cookie, `/items/${id}/amount`)
        .send({ quantity: 2 })
        .expect(404);
      await call(
        'put',
        owner.cookie,
        '/items/00000000-0000-4000-8000-00000000dead/amount',
      )
        .send({ quantity: 2 })
        .expect(404);
      expect(items(await getList(owner.cookie))[0].quantity).toBeNull();
      await request(app.getHttpServer())
        .put(`/api/shopping-list/items/${id}/amount`)
        .set('origin', TEST_ORIGIN)
        .send({ quantity: 2 })
        .expect(401);
    });
  });

  describe('bulk removal (POST items/bulk-delete)', () => {
    it('removes the given items in one call and keeps the rest', async () => {
      const { cookie } = await signUp('Ana');
      await add(cookie, { name: 'bulk one' });
      await add(cookie, { name: 'bulk two' });
      const list = await add(cookie, { name: 'bulk three' });
      const [one, two, three] = items(list).map((i) => i.id);

      const response = await call('post', cookie, '/items/bulk-delete')
        .send({ ids: [one, three] })
        .expect(200);

      expect(items(response.body as List).map((i) => i.id)).toEqual([two]);
      expect(items(await getList(cookie)).map((i) => i.id)).toEqual([two]);
    });

    it('ignores ids that are already gone or unknown, removing the rest', async () => {
      const { cookie } = await signUp('Ana');
      const list = await add(cookie, { name: 'gone soon' });
      const [id] = items(list).map((i) => i.id);
      await call('delete', cookie, `/items/${id}`).expect(200);
      const kept = await add(cookie, { name: 'kept' });
      const keptId = items(kept)[0].id;
      const fresh = await add(cookie, { name: 'fresh' });
      const freshId = items(fresh).find((i) => i.name !== 'kept')!.id;

      const response = await call('post', cookie, '/items/bulk-delete')
        .send({
          ids: [id, freshId, '00000000-0000-4000-8000-000000000000', freshId],
        })
        .expect(200);

      expect(items(response.body as List).map((i) => i.id)).toEqual([keptId]);
    });

    it("never removes another Family's items", async () => {
      const ana = await signUp('Ana');
      const stranger = await signUp('Stranger');
      const mine = items(await add(ana.cookie, { name: 'mine' }))[0].id;
      const theirs = items(await add(stranger.cookie, { name: 'theirs' }))[0]
        .id;

      const response = await call('post', ana.cookie, '/items/bulk-delete')
        .send({ ids: [mine, theirs] })
        .expect(200);

      expect(items(response.body as List)).toEqual([]);
      expect(items(await getList(stranger.cookie)).map((i) => i.id)).toEqual([
        theirs,
      ]);
    });

    it('rejects an empty, oversized or malformed ids array', async () => {
      const { cookie } = await signUp('Ana');
      const send = (ids: unknown) =>
        call('post', cookie, '/items/bulk-delete').send({ ids });
      await send([]).expect(400);
      await send(['not-a-uuid']).expect(400);
      await send(
        Array.from(
          { length: 101 },
          () => '00000000-0000-4000-8000-000000000000',
        ),
      ).expect(400);
    });

    it('requires a signed-in Member', async () => {
      await request(app.getHttpServer())
        .post('/api/shopping-list/items/bulk-delete')
        .set('origin', TEST_ORIGIN)
        .send({ ids: ['00000000-0000-4000-8000-000000000000'] })
        .expect(401);
    });
  });

  describe('Family scoping', () => {
    it('shares one list between Members of a Family and isolates other Families', async () => {
      const ana = await signUp('Ana');
      const mihai = await signUp('Mihai');
      const stranger = await signUp('Stranger');
      const [anaRow] = await database
        .select()
        .from(user)
        .where(eq(user.id, ana.userId));
      // Move Mihai into Ana's Family (his own Household of One stays behind).
      await database
        .update(user)
        .set({ familyId: anaRow.familyId, familyRole: 'member' })
        .where(eq(user.id, mihai.userId));

      const milk = await ingredientId(ana.cookie, 'milk');
      const added = await add(ana.cookie, {
        ingredientId: milk,
        quantity: 1,
        unit: 'l',
      });

      const seenByMihai = await getList(mihai.cookie);
      expect(seenByMihai.id).toBe(added.id);
      expect(items(seenByMihai)).toHaveLength(1);

      // Another Member can check and remove it.
      const itemId = items(added)[0].id;
      await call('patch', mihai.cookie, `/items/${itemId}`)
        .send({ checked: true })
        .expect(200);
      expect(items(await getList(ana.cookie))[0].checked).toBe(true);

      // A different Family sees nothing and cannot touch the item.
      expect(items(await getList(stranger.cookie))).toEqual([]);
      await call('patch', stranger.cookie, `/items/${itemId}`)
        .send({ checked: false })
        .expect(404);
      await call('delete', stranger.cookie, `/items/${itemId}`).expect(404);

      await call('delete', mihai.cookie, `/items/${itemId}`).expect(200);
      expect(items(await getList(ana.cookie))).toEqual([]);
    });

    it('requires a signed-in Member', async () => {
      await request(app.getHttpServer())
        .get('/api/shopping-list')
        .set('origin', TEST_ORIGIN)
        .expect(401);
    });
  });
  describe('addItemsWithSourceRecipes (Source Recipes per item)', () => {
    const makeRecipe = async () => {
      const id = crypto.randomUUID();
      await database
        .insert(recipes)
        .values({ id, familyId: null, title: `Sources ${id}`, servings: 2 });
      return id;
    };
    const sourcesOf = async (itemId: string) =>
      (
        await database
          .select({ recipeId: shoppingItemSourceRecipes.recipeId })
          .from(shoppingItemSourceRecipes)
          .where(eq(shoppingItemSourceRecipes.shoppingItemId, itemId))
      )
        .map((row) => row.recipeId)
        .sort();

    it('records several Source Recipes per item, on merged-into items too, and reports only the newly inserted items', async () => {
      const { cookie, userId } = await signUp('Sources');
      const eggs = await ingredientId(cookie, 'egg');
      const feta = await ingredientId(cookie, 'feta');
      const [r1, r2, r3] = [
        await makeRecipe(),
        await makeRecipe(),
        await makeRecipe(),
      ];
      const existing = items(
        await add(cookie, { ingredientId: eggs, quantity: 2, unit: 'pcs' }),
      )[0];

      const result = await app.get(ShoppingService).addItemsWithSourceRecipes(
        userId,
        [
          {
            item: { ingredientId: eggs, quantity: 3, unit: 'pcs' },
            recipeIds: [r1, r2, r3],
          },
          { item: { ingredientId: feta }, recipeIds: [r1] },
        ],
        'en',
      );

      const listed = items(result.list);
      const eggsItem = listed.find((i) => i.id === existing.id);
      const fetaItem = listed.find((i) => i.ingredientId === feta);
      expect(eggsItem?.quantity).toBe(5);
      expect(fetaItem).toBeDefined();
      expect(result.insertedIds).toEqual([fetaItem!.id]);
      expect(await sourcesOf(existing.id)).toEqual([r1, r2, r3].sort());
      expect(await sourcesOf(fetaItem!.id)).toEqual([r1]);
    });
    it("reports an item inserted and then merged into within one call once, with the union of both entries' Recipes", async () => {
      const { cookie, userId } = await signUp('Twice');
      const feta = await ingredientId(cookie, 'feta');
      const [r1, r2] = [await makeRecipe(), await makeRecipe()];

      const result = await app.get(ShoppingService).addItemsWithSourceRecipes(
        userId,
        [
          {
            item: { ingredientId: feta, quantity: 100, unit: 'g' },
            recipeIds: [r1],
          },
          {
            item: { ingredientId: feta, quantity: 50, unit: 'g' },
            recipeIds: [r1, r2],
          },
        ],
        'en',
      );

      const listed = items(result.list);
      expect(listed).toHaveLength(1);
      expect(listed[0].quantity).toBe(150);
      expect(result.insertedIds).toEqual([listed[0].id]);
      expect(await sourcesOf(listed[0].id)).toEqual([r1, r2].sort());
    });
  });
});
