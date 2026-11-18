import { jest } from '@jest/globals';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, ilike } from 'drizzle-orm';
import { seedId } from '../src/catalog/seed/seed-catalog';
import { DATABASE } from '../src/database/database.constants';
import type { Database } from '../src/database/database.types';
import {
  batches,
  ingredients,
  mealPlans,
  recipeIngredientLines,
  recipes,
  shoppingItemSourceRecipes,
  user,
} from '../src/database/schema';
import { client, signUp } from './support/admin-session';
import { createTestApp } from './support/create-test-app';

type Unit = 'g' | 'kg' | 'ml' | 'l' | 'pcs';
type ListItem = {
  id: string;
  ingredientId: string | null;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
};
type List = { groups: { items: ListItem[] }[] };
type Added = { createdIds: string[]; count: number };

jest.setTimeout(30_000);

/** A write's today must be near the server's UTC date. */
const TODAY = new Date().toISOString().slice(0, 10);
const at = (offset: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);

describe('Add missing for a Meal Plan (integration)', () => {
  let app: NestFastifyApplication;
  let database: Database;
  const stamp = Date.now();
  let n = 0;
  const basics: string[] = [];
  const eggs = seedId.ingredient('eggs');
  const flour = seedId.ingredient('flour');
  const milk = seedId.ingredient('milk');

  beforeAll(async () => {
    app = await createTestApp();
    database = app.get<Database>(DATABASE);
  });
  afterAll(async () => {
    const owners = await database
      .select({ familyId: user.familyId })
      .from(user)
      .where(ilike(user.email, `am-%-${stamp}-%`));
    for (const { familyId } of owners) {
      await database.delete(mealPlans).where(eq(mealPlans.familyId, familyId));
    }
    await database.delete(recipes).where(ilike(recipes.title, `%${stamp}-%`));
    for (const id of basics) {
      await database.delete(ingredients).where(eq(ingredients.id, id));
    }
    await app.close();
  });

  async function member(label: string) {
    const email = `am-${label}-${stamp}-${++n}@example.com`;
    const cookie = await signUp(app, email, label);
    const [{ familyId }] = await database
      .select({ familyId: user.familyId })
      .from(user)
      .where(eq(user.email, email));
    return {
      familyId,
      plans: client(app, cookie, '/api/meal-plans'),
      list: client(app, cookie, '/api/shopping-list'),
    };
  }
  type Member = Awaited<ReturnType<typeof member>>;

  async function recipe(
    familyId: string,
    lines: {
      ingredientId?: string;
      /** An Unmatched line, by the name as typed. */
      name?: string;
      quantity?: number;
      unit?: Unit;
      optional?: boolean;
    }[],
    over: { archived?: boolean } = {},
  ) {
    const id = crypto.randomUUID();
    await database.insert(recipes).values({
      id,
      familyId,
      title: `Dish ${stamp}-${++n}`,
      servings: 4,
      archivedAt: over.archived ? new Date() : null,
    });
    await database.insert(recipeIngredientLines).values(
      lines.map((line, position) => ({
        id: crypto.randomUUID(),
        recipeId: id,
        position,
        ingredientId: line.ingredientId ?? null,
        rawName: line.name ?? null,
        normalizedName: line.name?.trim().toLowerCase() ?? null,
        quantity: line.quantity ?? null,
        unit: line.unit ?? null,
        optional: line.optional ?? false,
      })),
    );
    return id;
  }

  async function stock(
    familyId: string,
    ingredientId: string,
    quantity: number | null,
    unit: Unit | null,
  ) {
    const [{ leaf }] = await database
      .select({ leaf: ingredients.leafCategoryId })
      .from(ingredients)
      .where(eq(ingredients.id, ingredientId));
    await database.insert(batches).values({
      familyId,
      ingredientId,
      leafCategoryId: leaf,
      location: 'fridge',
      quantity,
      unit,
    });
  }

  const q = `?locale=en&today=${TODAY}`;
  async function plan(who: Member, startDate: string, days: number) {
    const res = await who.plans.post(q, { startDate, days, servings: 4 });
    expect([res.status]).toEqual([201]);
    return (res.body as { id: string }).id;
  }
  async function fill(
    who: Member,
    planId: string,
    dayIndex: number,
    mealtime: string,
    recipeId: string,
  ) {
    await who.plans
      .put(`/${planId}/slots/${dayIndex}/${mealtime}${q}`, { recipeId })
      .expect(200);
  }
  const add = (who: Member, body: object) =>
    who.plans.post(`/add-missing${q}`, body);
  const shopping = async (who: Member) =>
    (
      (await who.list.get('?locale=en').expect(200)).body as List
    ).groups.flatMap((group) => group.items);
  const sourcesOf = async (itemId: string) =>
    (
      await database
        .select({ recipeId: shoppingItemSourceRecipes.recipeId })
        .from(shoppingItemSourceRecipes)
        .where(eq(shoppingItemSourceRecipes.shoppingItemId, itemId))
    )
      .map((row) => row.recipeId)
      .sort();

  /** Two dinners of one dish (4 eggs, 600 g flour) and a lunch of another (1 l milk). */
  async function week(who: Member) {
    const cake = await recipe(who.familyId, [
      { ingredientId: eggs, quantity: 4, unit: 'pcs' },
      { ingredientId: flour, quantity: 600, unit: 'g' },
    ]);
    const latte = await recipe(who.familyId, [
      { ingredientId: milk, quantity: 1, unit: 'l' },
    ]);
    const id = await plan(who, TODAY, 3);
    await fill(who, id, 0, 'dinner', cake);
    await fill(who, id, 1, 'dinner', cake);
    await fill(who, id, 2, 'lunch', latte);
    return { id, cake, latte };
  }
  const byIngredient = (items: ListItem[], id: string) =>
    items.find((item) => item.ingredientId === id);

  it('adds the whole window: totals per Ingredient across slots, kg or l from 1000, Source Recipes on each item, created ids returned', async () => {
    const ana = await member('window');
    const { cake, latte } = await week(ana);

    const res = await add(ana, { scope: 'window' });

    expect(res.status).toBe(201);
    const { createdIds, count } = res.body as Added;
    const items = await shopping(ana);
    expect(count).toBe(3);
    expect(createdIds.slice().sort()).toEqual(items.map((i) => i.id).sort());
    const eggItem = byIngredient(items, eggs);
    const flourItem = byIngredient(items, flour);
    const milkItem = byIngredient(items, milk);
    expect([eggItem?.quantity, eggItem?.unit]).toEqual([8, 'pcs']);
    expect([flourItem?.quantity, flourItem?.unit]).toEqual([1.2, 'kg']);
    expect([milkItem?.quantity, milkItem?.unit]).toEqual([1, 'l']);
    expect(await sourcesOf(eggItem!.id)).toEqual([cake]);
    expect(await sourcesOf(milkItem!.id)).toEqual([latte]);
  });

  it('returns only the ids of the Shopping Items it inserted, never one already on the list (what Undo deletes)', async () => {
    const ana = await member('undo');
    await week(ana);
    await add(ana, { scope: 'ingredient', ingredientId: eggs }).expect(201);
    const eggId = byIngredient(await shopping(ana), eggs)!.id;

    // The forecast leaves Ingredients on the list out, so nothing merges here: this guards the ids returned.
    const res = await add(ana, { scope: 'window' });

    const { createdIds } = res.body as Added;
    const items = await shopping(ana);
    expect(createdIds).not.toContain(eggId);
    expect(createdIds.slice().sort()).toEqual(
      items
        .filter((i) => i.id !== eggId)
        .map((i) => i.id)
        .sort(),
    );
  });

  it('keeps counts as counts and leaves amounts under 1000 in g and ml', async () => {
    const ana = await member('units');
    const dish = await recipe(ana.familyId, [
      { ingredientId: eggs, quantity: 1500, unit: 'pcs' },
      { ingredientId: flour, quantity: 999, unit: 'g' },
    ]);
    const id = await plan(ana, TODAY, 1);
    await fill(ana, id, 0, 'dinner', dish);

    await add(ana, { scope: 'window' });

    const items = await shopping(ana);
    expect([
      byIngredient(items, eggs)?.quantity,
      byIngredient(items, eggs)?.unit,
    ]).toEqual([1500, 'pcs']);
    expect([
      byIngredient(items, flour)?.quantity,
      byIngredient(items, flour)?.unit,
    ]).toEqual([999, 'g']);
  });

  it('adds one plan only', async () => {
    const ana = await member('one-plan');
    const { id } = await week(ana);
    const other = await plan(ana, at(3), 1);
    const juice = await recipe(ana.familyId, [
      { ingredientId: milk, quantity: 2, unit: 'l' },
    ]);
    await fill(ana, other, 0, 'dinner', juice);

    const res = await add(ana, { scope: 'plan', planId: id });

    expect(res.status).toBe(201);
    const items = await shopping(ana);
    expect(byIngredient(items, milk)?.quantity).toBe(1);
    expect(items).toHaveLength(3);
  });

  it('adds one date, with the earlier days needing the same Ingredients', async () => {
    const ana = await member('one-date');
    await week(ana);

    await add(ana, { scope: 'date', date: at(1) });

    const items = await shopping(ana);
    expect(items.map((i) => i.ingredientId).sort()).toEqual(
      [eggs, flour].sort(),
    );
    expect(byIngredient(items, eggs)?.quantity).toBe(8);
  });

  it('does not mark a later day as On list after an earlier day was added, and the next Add only adds its own amount', async () => {
    const ana = await member('later-day');
    const { id } = await week(ana);
    const eggsStatuses = async () =>
      (
        (await ana.plans.get(`/${id}${q}`).expect(200)).body as {
          slots: {
            dayIndex: number;
            issues: { ingredientId: string; onList: boolean }[];
          }[];
        }
      ).slots
        .filter((slot) => slot.dayIndex < 2)
        .map(
          (slot) => slot.issues.find((i) => i.ingredientId === eggs)?.onList,
        );

    await add(ana, { scope: 'date', date: at(0) }).expect(201);

    expect(await eggsStatuses()).toEqual([true, false]);
    await add(ana, { scope: 'date', date: at(1) }).expect(201);
    const items = await shopping(ana);
    expect(items.filter((i) => i.ingredientId === eggs)).toHaveLength(1);
    expect(byIngredient(items, eggs)?.quantity).toBe(8);
    expect(await eggsStatuses()).toEqual([true, true]);
  });

  it('puts a later day, and the earlier days needing the same Ingredients, on list when that day is added', async () => {
    const ana = await member('later-first');
    const { id } = await week(ana);

    const res = await add(ana, { scope: 'date', date: at(1) }).expect(201);

    expect((res.body as Added).count).toBe(2);
    const items = await shopping(ana);
    expect(byIngredient(items, eggs)?.quantity).toBe(8);
    expect(byIngredient(items, flour)?.quantity).toBe(1.2);
    const read = (await ana.plans.get(`/${id}${q}`).expect(200)).body as {
      slots: { dayIndex: number; issues: { onList: boolean }[] }[];
    };
    expect(
      read.slots
        .filter((slot) => slot.dayIndex < 2)
        .every((slot) => slot.issues.every((issue) => issue.onList)),
    ).toBe(true);
  });

  it('adds only the uncovered part when the list already covers some of the need', async () => {
    const ana = await member('partial');
    await week(ana);
    await ana.list
      .post('/items?locale=en', {
        ingredientId: eggs,
        quantity: 6,
        unit: 'pcs',
      })
      .expect(200);

    await add(ana, { scope: 'window' }).expect(201);

    expect(byIngredient(await shopping(ana), eggs)?.quantity).toBe(8);
  });

  it('adds one Ingredient, summed across the window', async () => {
    const ana = await member('one-ingredient');
    const { cake } = await week(ana);

    const res = await add(ana, { scope: 'ingredient', ingredientId: eggs });

    expect((res.body as Added).count).toBe(1);
    const items = await shopping(ana);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      ingredientId: eggs,
      quantity: 8,
      unit: 'pcs',
    });
    expect(await sourcesOf(items[0].id)).toEqual([cake]);
  });

  it('adds one Ingredient within one plan only', async () => {
    const ana = await member('ingredient-in-plan');
    const { id, cake } = await week(ana);
    const other = await plan(ana, at(3), 1);
    await fill(ana, other, 0, 'dinner', cake);

    const res = await add(ana, {
      scope: 'ingredient',
      ingredientId: eggs,
      planId: id,
    });

    expect((res.body as Added).count).toBe(1);
    expect(await shopping(ana)).toMatchObject([
      { ingredientId: eggs, quantity: 8 },
    ]);
  });

  it('adds one Ingredient of an upcoming plan past the window', async () => {
    const ana = await member('ingredient-upcoming');
    const { cake } = await week(ana);
    const later = await plan(ana, at(10), 1);
    await fill(ana, later, 0, 'dinner', cake);

    const res = await add(ana, {
      scope: 'ingredient',
      ingredientId: eggs,
      planId: later,
    });

    expect((res.body as Added).count).toBe(1);
    expect(await shopping(ana)).toMatchObject([
      { ingredientId: eggs, quantity: 4 },
    ]);
  });

  it('adds nothing the second time, and nothing for an Ingredient already on the list', async () => {
    const ana = await member('twice');
    await week(ana);
    await add(ana, { scope: 'window' }).expect(201);
    const before = await shopping(ana);

    const again = await add(ana, { scope: 'window' });

    expect(again.body).toEqual({ createdIds: [], count: 0 });
    const oneIngredient = await add(ana, {
      scope: 'ingredient',
      ingredientId: eggs,
    });
    expect(oneIngredient.body).toEqual({ createdIds: [], count: 0 });
    expect(await shopping(ana)).toEqual(before);
  });

  it('leaves out uncertain issues, optional lines and unavailable slots', async () => {
    const ana = await member('left-out');
    // A Batch with no quantity covers the first use; the second is uncertain.
    await stock(ana.familyId, milk, null, null);
    const uncertain = await recipe(ana.familyId, [
      { ingredientId: milk, quantity: 1, unit: 'l' },
    ]);
    const optional = await recipe(ana.familyId, [
      { ingredientId: flour, quantity: 100, unit: 'g', optional: true },
    ]);
    const gone = await recipe(ana.familyId, [
      { ingredientId: eggs, quantity: 2, unit: 'pcs' },
    ]);
    const id = await plan(ana, TODAY, 2);
    await fill(ana, id, 0, 'dinner', uncertain);
    await fill(ana, id, 1, 'dinner', uncertain);
    await fill(ana, id, 1, 'lunch', optional);
    await fill(ana, id, 0, 'lunch', gone);
    // Archived after it was planned: the slot is unavailable.
    await database
      .update(recipes)
      .set({ archivedAt: new Date() })
      .where(eq(recipes.id, gone));

    const res = await add(ana, { scope: 'window' });

    expect(res.body).toEqual({ createdIds: [], count: 0 });
    expect(await shopping(ana)).toEqual([]);
  });

  it('leaves out a Pantry Basic line', async () => {
    const ana = await member('basic');
    // A stamped Pantry Basic of our own, so no seed Ingredient is touched.
    const [sample] = await database
      .select()
      .from(ingredients)
      .where(eq(ingredients.id, milk));
    const basic = { id: crypto.randomUUID() };
    await database.insert(ingredients).values({
      ...sample,
      id: basic.id,
      name: `Pantry Basic ${stamp}`,
      normalizedName: `pantry basic ${stamp}`,
      pantryBasic: true,
    });
    basics.push(basic.id);
    const dish = await recipe(ana.familyId, [
      { ingredientId: basic.id, quantity: 5, unit: 'pcs' },
    ]);
    const id = await plan(ana, TODAY, 1);
    await fill(ana, id, 0, 'dinner', dish);

    const res = await add(ana, { scope: 'window' });

    expect(res.body).toEqual({ createdIds: [], count: 0 });
  });

  it('adds one Unmatched Ingredient by its name, whatever the case', async () => {
    const ana = await member('unmatched');
    const dish = await recipe(ana.familyId, [
      { name: 'Dragon Fruit', quantity: 2, unit: 'pcs' },
      { ingredientId: eggs, quantity: 4, unit: 'pcs' },
    ]);
    const id = await plan(ana, TODAY, 2);
    await fill(ana, id, 0, 'dinner', dish);
    await fill(ana, id, 1, 'dinner', dish);

    const res = await add(ana, { scope: 'ingredient', name: ' dragon FRUIT ' });

    expect((res.body as Added).count).toBe(1);
    const items = await shopping(ana);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      ingredientId: null,
      quantity: 4,
      unit: 'pcs',
    });
  });

  it('adds one Ingredient only for days inside the window', async () => {
    const ana = await member('beyond');
    const dish = await recipe(ana.familyId, [
      { ingredientId: eggs, quantity: 4, unit: 'pcs' },
    ]);
    // Days 5 to 9: the last two are beyond the 7-day window.
    const id = await plan(ana, at(5), 5);
    await fill(ana, id, 0, 'dinner', dish);
    await fill(ana, id, 4, 'dinner', dish);

    await add(ana, { scope: 'ingredient', ingredientId: eggs }).expect(201);

    const items = await shopping(ana);
    expect(items[0]).toMatchObject({ ingredientId: eggs, quantity: 4 });
  });

  it('keeps 3-decimal precision when converting to kg', async () => {
    const ana = await member('precision');
    const dish = await recipe(ana.familyId, [
      { ingredientId: flour, quantity: 1234.567, unit: 'g' },
    ]);
    const id = await plan(ana, TODAY, 1);
    await fill(ana, id, 0, 'dinner', dish);

    await add(ana, { scope: 'window' }).expect(201);

    const items = await shopping(ana);
    expect([items[0].quantity, items[0].unit]).toEqual([1.235, 'kg']);
  });

  it('refuses another Family’s plan', async () => {
    const ana = await member('owner');
    const bo = await member('stranger');
    const { id } = await week(ana);

    const res = await add(bo, { scope: 'plan', planId: id });

    expect(res.status).toBe(404);
    expect(await shopping(ana)).toEqual([]);
    expect(await shopping(bo)).toEqual([]);
  });

  it('rejects a malformed scope', async () => {
    const ana = await member('bad');
    expect((await add(ana, { scope: 'everything' })).status).toBe(400);
    expect((await add(ana, { scope: 'plan' })).status).toBe(400);
  });
});
