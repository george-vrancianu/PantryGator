import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, count, eq, ne } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import request from 'supertest';
import type { Database } from '../src/database/database.types';
import * as schema from '../src/database/schema';
import {
  batches,
  family,
  mealPlans,
  mealPlanSlots,
  recipes,
  shoppingItems,
  user,
} from '../src/database/schema';
import { DEMO_BATCHES, DEMO_SHOPPING } from '../src/demo/demo-plan';
import {
  DemoSeedRefusedError,
  seedDemoAccount,
} from '../src/demo/seed-demo-account';
import { createTestApp, TEST_ORIGIN } from './support/create-test-app';

const TODAY = '2026-11-11';
const PASSWORD = 'demo-password-for-tests';

describe('demo:seed (integration)', () => {
  let app: NestFastifyApplication;
  let pool: pg.Pool;
  let db: Database;

  beforeAll(async () => {
    app = await createTestApp();
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema });
  });
  afterAll(async () => {
    await pool.end();
    await app.close();
  });

  const newEmail = () => `demo-${randomUUID()}@example.com`;
  const seed = (email: string, apply = true) =>
    seedDemoAccount(db, { email, password: PASSWORD, today: TODAY, apply });

  async function signIn(email: string, password = PASSWORD) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('origin', TEST_ORIGIN)
      .send({ email, password });
    const cookie = [res.headers['set-cookie'] ?? []]
      .flat()
      .map((c) => c.split(';')[0])
      .join('; ');
    return { status: res.status, cookie };
  }
  const get = (cookie: string, path: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('origin', TEST_ORIGIN)
      .set('cookie', cookie);

  const usersWith = (email: string) =>
    db.select().from(user).where(eq(user.email, email));
  const rowsOf = async (familyId: string) => ({
    batches: (
      await db
        .select({ n: count() })
        .from(batches)
        .where(eq(batches.familyId, familyId))
    )[0].n,
    familyRecipes: (
      await db
        .select({ n: count() })
        .from(recipes)
        .where(eq(recipes.familyId, familyId))
    )[0].n,
    slots: (
      await db
        .select({ n: count() })
        .from(mealPlanSlots)
        .innerJoin(mealPlans, eq(mealPlans.id, mealPlanSlots.mealPlanId))
        .where(eq(mealPlans.familyId, familyId))
    )[0].n,
  });
  /** Row counts outside one Family, to show the seed touches nothing else. */
  const elsewhere = async (familyId: string) => ({
    families: (
      await db
        .select({ n: count() })
        .from(family)
        .where(ne(family.id, familyId))
    )[0].n,
    batches: (
      await db
        .select({ n: count() })
        .from(batches)
        .where(ne(batches.familyId, familyId))
    )[0].n,
    shoppingItems: (await db.select({ n: count() }).from(shoppingItems))[0].n,
  });

  it('a dry run writes nothing', async () => {
    const email = newEmail();
    const report = await seed(email, false);
    expect(report.applied).toBe(false);
    expect(report.counts.planSlots).toBe(21);
    expect(await usersWith(email)).toHaveLength(0);
    expect(
      await db.select().from(family).where(eq(family.id, report.familyId)),
    ).toHaveLength(0);
  });

  it('seeds a Member who can sign in, past the Intro, with 1000 Credits, a full Pantry, list and week', async () => {
    const email = newEmail();
    const report = await seed(email);
    expect(report).toMatchObject({ applied: true, replacedExisting: false });

    const [member] = await usersWith(email);
    expect(member).toMatchObject({
      name: 'Demo Gator',
      familyRole: 'owner',
      role: 'regular',
    });
    expect(member.introDoneAt).not.toBeNull();

    const { status, cookie } = await signIn(email);
    expect(status).toBe(200);
    const credits = await get(cookie, '/api/credits').expect(200);
    expect((credits.body as { balance: number }).balance).toBe(1000);
    const plans = await get(cookie, '/api/meal-plans').expect(200);
    expect((plans.body as { mealPlans: unknown[] }).mealPlans).toHaveLength(1);
    const list = await get(cookie, '/api/shopping-list').expect(200);
    expect(JSON.stringify(list.body)).toContain('Birthday candles');
    await get(cookie, '/api/pantry').expect(200);

    expect(await rowsOf(report.familyId)).toEqual({
      batches: DEMO_BATCHES.length,
      // 8 Bases, 1 Variant, 1 Add to Family copy.
      familyRecipes: 10,
      slots: 21,
    });
    const [listed] = await db
      .select({ n: count() })
      .from(shoppingItems)
      .innerJoin(
        schema.shoppingLists,
        eq(schema.shoppingLists.id, shoppingItems.listId),
      )
      .where(eq(schema.shoppingLists.familyId, report.familyId));
    expect(listed.n).toBe(DEMO_SHOPPING.length);
    const [plan] = await db
      .select()
      .from(mealPlans)
      .where(eq(mealPlans.familyId, report.familyId));
    expect(plan).toMatchObject({ startDate: TODAY, days: 7 });
  });

  it('a re-run rebuilds the Demo Family from scratch and touches nothing else', async () => {
    const email = newEmail();
    const first = await seed(email);
    const before = await elsewhere(first.familyId);
    const { cookie } = await signIn(email);

    const second = await seed(email);
    expect(second.replacedExisting).toBe(true);
    expect(second.familyId).not.toBe(first.familyId);
    expect(await usersWith(email)).toHaveLength(1);
    expect(
      await db.select().from(family).where(eq(family.id, first.familyId)),
    ).toHaveLength(0);
    // Shopping Items count every list: the new Demo list replaced the old one item for item.
    expect(await elsewhere(second.familyId)).toEqual(before);
    await get(cookie, '/api/credits').expect(401);

    const again = await signIn(email);
    const credits = await get(again.cookie, '/api/credits').expect(200);
    expect((credits.body as { balance: number }).balance).toBe(1000);
    expect((await rowsOf(second.familyId)).slots).toBe(21);
  });

  it('refuses an email that belongs to a real Member and leaves them untouched', async () => {
    const email = newEmail();
    await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('origin', TEST_ORIGIN)
      .send({ name: 'Real Member', email, password: 'a-real-password' })
      .expect(200);

    await expect(seed(email)).rejects.toThrow(DemoSeedRefusedError);
    const [member] = await usersWith(email);
    expect(member.name).toBe('Real Member');
    expect((await signIn(email, 'a-real-password')).status).toBe(200);
  });

  it('refuses when someone else has joined the Demo Family', async () => {
    const email = newEmail();
    const report = await seed(email);
    await db.insert(user).values({
      id: randomUUID(),
      name: 'Joined Member',
      email: newEmail(),
      familyId: report.familyId,
      familyRole: 'member',
    });

    await expect(seed(email)).rejects.toThrow(/joined the Demo Family/);
    const [still] = await db
      .select()
      .from(user)
      .where(and(eq(user.email, email), eq(user.familyId, report.familyId)));
    expect(still).toBeDefined();
  });

  it.each([
    [{ email: 'not-an-email' }, /not an email/],
    [{ password: 'short' }, /at least 8/],
    [{ today: '11/11/2026' }, /YYYY-MM-DD/],
  ])('refuses bad input %j', async (over, message) => {
    await expect(
      seedDemoAccount(db, {
        email: newEmail(),
        password: PASSWORD,
        today: TODAY,
        apply: true,
        ...over,
      }),
    ).rejects.toThrow(message);
  });
});
