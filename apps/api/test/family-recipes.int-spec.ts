import { jest } from '@jest/globals';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq, ilike, inArray, isNull } from 'drizzle-orm';
import pg from 'pg';
import { DATABASE } from '../src/database/database.constants';
import type { Database } from '../src/database/database.types';
import {
  batches,
  catalogTranslations,
  eatingMoments,
  family,
  ingredients,
  recipeIngredientLines,
  recipes,
  unmatchedEntries,
  user,
} from '../src/database/schema';
import type {
  AdminRecipeDetail,
  FamilyRecipeDraft,
  FamilyRecipeEdit,
  RecipeDetail,
  RecipeFilters,
  RecipeListItem,
} from '../src/recipes/recipes.schemas';
import { client, signUp } from './support/admin-session';
import { createTestApp } from './support/create-test-app';
import { storeUiLanguage } from './support/stored-language';
import { promoteToAdmin } from './support/promote-to-admin';
import { waitForBlockedBackend } from './support/wait-for-blocked-backend';

const code = (res: { body: unknown }) => (res.body as { code: string }).code;

jest.setTimeout(30_000);

describe('Family Recipes (integration)', () => {
  let app: NestFastifyApplication;
  let database: Database;
  let pool: pg.Pool;
  let admin: ReturnType<typeof client>;
  let adminRecipes: ReturnType<typeof client>;
  let a1: ReturnType<typeof client>;
  let a2: ReturnType<typeof client>;
  let b: ReturnType<typeof client>;
  let adminCookie: string;
  let cookieOf: Record<string, string>;
  let familyA: string;
  let momentId: string;
  let ing: string[];
  const stamp = Date.now();
  let n = 0;
  const title = (label: string) => `${label} ${stamp}-${++n}`;

  const line = (i: number, quantity = 100) => ({
    ingredientId: ing[i],
    quantity,
    unit: 'g',
  });

  async function catalogBase(overrides: Record<string, unknown> = {}) {
    const res = await admin.post('', {
      title: title('Cat base'),
      servings: 4,
      lines: [line(0), line(1)],
      steps: [{ text: 'Mix' }, { text: 'Bake' }],
      ...overrides,
    });
    expect(res.status).toBe(201);
    return res.body as AdminRecipeDetail;
  }

  const doc = (parentId: string | null, overrides = {}) => ({
    title: title('Fam'),
    servings: 2,
    locale: 'en',
    parentId,
    lines: [line(0, 50)],
    steps: [{ text: 'Whisk' }],
    ...overrides,
  });

  async function familyRecipe(
    who: ReturnType<typeof client>,
    parentId: string | null,
    overrides = {},
  ) {
    const res = await who.post('', doc(parentId, overrides));
    expect([res.status, res.body]).toEqual([201, expect.anything()]);
    return res.body as FamilyRecipeEdit;
  }

  const unmatchedFor = (lineId: string) =>
    database
      .select()
      .from(unmatchedEntries)
      .where(eq(unmatchedEntries.ingredientLineId, lineId));

  beforeAll(async () => {
    app = await createTestApp();
    database = app.get<Database>(DATABASE);
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const adminEmail = `fam-recipes-admin-${stamp}@example.com`;
    adminCookie = await signUp(app, adminEmail, 'Admin');
    await promoteToAdmin(database, adminEmail);
    admin = client(app, adminCookie, '/api/admin/recipes');
    adminRecipes = client(app, adminCookie, '/api/recipes');
    const emails = {
      a1: `fam-recipes-a1-${stamp}@example.com`,
      a2: `fam-recipes-a2-${stamp}@example.com`,
      b: `fam-recipes-b-${stamp}@example.com`,
    };
    cookieOf = {
      a1: await signUp(app, emails.a1, 'A1'),
      a2: await signUp(app, emails.a2, 'A2'),
      b: await signUp(app, emails.b, 'B'),
    };
    a1 = client(app, cookieOf.a1, '/api/recipes');
    a2 = client(app, cookieOf.a2, '/api/recipes');
    b = client(app, cookieOf.b, '/api/recipes');
    // a2 joins a1's Family.
    const invite = (
      await client(app, cookieOf.a1, '/api/family').get('').expect(200)
    ).body as { inviteCode: string };
    await client(app, cookieOf.a2, '/api/family')
      .post('/join', { code: invite.inviteCode })
      .expect(201);
    const [row] = await database
      .select({ familyId: user.familyId })
      .from(user)
      .where(eq(user.email, emails.a1));
    familyA = row.familyId;
    momentId = crypto.randomUUID();
    await database.insert(eatingMoments).values({
      id: momentId,
      name: `Moment ${stamp}`,
      normalizedName: `moment ${stamp}`,
      sortOrder: 1000,
    });
    ing = (
      await database
        .select({ id: ingredients.id })
        .from(ingredients)
        .where(isNull(ingredients.ownerFamilyId))
        .limit(5)
    ).map((r) => r.id);
  });

  afterAll(async () => {
    const like = `%${stamp}%`;
    const all = await database
      .select({ id: recipes.id, parentId: recipes.parentId })
      .from(recipes)
      .where(ilike(recipes.title, like));
    for (const row of all.filter((r) => r.parentId)) {
      await database.delete(recipes).where(eq(recipes.id, row.id));
    }
    await database.delete(recipes).where(ilike(recipes.title, like));
    await database.delete(eatingMoments).where(ilike(eatingMoments.name, like));
    // Resolving an Unmatched name adds a Synonym to a seeded Ingredient; remove it so the worker's shared database stays as seeded.
    await database
      .delete(catalogTranslations)
      .where(
        and(
          eq(catalogTranslations.kind, 'synonym'),
          ilike(catalogTranslations.value, like),
        ),
      );
    await pool.end();
    await app.close();
  });

  describe('variant draft', () => {
    it('copies a Catalog base as a draft without ids, under that base', async () => {
      const base = await catalogBase({
        prepMinutes: 5,
        difficulty: 'easy',
        lines: [line(0), { note: 'diced', optional: true, ...line(1, 2) }],
        steps: [{ text: 'Mix', timerSeconds: 30 }, { text: 'Bake' }],
      });
      await admin
        .post(`/${base.id}/tips`, {
          text: 'Base tip',
          stepId: base.steps[0].id,
        })
        .expect(201);
      const draft = (await a1.get(`/${base.id}/variant-draft`).expect(200))
        .body as FamilyRecipeDraft;
      expect(draft).toMatchObject({
        parentId: base.id,
        title: base.title,
        servings: 4,
        prepMinutes: 5,
        difficulty: 'easy',
        steps: [
          { text: 'Mix', timerSeconds: 30 },
          { text: 'Bake', timerSeconds: null },
        ],
      });
      expect(draft.lines[1]).toMatchObject({
        ingredientId: ing[1],
        rawName: null,
        quantity: 2,
        optional: true,
        note: 'diced',
      });
      expect(draft.lines[1].ingredientName).toBeTruthy();
      expect(JSON.stringify(draft)).not.toContain(base.steps[0].id);
      expect(draft.tips).toEqual([{ stepIndex: 0, text: 'Base tip' }]);
    });

    it('carries the source step Tips, anchored to draft steps by index', async () => {
      const base = await catalogBase({
        steps: [{ text: 'Mix' }, { text: 'Bake' }],
      });
      await admin.post(`/${base.id}/tips`, { text: 'Recipe tip' }).expect(201);
      for (const [text, step] of [
        ['Second tip', 1],
        ['First tip', 0],
        ['Another on bake', 1],
      ] as const) {
        await admin
          .post(`/${base.id}/tips`, { text, stepId: base.steps[step].id })
          .expect(201);
      }
      const draft = (await a1.get(`/${base.id}/variant-draft`).expect(200))
        .body as FamilyRecipeDraft;
      expect(draft.tips).toEqual([
        { stepIndex: 1, text: 'Second tip' },
        { stepIndex: 0, text: 'First tip' },
        { stepIndex: 1, text: 'Another on bake' },
      ]);

      // From a Family Variant: its own step Tips, not the base's.
      const fv = await familyRecipe(a1, base.id, {
        steps: [{ text: 'Only' }],
        tips: [{ stepIndex: 0, text: 'Mine' }],
      });
      const fromVariant = (await a1.get(`/${fv.id}/variant-draft`).expect(200))
        .body as FamilyRecipeDraft;
      expect(fromVariant.tips).toEqual([{ stepIndex: 0, text: 'Mine' }]);
    });

    it('creates step Tips re-anchored to the new Steps, in order', async () => {
      const base = await catalogBase();
      const created = await familyRecipe(a1, base.id, {
        steps: [{ text: 'One' }, { text: 'Two' }],
        tips: [
          { stepIndex: 1, text: 'On two' },
          { stepIndex: 0, text: 'On one' },
        ],
      });
      expect(created.tips.map((t) => [t.text, t.stepId])).toEqual([
        ['On two', created.steps[1].id],
        ['On one', created.steps[0].id],
      ]);
    });

    it('creates a Recipe-level Tip (stepIndex null) on the Recipe, not on a Step', async () => {
      const base = await catalogBase();
      const created = await familyRecipe(a1, base.id, {
        steps: [{ text: 'One' }],
        tips: [
          { stepIndex: null, text: 'About the dish' },
          { stepIndex: 0, text: 'On one' },
        ],
      });
      expect(created.tips.map((t) => [t.text, t.stepId])).toEqual([
        ['About the dish', null],
        ['On one', created.steps[0].id],
      ]);
    });

    it('refuses a Tip whose step is not in the document', async () => {
      const res = await a1.post(
        '',
        doc(null, {
          steps: [{ text: 'One' }],
          tips: [{ stepIndex: 1, text: 'Nowhere' }],
        }),
      );
      expect(res.status).toBe(400);
      expect(code(res)).toBe('recipes.bad_step_anchor');
      for (const tip of [
        { stepIndex: 0, text: '' },
        { stepIndex: -1, text: 'Before the steps' },
      ]) {
        const invalid = await a1.post('', doc(null, { tips: [tip] }));
        expect(invalid.status).toBe(400);
        expect(code(invalid)).toBe('validation_failed');
      }
    });

    it('from a Variant copies the Variant content but points at its base', async () => {
      const base = await catalogBase();
      const cv = (
        await admin.post(`/${base.id}/variants`, { title: title('Cat var') })
      ).body as AdminRecipeDetail;
      await admin
        .put(`/${cv.id}`, {
          title: cv.title,
          servings: 7,
          lines: [line(2, 9)],
          steps: [{ text: 'Variant step' }],
        })
        .expect(200);
      const draft = (await a1.get(`/${cv.id}/variant-draft`).expect(200))
        .body as FamilyRecipeDraft;
      expect(draft).toMatchObject({
        parentId: base.id,
        servings: 7,
        steps: [{ text: 'Variant step' }],
      });
      expect(draft.lines).toHaveLength(1);
      expect(draft.lines[0].ingredientId).toBe(ing[2]);
    });

    it("is hidden for another Family's Recipe and unknown ids", async () => {
      const mine = await familyRecipe(a1, null);
      await b.get(`/${mine.id}/variant-draft`).expect(404);
      expect(code(await b.get(`/${mine.id}/variant-draft`).expect(404))).toBe(
        'recipes.not_found',
      );
      await b.get(`/${crypto.randomUUID()}/variant-draft`).expect(404);
    });
  });

  describe('edit view', () => {
    it('names the owner of each line Ingredient, null on an Unmatched line', async () => {
      const [{ leafCategoryId }] = await database
        .select({ leafCategoryId: ingredients.leafCategoryId })
        .from(ingredients)
        .where(eq(ingredients.id, ing[0]));
      const mine = (
        await client(app, cookieOf.a1, '/api/catalog')
          .post('/family-ingredients?locale=en', {
            name: title('Own spice'),
            leafCategoryId,
            defaultUnit: 'g',
          })
          .expect(201)
      ).body as { id: string };
      const recipe = await familyRecipe(a1, null, {
        lines: [
          line(0),
          { ingredientId: mine.id, quantity: 5, unit: 'g' },
          { rawName: 'Moon dust', quantity: null, unit: null },
        ],
      });
      const view = (await a1.get(`/${recipe.id}/edit`).expect(200))
        .body as FamilyRecipeEdit;
      expect(view.lines.map((l) => l.ingredientOwner)).toEqual([
        'catalog',
        'family',
        null,
      ]);
      expect(recipe.lines.map((l) => l.ingredientOwner)).toEqual([
        'catalog',
        'family',
        null,
      ]);
    });

    it("gives a Variant its base's title in the stored language, null on a Base Recipe", async () => {
      const base = await catalogBase();
      await admin
        .put(`/${base.id}/translations/ro`, { title: title('Baza') })
        .expect(200);
      const translated = (await admin.get(`/${base.id}`).expect(200))
        .body as AdminRecipeDetail;
      const roTitle = translated.translations.ro.title;
      const fv = await familyRecipe(a1, base.id);
      expect(fv.parentTitle).toBe(base.title);
      await storeUiLanguage(app, cookieOf.a1, 'ro');
      const ro = (await a1.get(`/${fv.id}/edit`).expect(200))
        .body as FamilyRecipeEdit;
      await storeUiLanguage(app, cookieOf.a1, 'en');
      expect(ro.parentTitle).toBe(roTitle);
      const standalone = await familyRecipe(a1, null);
      expect(standalone.parentTitle).toBeNull();
    });
  });

  describe('create, edit and archive', () => {
    it('lets any Member of the Family create, edit and archive a Variant', async () => {
      const base = await catalogBase();
      const created = await familyRecipe(a1, base.id, {
        tagIds: [],
        lines: [line(0, 50), { rawName: `Zq grandma spice ${stamp}` }],
      });
      expect(created).toMatchObject({
        parentId: base.id,
        archived: false,
        servings: 2,
      });
      expect(created.lines[1]).toMatchObject({
        ingredientId: null,
        rawName: `Zq grandma spice ${stamp}`,
        ingredientName: `Zq grandma spice ${stamp}`,
      });

      const edit = (await a2.get(`/${created.id}/edit`).expect(200))
        .body as FamilyRecipeEdit;
      expect(edit.id).toBe(created.id);
      expect(edit.lines[0].ingredientName).toBeTruthy();

      const updated = (
        await a2
          .put(`/${created.id}`, {
            title: `${created.title} v2`,
            servings: 3,
            locale: 'en',
            lines: [
              {
                id: edit.lines[0].id,
                ingredientId: edit.lines[0].ingredientId,
                quantity: 75,
                unit: 'g',
              },
              { id: edit.lines[1].id, rawName: `Zq grandma spice ${stamp}` },
              line(1),
            ],
            steps: [{ id: edit.steps[0].id, text: 'Whisk hard' }],
          })
          .expect(200)
      ).body as FamilyRecipeEdit;
      expect(updated.title).toBe(`${created.title} v2`);
      expect(updated.lines.map((l) => l.id).slice(0, 2)).toEqual([
        edit.lines[0].id,
        edit.lines[1].id,
      ]);
      expect(updated.lines[0].quantity).toBe(75);
      expect(updated.lines).toHaveLength(3);
      expect(updated.steps[0]).toMatchObject({
        id: edit.steps[0].id,
        text: 'Whisk hard',
      });

      const archived = (await a1.post(`/${created.id}/archive`).expect(200))
        .body as FamilyRecipeEdit;
      expect(archived.archived).toBe(true);
      // Archived, never removed.
      const [row] = await database
        .select()
        .from(recipes)
        .where(eq(recipes.id, created.id));
      expect(row.archivedAt).not.toBeNull();
    });

    it('creates a standalone Family Base Recipe', async () => {
      const created = await familyRecipe(a1, null);
      expect(created.parentId).toBeNull();
      const res = (await a1.get(`/${created.id}`).expect(200))
        .body as RecipeDetail;
      expect(res).toMatchObject({ owner: 'family', parentId: null });
    });

    it('refuses a Variant of a Variant, and parents the Family cannot use', async () => {
      const base = await catalogBase();
      const fv = await familyRecipe(a1, base.id);
      const res = await a1.post('', doc(fv.id)).expect(409);
      expect(code(res)).toBe('recipes.variant_of_variant');
      const cv = (
        await admin.post(`/${base.id}/variants`, { title: title('Cat var') })
      ).body as AdminRecipeDetail;
      expect(code(await a1.post('', doc(cv.id)).expect(409))).toBe(
        'recipes.variant_of_variant',
      );
      const otherBase = await familyRecipe(b, null);
      expect(code(await a1.post('', doc(otherBase.id)).expect(404))).toBe(
        'recipes.parent_not_found',
      );
      await a1.post('', doc(crypto.randomUUID())).expect(404);
    });

    it('validates lines: ingredient xor raw name, quantity with unit', async () => {
      const bad = async (lines: object[], expected: string) =>
        expect(code(await a1.post('', doc(null, { lines })).expect(400))).toBe(
          expected,
        );
      await bad([{}], 'recipes.ingredient_required');
      await bad(
        [{ ingredientId: ing[0], rawName: 'x' }],
        'recipes.line_name_conflict',
      );
      await bad(
        [{ rawName: 'salt', quantity: 1 }],
        'recipes.quantity_unit_mismatch',
      );
      await bad([{ rawName: '!!!' }], 'recipes.ingredient_required');
    });

    it('keeps Family Variants readable and editable after the Catalog base is archived', async () => {
      const base = await catalogBase();
      const fv = await familyRecipe(a1, base.id);
      await admin.post(`/${base.id}/archive`, {}).expect(200);
      const read = (await a1.get(`/${fv.id}`).expect(200)).body as RecipeDetail;
      expect(read.base).toMatchObject({ id: base.id, archived: true });
      await a1
        .put(`/${fv.id}`, {
          title: `${fv.title} edited`,
          servings: 2,
          locale: 'en',
          lines: [],
          steps: [],
        })
        .expect(200);
      expect(code(await a1.post('', doc(base.id)).expect(409))).toBe(
        'recipes.parent_archived',
      );
    });
  });

  describe('visibility', () => {
    it('shows a Family Variant under its base and in filtered lists to its Family only', async () => {
      const base = await catalogBase();
      const fv = await familyRecipe(a1, base.id);

      const detail = (await a2.get(`/${base.id}`).expect(200))
        .body as RecipeDetail;
      expect(detail.variants).toEqual([
        expect.objectContaining({ id: fv.id, owner: 'family' }),
      ]);
      const search = async (who: typeof a1) =>
        (
          (await who.get(`?search=${encodeURIComponent(fv.title)}`).expect(200))
            .body as { recipes: RecipeListItem[] }
        ).recipes;
      expect(await search(a2)).toEqual([
        expect.objectContaining({ id: fv.id, owner: 'family' }),
      ]);
      expect(await search(b)).toEqual([]);
      const otherDetail = (await b.get(`/${base.id}`).expect(200))
        .body as RecipeDetail;
      expect(otherDetail.variants).toEqual([]);
    });

    it('is invisible to another Family for read, edit, update, archive and tips', async () => {
      const base = await catalogBase();
      const fv = await familyRecipe(a1, base.id);
      await b.get(`/${fv.id}`).expect(404);
      await b.get(`/${fv.id}/edit`).expect(404);
      await b
        .put(`/${fv.id}`, {
          title: 'x',
          servings: 1,
          locale: 'en',
          lines: [],
          steps: [],
        })
        .expect(404);
      await b.post(`/${fv.id}/archive`).expect(404);
      await b.post(`/${fv.id}/tips`, { text: 'x' }).expect(404);
      await b.put(`/${fv.id}/hidden-tips`, { tipIds: [] }).expect(404);
    });

    it('cannot edit Catalog Recipes through the Member endpoints', async () => {
      const base = await catalogBase();
      await a1.get(`/${base.id}/edit`).expect(404);
      await a1
        .put(`/${base.id}`, {
          title: 'x',
          servings: 1,
          locale: 'en',
          lines: [],
          steps: [],
        })
        .expect(404);
      await a1.post(`/${base.id}/archive`).expect(404);
      await a1.post(`/${base.id}/tips`, { text: 'x' }).expect(404);
    });

    it('is invisible to the Admin endpoints, even for an Admin of that Family', async () => {
      const base = await catalogBase();
      const fv = await familyRecipe(adminRecipes, base.id);
      const listed = (await admin.get('').expect(200)).body as { id: string }[];
      expect(listed.map((r) => r.id)).not.toContain(fv.id);
      await admin.get(`/${fv.id}`).expect(404);
      await admin
        .put(`/${fv.id}`, { title: 'x', servings: 1, lines: [], steps: [] })
        .expect(404);
      await admin.post(`/${fv.id}/archive`, {}).expect(404);
      await admin.post(`/${fv.id}/variants`, { title: 'x' }).expect(404);
      await admin.post(`/${fv.id}/tips`, { text: 'x' }).expect(404);
      await admin.put(`/${fv.id}/hidden-tips`, { tipIds: [] }).expect(404);
      await admin.put(`/${fv.id}/translations/ro`, { title: 'x' }).expect(404);
    });
  });

  describe('Tips', () => {
    it('takes the Family lock before the Recipe lock on a Tip write', async () => {
      const base = await catalogBase();
      const fv = await familyRecipe(a1, base.id);

      // Holds the Family row like deleteFamily does.
      const holder = await pool.connect();
      let response: Promise<unknown> | undefined;
      try {
        await holder.query('BEGIN');
        const { rows } = await holder.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid',
        );
        await holder.query('SELECT id FROM family WHERE id = $1 FOR UPDATE', [
          familyA,
        ]);
        response = a1.post(`/${fv.id}/tips`, { text: 'Locked' }).then((r) => r);
        await waitForBlockedBackend(pool, rows[0].pid);
        // Had the Tip write taken the Recipe lock first, deleteFamily's
        // cascade would now wait on it while the write waits on the Family.
        const { rows: held } = await holder.query(
          'SELECT 1 FROM recipes WHERE id = $1 FOR NO KEY UPDATE NOWAIT',
          [fv.id],
        );
        expect(held).toHaveLength(1);
      } finally {
        await holder.query('ROLLBACK').catch(() => undefined);
        holder.release();
      }
      expect(((await response) as { status: number }).status).toBe(201);
    });

    it('manages Family Tips and hides inherited base Tips', async () => {
      const base = await catalogBase();
      const baseTip = (
        await admin.post(`/${base.id}/tips`, { text: 'Base-wide tip' })
      ).body as AdminRecipeDetail;
      const fv = await familyRecipe(a1, base.id);

      let view = (
        await a2.post(`/${fv.id}/tips`, { text: 'Own one' }).expect(201)
      ).body as FamilyRecipeEdit;
      view = (
        await a2
          .post(`/${fv.id}/tips`, {
            text: 'Step tip',
            stepId: view.steps[0].id,
          })
          .expect(201)
      ).body as FamilyRecipeEdit;
      expect(view.tips.map((t) => t.text)).toEqual(['Own one', 'Step tip']);
      expect(view.parentTips).toEqual([
        expect.objectContaining({ id: baseTip.tips[0].id, hidden: false }),
      ]);

      view = (
        await a1
          .put(`/${fv.id}/tips/order`, {
            ids: [view.tips[1].id, view.tips[0].id],
          })
          .expect(200)
      ).body as FamilyRecipeEdit;
      expect(view.tips.map((t) => t.text)).toEqual(['Step tip', 'Own one']);
      view = (
        await a1
          .patch(`/${fv.id}/tips/${view.tips[1].id}`, { text: 'Renamed' })
          .expect(200)
      ).body as FamilyRecipeEdit;
      expect(view.tips[1].text).toBe('Renamed');

      await a1
        .put(`/${fv.id}/hidden-tips`, { tipIds: [baseTip.tips[0].id] })
        .expect(200);
      const read = (await a1.get(`/${fv.id}`).expect(200)).body as RecipeDetail;
      expect(read.tips.map((t) => t.text)).not.toContain('Base-wide tip');
      // The base is untouched.
      const baseRead = (await a1.get(`/${base.id}`).expect(200))
        .body as RecipeDetail;
      expect(baseRead.tips.map((t) => t.text)).toContain('Base-wide tip');

      await a2.del(`/${fv.id}/tips/${view.tips[0].id}`).expect(204);
      await b.del(`/${fv.id}/tips/${view.tips[1].id}`).expect(404);
    });
  });

  describe('Unmatched names', () => {
    afterEach(() => storeUiLanguage(app, cookieOf.a1, 'en'));

    it('queues raw lines, replaces the entry on rename and drops it when matched or deleted', async () => {
      const raw = `Zq rare herb ${stamp}`;
      // A signed-in request's `?locale=` is ignored: the stored Catalog Language tags the entry.
      await storeUiLanguage(app, cookieOf.a1, 'ro');
      const created = await familyRecipe(a1, null, {
        lines: [{ rawName: raw, quantity: 1, unit: 'pcs' }, line(0)],
      });
      const first = await unmatchedFor(created.lines[0].id);
      expect(first).toHaveLength(1);
      expect(first[0]).toMatchObject({
        source: 'recipe',
        rawName: raw,
        locale: 'ro',
      });
      expect(await unmatchedFor(created.lines[1].id)).toHaveLength(0);

      const put = async (lines: object[]) =>
        (
          await a1
            .put(`/${created.id}`, {
              title: created.title,
              servings: 2,
              lines,
              steps: [],
            })
            .expect(200)
        ).body as FamilyRecipeEdit;

      // Unchanged name keeps its entry.
      await put([{ id: created.lines[0].id, rawName: raw }]);
      expect((await unmatchedFor(created.lines[0].id))[0].id).toBe(first[0].id);

      // Renamed: replaced.
      const renamed = `${raw} fresh`;
      await put([{ id: created.lines[0].id, rawName: renamed }]);
      const second = await unmatchedFor(created.lines[0].id);
      expect(second).toHaveLength(1);
      expect(second[0]).toMatchObject({ rawName: renamed });
      expect(second[0].id).not.toBe(first[0].id);

      // Now matched: gone.
      await put([{ id: created.lines[0].id, ingredientId: ing[3] }]);
      expect(await unmatchedFor(created.lines[0].id)).toHaveLength(0);

      // Raw again, then deleted: gone.
      const again = await put([{ rawName: `${raw} again` }]);
      expect(await unmatchedFor(again.lines[0].id)).toHaveLength(1);
      await put([]);
      expect(await unmatchedFor(again.lines[0].id)).toHaveLength(0);
    });

    it('is relinked by the Admin queue, keeping quantity and unit', async () => {
      const raw = `Zq relink me ${stamp}`;
      const created = await familyRecipe(a1, null, {
        lines: [{ rawName: raw, quantity: 3, unit: 'pcs' }],
      });
      const { normalizedName } = (
        await database
          .select()
          .from(recipeIngredientLines)
          .where(eq(recipeIngredientLines.id, created.lines[0].id))
      )[0];
      const res = await client(app, adminCookie, '/api/admin/unmatched').post(
        '/resolve',
        { normalizedName, ingredientId: ing[4] },
      );
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ relinkedRecipeLines: 1 });
      const view = (await a1.get(`/${created.id}/edit`).expect(200))
        .body as FamilyRecipeEdit;
      expect(view.lines[0]).toMatchObject({
        ingredientId: ing[4],
        rawName: null,
        quantity: 3,
        unit: 'pcs',
      });
      expect(await unmatchedFor(created.lines[0].id)).toHaveLength(0);
    });
  });

  describe('review rules', () => {
    it('only takes Catalog bases as parents and drafts', async () => {
      const base = await catalogBase();
      const standalone = await familyRecipe(a1, null);
      expect(code(await a1.post('', doc(standalone.id)).expect(404))).toBe(
        'recipes.parent_not_found',
      );
      expect(
        code(await a1.get(`/${standalone.id}/variant-draft`).expect(404)),
      ).toBe('recipes.parent_not_found');
      const fv = await familyRecipe(a1, base.id);
      const draft = (await a1.get(`/${fv.id}/variant-draft`).expect(200))
        .body as FamilyRecipeDraft;
      expect(draft.parentId).toBe(base.id);
    });

    it('refuses a draft under an archived base', async () => {
      const base = await catalogBase();
      const fv = await familyRecipe(a1, base.id);
      await admin.post(`/${base.id}/archive`, {}).expect(200);
      for (const id of [base.id, fv.id]) {
        expect(code(await a1.get(`/${id}/variant-draft`).expect(409))).toBe(
          'recipes.parent_archived',
        );
      }
    });

    it('keeps the first archive time', async () => {
      const created = await familyRecipe(a1, null);
      const first = (await a1.post(`/${created.id}/archive`).expect(200))
        .body as FamilyRecipeEdit;
      const second = (await a2.post(`/${created.id}/archive`).expect(200))
        .body as FamilyRecipeEdit;
      expect(second.archivedAt).toBe(first.archivedAt);
    });

    it('does not need the locale in Family bodies: the stored Catalog Language is used', async () => {
      const { locale, ...noLocale } = doc(null);
      // Marks the destructured locale as intentionally unused (omitted from the body).
      void locale;
      await a1.post('', noLocale).expect(201);
    });

    it('refuses bad hidden Tips and foreign Tips with coded errors', async () => {
      const base = await catalogBase();
      const baseStepTip = (
        await admin.post(`/${base.id}/tips`, {
          text: 'Step',
          stepId: base.steps[0].id,
        })
      ).body as AdminRecipeDetail;
      const fv = await familyRecipe(a1, base.id);
      const own = (await a1.post(`/${fv.id}/tips`, { text: 'Own' }).expect(201))
        .body as FamilyRecipeEdit;
      const sibling = await familyRecipe(a1, base.id);
      const siblingTip = (
        await a1.post(`/${sibling.id}/tips`, { text: 'Other' }).expect(201)
      ).body as FamilyRecipeEdit;

      for (const tipId of [
        baseStepTip.tips[0].id,
        own.tips[0].id,
        siblingTip.tips[0].id,
      ]) {
        expect(
          code(
            await a1
              .put(`/${fv.id}/hidden-tips`, { tipIds: [tipId] })
              .expect(400),
          ),
        ).toBe('recipes.bad_hidden_tip');
      }
      expect(
        code(
          await a1
            .patch(`/${fv.id}/tips/${siblingTip.tips[0].id}`, { text: 'x' })
            .expect(404),
        ),
      ).toBe('recipes.tip_not_found');
      await a1.del(`/${fv.id}/tips/${siblingTip.tips[0].id}`).expect(404);
      expect(
        code(
          await a1
            .put(`/${fv.id}/tips/order`, {
              ids: [own.tips[0].id, siblingTip.tips[0].id],
            })
            .expect(409),
        ),
      ).toBe('recipes.tip_order_stale');
    });
  });

  describe('Pantry matching', () => {
    it('matches a Family line saved by name against the Family Pantry only', async () => {
      const raw = `Zq pantry sumac ${stamp}`;
      const created = await familyRecipe(a1, null, {
        lines: [{ rawName: raw, quantity: 1, unit: 'pcs' }, line(0)],
      });
      const [{ leaf }] = await database
        .select({ leaf: ingredients.leafCategoryId })
        .from(ingredients)
        .where(eq(ingredients.id, ing[0]));
      await database.insert(batches).values({
        familyId: familyA,
        ingredientId: null,
        unmatched: true,
        rawName: ` ${raw.toUpperCase()} `,
        leafCategoryId: leaf,
        location: 'fridge',
        quantity: 2,
        unit: 'pcs',
      });
      const matchFor = async (who: typeof a1) =>
        who.get(`/${created.id}/pantry-match?today=2026-10-12`);
      const mine = await matchFor(a2);
      expect(mine.status).toBe(200);
      const lines = (
        mine.body as { lines: { lineId: string; status: string }[] }
      ).lines;
      expect(lines.find((l) => l.lineId === created.lines[0].id)?.status).toBe(
        'covered',
      );
      expect((await matchFor(b)).status).toBe(404);
      await b
        .post(`/${created.id}/add-missing?locale=en`, { today: '2026-10-12' })
        .expect(404);
    });
  });

  describe('guidance', () => {
    const guidance = (extra: object[] = []) => ({
      nutritionNote: 'Rich in protein; go easy on salt.',
      pairings: [
        {
          kind: 'drink',
          label: 'Dry white',
          reason: 'Acid cuts the fat',
          principle: 'acid_cuts_fat',
        },
        ...extra,
      ],
      eatingMoments: [
        { eatingMomentId: momentId, polarity: 'good_for', reason: 'Brunch' },
      ],
    });

    it('writes and reads Family guidance through its own endpoint', async () => {
      const created = await familyRecipe(a1, null);
      const view = (
        await a2
          .put(`/${created.id}/guidance?locale=en`, guidance())
          .expect(200)
      ).body as FamilyRecipeEdit;
      expect(view).toMatchObject({
        nutritionNote: 'Rich in protein; go easy on salt.',
        pairings: [{ label: 'Dry white', kind: 'drink' }],
        eatingMoments: [{ eatingMomentId: momentId, polarity: 'good_for' }],
      });
      const read = (await a1.get(`/${created.id}`).expect(200))
        .body as RecipeDetail;
      expect(read.guidance.nutritionNote).toBe(view.nutritionNote);
      expect(read.guidance.eatingMoments[0]).toMatchObject({
        reason: 'Brunch',
      });
      // A PUT of the document leaves the guidance alone.
      await a1
        .put(`/${created.id}`, {
          title: created.title,
          servings: 2,
          locale: 'en',
          lines: [],
          steps: [],
        })
        .expect(200);
      expect(
        (
          (await a1.get(`/${created.id}/edit`).expect(200))
            .body as FamilyRecipeEdit
        ).pairings,
      ).toHaveLength(1);
    });

    it("links Catalog Recipes and own Recipes, never another Family's", async () => {
      const base = await catalogBase();
      const mine = await familyRecipe(a1, null);
      const theirs = await familyRecipe(b, null);
      const target = await familyRecipe(a1, null);
      const link = (linkedRecipeId: string) =>
        a1.put(`/${target.id}/guidance`, {
          nutritionNote: null,
          eatingMoments: [],
          pairings: [
            {
              kind: 'food',
              label: 'Side',
              reason: 'Goes well',
              linkedRecipeId,
            },
          ],
        });
      await link(base.id).expect(200);
      await link(mine.id).expect(200);
      // another Family's Recipe answers exactly like an id that does not exist
      const refused = await link(theirs.id).expect(404);
      const unknown = await link(crypto.randomUUID()).expect(404);
      expect(code(refused)).toBe('recipes.pairing_link_not_found');
      expect(refused.body).toEqual(unknown.body);
    });

    it('copies guidance into the draft and saves it with the Variant', async () => {
      const base = await catalogBase();
      await admin
        .put(`/${base.id}/guidance`, {
          nutritionNote: 'Base note',
          pairings: [
            {
              kind: 'food',
              label: 'Salad',
              reason: 'Fresh',
              linkedIngredientId: ing[1],
            },
          ],
          eatingMoments: [
            { eatingMomentId: momentId, polarity: 'avoid', reason: null },
          ],
        })
        .expect(200);
      const draft = (await a1.get(`/${base.id}/variant-draft`).expect(200))
        .body as FamilyRecipeDraft;
      expect(draft.guidance).toEqual({
        nutritionNote: 'Base note',
        pairings: [
          {
            kind: 'food',
            label: 'Salad',
            reason: 'Fresh',
            principle: null,
            linkedIngredientId: ing[1],
            linkedRecipeId: null,
          },
        ],
        eatingMoments: [
          { eatingMomentId: momentId, polarity: 'avoid', reason: null },
        ],
      });
      const { guidance: draftGuidance, ...rest } = draft;
      const saved = (
        await a1
          .post('', {
            ...rest,
            guidance: draftGuidance,
            locale: 'en',
            lines: [],
            steps: [],
          })
          .expect(201)
      ).body as FamilyRecipeEdit;
      expect(saved.nutritionNote).toBe('Base note');
      expect(saved.pairings).toHaveLength(1);
      expect(saved.eatingMoments).toHaveLength(1);
    });

    it('is invisible to other Families and to the Admin endpoint', async () => {
      const created = await familyRecipe(a1, null);
      const body = { nutritionNote: null, pairings: [], eatingMoments: [] };
      await b.put(`/${created.id}/guidance`, body).expect(404);
      await admin.put(`/${created.id}/guidance`, body).expect(404);
      const base = await catalogBase();
      await a1.put(`/${base.id}/guidance`, body).expect(404);
    });
  });

  describe('guidance extras', () => {
    const emptyDoc = { lines: [], steps: [], locale: 'en' };

    it('offers live Eating Moments to Members, in sort order', async () => {
      const archivedId = crypto.randomUUID();
      await database.insert(eatingMoments).values({
        id: archivedId,
        name: `Gone ${stamp}`,
        normalizedName: `gone ${stamp}`,
        sortOrder: 1001,
        archivedAt: new Date(),
      });
      const filters = (await a1.get('/filters').expect(200))
        .body as RecipeFilters;
      const ids = filters.eatingMoments.map((m) => m.id);
      expect(ids).toContain(momentId);
      expect(ids).not.toContain(archivedId);
      expect(filters.eatingMoments.find((m) => m.id === momentId)?.name).toBe(
        `Moment ${stamp}`,
      );
      await database
        .delete(eatingMoments)
        .where(eq(eatingMoments.id, archivedId));
    });

    it('names the links of Pairings in the edit view, null when archived', async () => {
      const target = await familyRecipe(a1, null);
      const linked = await familyRecipe(a1, null);
      const view = (
        await a1
          .put(`/${target.id}/guidance?locale=en`, {
            nutritionNote: null,
            eatingMoments: [],
            pairings: [
              {
                kind: 'food',
                label: 'A',
                reason: 'r',
                linkedIngredientId: ing[0],
              },
              {
                kind: 'food',
                label: 'B',
                reason: 'r',
                linkedRecipeId: linked.id,
              },
              { kind: 'food', label: 'C', reason: 'r' },
            ],
          })
          .expect(200)
      ).body as FamilyRecipeEdit;
      expect(view.pairings[0].linkedIngredientName).toBeTruthy();
      expect(view.pairings[1]).toMatchObject({
        linkedRecipeTitle: linked.title,
      });
      expect(view.pairings[2]).toMatchObject({
        linkedIngredientName: null,
        linkedRecipeTitle: null,
      });
      await a1.post(`/${linked.id}/archive`).expect(200);
      const after = (await a1.get(`/${target.id}/edit`).expect(200))
        .body as FamilyRecipeEdit;
      expect(after.pairings[1]).toMatchObject({
        linkedRecipeId: linked.id,
        linkedRecipeTitle: null,
      });
    });

    it('drops archived links and Eating Moments from the draft, keeping labels', async () => {
      const base = await catalogBase();
      const linked = await catalogBase();
      const archivedMoment = crypto.randomUUID();
      await database.insert(eatingMoments).values({
        id: archivedMoment,
        name: `Old ${stamp}`,
        normalizedName: `old ${stamp}`,
        sortOrder: 1002,
      });
      await admin
        .put(`/${base.id}/guidance`, {
          nutritionNote: null,
          pairings: [
            {
              kind: 'food',
              label: 'Side',
              reason: 'r',
              linkedRecipeId: linked.id,
            },
          ],
          eatingMoments: [
            { eatingMomentId: momentId, polarity: 'good_for', reason: null },
            { eatingMomentId: archivedMoment, polarity: 'avoid', reason: null },
          ],
        })
        .expect(200);
      await admin.post(`/${linked.id}/archive`, {}).expect(200);
      await database
        .update(eatingMoments)
        .set({ archivedAt: new Date() })
        .where(eq(eatingMoments.id, archivedMoment));
      const draft = (await a1.get(`/${base.id}/variant-draft`).expect(200))
        .body as FamilyRecipeDraft;
      expect(draft.guidance.pairings).toMatchObject([
        { label: 'Side', linkedRecipeId: null, linkedIngredientId: null },
      ]);
      expect(draft.guidance.eatingMoments.map((m) => m.eatingMomentId)).toEqual(
        [momentId],
      );
    });

    it('resolves draft guidance in the requested locale', async () => {
      const base = await catalogBase();
      const withGuidance = (
        await admin
          .put(`/${base.id}/guidance`, {
            nutritionNote: 'Note',
            pairings: [{ kind: 'drink', label: 'Wine', reason: 'Nice' }],
            eatingMoments: [],
          })
          .expect(200)
      ).body as AdminRecipeDetail;
      await admin
        .put(`/${base.id}/translations/ro`, {
          nutritionNote: 'Notă',
          pairings: {
            [withGuidance.pairings[0].id]: { label: 'Vin', reason: 'Frumos' },
          },
        })
        .expect(200);
      await storeUiLanguage(app, cookieOf.a1, 'ro');
      const draft = (await a1.get(`/${base.id}/variant-draft`).expect(200))
        .body as FamilyRecipeDraft;
      await storeUiLanguage(app, cookieOf.a1, 'en');
      expect(draft.guidance.nutritionNote).toBe('Notă');
      expect(draft.guidance.pairings[0]).toMatchObject({
        label: 'Vin',
        reason: 'Frumos',
      });
    });

    it("refuses to create with guidance linking another Family's Recipe", async () => {
      const theirs = await familyRecipe(b, null);
      const res = await a1
        .post('', {
          ...doc(null),
          ...emptyDoc,
          guidance: {
            nutritionNote: null,
            eatingMoments: [],
            pairings: [
              {
                kind: 'food',
                label: 'X',
                reason: 'r',
                linkedRecipeId: theirs.id,
              },
            ],
          },
        })
        .expect(404);
      expect(code(res)).toBe('recipes.pairing_link_not_found');
      const unknown = await a1
        .post('', {
          ...doc(null),
          ...emptyDoc,
          guidance: {
            nutritionNote: null,
            eatingMoments: [],
            pairings: [
              {
                kind: 'food',
                label: 'X',
                reason: 'r',
                linkedRecipeId: crypto.randomUUID(),
              },
            ],
          },
        })
        .expect(404);
      expect(res.body).toEqual(unknown.body);
    });
  });

  describe('Cook Tonight', () => {
    it("offers a Family's own Variant and standalone Recipe to that Family only", async () => {
      const [{ leaf }] = await database
        .select({ leaf: ingredients.leafCategoryId })
        .from(ingredients)
        .where(eq(ingredients.id, ing[0]));
      const base = await catalogBase({ lines: [line(1)] });
      const variant = await familyRecipe(a1, base.id, {
        lines: [{ ingredientId: ing[0] }],
      });
      const alone = await familyRecipe(a1, null, {
        lines: [{ ingredientId: ing[0] }],
      });
      const [batch] = await database
        .insert(batches)
        .values({
          familyId: familyA,
          ingredientId: ing[0],
          unmatched: false,
          leafCategoryId: leaf,
          location: 'fridge',
        })
        .returning({ id: batches.id });
      try {
        const cards = async (who: typeof a1) =>
          (
            (
              await client(
                app,
                who === a1 ? cookieOf.a1 : cookieOf.b,
                '/api/recipes',
              )
                .get('/cook-tonight?today=2026-10-12')
                .expect(200)
            ).body as { cards: { recipe: { id: string; owner: string } }[] }
          ).cards.map((c) => c.recipe);
        const mine = await cards(a1);
        expect(mine).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: variant.id, owner: 'family' }),
            expect.objectContaining({ id: alone.id, owner: 'family' }),
          ]),
        );
        const theirs = (await cards(b)).map((r) => r.id);
        expect(theirs).not.toContain(variant.id);
        expect(theirs).not.toContain(alone.id);
      } finally {
        await database.delete(batches).where(eq(batches.id, batch.id));
      }
    });
  });

  describe('Family deletion', () => {
    it('cascades to Recipes, lines, Tips and Unmatched entries', async () => {
      const email = `fam-recipes-c-${stamp}@example.com`;
      const cookie = await signUp(app, email, 'C');
      const c = client(app, cookie, '/api/recipes');
      const [{ familyId: abandoned }] = await database
        .select({ familyId: user.familyId })
        .from(user)
        .where(eq(user.email, email));
      const base = await catalogBase();
      const fv = await familyRecipe(c, base.id, {
        lines: [{ rawName: `Zq cascade ${stamp}` }, line(0)],
      });
      await c.post(`/${fv.id}/tips`, { text: 'tip' }).expect(201);
      expect(await unmatchedFor(fv.lines[0].id)).toHaveLength(1);

      const invite = (
        await client(app, cookieOf.a1, '/api/family').get('').expect(200)
      ).body as { inviteCode: string };
      await client(app, cookie, '/api/family')
        .post('/join', { code: invite.inviteCode })
        .expect(201);

      expect(
        await database.select().from(family).where(eq(family.id, abandoned)),
      ).toEqual([]);
      expect(
        await database.select().from(recipes).where(eq(recipes.id, fv.id)),
      ).toEqual([]);
      expect(
        await database
          .select()
          .from(recipeIngredientLines)
          .where(
            inArray(
              recipeIngredientLines.id,
              fv.lines.map((l) => l.id),
            ),
          ),
      ).toEqual([]);
      expect(await unmatchedFor(fv.lines[0].id)).toEqual([]);
      // The Catalog base is untouched, and the Family still exists for A.
      await a1.get(`/${base.id}`).expect(200);
      expect(familyA).toBeDefined();
    });
  });

  describe('Source Link', () => {
    const link = 'https://Example.com/soup#top';

    it('is saved normalised, returned on the detail, and kept by an update', async () => {
      const created = await familyRecipe(a1, null, { sourceLink: link });
      expect(created.sourceLink).toBe('https://example.com/soup');
      const detail = (await a1.get(`/${created.id}`).expect(200))
        .body as RecipeDetail;
      expect(detail.sourceLink).toBe('https://example.com/soup');

      const updated = (
        await a1
          .put(`/${created.id}`, {
            title: title('Renamed'),
            servings: 3,
            locale: 'en',
            lines: [line(0, 10)],
            steps: [{ text: 'Stir' }],
          })
          .expect(200)
      ).body as FamilyRecipeEdit;
      expect(updated.sourceLink).toBe('https://example.com/soup');
    });

    it('is null for a Recipe without one', async () => {
      const created = await familyRecipe(a1, null);
      expect(created.sourceLink).toBeNull();
      const detail = (await a1.get(`/${created.id}`).expect(200))
        .body as RecipeDetail;
      expect(detail.sourceLink).toBeNull();
    });

    it('refuses a Source Link that is not an http(s) link', async () => {
      await a1
        .post('', doc(null, { sourceLink: 'ftp://example.com/a' }))
        .expect(400);
      await a1.post('', doc(null, { sourceLink: 'nonsense' })).expect(400);
      await a1
        .post('', doc(null, { sourceLink: 'javascript:alert(1)' }))
        .expect(400);
    });

    it('refuses a Source Link over the length limit', async () => {
      await a1
        .post(
          '',
          doc(null, { sourceLink: `https://example.com/${'a'.repeat(2100)}` }),
        )
        .expect(400);
    });

    it('is not copied into a Variant draft', async () => {
      const base = await catalogBase();
      const variant = await familyRecipe(a1, base.id, { sourceLink: link });
      const draft = (await a1.get(`/${variant.id}/variant-draft`).expect(200))
        .body as FamilyRecipeDraft;
      expect(draft).not.toHaveProperty('sourceLink');
      expect(variant.sourceLink).not.toBeNull();
    });

    describe('clearing and locking on update', () => {
      const put = (id: string, extra: object = {}) =>
        a1.put(`/${id}`, {
          title: title('Renamed'),
          servings: 3,
          locale: 'en',
          lines: [line(0, 10)],
          steps: [{ text: 'Stir' }],
          ...extra,
        });
      const linked = () =>
        familyRecipe(a1, null, { sourceLink: link, sourceLanguage: 'ro' });
      const stored = async (id: string) =>
        (await a1.get(`/${id}`).expect(200)).body as RecipeDetail;

      it('sourceLink: null clears the link and the language, nothing else', async () => {
        const created = await linked();
        const updated = (
          await put(created.id, { sourceLink: null }).expect(200)
        ).body as FamilyRecipeEdit;
        expect(updated.sourceLink).toBeNull();
        expect(updated.sourceLanguage).toBeNull();
        const detail = await stored(created.id);
        expect(detail.sourceLink).toBeNull();
        expect(detail.sourceLanguage).toBeNull();
        expect(detail.servings).toBe(3);
        expect(detail.steps.map((s) => s.text)).toEqual(['Stir']);
      });

      it('refuses setting a link on a Recipe without one', async () => {
        const created = await familyRecipe(a1, null);
        const res = await put(created.id, {
          sourceLink: 'https://example.com/new',
        }).expect(400);
        expect(res.body).toMatchObject({ code: 'recipes.source_link_locked' });
        expect((await stored(created.id)).sourceLink).toBeNull();
      });

      it('refuses changing the link or resending the same one', async () => {
        const created = await linked();
        for (const sourceLink of [
          'https://example.com/other',
          'https://example.com/soup',
          link,
        ]) {
          const res = await put(created.id, { sourceLink }).expect(400);
          expect(res.body).toMatchObject({
            code: 'recipes.source_link_locked',
          });
        }
        const detail = await stored(created.id);
        expect(detail.sourceLink).toBe('https://example.com/soup');
        expect(detail.sourceLanguage).toBe('ro');
        expect(detail.title).not.toBe('Renamed');
      });

      it('keeps both the link and the language when neither is sent', async () => {
        const created = await linked();
        await put(created.id).expect(200);
        const detail = await stored(created.id);
        expect(detail.sourceLink).toBe('https://example.com/soup');
        expect(detail.sourceLanguage).toBe('ro');
        expect(detail.title).toContain('Renamed');
      });

      it('refuses clearing the link while setting a language, and changes nothing', async () => {
        const created = await linked();
        const res = await put(created.id, {
          sourceLink: null,
          sourceLanguage: 'fr',
        }).expect(400);
        expect(res.body).toMatchObject({ code: 'recipes.source_link_locked' });
        const detail = await stored(created.id);
        expect(detail.sourceLink).toBe('https://example.com/soup');
        expect(detail.sourceLanguage).toBe('ro');
        expect(detail.title).not.toContain('Renamed');
      });

      it('still refuses an unknown field', async () => {
        const created = await linked();
        await put(created.id, { sourceLinks: null }).expect(400);
      });

      it('Make a variant from a linked Variant saves with neither', async () => {
        const catalog = await catalogBase();
        const source = await familyRecipe(a1, catalog.id, {
          sourceLink: link,
          sourceLanguage: 'ro',
        });
        const draft = (await a1.get(`/${source.id}/variant-draft`).expect(200))
          .body as FamilyRecipeDraft;
        const posted = {
          ...draft,
          locale: 'en',
          lines: draft.lines.map((l) => ({ ...l, ingredientName: undefined })),
        };
        const made = (await a1.post('', posted).expect(201))
          .body as FamilyRecipeEdit;
        expect(made.parentId).toBe(catalog.id);
        const detail = await stored(made.id);
        expect(detail.sourceLink).toBeNull();
        expect(detail.sourceLanguage).toBeNull();
        const parent = await stored(source.id);
        expect(parent.sourceLink).toBe('https://example.com/soup');
        expect(parent.sourceLanguage).toBe('ro');
      });
    });

    it('queues Unmatched lines for curation on save, as for any Family Recipe', async () => {
      const created = await familyRecipe(a1, null, {
        sourceLink: link,
        lines: [
          { rawName: `Zq link spice ${stamp}`, quantity: null, unit: null },
        ],
      });
      const queued = await unmatchedFor(created.lines[0].id);
      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({ source: 'recipe' });
    });
  });
  describe('Source language', () => {
    const link = 'https://Example.com/soup#top';
    const put = (id: string, extra: object = {}) =>
      a1.put(`/${id}`, {
        title: title('Renamed'),
        servings: 3,
        locale: 'en',
        lines: [line(0, 10)],
        steps: [{ text: 'Stir' }],
        ...extra,
      });

    it('is saved lower-cased, returned on the detail, and kept by an update', async () => {
      const created = await familyRecipe(a1, null, {
        sourceLink: link,
        sourceLanguage: ' RO ',
      });
      expect(created.sourceLanguage).toBe('ro');
      const detail = (await a1.get(`/${created.id}`).expect(200))
        .body as RecipeDetail;
      expect(detail.sourceLanguage).toBe('ro');
      const updated = (await put(created.id).expect(200))
        .body as FamilyRecipeEdit;
      expect(updated.sourceLanguage).toBe('ro');
    });

    it('is null for a Recipe without one', async () => {
      const created = await familyRecipe(a1, null);
      expect(created.sourceLanguage).toBeNull();
      const detail = (await a1.get(`/${created.id}`).expect(200))
        .body as RecipeDetail;
      expect(detail.sourceLanguage).toBeNull();
    });

    it('refuses a value that is not a language code', async () => {
      for (const sourceLanguage of [
        '',
        'english please',
        '1',
        'a'.repeat(9),
        5,
      ]) {
        await a1.post('', doc(null, { sourceLanguage })).expect(400);
      }
    });

    it('is refused by an update with its own code, leaving it untouched', async () => {
      const created = await familyRecipe(a1, null, {
        sourceLink: link,
        sourceLanguage: 'ro',
      });
      const res = await put(created.id, { sourceLanguage: 'fr' }).expect(400);
      expect(res.body).toMatchObject({ code: 'recipes.source_link_locked' });
      const detail = (await a1.get(`/${created.id}`).expect(200))
        .body as RecipeDetail;
      expect(detail.sourceLanguage).toBe('ro');
      expect(detail.sourceLink).toBe('https://example.com/soup');
    });

    it('is cleared alone by sourceLanguage: null, keeping the link', async () => {
      const created = await familyRecipe(a1, null, {
        sourceLink: link,
        sourceLanguage: 'ro',
      });
      const updated = (
        await put(created.id, { sourceLanguage: null }).expect(200)
      ).body as FamilyRecipeEdit;
      expect(updated.sourceLanguage).toBeNull();
      expect(updated.sourceLink).toBe('https://example.com/soup');
      const detail = (await a1.get(`/${created.id}`).expect(200))
        .body as RecipeDetail;
      expect(detail.sourceLanguage).toBeNull();
      expect(detail.sourceLink).toBe('https://example.com/soup');
    });

    it('is not copied into a Variant draft', async () => {
      const base = await catalogBase();
      const variant = await familyRecipe(a1, base.id, {
        sourceLink: link,
        sourceLanguage: 'ro',
      });
      const draft = (await a1.get(`/${variant.id}/variant-draft`).expect(200))
        .body as FamilyRecipeDraft;
      expect(draft).not.toHaveProperty('sourceLanguage');
      expect(variant.sourceLanguage).toBe('ro');
    });

    it('is not on the variant draft of a Recipe that has both', async () => {
      const source = await familyRecipe(a1, (await catalogBase()).id, {
        sourceLink: link,
        sourceLanguage: 'ro',
      });
      expect(source.sourceLink).not.toBeNull();
      expect(source.sourceLanguage).toBe('ro');
      const draft = (await a1.get(`/${source.id}/variant-draft`).expect(200))
        .body as FamilyRecipeDraft;
      expect(draft).not.toHaveProperty('sourceLink');
      expect(draft).not.toHaveProperty('sourceLanguage');
    });
  });
});
