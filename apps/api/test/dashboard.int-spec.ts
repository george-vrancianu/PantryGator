import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DATABASE } from '../src/database/database.constants';
import type { Database } from '../src/database/database.types';
import { dashboardLayouts, user } from '../src/database/schema';
import { createTestApp, TEST_ORIGIN } from './support/create-test-app';

type Widget = { id: string; type: string; size: string };

describe('Dashboard layout (integration)', () => {
  let app: NestFastifyApplication;
  let database: Database;
  let counter = 0;

  beforeAll(async () => {
    app = await createTestApp();
    database = app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await app.close();
  });

  async function signUp(name: string) {
    const email = `dashboard-${Date.now()}-${++counter}@example.com`;
    const response = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('origin', TEST_ORIGIN)
      .set(
        'x-forwarded-for',
        `10.2.${Math.floor(counter / 250)}.${counter % 250}`,
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

  const call = (method: 'get' | 'put', cookie: string) =>
    request(app.getHttpServer())
      [method]('/api/dashboard-layout')
      .set('origin', TEST_ORIGIN)
      .set('cookie', cookie);

  it('requires sign-in', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard-layout')
      .set('origin', TEST_ORIGIN)
      .expect(401);
  });

  it('gives a new Member the default layout', async () => {
    const { cookie } = await signUp('Ana');

    const body = (await call('get', cookie).expect(200)).body as unknown;

    const widgets = (body as { widgets: Widget[] }).widgets;
    expect(widgets.map(({ type, size }) => ({ type, size }))).toEqual([
      { type: 'pantry-stock', size: 'small' },
      { type: 'shopping', size: 'small' },
      { type: 'meal-plan', size: 'wide' },
      { type: 'use-soon', size: 'wide' },
    ]);
    expect(new Set(widgets.map((w) => w.id)).size).toBe(widgets.length);
  });

  it('persists the layout for the Member and returns it unchanged', async () => {
    const { cookie } = await signUp('Bia');
    const layout = [
      { id: 'a', type: 'budget', size: 'small' },
      { id: 'b', type: 'meal-plan', size: 'wide' },
      { id: 'c', type: 'budget', size: 'wide' },
      { id: 'd', type: 'meal-plan', size: 'tall' },
    ];

    await call('put', cookie).send({ widgets: layout }).expect(200);
    const body = (await call('get', cookie).expect(200)).body as unknown;

    expect(body).toEqual({ widgets: layout });
  });

  it('drops a stored Pantry health Widget when the layout is read', async () => {
    const { cookie, userId } = await signUp('Dina');
    await database.insert(dashboardLayouts).values({
      userId,
      widgets: [
        { id: 'h', type: 'health', size: 'wide' },
        { id: 'b', type: 'budget', size: 'small' },
      ],
    });

    const body = (await call('get', cookie).expect(200)).body as unknown;

    expect(body).toEqual({
      widgets: [{ id: 'b', type: 'budget', size: 'small' }],
    });
  });

  it('no longer accepts a Pantry health Widget in a saved layout', async () => {
    const { cookie } = await signUp('Dora');

    await call('put', cookie)
      .send({ widgets: [{ id: 'h', type: 'health', size: 'wide' }] })
      .expect(400);
  });

  it('replaces the previous layout, including an emptied Dashboard', async () => {
    const { cookie } = await signUp('Cris');
    await call('put', cookie)
      .send({ widgets: [{ id: 'a', type: 'shopping', size: 'small' }] })
      .expect(200);
    await call('put', cookie).send({ widgets: [] }).expect(200);

    const body = (await call('get', cookie).expect(200)).body as unknown;

    expect(body).toEqual({ widgets: [] });
  });

  it('keeps each Member layout private, even inside one Family', async () => {
    const owner = await signUp('Owner');
    const other = await signUp('Other');
    const [{ familyId }] = await database
      .select({ familyId: user.familyId })
      .from(user)
      .where(eq(user.id, owner.userId));
    // Redeeming an Invite Code is a later ticket; place the second Member directly.
    await database
      .update(user)
      .set({ familyId, familyRole: 'member' })
      .where(eq(user.id, other.userId));
    await call('put', owner.cookie)
      .send({ widgets: [{ id: 'x', type: 'nutrition', size: 'small' }] })
      .expect(200);

    const body = (await call('get', other.cookie).expect(200)).body as unknown;

    expect((body as { widgets: Widget[] }).widgets).toHaveLength(4);
  });

  it('drops the retired Quick Scan Widget from a saved layout', async () => {
    const { cookie, userId } = await signUp('Eva');
    await database.insert(dashboardLayouts).values({
      userId,
      widgets: [
        { id: 'a', type: 'quick-scan', size: 'wide' },
        { id: 'b', type: 'budget', size: 'small' },
      ],
    });

    const body = (await call('get', cookie).expect(200)).body as unknown;

    expect(body).toEqual({
      widgets: [{ id: 'b', type: 'budget', size: 'small' }],
    });
  });

  it.each([
    ['an unknown type', [{ id: 'a', type: 'weather', size: 'small' }]],
    ['an unknown size', [{ id: 'a', type: 'shopping', size: 'huge' }]],
    [
      'duplicate instance ids',
      [
        { id: 'a', type: 'shopping', size: 'small' },
        { id: 'a', type: 'budget', size: 'small' },
      ],
    ],
  ])('rejects %s', async (_label, widgets) => {
    const { cookie } = await signUp('Dan');

    const body = (await call('put', cookie).send({ widgets }).expect(400))
      .body as unknown;

    expect(body).toMatchObject({ code: expect.any(String) as string });
  });
});
