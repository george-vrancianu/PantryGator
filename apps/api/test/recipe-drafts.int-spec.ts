import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DATABASE } from '../src/database/database.constants';
import type { Database } from '../src/database/database.types';
import {
  ingredients,
  recipeDrafts,
  recipes,
  user,
} from '../src/database/schema';
import { seedId } from '../src/catalog/seed/seed-catalog';
import { client, signUp } from './support/admin-session';
import { MAX_NUTRITION_NOTE } from '../src/recipes/recipe-guidance.schemas';
import { RECIPE_DRAFT_CAP_FACTOR } from '../src/recipe-drafts/recipe-drafts.schemas';
import { createTestApp } from './support/create-test-app';

jest.setTimeout(30_000);

type Client = ReturnType<typeof client>;
const code = (res: { body: unknown }) => (res.body as { code: string }).code;
type Got = {
  version: number;
  expiresAt: string;
  content: { title: string; tagIds?: string[] };
};
type Refused = { params: unknown };
const bodyOf = <T>(res: { body: unknown }) => res.body as T;

describe('Recipe Drafts (integration)', () => {
  let app: NestFastifyApplication;
  let database: Database;
  let a1: Client; // owner of Family A
  let a2: Client; // second Member of Family A
  let b: Client; // Member of Family B
  let a1Id: string;
  let a1Cookie: string;
  let bCookie: string;
  let ingredientId: string;
  const stamp = Date.now();
  let n = 0;
  const label = (what: string) => `${what} ${stamp}-${++n}`;

  const draftsOf = (who: Client) => who.get('');
  const api = (cookie: string, prefix: string) => client(app, cookie, prefix);

  /** A Recipe Draft's content as the form would hold it. */
  const content = (overrides: Record<string, unknown> = {}) => ({
    title: label('Draft'),
    servings: '4',
    prepMinutes: '',
    cookMinutes: '',
    difficulty: '',
    tagIds: [],
    lines: [
      {
        ingredientId,
        name: '',
        quantity: '100',
        unit: 'g',
        optional: false,
        note: '',
      },
    ],
    steps: [{ text: 'Whisk', timer: '', tips: [{ text: 'Slowly' }] }],
    ...overrides,
  });

  const newDraft = (overrides: Record<string, unknown> = {}) => ({
    kind: 'new_recipe',
    content: content(),
    ...overrides,
  });

  async function create(who: Client, overrides: Record<string, unknown> = {}) {
    const res = await who.post('', newDraft(overrides));
    expect([res.status, res.body]).toEqual([201, expect.anything()]);
    return res.body as { id: string; version: number };
  }

  /** A seeded live Catalog Base Recipe, usable as the base of a Variant. */
  async function catalogBase() {
    const [row] = await database
      .select({ id: recipes.id })
      .from(recipes)
      .where(
        and(
          isNull(recipes.familyId),
          isNull(recipes.parentId),
          isNull(recipes.archivedAt),
        ),
      )
      .limit(1);
    return row;
  }

  /** Moves a Recipe Draft's last edit into the past. */
  const ageDraft = (id: string, days: number) =>
    database
      .update(recipeDrafts)
      .set({ updatedAt: sql`now() - make_interval(days => ${days})` })
      .where(eq(recipeDrafts.id, id));

  beforeAll(async () => {
    app = await createTestApp();
    database = app.get<Database>(DATABASE);
    const cookies = {
      a1: await signUp(app, `rd-a1-${stamp}@example.com`, 'A1'),
      a2: await signUp(app, `rd-a2-${stamp}@example.com`, 'A2'),
      b: await signUp(app, `rd-b-${stamp}@example.com`, 'B'),
    };
    const invite = (await api(cookies.a1, '/api/family').get('').expect(200))
      .body as { inviteCode: string };
    await api(cookies.a2, '/api/family')
      .post('/join', { code: invite.inviteCode })
      .expect(201);
    a1Cookie = cookies.a1;
    bCookie = cookies.b;
    a1 = api(cookies.a1, '/api/recipe-drafts');
    a2 = api(cookies.a2, '/api/recipe-drafts');
    b = api(cookies.b, '/api/recipe-drafts');
    const ids = await database
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(sql`${user.email} like ${`rd-%-${stamp}@example.com`}`);
    a1Id = ids.find((r) => r.email.startsWith('rd-a1'))!.id;
    [{ id: ingredientId }] = await database
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(isNull(ingredients.ownerFamilyId))
      .limit(1);
  });

  afterAll(async () => {
    await database
      .delete(recipes)
      .where(sql`${recipes.title} like ${`%${stamp}%`}`);
    await app.close();
  });

  describe('create and get', () => {
    it('creates at version 1 and reads the content back as typed', async () => {
      const typed = content({
        title: '',
        lines: [
          {
            ingredientId: '',
            name: 'flour',
            quantity: '1/2 ab',
            unit: 'g',
            optional: true,
            note: '',
          },
        ],
        steps: [{ text: '', timer: '' }],
      });
      const created = await create(a1, { content: typed });
      expect(created.version).toBe(1);

      const got = await a1.get(`/${created.id}`).expect(200);
      expect(got.body).toMatchObject({
        id: created.id,
        kind: 'new_recipe',
        baseRecipeId: null,
        baseAvailable: false,
        version: 1,
      });
      expect(bodyOf<Got>(got).content).toMatchObject({
        title: '',
        lines: [{ name: 'flour', quantity: '1/2 ab' }],
        steps: [{ text: '' }],
      });
    });
  });

  describe('an Ingredient that is gone', () => {
    const line = (id: string, name: string) => ({
      ingredientId: id,
      name,
      quantity: '',
      unit: 'g',
      optional: false,
      note: '',
    });
    const linesOf = (res: { body: unknown }) =>
      bodyOf<{ content: { lines: unknown[] } }>(res).content.lines;
    const familyIngredient = async (cookie: string, name: string) => {
      const res = await api(cookie, '/api/catalog')
        .post('/family-ingredients', {
          name: label(name),
          leafCategoryId: seedId.leaf('ground-spices'),
          defaultUnit: 'g',
        })
        .expect(201);
      return (res.body as { id: string }).id;
    };

    it('comes back as an Unmatched name, keeping the typed name, once a Family Ingredient is deleted', async () => {
      const mine = await familyIngredient(a1Cookie, 'Kept spice');
      const doomed = await familyIngredient(a1Cookie, 'Doomed spice');
      const created = await create(a1, {
        content: content({
          lines: [line(mine, 'Kept'), line(doomed, 'Gone')],
        }),
      });
      await database.delete(ingredients).where(eq(ingredients.id, doomed));
      const got = await a1.get(`/${created.id}`).expect(200);
      expect(linesOf(got)).toMatchObject([
        { ingredientId: mine, name: 'Kept' },
        { ingredientId: '', name: 'Gone' },
      ]);
      await database.delete(ingredients).where(eq(ingredients.id, mine));
    });

    it("does not show another Family's Ingredient: it comes back as an Unmatched name", async () => {
      const theirs = await familyIngredient(bCookie, 'Their spice');
      const created = await create(a1, {
        content: content({ lines: [line(theirs, 'Spice')] }),
      });
      const got = await a1.get(`/${created.id}`).expect(200);
      expect(linesOf(got)).toMatchObject([{ ingredientId: '', name: 'Spice' }]);
      await database.delete(ingredients).where(eq(ingredients.id, theirs));
    });
  });

  describe('update', () => {
    it('replaces the content and bumps the version on a match', async () => {
      const { id } = await create(a1);
      const next = content({ title: label('Renamed') });
      const res = await a1
        .put(`/${id}`, { version: 1, content: next })
        .expect(200);
      expect(res.body).toEqual({ id, version: 2 });
      const got = await a1.get(`/${id}`).expect(200);
      expect(got.body).toMatchObject({
        version: 2,
        content: { title: next.title },
      });
    });

    it('refuses a stale version with 409 and leaves the content unchanged', async () => {
      const original = content();
      const { id } = await create(a1, { content: original });
      await a1.put(`/${id}`, { version: 1, content: content() }).expect(200);
      const stale = await a1.put(`/${id}`, {
        version: 1,
        content: content({ title: 'from the old tablet' }),
      });
      expect([stale.status, code(stale)]).toEqual([
        409,
        'recipe_drafts.version_conflict',
      ]);
      const got = await a1.get(`/${id}`).expect(200);
      expect(bodyOf<Got>(got).version).toBe(2);
      expect(bodyOf<Got>(got).content.title).not.toBe('from the old tablet');
    });
  });

  describe('list', () => {
    it('returns summaries, newest edit first, with origin and expiry', async () => {
      const lister = api(
        await signUp(app, `rd-list-${stamp}@example.com`, 'Lister'),
        '/api/recipe-drafts',
      );
      const plain = await create(lister, {
        content: content({ title: 'Plain' }),
      });
      const link = await create(lister, {
        content: content({
          title: 'From a link',
          sourceLink: 'https://www.example.org/cake?x=1',
          sourceLanguage: 'ro',
        }),
      });
      const plate = await create(lister, {
        content: content({ title: 'From a plate', plateScan: true }),
      });
      // Editing the oldest one moves it to the top.
      await lister
        .put(`/${plain.id}`, {
          version: 1,
          content: content({ title: 'Plain edited' }),
        })
        .expect(200);

      const list = (await draftsOf(lister).expect(200)).body as Array<{
        id: string;
        title: string;
        origin: unknown;
        kind: string;
        version: number;
        updatedAt: string;
        expiresAt: string;
      }>;
      expect(list.map((d) => d.id)).toEqual([plain.id, plate.id, link.id]);
      expect(list.map((d) => d.origin)).toEqual([
        null,
        { type: 'plate_scan' },
        { type: 'link', domain: 'example.org' },
      ]);
      expect(list[0]).toMatchObject({
        title: 'Plain edited',
        kind: 'new_recipe',
        baseRecipeId: null,
        baseRecipeName: null,
        version: 2,
      });
      const days =
        (Date.parse(list[0].expiresAt) - Date.parse(list[0].updatedAt)) /
        86_400_000;
      expect(days).toBe(30);
    });

    it('names the base of a Variant', async () => {
      const base = await catalogBase();
      const { id } = await create(a1, {
        kind: 'variant',
        baseRecipeId: base.id,
      });
      const list = (await draftsOf(a1).expect(200)).body as Array<{
        id: string;
        baseRecipeId: string;
        baseRecipeName: string;
      }>;
      expect(list.find((d) => d.id === id)).toMatchObject({
        baseRecipeId: base.id,
        baseRecipeName: expect.stringMatching(/./) as string,
      });
      const got = await a1.get(`/${id}`).expect(200);
      expect(got.body).toMatchObject({
        kind: 'variant',
        baseRecipeId: base.id,
        baseAvailable: true,
      });
    });

    it('sets the base to none when the base Recipe is deleted', async () => {
      const bakerCookie = await signUp(
        app,
        `rd-base-${stamp}@example.com`,
        'Baker',
      );
      const bases = api(bakerCookie, '/api/recipes');
      const made = await bases
        .post('', {
          title: label('Own base'),
          servings: 2,
          locale: 'en',
          parentId: null,
          lines: [{ ingredientId, quantity: 50, unit: 'g' }],
          steps: [{ text: 'Whisk' }],
        })
        .expect(201);
      const baker = api(bakerCookie, '/api/recipe-drafts');
      const { id } = await create(baker, {
        kind: 'variant',
        baseRecipeId: (made.body as { id: string }).id,
      });
      await database
        .delete(recipes)
        .where(eq(recipes.id, (made.body as { id: string }).id));
      const got = await baker.get(`/${id}`).expect(200);
      expect(got.body).toMatchObject({
        kind: 'variant',
        baseRecipeId: null,
        baseAvailable: false,
      });
    });
  });

  describe('delete', () => {
    it('discards one Recipe Draft', async () => {
      const { id } = await create(a1);
      await a1.del(`/${id}`).expect(204);
      await a1.get(`/${id}`).expect(404);
      await a1.del(`/${id}`).expect(404);
    });
  });

  describe('privacy', () => {
    it('is 404 on every endpoint for another Member of the Family and of another Family', async () => {
      const mine = await create(a1);
      for (const other of [a2, b]) {
        const checks = [
          await other.get(`/${mine.id}`),
          await other.put(`/${mine.id}`, { version: 1, content: content() }),
          await other.del(`/${mine.id}`),
        ];
        expect(checks.map((r) => [r.status, code(r)])).toEqual(
          checks.map(() => [404, 'recipe_drafts.not_found']),
        );
        const list = (await draftsOf(other).expect(200)).body as Array<{
          id: string;
        }>;
        expect(list.map((d) => d.id)).not.toContain(mine.id);
      }
      // Still intact for its owner.
      const got = await a1.get(`/${mine.id}`).expect(200);
      expect(bodyOf<Got>(got).version).toBe(1);
    });
  });

  describe('cap', () => {
    it('refuses the 21st, and expired ones do not count', async () => {
      const cookie = await signUp(app, `rd-cap-${stamp}@example.com`, 'Capper');
      const capper = api(cookie, '/api/recipe-drafts');
      const ids: string[] = [];
      for (let i = 0; i < 20; i++) ids.push((await create(capper)).id);
      const refused = await capper.post('', newDraft());
      expect([refused.status, code(refused)]).toEqual([
        409,
        'recipe_drafts.limit_reached',
      ]);
      expect(bodyOf<Refused>(refused).params).toEqual({ max: 20 });
      expect((await draftsOf(capper).expect(200)).body).toHaveLength(20);

      await ageDraft(ids[0], 31);
      await create(capper);
      expect((await draftsOf(capper).expect(200)).body).toHaveLength(20);
    });
  });

  describe('expiry', () => {
    it('deletes a 31-day-old Recipe Draft lazily and 404s it', async () => {
      const old = await create(a1);
      const fresh = await create(a1);
      await ageDraft(old.id, 31);
      await a1.get(`/${old.id}`).expect(404);
      const list = (await draftsOf(a1).expect(200)).body as Array<{
        id: string;
      }>;
      expect(list.map((d) => d.id)).toContain(fresh.id);
      expect(list.map((d) => d.id)).not.toContain(old.id);
      const rows = await database
        .select({ id: recipeDrafts.id })
        .from(recipeDrafts)
        .where(eq(recipeDrafts.id, old.id));
      expect(rows).toEqual([]);
    });

    it('does not update an expired one, and keeps one just inside 30 days', async () => {
      const old = await create(a1);
      await ageDraft(old.id, 31);
      await a1
        .put(`/${old.id}`, { version: 1, content: content() })
        .expect(404);
      const inside = await create(a1);
      await ageDraft(inside.id, 29);
      await a1.get(`/${inside.id}`).expect(200);
    });

    it('deletes an expired, not yet purged one with 204, then 404s it', async () => {
      const old = await create(a1);
      await ageDraft(old.id, 31);
      await a1.del(`/${old.id}`).expect(204);
      await a1.del(`/${old.id}`).expect(404);
    });

    it('moves expires at with every edit', async () => {
      const { id } = await create(a1);
      await ageDraft(id, 20);
      await a1.put(`/${id}`, { version: 1, content: content() }).expect(200);
      const got = await a1.get(`/${id}`).expect(200);
      const remaining =
        (Date.parse(bodyOf<Got>(got).expiresAt) - Date.now()) / 86_400_000;
      expect(remaining).toBeGreaterThan(29.9);
    });
  });

  describe('content checks', () => {
    it('allows a nutrition note up to the Recipe Draft cap and refuses more', async () => {
      const cap = MAX_NUTRITION_NOTE * RECIPE_DRAFT_CAP_FACTOR;
      const guidance = (nutritionNote: string) => ({
        nutritionNote,
        pairings: [],
        eatingMoments: [],
      });
      await a1
        .post(
          '',
          newDraft({
            content: content({ guidance: guidance('a'.repeat(cap)) }),
          }),
        )
        .expect(201);
      await a1
        .post(
          '',
          newDraft({
            content: content({ guidance: guidance('a'.repeat(cap + 1)) }),
          }),
        )
        .expect(400);
    });

    it('accepts half-typed values', async () => {
      await create(a1, {
        content: content({
          title: '',
          servings: 'two-ish',
          prepMinutes: '1e',
          lines: [
            {
              ingredientId: '',
              name: '',
              quantity: '1/2 ab',
              unit: 'g',
              optional: false,
              note: '',
            },
          ],
          steps: [{ text: '', timer: '3,' }],
        }),
      });
    });

    it('accepts text longer than the Recipe allows, only the counts are held to the Recipe', async () => {
      const { id } = await create(a1, {
        content: content({ title: 'T'.repeat(201) }),
      });
      const got = await a1.get(`/${id}`).expect(200);
      expect(bodyOf<Got>(got).content.title).toHaveLength(201);
      await a1
        .put(`/${id}`, {
          version: 1,
          content: content({ title: 'U'.repeat(1500) }),
        })
        .expect(200);
      const absurd = await a1.post(
        '',
        newDraft({ content: content({ title: 'T'.repeat(5000) }) }),
      );
      expect(absurd.status).toBe(400);
    });

    it('round-trips the suggested markers of Guidance', async () => {
      const guidance = {
        nutritionNote: 'Light',
        nutritionNoteSuggested: true,
        pairings: [
          {
            kind: 'food',
            label: 'Salad',
            reason: '',
            principle: '',
            linkType: 'none',
            linkTarget: '',
            suggested: true,
          },
        ],
        eatingMoments: [
          {
            eatingMomentId: '',
            polarity: 'good',
            reason: '',
            suggested: false,
          },
        ],
      };
      const { id } = await create(a1, { content: content({ guidance }) });
      const got = await a1.get(`/${id}`).expect(200);
      expect(got.body).toMatchObject({ content: { guidance } });
    });

    it('keeps the picked Tags through create, autosave and resume (#709)', async () => {
      const tagIds = [
        'a1b2c3d4-0000-4000-8000-000000000001',
        'some-family-tag',
      ];
      const { id } = await create(a1, { content: content({ tagIds }) });
      expect(
        ((await a1.get(`/${id}`).expect(200)).body as Got).content.tagIds,
      ).toEqual(tagIds);
      const next = [...tagIds].reverse().slice(0, 1);
      await a1
        .put(`/${id}`, { version: 1, content: content({ tagIds: next }) })
        .expect(200);
      expect(
        ((await a1.get(`/${id}`).expect(200)).body as Got).content.tagIds,
      ).toEqual(next);
    });

    it('gives a draft sent without Tags an empty list, and refuses more than 10', async () => {
      const { tagIds: omitted, ...withoutTags } = content({ tagIds: [] });
      void omitted;
      const { id } = await create(a1, { content: withoutTags });
      expect(
        ((await a1.get(`/${id}`).expect(200)).body as Got).content.tagIds,
      ).toEqual([]);
      const res = await a1.post(
        '',
        newDraft({
          content: content({
            tagIds: Array.from({ length: 11 }, (_, i) => `t${i}`),
          }),
        }),
      );
      expect(res.status).toBe(400);
    });

    it('refuses content over the Recipe limits and of the wrong shape', async () => {
      const line = {
        ingredientId: '',
        name: 'x',
        quantity: '',
        unit: 'g',
        optional: false,
        note: '',
      };
      const tooMany = [
        content({ lines: Array.from({ length: 101 }, () => line) }),
        content({
          steps: Array.from({ length: 101 }, () => ({ text: 'a', timer: '' })),
        }),
        content({
          steps: Array.from({ length: 5 }, () => ({
            text: 'a',
            timer: '',
            tips: Array.from({ length: 41 }, () => ({ text: 't' })),
          })),
        }),
        { ...content(), surprise: true },
        content({ title: undefined }),
      ];
      for (const bad of tooMany) {
        const res = await a1.post('', newDraft({ content: bad }));
        expect(res.status).toBe(400);
      }
      const { id } = await create(a1);
      const res = await a1.put(`/${id}`, {
        version: 1,
        content: content({ lines: Array.from({ length: 101 }, () => line) }),
      });
      expect(res.status).toBe(400);
    });

    it('refuses a New Recipe with a base and a base the Family cannot see', async () => {
      const base = await catalogBase();
      const withBase = await a1.post('', newDraft({ baseRecipeId: base.id }));
      expect(withBase.status).toBe(400);
      const unknown = await a1.post(
        '',
        newDraft({ kind: 'variant', baseRecipeId: randomUUID() }),
      );
      expect(unknown.status).toBe(404);
    });

    it("refuses a Variant whose base is another Family's Recipe", async () => {
      const made = await api(a1Cookie, '/api/recipes')
        .post('', {
          title: label('A-only base'),
          servings: 2,
          locale: 'en',
          parentId: null,
          lines: [{ ingredientId, quantity: 50, unit: 'g' }],
          steps: [{ text: 'Whisk' }],
        })
        .expect(201);
      const res = await b.post(
        '',
        newDraft({
          kind: 'variant',
          baseRecipeId: (made.body as { id: string }).id,
        }),
      );
      expect([res.status, code(res)]).toEqual([
        404,
        'recipes.parent_not_found',
      ]);
    });
  });

  describe('leaving a Family', () => {
    async function joiner(name: string) {
      const email = `rd-${name}-${stamp}@example.com`;
      const cookie = await signUp(app, email, name);
      const invite = (await api(a1Cookie, '/api/family').get('').expect(200))
        .body as { inviteCode: string };
      await api(cookie, '/api/family')
        .post('/join', { code: invite.inviteCode })
        .expect(201);
      const [row] = await database
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email));
      return { cookie, id: row.id, drafts: api(cookie, '/api/recipe-drafts') };
    }
    const countOf = async (memberId: string) =>
      (
        await database
          .select({ id: recipeDrafts.id })
          .from(recipeDrafts)
          .where(eq(recipeDrafts.memberId, memberId))
      ).length;

    it("deletes the Member's Recipe Drafts when they leave, and keeps the others", async () => {
      const leaver = await joiner('leaver');
      await create(leaver.drafts);
      await create(leaver.drafts);
      await create(a1);
      await api(leaver.cookie, '/api/family').post('/leave').expect(200);
      expect(await countOf(leaver.id)).toBe(0);
      expect(await countOf(a1Id)).toBeGreaterThan(0);
    });

    it("deletes the Member's Recipe Drafts when the Owner removes them", async () => {
      const removed = await joiner('removed');
      await create(removed.drafts);
      await api(a1Cookie, '/api/family')
        .del(`/members/${removed.id}`)
        .expect(200);
      expect(await countOf(removed.id)).toBe(0);
    });
  });

  describe('deleting the Family', () => {
    it("deletes every Member's Recipe Drafts", async () => {
      const ownerEmail = `rd-fowner-${stamp}@example.com`;
      const ownerCookie = await signUp(app, ownerEmail, 'FOwner');
      const memberEmail = `rd-fmember-${stamp}@example.com`;
      const memberCookie = await signUp(app, memberEmail, 'FMember');
      const invite = (await api(ownerCookie, '/api/family').get('').expect(200))
        .body as { inviteCode: string };
      await api(memberCookie, '/api/family')
        .post('/join', { code: invite.inviteCode })
        .expect(201);
      const owner = api(ownerCookie, '/api/recipe-drafts');
      const member = api(memberCookie, '/api/recipe-drafts');
      const kept = [await create(owner), await create(member)];
      await api(ownerCookie, '/api/family').del('').expect(200);
      const left = await database
        .select({ id: recipeDrafts.id })
        .from(recipeDrafts)
        .where(
          inArray(
            recipeDrafts.id,
            kept.map((d) => d.id),
          ),
        );
      expect(left).toEqual([]);
    });
  });

  describe('saving a Family Recipe', () => {
    const doc = (overrides: Record<string, unknown> = {}) => ({
      title: label('Saved'),
      servings: 2,
      locale: 'en',
      parentId: null,
      lines: [{ ingredientId, quantity: 50, unit: 'g' }],
      steps: [{ text: 'Whisk' }],
      ...overrides,
    });
    const exists = async (id: string) =>
      (
        await database
          .select({ id: recipeDrafts.id })
          .from(recipeDrafts)
          .where(eq(recipeDrafts.id, id))
      ).length === 1;
    let recipesApi: Client;
    beforeAll(() => {
      recipesApi = api(a1Cookie, '/api/recipes');
    });

    it('creates a Base Recipe and ends its Recipe Draft', async () => {
      const draft = await create(a1);
      const res = await recipesApi.post('', doc({ recipeDraftId: draft.id }));
      expect(res.status).toBe(201);
      expect(await exists(draft.id)).toBe(false);
    });

    it('refuses a recipeDraftId longer than 64 characters', async () => {
      const res = await recipesApi.post(
        '',
        doc({ recipeDraftId: 'x'.repeat(65) }),
      );
      expect(res.status).toBe(400);
      expect(code(res)).toBe('validation_failed');
    });

    it('creates a Variant and ends its Recipe Draft', async () => {
      const base = await catalogBase();
      const draft = await create(a1, {
        kind: 'variant',
        baseRecipeId: base.id,
      });
      const res = await recipesApi.post(
        '',
        doc({ parentId: base.id, recipeDraftId: draft.id }),
      );
      expect(res.status).toBe(201);
      expect(await exists(draft.id)).toBe(false);
    });

    it('keeps the Recipe Draft when the create fails', async () => {
      const draft = await create(a1);
      const invalid = await recipesApi.post(
        '',
        doc({
          recipeDraftId: draft.id,
          lines: [{ ingredientId: null, rawName: null }],
        }),
      );
      expect(invalid.status).toBe(400);
      const unmatchedBase = await recipesApi.post(
        '',
        doc({ recipeDraftId: draft.id, parentId: randomUUID() }),
      );
      expect(unmatchedBase.status).toBe(404);
      expect(await exists(draft.id)).toBe(true);
    });

    it('ignores a malformed id', async () => {
      const res = await recipesApi.post(
        '',
        doc({ recipeDraftId: 'not-a-uuid' }),
      );
      expect(res.status).toBe(201);
    });

    it("ignores an unknown id and leaves another Member's Recipe Draft alone", async () => {
      const foreign = await create(b);
      const res = await recipesApi.post('', doc({ recipeDraftId: foreign.id }));
      expect(res.status).toBe(201);
      expect(await exists(foreign.id)).toBe(true);
      const unknown = await recipesApi.post(
        '',
        doc({ recipeDraftId: randomUUID() }),
      );
      expect(unknown.status).toBe(201);
      const sameFamily = await create(a2);
      await recipesApi
        .post('', doc({ recipeDraftId: sameFamily.id }))
        .expect(201);
      expect(await exists(sameFamily.id)).toBe(true);
    });
  });
});
