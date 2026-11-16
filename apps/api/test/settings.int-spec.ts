import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { seedCatalog, seedId } from '../src/catalog/seed/seed-catalog';
import { DATABASE } from '../src/database/database.constants';
import type { Database } from '../src/database/database.types';
import { leafCategories, user } from '../src/database/schema';
import { createTestApp, TEST_ORIGIN } from './support/create-test-app';

type Batch = { id: string; name: string; expiryDate: string | null };
type FamilySettings = {
  staleThresholdDays: number;
  expiryOverrides: { categoryId: string; days: number }[];
};

const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe('Settings (integration)', () => {
  let app: NestFastifyApplication;
  let database: Database;
  let counter = 0;

  beforeAll(async () => {
    app = await createTestApp();
    database = app.get<Database>(DATABASE);
    await seedCatalog(database);
  });

  afterAll(async () => {
    await app.close();
  });

  async function signUp() {
    const n = ++counter;
    const response = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('origin', TEST_ORIGIN)
      .set('x-forwarded-for', `10.9.${Math.floor(n / 250)}.${n % 250}`)
      .send({
        name: `Settings ${n}`,
        email: `settings-${Date.now()}-${n}@example.com`,
        password: 'correct-horse-staple',
      })
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

  /** Puts `member` into the Family of `owner` (joining is a separate ticket). */
  async function joinFamilyOf(owner: string, member: string) {
    const [{ familyId }] = await database
      .select({ familyId: user.familyId })
      .from(user)
      .where(eq(user.id, owner));
    await database
      .update(user)
      .set({ familyId, familyRole: 'member' })
      .where(eq(user.id, member));
  }

  const call = (
    cookie: string,
    method: 'get' | 'put' | 'patch' | 'delete',
    path: string,
  ) =>
    request(app.getHttpServer())
      [method](`/api/settings${path}`)
      .set('origin', TEST_ORIGIN)
      .set('cookie', cookie);

  const familySettings = async (cookie: string) =>
    (await call(cookie, 'get', '/family').expect(200)).body as FamilySettings;

  const addParmesan = (cookie: string) =>
    request(app.getHttpServer())
      .post('/api/pantry/batches')
      .set('origin', TEST_ORIGIN)
      .set('cookie', cookie)
      .send({ ingredientId: seedId.ingredient('parmesan') });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/settings/family').expect(401);
    await request(app.getHttpServer())
      .get('/api/settings/preferences')
      .expect(401);
  });

  describe('Family Settings', () => {
    it('start with a Stale Threshold of 3 days and no overrides', async () => {
      const { cookie } = await signUp();
      expect(await familySettings(cookie)).toEqual({
        staleThresholdDays: 3,
        expiryOverrides: [],
      });
    });

    it('are shared: a change by one Member is visible to another', async () => {
      const ana = await signUp();
      const mihai = await signUp();
      await joinFamilyOf(ana.userId, mihai.userId);

      await call(ana.cookie, 'patch', '/family')
        .send({ staleThresholdDays: 5 })
        .expect(200);
      await call(
        ana.cookie,
        'put',
        `/family/expiry-overrides/${seedId.leaf('hard-cheese')}`,
      )
        .send({ days: 14 })
        .expect(200);

      const seen = await familySettings(mihai.cookie);
      expect(seen.staleThresholdDays).toBe(5);
      expect(seen.expiryOverrides).toEqual([
        expect.objectContaining({
          categoryId: seedId.leaf('hard-cheese'),
          days: 14,
        }),
      ]);

      // Any Member (not only the Owner) may edit.
      await call(mihai.cookie, 'patch', '/family')
        .send({ staleThresholdDays: 2 })
        .expect(200);
      expect((await familySettings(ana.cookie)).staleThresholdDays).toBe(2);
    });

    it('do not leak to another Family', async () => {
      const ana = await signUp();
      const outsider = await signUp();
      await call(ana.cookie, 'patch', '/family').send({
        staleThresholdDays: 9,
      });
      expect((await familySettings(outsider.cookie)).staleThresholdDays).toBe(
        3,
      );
    });

    it('validates the Stale Threshold and the override target', async () => {
      const { cookie } = await signUp();
      for (const staleThresholdDays of [0, -1, 1.5, 366, 'soon']) {
        await call(cookie, 'patch', '/family')
          .send({ staleThresholdDays })
          .expect(400);
      }
      const category = `/family/expiry-overrides/${seedId.leaf('hard-cheese')}`;
      for (const days of [0, -2, 2.5, 4000]) {
        await call(cookie, 'put', category).send({ days }).expect(400);
      }
      const response = await call(
        cookie,
        'put',
        '/family/expiry-overrides/00000000-0000-4000-8000-000000000000',
      )
        .send({ days: 3 })
        .expect(404);
      expect(response.body).toMatchObject({
        code: 'settings.category_not_found',
      });
    });

    it('replaces an override in place and removes it on delete', async () => {
      const { cookie } = await signUp();
      const category = `/family/expiry-overrides/${seedId.parent('dairy')}`;
      await call(cookie, 'put', category).send({ days: 3 }).expect(200);
      await call(cookie, 'put', category).send({ days: 6 }).expect(200);
      expect((await familySettings(cookie)).expiryOverrides).toEqual([
        expect.objectContaining({
          categoryId: seedId.parent('dairy'),
          days: 6,
        }),
      ]);
      await call(cookie, 'delete', category).expect(200);
      expect((await familySettings(cookie)).expiryOverrides).toEqual([]);
    });

    it('lets an outsider DELETE only their own Family overrides', async () => {
      const { cookie } = await signUp();
      const outsider = await signUp();
      const category = `/family/expiry-overrides/${seedId.parent('dairy')}`;
      await call(cookie, 'put', category).send({ days: 4 }).expect(200);
      await call(outsider.cookie, 'delete', category).expect(200);
      expect((await familySettings(cookie)).expiryOverrides).toEqual([
        expect.objectContaining({
          categoryId: seedId.parent('dairy'),
          days: 4,
        }),
      ]);
    });

    it('lists the Categories an override can target, localised', async () => {
      const { cookie } = await signUp();
      const body = (
        await call(cookie, 'get', '/categories?locale=ro').expect(200)
      ).body as {
        parents: {
          id: string;
          name: string;
          leaves: { id: string; name: string }[];
        }[];
      };
      const dairy = body.parents.find((p) => p.id === seedId.parent('dairy'));
      expect(dairy?.leaves.map((l) => l.id)).toContain(
        seedId.leaf('hard-cheese'),
      );
    });
    it("sends each Category's Catalog Default Expiry, a Leaf without its own falling back to its Parent's", async () => {
      const { cookie } = await signUp();
      const bare = randomUUID();
      await database.insert(leafCategories).values({
        id: bare,
        parentId: seedId.parent('dairy'),
        name: 'Settings test bare leaf',
        normalizedName: `settings test bare leaf ${bare}`,
        defaultExpiryDays: null,
      });
      const body = (
        await call(cookie, 'get', '/categories?locale=en').expect(200)
      ).body as {
        parents: {
          id: string;
          catalogDays: number | null;
          leaves: { id: string; catalogDays: number | null }[];
        }[];
      };
      const dairy = body.parents.find((p) => p.id === seedId.parent('dairy'));
      // Catalog: Dairy lasts 10 days, hard cheese 60.
      expect(dairy?.catalogDays).toBe(10);
      const leafDays = (id: string) =>
        dairy?.leaves.find((l) => l.id === id)?.catalogDays;
      expect(leafDays(seedId.leaf('hard-cheese'))).toBe(60);
      expect(leafDays(bare)).toBe(10);
    });
  });

  describe('Default Expiry override', () => {
    it('takes precedence over the Leaf default when the Pantry form pre-fills expiry', async () => {
      const { cookie } = await signUp();
      // Catalog: hard cheese lasts 60 days.
      expect(
        ((await addParmesan(cookie).expect(201)).body as Batch).expiryDate,
      ).toBe(inDays(60));
      await call(
        cookie,
        'put',
        `/family/expiry-overrides/${seedId.leaf('hard-cheese')}`,
      )
        .send({ days: 14 })
        .expect(200);
      expect(
        ((await addParmesan(cookie).expect(201)).body as Batch).expiryDate,
      ).toBe(inDays(14));
    });

    it('also applies to the Finish Shopping proposal', async () => {
      const { cookie } = await signUp();
      const item = await request(app.getHttpServer())
        .post('/api/shopping-list/items')
        .set('origin', TEST_ORIGIN)
        .set('cookie', cookie)
        .send({ ingredientId: seedId.ingredient('parmesan') })
        .expect(200);
      const itemId = (
        item.body as { groups: { items: { id: string }[] }[] }
      ).groups.flatMap((g) => g.items)[0].id;
      await request(app.getHttpServer())
        .patch(`/api/shopping-list/items/${itemId}`)
        .set('origin', TEST_ORIGIN)
        .set('cookie', cookie)
        .send({ checked: true })
        .expect(200);
      await call(
        cookie,
        'put',
        `/family/expiry-overrides/${seedId.leaf('hard-cheese')}`,
      )
        .send({ days: 14 })
        .expect(200);
      const proposal = await request(app.getHttpServer())
        .get('/api/shopping-list/finish')
        .set('origin', TEST_ORIGIN)
        .set('cookie', cookie)
        .expect(200);
      expect(
        (proposal.body as { lines: { expiryDate: string }[] }).lines[0]
          .expiryDate,
      ).toBe(inDays(14));
    });

    it('takes precedence over the Parent default too, and a Leaf override beats a Parent one', async () => {
      const { cookie } = await signUp();
      await call(
        cookie,
        'put',
        `/family/expiry-overrides/${seedId.parent('dairy')}`,
      )
        .send({ days: 20 })
        .expect(200);
      expect(
        ((await addParmesan(cookie).expect(201)).body as Batch).expiryDate,
      ).toBe(inDays(20));
      await call(
        cookie,
        'put',
        `/family/expiry-overrides/${seedId.leaf('hard-cheese')}`,
      )
        .send({ days: 9 })
        .expect(200);
      expect(
        ((await addParmesan(cookie).expect(201)).body as Batch).expiryDate,
      ).toBe(inDays(9));
    });

    it('also reaches the Catalog search defaults so the form can pre-fill', async () => {
      const { cookie } = await signUp();
      const search = async () =>
        (
          (
            await request(app.getHttpServer())
              .get('/api/catalog/search')
              .query({ q: 'parmesan' })
              .set('origin', TEST_ORIGIN)
              .set('cookie', cookie)
              .expect(200)
          ).body as { results: { defaults: { expiryDays: number | null } }[] }
        ).results[0].defaults.expiryDays;
      expect(await search()).toBe(60);
      await call(
        cookie,
        'put',
        `/family/expiry-overrides/${seedId.leaf('hard-cheese')}`,
      )
        .send({ days: 11 })
        .expect(200);
      expect(await search()).toBe(11);
    });

    it('does not change an explicit expiry and leaves other Families on the Catalog default', async () => {
      const ana = await signUp();
      const outsider = await signUp();
      await call(
        ana.cookie,
        'put',
        `/family/expiry-overrides/${seedId.leaf('hard-cheese')}`,
      )
        .send({ days: 2 })
        .expect(200);
      const explicit = (
        await request(app.getHttpServer())
          .post('/api/pantry/batches')
          .set('origin', TEST_ORIGIN)
          .set('cookie', ana.cookie)
          .send({
            ingredientId: seedId.ingredient('parmesan'),
            expiryDate: '2031-01-01',
          })
          .expect(201)
      ).body as Batch;
      expect(explicit.expiryDate).toBe('2031-01-01');
      expect(
        ((await addParmesan(outsider.cookie).expect(201)).body as Batch)
          .expiryDate,
      ).toBe(inDays(60));
    });
  });

  describe('Stale Threshold and the Pantry', () => {
    it('leaves the Pantry response unchanged when the Stale Threshold changes', async () => {
      const { cookie } = await signUp();
      const add = (expiryDate: string | null) =>
        request(app.getHttpServer())
          .post('/api/pantry/batches')
          .set('origin', TEST_ORIGIN)
          .set('cookie', cookie)
          .send({ ingredientId: seedId.ingredient('milk'), expiryDate })
          .expect(201);
      await add('2031-06-09');
      await add('2031-06-12');
      await add(null);
      const pantry = async () =>
        (
          (
            await request(app.getHttpServer())
              .get('/api/pantry')
              .set('origin', TEST_ORIGIN)
              .set('cookie', cookie)
              .expect(200)
          ).body as { batches: Record<string, unknown>[] }
        ).batches;

      // The client colours expiry tags by the threshold; no Batch carries an Expiring Soon flag.
      const before = await pantry();
      expect(before).toHaveLength(3);
      for (const batch of before)
        expect(batch).not.toHaveProperty('expiringSoon');
      await call(cookie, 'patch', '/family')
        .send({ staleThresholdDays: 7 })
        .expect(200);
      expect(await pantry()).toEqual(before);
    });
  });

  describe('Member Preferences', () => {
    it('have no locale until one is saved', async () => {
      const { cookie } = await signUp();
      expect(
        (await call(cookie, 'get', '/preferences').expect(200)).body,
      ).toEqual({
        locale: null,
        catalogLanguage: null,
        effectiveCatalogLanguage: 'en',
        scanLanguage: null,
        effectiveScanLanguage: 'en',
        spokenLanguage: null,
        effectiveSpokenLanguage: 'en',
        theme: null,
        hideRecipesWithAllergies: false,
        introDone: false,
      });
    });

    it('save the locale on the Member, readable from any device (a new session)', async () => {
      const { cookie, userId } = await signUp();
      await call(cookie, 'put', '/preferences')
        .send({ locale: 'ro' })
        .expect(200);

      const [row] = await database
        .select({ locale: user.locale })
        .from(user)
        .where(eq(user.id, userId));
      expect(row.locale).toBe('ro');

      const second = await request(app.getHttpServer())
        .post('/api/auth/sign-in/email')
        .set('origin', TEST_ORIGIN)
        .set('x-forwarded-for', '10.9.250.1')
        .send({
          email: (
            await database
              .select({ email: user.email })
              .from(user)
              .where(eq(user.id, userId))
          )[0].email,
          password: 'correct-horse-staple',
        })
        .expect(200);
      const otherDevice = [second.headers['set-cookie'] ?? []]
        .flat()
        .map((c) => c.split(';')[0])
        .join('; ');
      expect(
        (await call(otherDevice, 'get', '/preferences').expect(200)).body,
      ).toEqual({
        locale: 'ro',
        catalogLanguage: null,
        effectiveCatalogLanguage: 'ro',
        scanLanguage: null,
        effectiveScanLanguage: 'ro',
        spokenLanguage: null,
        effectiveSpokenLanguage: 'ro',
        theme: null,
        hideRecipesWithAllergies: false,
        introDone: false,
      });
    });

    it('are private to the Member, not shared with the Family', async () => {
      const ana = await signUp();
      const mihai = await signUp();
      await joinFamilyOf(ana.userId, mihai.userId);
      await call(ana.cookie, 'put', '/preferences')
        .send({ locale: 'ro' })
        .expect(200);
      expect(
        (await call(mihai.cookie, 'get', '/preferences').expect(200)).body,
      ).toEqual({
        locale: null,
        catalogLanguage: null,
        effectiveCatalogLanguage: 'en',
        scanLanguage: null,
        effectiveScanLanguage: 'en',
        spokenLanguage: null,
        effectiveSpokenLanguage: 'en',
        theme: null,
        hideRecipesWithAllergies: false,
        introDone: false,
      });
    });

    it('accepts Danish as a locale', async () => {
      const { cookie, userId } = await signUp();
      await call(cookie, 'put', '/preferences')
        .send({ locale: 'da' })
        .expect(200);
      expect(
        (await call(cookie, 'get', '/preferences').expect(200)).body,
      ).toEqual({
        locale: 'da',
        catalogLanguage: null,
        effectiveCatalogLanguage: 'da',
        scanLanguage: null,
        effectiveScanLanguage: 'da',
        spokenLanguage: null,
        effectiveSpokenLanguage: 'da',
        theme: null,
        hideRecipesWithAllergies: false,
        introDone: false,
      });
      const [row] = await database
        .select({ locale: user.locale })
        .from(user)
        .where(eq(user.id, userId));
      expect(row.locale).toBe('da');
    });

    it('saves "Hide Recipes with my Allergies" for the Member only, keeping the other preferences', async () => {
      const ana = await signUp();
      const mihai = await signUp();
      await joinFamilyOf(ana.userId, mihai.userId);
      await call(ana.cookie, 'put', '/preferences')
        .send({ locale: 'ro' })
        .expect(200);
      const saved = await call(ana.cookie, 'put', '/preferences')
        .send({ hideRecipesWithAllergies: true })
        .expect(200);
      expect(saved.body).toEqual({
        locale: 'ro',
        catalogLanguage: null,
        effectiveCatalogLanguage: 'ro',
        scanLanguage: null,
        effectiveScanLanguage: 'ro',
        spokenLanguage: null,
        effectiveSpokenLanguage: 'ro',
        theme: null,
        hideRecipesWithAllergies: true,
        introDone: false,
      });
      expect(
        (await call(mihai.cookie, 'get', '/preferences').expect(200)).body,
      ).toMatchObject({ hideRecipesWithAllergies: false });
      await call(ana.cookie, 'put', '/preferences')
        .send({ hideRecipesWithAllergies: false })
        .expect(200);
      expect(
        (await call(ana.cookie, 'get', '/preferences').expect(200)).body,
      ).toMatchObject({ hideRecipesWithAllergies: false });
    });

    it('rejects an unsupported locale', async () => {
      const { cookie } = await signUp();
      await call(cookie, 'put', '/preferences')
        .send({ locale: 'fr' })
        .expect(400);
    });

    it('reject a save with nothing to update', async () => {
      const { cookie } = await signUp();
      await call(cookie, 'put', '/preferences').send({}).expect(400);
    });

    it('save the Theme on the Member and return the full Member Preferences', async () => {
      const { cookie, userId } = await signUp();
      expect(
        (
          await call(cookie, 'put', '/preferences')
            .send({ theme: 'dark' })
            .expect(200)
        ).body,
      ).toEqual({
        locale: null,
        catalogLanguage: null,
        effectiveCatalogLanguage: 'en',
        scanLanguage: null,
        effectiveScanLanguage: 'en',
        spokenLanguage: null,
        effectiveSpokenLanguage: 'en',
        theme: 'dark',
        hideRecipesWithAllergies: false,
        introDone: false,
      });
      expect(
        (await call(cookie, 'get', '/preferences').expect(200)).body,
      ).toEqual({
        locale: null,
        catalogLanguage: null,
        effectiveCatalogLanguage: 'en',
        scanLanguage: null,
        effectiveScanLanguage: 'en',
        spokenLanguage: null,
        effectiveSpokenLanguage: 'en',
        theme: 'dark',
        hideRecipesWithAllergies: false,
        introDone: false,
      });
      const [row] = await database
        .select({ theme: user.theme })
        .from(user)
        .where(eq(user.id, userId));
      expect(row.theme).toBe('dark');
    });

    it('keep the locale when only the Theme is saved, and the Theme when only the locale is', async () => {
      const { cookie } = await signUp();
      await call(cookie, 'put', '/preferences')
        .send({ locale: 'ro' })
        .expect(200);
      await call(cookie, 'put', '/preferences')
        .send({ theme: 'light' })
        .expect(200);
      expect(
        (await call(cookie, 'get', '/preferences').expect(200)).body,
      ).toEqual({
        locale: 'ro',
        catalogLanguage: null,
        effectiveCatalogLanguage: 'ro',
        scanLanguage: null,
        effectiveScanLanguage: 'ro',
        spokenLanguage: null,
        effectiveSpokenLanguage: 'ro',
        theme: 'light',
        hideRecipesWithAllergies: false,
        introDone: false,
      });

      expect(
        (
          await call(cookie, 'put', '/preferences')
            .send({ locale: 'da' })
            .expect(200)
        ).body,
      ).toEqual({
        locale: 'da',
        catalogLanguage: null,
        effectiveCatalogLanguage: 'da',
        scanLanguage: null,
        effectiveScanLanguage: 'da',
        spokenLanguage: null,
        effectiveSpokenLanguage: 'da',
        theme: 'light',
        hideRecipesWithAllergies: false,
        introDone: false,
      });
    });

    describe('done with the Intro', () => {
      const introDoneAt = async (userId: string) =>
        (
          await database
            .select({ at: user.introDoneAt })
            .from(user)
            .where(eq(user.id, userId))
        )[0].at;

      it('starts not done for a new Member, who still gets a Solo Family', async () => {
        const { cookie, userId } = await signUp();
        expect(
          (
            (await call(cookie, 'get', '/preferences').expect(200)).body as {
              introDone: boolean;
            }
          ).introDone,
        ).toBe(false);
        expect(await introDoneAt(userId)).toBeNull();
        const [row] = await database
          .select({ familyId: user.familyId, familyRole: user.familyRole })
          .from(user)
          .where(eq(user.id, userId));
        expect(row.familyId).toEqual(expect.any(String));
        expect(row.familyRole).toBe('owner');
      });

      it('is set by saving introDone: true, and readable from any device', async () => {
        const { cookie, userId } = await signUp();
        const saved = await call(cookie, 'put', '/preferences')
          .send({ introDone: true })
          .expect(200);
        expect((saved.body as { introDone: boolean }).introDone).toBe(true);
        expect(await introDoneAt(userId)).toBeInstanceOf(Date);
      });

      it('saves the four languages and introDone in one call', async () => {
        const { cookie } = await signUp();
        const saved = await call(cookie, 'put', '/preferences')
          .send({
            locale: 'ro',
            spokenLanguage: 'da',
            scanLanguage: 'en',
            catalogLanguage: 'da',
            introDone: true,
          })
          .expect(200);
        expect(saved.body).toMatchObject({
          locale: 'ro',
          spokenLanguage: 'da',
          scanLanguage: 'en',
          catalogLanguage: 'da',
          introDone: true,
        });
      });

      it('is idempotent: the first timestamp wins', async () => {
        const { cookie, userId } = await signUp();
        await call(cookie, 'put', '/preferences')
          .send({ introDone: true })
          .expect(200);
        const first = new Date('2026-01-01T00:00:00Z');
        await database
          .update(user)
          .set({ introDoneAt: first })
          .where(eq(user.id, userId));
        await call(cookie, 'put', '/preferences')
          .send({ introDone: true })
          .expect(200);
        expect(await introDoneAt(userId)).toEqual(first);
      });

      it('cannot be undone, and other saves leave it alone', async () => {
        const { cookie, userId } = await signUp();
        await call(cookie, 'put', '/preferences')
          .send({ introDone: false })
          .expect(400);
        await call(cookie, 'put', '/preferences')
          .send({ introDone: true })
          .expect(200);
        const first = await introDoneAt(userId);
        await call(cookie, 'put', '/preferences')
          .send({ theme: 'dark' })
          .expect(200);
        expect(await introDoneAt(userId)).toEqual(first);
      });

      it('is private to the Member', async () => {
        const ana = await signUp();
        const mihai = await signUp();
        await call(ana.cookie, 'put', '/preferences')
          .send({ introDone: true })
          .expect(200);
        expect(await introDoneAt(mihai.userId)).toBeNull();
      });
    });

    it('save the locale and the Theme together', async () => {
      const { cookie } = await signUp();
      await call(cookie, 'put', '/preferences')
        .send({ locale: 'en', theme: 'light' })
        .expect(200);
      expect(
        (await call(cookie, 'get', '/preferences').expect(200)).body,
      ).toEqual({
        locale: 'en',
        catalogLanguage: null,
        effectiveCatalogLanguage: 'en',
        scanLanguage: null,
        effectiveScanLanguage: 'en',
        spokenLanguage: null,
        effectiveSpokenLanguage: 'en',
        theme: 'light',
        hideRecipesWithAllergies: false,
        introDone: false,
      });
    });

    it.each(['warm', 'minimal'])(
      'save a sent %s Theme as light',
      async (sent) => {
        const { cookie, userId } = await signUp();
        const response = await call(cookie, 'put', '/preferences')
          .send({ theme: sent })
          .expect(200);
        expect(response.body).toMatchObject({ theme: 'light' });
        const [row] = await database
          .select({ theme: user.theme })
          .from(user)
          .where(eq(user.id, userId));
        expect(row.theme).toBe('light');
      },
    );

    it.each(['warm', 'minimal'])(
      'read a stored %s Theme as light',
      async (stored) => {
        const { cookie, userId } = await signUp();
        await database
          .update(user)
          .set({ theme: stored })
          .where(eq(user.id, userId));
        const response = await call(cookie, 'get', '/preferences').expect(200);
        expect(response.body).toMatchObject({ theme: 'light' });
      },
    );

    it('reject an unknown Theme', async () => {
      const { cookie } = await signUp();
      await call(cookie, 'put', '/preferences')
        .send({ theme: 'neon' })
        .expect(400);
      await call(cookie, 'put', '/preferences')
        .send({ theme: null })
        .expect(400);
    });

    it('read an unknown stored Theme as never chosen', async () => {
      const { cookie, userId } = await signUp();
      await database
        .update(user)
        .set({ theme: 'sage' })
        .where(eq(user.id, userId));
      expect(
        (await call(cookie, 'get', '/preferences').expect(200)).body,
      ).toEqual({
        locale: null,
        catalogLanguage: null,
        effectiveCatalogLanguage: 'en',
        scanLanguage: null,
        effectiveScanLanguage: 'en',
        spokenLanguage: null,
        effectiveSpokenLanguage: 'en',
        theme: null,
        hideRecipesWithAllergies: false,
        introDone: false,
      });
    });
  });
});
