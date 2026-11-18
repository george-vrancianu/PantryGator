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
  user,
} from '../src/database/schema';
import { client, signUp } from './support/admin-session';
import { createTestApp } from './support/create-test-app';

type Unit = 'g' | 'kg' | 'ml' | 'l' | 'pcs';
type Issue = {
  ingredientId: string | null;
  name: string;
  kind: string;
  quantity: number | null;
  unit: string | null;
  onList: boolean;
  reason: { code: string; meals?: { recipeTitle: string }[] };
};
type Slot = {
  dayIndex: number;
  date: string;
  mealtime: string;
  recipeTitle: string;
  status: string | null;
  issues: Issue[];
};
type PlanDetail = {
  id: string;
  startDate: string;
  slots: Slot[];
  forecast: {
    tag: { kind: string; count?: number };
    days: { date: string; status: string }[];
  };
};
type WindowSlot = Slot & {
  planId: string;
  minutes: number | null;
  aisle: { id: string; name: string } | null;
  servings: number;
};
type Window = {
  today: string;
  days: {
    date: string;
    status: string;
    planId: string | null;
    slots: WindowSlot[];
  }[];
  tag: { kind: string; count?: number };
  plan: { id: string } | null;
  nextPlanStart: string | null;
  nextPlanId: string | null;
  missing: {
    ingredientId: string | null;
    name: string;
    quantity: number | null;
    unit: string | null;
    recipeIds: string[];
  }[];
};

jest.setTimeout(30_000);

/** A write's today must be near the server's UTC date. */
const TODAY = new Date().toISOString().slice(0, 10);
const at = (offset: number, from = TODAY) =>
  new Date(Date.parse(`${from}T00:00:00Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);

describe('Plan Forecast (integration)', () => {
  let app: NestFastifyApplication;
  let database: Database;
  const stamp = Date.now();
  let n = 0;
  const eggs = seedId.ingredient('eggs');
  const milk = seedId.ingredient('milk');

  beforeAll(async () => {
    app = await createTestApp();
    database = app.get<Database>(DATABASE);
  });
  afterAll(async () => {
    const owners = await database
      .select({ familyId: user.familyId })
      .from(user)
      .where(ilike(user.email, `pf-%-${stamp}-%`));
    for (const { familyId } of owners) {
      await database.delete(mealPlans).where(eq(mealPlans.familyId, familyId));
    }
    await database.delete(recipes).where(ilike(recipes.title, `%${stamp}-%`));
    await app.close();
  });

  async function member(label: string) {
    const email = `pf-${label}-${stamp}-${++n}@example.com`;
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
    lines: { ingredientId: string; quantity?: number; unit?: Unit }[],
    over: { archived?: boolean; servings?: number; prep?: number } = {},
  ) {
    const id = crypto.randomUUID();
    await database.insert(recipes).values({
      id,
      familyId,
      title: `Dish ${stamp}-${++n}`,
      servings: over.servings ?? 4,
      prepMinutes: over.prep ?? 10,
      cookMinutes: 20,
      archivedAt: over.archived ? new Date() : null,
    });
    await database.insert(recipeIngredientLines).values(
      lines.map((line, position) => ({
        id: crypto.randomUUID(),
        recipeId: id,
        position,
        ingredientId: line.ingredientId,
        quantity: line.quantity ?? null,
        unit: line.unit ?? null,
      })),
    );
    return id;
  }

  async function stock(
    familyId: string,
    ingredientId: string,
    quantity: number,
    unit: Unit,
    expiryDate: string | null = null,
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
      expiryDate,
    });
  }

  const q = (today = TODAY) => `?locale=en&today=${today}`;
  async function plan(who: Member, startDate: string, days: number) {
    const res = await who.plans.post(q(), { startDate, days, servings: 4 });
    expect([res.status]).toEqual([201]);
    return (res.body as PlanDetail).id;
  }
  async function fill(
    who: Member,
    planId: string,
    dayIndex: number,
    mealtime: string,
    recipeId: string,
    servings?: number,
  ) {
    await who.plans
      .put(`/${planId}/slots/${dayIndex}/${mealtime}${q()}`, {
        recipeId,
        servings,
      })
      .expect(200);
  }
  const readPlan = async (who: Member, id: string, today = TODAY) =>
    (await who.plans.get(`/${id}${q(today)}`).expect(200)).body as PlanDetail;
  const readWindow = async (who: Member, query = q()) =>
    (await who.plans.get(`/window${query}`).expect(200)).body as Window;

  describe('reading one plan', () => {
    it('carries a status and issues per slot, the day statuses and the plan tag', async () => {
      const ana = await member('plan');
      const dish = await recipe(ana.familyId, [
        { ingredientId: eggs, quantity: 4, unit: 'pcs' },
      ]);
      await stock(ana.familyId, eggs, 6, 'pcs');
      const id = await plan(ana, TODAY, 3);
      await fill(ana, id, 0, 'dinner', dish);
      await fill(ana, id, 2, 'lunch', dish);

      const read = await readPlan(ana, id);
      expect(read.slots.map((s) => [s.dayIndex, s.status])).toEqual([
        [0, 'covered'],
        [2, 'short'],
      ]);
      expect(read.slots[0].issues).toEqual([]);
      expect(read.slots[1].issues).toEqual([
        {
          ingredientId: eggs,
          name: expect.any(String) as string,
          kind: 'short',
          quantity: 2,
          unit: 'pcs',
          onList: false,
          reason: {
            code: 'onlyLeftAfter',
            amount: 2,
            unit: 'pcs',
            meals: [
              {
                date: TODAY,
                mealtime: 'dinner',
                recipeId: dish,
                recipeTitle: read.slots[0].recipeTitle,
              },
            ],
          },
        },
      ]);
      expect(read.forecast).toEqual({
        tag: { kind: 'short', count: 1 },
        days: [
          { date: TODAY, status: 'covered' },
          { date: at(1), status: 'empty' },
          { date: at(2), status: 'short' },
        ],
      });
    });

    it('turns short into onList once the Ingredient is on the Shopping List', async () => {
      const ana = await member('onlist');
      const dish = await recipe(ana.familyId, [
        { ingredientId: eggs, quantity: 4, unit: 'pcs' },
      ]);
      const id = await plan(ana, TODAY, 1);
      await fill(ana, id, 0, 'dinner', dish);
      expect((await readPlan(ana, id)).slots[0].status).toBe('short');
      await ana.list
        .post('/items?locale=en', { ingredientId: eggs })
        .expect(200);
      const read = await readPlan(ana, id);
      expect(read.slots[0].status).toBe('onList');
      expect(read.slots[0].issues[0].onList).toBe(true);
      expect(read.forecast.tag).toEqual({ kind: 'coveredOnceYouShop' });
    });

    it('does not count a checked Shopping Item as on the list', async () => {
      const ana = await member('checked');
      const dish = await recipe(ana.familyId, [
        { ingredientId: eggs, quantity: 4, unit: 'pcs' },
      ]);
      const id = await plan(ana, TODAY, 1);
      await fill(ana, id, 0, 'dinner', dish);
      const added = await ana.list
        .post('/items?locale=en', { ingredientId: eggs })
        .expect(200);
      const itemId = (added.body as { groups: { items: { id: string }[] }[] })
        .groups[0].items[0].id;
      await ana.list
        .patch(`/items/${itemId}?locale=en`, { checked: true })
        .expect(200);
      expect((await readPlan(ana, id)).slots[0].status).toBe('short');
      await ana.list
        .patch(`/items/${itemId}?locale=en`, { checked: false })
        .expect(200);
      expect((await readPlan(ana, id)).slots[0].status).toBe('onList');
    });

    it('gives past days no status, and forecasts from the client today', async () => {
      const ana = await member('past');
      const dish = await recipe(ana.familyId, [
        { ingredientId: eggs, quantity: 4, unit: 'pcs' },
      ]);
      const id = await plan(ana, TODAY, 2);
      await fill(ana, id, 0, 'dinner', dish);
      await fill(ana, id, 1, 'dinner', dish);
      await stock(ana.familyId, eggs, 4, 'pcs');

      const read = await readPlan(ana, id, at(1));
      expect(read.slots[0]).toMatchObject({ status: null, issues: [] });
      // Yesterday's dinner no longer uses the eggs up.
      expect(read.slots[1].status).toBe('covered');
      expect(read.forecast.days).toEqual([{ date: at(1), status: 'covered' }]);
    });

    it('marks a slot unavailable once its Recipe is archived', async () => {
      const ana = await member('archived');
      const dish = await recipe(ana.familyId, [
        { ingredientId: eggs, quantity: 4, unit: 'pcs' },
      ]);
      const id = await plan(ana, TODAY, 1);
      await fill(ana, id, 0, 'dinner', dish);
      await database
        .update(recipes)
        .set({ archivedAt: new Date() })
        .where(eq(recipes.id, dish));
      const read = await readPlan(ana, id);
      expect(read.slots[0]).toMatchObject({
        status: 'unavailable',
        issues: [],
      });
      expect(read.forecast.tag).toEqual({ kind: 'none' });
    });

    it('carries the forecast on from an earlier plan', async () => {
      const ana = await member('carry');
      const dish = await recipe(ana.familyId, [
        { ingredientId: eggs, quantity: 4, unit: 'pcs' },
      ]);
      await stock(ana.familyId, eggs, 6, 'pcs');
      const first = await plan(ana, TODAY, 1);
      const second = await plan(ana, at(1), 1);
      await fill(ana, first, 0, 'dinner', dish);
      await fill(ana, second, 0, 'dinner', dish);
      expect((await readPlan(ana, second)).slots[0].status).toBe('short');
    });
  });

  describe('the window read', () => {
    it('runs planned days across two consecutive plans, with gap days and the next plan date', async () => {
      const ana = await member('window');
      const dish = await recipe(
        ana.familyId,
        [{ ingredientId: eggs, quantity: 4, unit: 'pcs' }],
        { prep: 15 },
      );
      await stock(ana.familyId, eggs, 6, 'pcs');
      const first = await plan(ana, TODAY, 3);
      const second = await plan(ana, at(3), 2);
      const later = await plan(ana, at(10), 2);
      await fill(ana, first, 0, 'dinner', dish);
      await fill(ana, second, 1, 'breakfast', dish, 8);
      await fill(ana, later, 0, 'dinner', dish);

      const window = await readWindow(ana);
      expect(window.today).toBe(TODAY);
      expect(window.days.map((d) => [d.date, d.status, d.planId])).toEqual([
        [TODAY, 'covered', first],
        [at(1), 'empty', first],
        [at(2), 'empty', first],
        [at(3), 'empty', second],
        [at(4), 'short', second],
      ]);
      const [dinner] = window.days[0].slots;
      expect(dinner).toMatchObject({
        planId: first,
        mealtime: 'dinner',
        minutes: 35,
        servings: 4,
        status: 'covered',
        issues: [],
      });
      expect(dinner.aisle).toEqual({
        id: expect.any(String) as string,
        name: expect.any(String) as string,
        sortOrder: expect.any(Number) as number,
      });
      // 8 servings of a 4-serving Recipe needs 8 eggs; 2 were left.
      expect(window.days[4].slots[0].issues[0]).toMatchObject({
        kind: 'short',
        quantity: 6,
        unit: 'pcs',
      });
      expect(window.tag).toEqual({ kind: 'short', count: 1 });
      expect(window.plan).toMatchObject({ id: first });
      expect(window.nextPlanStart).toBe(at(10));
      expect(window.nextPlanId).toBe(later);
      expect(window.missing).toEqual([
        {
          ingredientId: eggs,
          name: expect.any(String) as string,
          quantity: 6,
          unit: 'pcs',
          recipeIds: [dish],
        },
      ]);
    });

    it('shows the next plan when today is outside every plan, and nothing planned with none', async () => {
      const ana = await member('next');
      const none = await member('none');
      const dish = await recipe(ana.familyId, [
        { ingredientId: milk, quantity: 1, unit: 'l' },
      ]);
      const upcoming = await plan(ana, at(12), 2);
      await fill(ana, upcoming, 0, 'dinner', dish);

      const window = await readWindow(ana);
      expect(window).toMatchObject({
        days: [],
        tag: { kind: 'none' },
        plan: { id: upcoming },
        nextPlanStart: at(12),
        nextPlanId: upcoming,
        missing: [],
      });
      expect(await readWindow(none)).toMatchObject({
        days: [],
        plan: null,
        nextPlanStart: null,
        nextPlanId: null,
      });
    });

    it('takes today from the client, falling back to the UTC date', async () => {
      const ana = await member('today');
      const dish = await recipe(ana.familyId, [
        { ingredientId: eggs, quantity: 4, unit: 'pcs' },
      ]);
      const utc = new Date().toISOString().slice(0, 10);
      const id = await ana.plans
        .post('?locale=en', { startDate: utc, days: 2 })
        .expect(201)
        .then((res) => (res.body as PlanDetail).id);
      await ana.plans
        .put(`/${id}/slots/0/dinner?locale=en`, { recipeId: dish })
        .expect(200);
      await ana.plans
        .put(`/${id}/slots/1/dinner?locale=en`, { recipeId: dish })
        .expect(200);

      const fallback = await readWindow(ana, '?locale=en');
      expect(fallback.today).toBe(utc);
      expect(fallback.days.map((d) => d.date)).toEqual([utc, at(1, utc)]);
      const client = await readWindow(ana, `?locale=en&today=${at(1, utc)}`);
      expect(client.days.map((d) => d.date)).toEqual([at(1, utc)]);
    });

    it('refuses a malformed today', async () => {
      const ana = await member('bad');
      await ana.plans.get('/window?today=tomorrow').expect(400);
    });
  });

  it("never lets another Family's Pantry, list or plans into the forecast", async () => {
    const ana = await member('own');
    const ben = await member('other');
    const dish = await recipe(ana.familyId, [
      { ingredientId: eggs, quantity: 4, unit: 'pcs' },
    ]);
    const benDish = await recipe(ben.familyId, [
      { ingredientId: eggs, quantity: 4, unit: 'pcs' },
    ]);
    await stock(ben.familyId, eggs, 100, 'pcs');
    await ben.list.post('/items?locale=en', { ingredientId: eggs }).expect(200);
    const benPlan = await plan(ben, TODAY, 1);
    await fill(ben, benPlan, 0, 'breakfast', benDish, 40);
    const id = await plan(ana, TODAY, 1);
    await fill(ana, id, 0, 'dinner', dish);

    const read = await readPlan(ana, id);
    expect(read.slots[0]).toMatchObject({ status: 'short' });
    expect(read.slots[0].issues[0]).toMatchObject({
      kind: 'missing',
      onList: false,
      reason: { code: 'notInPantry' },
    });
    const window = await readWindow(ana);
    expect(window.days).toHaveLength(1);
    expect(window.days[0].slots).toHaveLength(1);
    await ana.plans.get(`/${benPlan}${q()}`).expect(404);
  });
});
