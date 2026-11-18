import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { StructuredOutputRequest } from '../src/ai/structured-output-ai.service';
import { normalizeName } from '../src/catalog/normalize';
import { seedId } from '../src/catalog/seed/seed-catalog';
import { DATABASE } from '../src/database/database.constants';
import type { Database } from '../src/database/database.types';
import {
  batches,
  catalogTranslations,
  ingredients,
  ingredientStockHistory,
  recipeIngredientLines,
  runningLow,
  scanUsage,
  shoppingItems,
  shoppingTemplateLines,
  staples,
  suggestionDismissals,
  user,
} from '../src/database/schema';
import { client, signUp } from './support/admin-session';
import { createTestApp, TEST_ORIGIN } from './support/create-test-app';
import { promoteToAdmin } from './support/promote-to-admin';

// Spec: #276, ADR 0011. Every Family is
// throwaway and every name carries the run stamp; assertions filter to our own
// names and ids because the shared tables also hold rows from other suites.
// Everything that ends up shared sits under a non-Dairy Leaf (ground-spices)
// and is removed in afterAll.
type Who = ReturnType<typeof client>;
type Json = Record<string, unknown>;
type Made = { id: string; name: string };
type Candidate = {
  normalizedName: string;
  name: string;
  ingredient: { id: string; name: string };
  familyCount: number;
};
type Search = { results: { id: string; owner: string }[] };

const IMAGE = 'data:image/jpeg;base64,YQ==';

describe('Admin: merge Family Ingredients, Synonym candidates (integration)', () => {
  let app: NestFastifyApplication;
  let database: Database;
  const stamp = Date.now();
  let n = 0;
  const unique = (label: string) => `${label} ${stamp}-${++n}`;
  let respond: Json = {};
  const prompts: StructuredOutputRequest[] = [];
  const touched: string[] = [];

  let admin: Who;
  let a: Who;
  let b: Who;
  let c: Who;
  let d: Who;
  const emails: Record<string, string> = {};

  const GROUND_SPICES = seedId.leaf('ground-spices');
  const OTHER = seedId.leaf('other-other');
  const NONE = '00000000-0000-4000-8000-000000000000';

  beforeAll(async () => {
    app = await createTestApp([], {
      generate: (input) => {
        prompts.push(input);
        return Promise.resolve({ data: respond, requestId: 'fake-request' });
      },
    });
    database = app.get<Database>(DATABASE);
    const member = async (label: string) => {
      emails[label] = `afm-${label}-${stamp}@example.com`;
      return client(app, await signUp(app, emails[label], label), '/api');
    };
    a = await member('a');
    b = await member('b');
    c = await member('c');
    d = await member('d');
    const adminEmail = `afm-admin-${stamp}@example.com`;
    const adminCookie = await signUp(app, adminEmail, 'Admin');
    await promoteToAdmin(database, adminEmail);
    admin = client(app, adminCookie, '/api');
  });

  // Each test scans a few times; the Scan Cap is not what is under test.
  beforeEach(async () => {
    await database.delete(scanUsage).where(
      inArray(
        scanUsage.memberId,
        database
          .select({ id: user.id })
          .from(user)
          .where(inArray(user.email, [emails.a, emails.d])),
      ),
    );
  });

  afterAll(async () => {
    if (touched.length > 0) {
      for (const table of [
        batches,
        shoppingItems,
        shoppingTemplateLines,
        recipeIngredientLines,
        staples,
        runningLow,
        suggestionDismissals,
        ingredientStockHistory,
      ]) {
        await database
          .delete(table)
          .where(inArray(table.ingredientId, touched));
      }
      await database
        .delete(catalogTranslations)
        .where(inArray(catalogTranslations.entityId, touched));
      await database
        .delete(ingredients)
        .where(inArray(ingredients.id, touched));
    }
    await app.close();
  });

  const familyIdOf = async (label: string) => {
    const [row] = await database
      .select({ familyId: user.familyId })
      .from(user)
      .where(eq(user.email, emails[label]));
    return row.familyId;
  };

  async function made(
    who: Who,
    name: string,
    leaf = GROUND_SPICES,
  ): Promise<Made> {
    const res = await who.post('/catalog/family-ingredients?locale=en', {
      name,
      leafCategoryId: leaf,
      defaultUnit: 'g',
    });
    expect([res.status, res.body]).toEqual([201, expect.anything()]);
    const row = res.body as Made;
    touched.push(row.id);
    return row;
  }

  async function shared(name: string): Promise<Made> {
    const res = await admin.post('/admin/catalog/ingredients', {
      leafCategoryId: GROUND_SPICES,
      name,
      defaultUnit: 'g',
    });
    expect([res.status, res.body]).toEqual([201, expect.anything()]);
    const row = res.body as Made;
    touched.push(row.id);
    return row;
  }

  const sharedSynonymRow = (entityId: string, value: string, locale = 'en') =>
    database.insert(catalogTranslations).values({
      id: randomUUID(),
      entityType: 'ingredient',
      entityId,
      locale,
      kind: 'synonym',
      value,
      normalizedValue: normalizeName(value),
    });
  const familySynonymRow = (
    entityId: string,
    familyId: string,
    value: string,
    locale = 'en',
  ) =>
    database.insert(catalogTranslations).values({
      id: randomUUID(),
      entityType: 'ingredient',
      entityId,
      ownerFamilyId: familyId,
      locale,
      kind: 'synonym',
      value,
      normalizedValue: normalizeName(value),
    });
  /** The Family Synonyms (owned rows) on an Ingredient. */
  const familySynonymsOf = (entityId: string) =>
    database
      .select()
      .from(catalogTranslations)
      .where(
        and(
          eq(catalogTranslations.entityId, entityId),
          eq(catalogTranslations.kind, 'synonym'),
          isNotNull(catalogTranslations.ownerFamilyId),
        ),
      );
  const rowOf = async (id: string) =>
    (
      await database.select().from(ingredients).where(eq(ingredients.id, id))
    )[0];

  const merge = (ingredientId: string, targetIngredientId: string) =>
    admin.post('/admin/family-ingredients/merge', {
      ingredientId,
      targetIngredientId,
    });
  const promote = (ingredientId: string) =>
    admin.post('/admin/family-ingredients/promote', { ingredientId });
  const addShared = (body: Json) =>
    admin.post('/admin/family-synonyms/promote', body);
  const linkSynonym = async (who: Who, name: string, ingredientId: string) => {
    const res = await who.post('/catalog/family-synonyms?locale=en', {
      name,
      ingredientId,
    });
    expect([res.status, res.body]).toEqual([201, expect.anything()]);
  };

  const searchIds = async (who: Who, q: string, extra = '') =>
    (
      (
        await who.get(
          `/catalog/search?q=${encodeURIComponent(q)}&locale=en${extra}`,
        )
      ).body as Search
    ).results.map((r) => r.id);

  const scan = async (who: Who, productName: string) => {
    respond = {
      productName,
      productType: 'Spice',
      matchedIngredientId: null,
      matchedCategory: null,
      matchConfidence: 0,
      fallbackIngredientName: 'Something else',
      expiryDate: null,
      expiryText: null,
      netQuantity: null,
      netUnit: null,
      confidence: 0.95,
    };
    prompts.length = 0;
    const res = await who.post('/scan/product', { productImage: IMAGE });
    expect(res.status).toBe(201);
    return (res.body as { lines: { match: { id: string } | null }[] }).lines[0]
      .match;
  };

  /** Every candidate (following the cursor) whose name is in `names`, in served order. */
  async function candidatesOf(...names: string[]): Promise<Candidate[]> {
    const found: Candidate[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 50; page++) {
      const res: request.Response = await admin.get(
        `/admin/family-synonyms?limit=100${cursor ? `&cursor=${cursor}` : ''}`,
      );
      expect(res.status).toBe(200);
      const body = res.body as {
        candidates: Candidate[];
        nextCursor: string | null;
      };
      found.push(
        ...body.candidates.filter((x) =>
          names.some((name) => normalizeName(name) === x.normalizedName),
        ),
      );
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    return found;
  }

  describe('access', () => {
    it('requires authentication', async () => {
      const http = () => request(app.getHttpServer());
      await http().get('/api/admin/family-synonyms').expect(401);
      for (const path of [
        '/api/admin/family-ingredients/merge',
        '/api/admin/family-synonyms/promote',
      ]) {
        await http()
          .post(path)
          .set('origin', TEST_ORIGIN)
          .send({ ingredientId: NONE, targetIngredientId: NONE })
          .expect(401);
      }
    });

    it('is Admin-only: a Member gets 403 everywhere, and nothing changes', async () => {
      const target = await shared(unique('Afm Member Target'));
      const copy = await made(a, unique('Afm Member Copy'));
      await linkSynonym(a, unique('Afm Member Alias'), target.id);

      await a
        .post('/admin/family-ingredients/merge', {
          ingredientId: copy.id,
          targetIngredientId: target.id,
        })
        .expect(403);
      await a.get('/admin/family-synonyms').expect(403);
      await a
        .post('/admin/family-synonyms/promote', {
          normalizedName: 'x',
          ingredientId: target.id,
          locale: 'en',
        })
        .expect(403);

      expect((await rowOf(copy.id)).ownerFamilyId).not.toBeNull();
      expect(await familySynonymsOf(target.id)).toHaveLength(1);
    });
  });

  describe('merge', () => {
    it('re-points every reference kind to the shared target, de-duplicates, and deletes the copies', async () => {
      const name = unique('Afm Merge');
      const target = await shared(unique('Afm Merge Target'));
      const copyA = await made(a, name);
      const copyB = await made(b, name.toUpperCase(), OTHER);
      const copyC = await made(c, name, OTHER);
      const familyB = await familyIdOf('b');
      const familyC = await familyIdOf('c');
      const gone = [copyA.id, copyB.id, copyC.id];

      await b
        .post('/pantry/batches?locale=en', {
          ingredientId: copyB.id,
          quantity: 2,
          unit: 'g',
          location: 'cupboard',
        })
        .expect(201);
      await b
        .post('/shopping-list/items', { ingredientId: copyB.id })
        .expect(200);
      await b
        .post('/shopping-templates', {
          name: unique('Merge template'),
          lines: [{ ingredientId: copyB.id }],
        })
        .expect(201);
      await b
        .post('/recipes', {
          title: unique('Merge recipe'),
          servings: 2,
          locale: 'en',
          parentId: null,
          lines: [{ ingredientId: copyB.id, quantity: 50, unit: 'g' }],
          steps: [{ text: 'Stir' }],
        })
        .expect(201);
      await b
        .post('/staples?locale=en', { ingredientId: copyB.id })
        .expect(201);
      await b.put(`/pantry/running-low/${copyB.id}`).expect(204);
      await b
        .post(`/shopping-list/suggestions/${copyB.id}/dismiss`)
        .expect(204);
      await c
        .post('/pantry/batches?locale=en', {
          ingredientId: copyC.id,
          quantity: 1,
          unit: 'g',
          location: 'cupboard',
        })
        .expect(201);

      const res = await merge(copyA.id, target.id);

      expect(res.status).toBe(200);
      const body = res.body as {
        targetIngredientId: string;
        mergedIngredientIds: string[];
      };
      expect(body.targetIngredientId).toBe(target.id);
      expect(body.mergedIngredientIds.sort()).toEqual([...gone].sort());
      expect(
        await database
          .select()
          .from(ingredients)
          .where(inArray(ingredients.id, gone)),
      ).toHaveLength(0);
      // The target is untouched and still shared.
      expect(await rowOf(target.id)).toMatchObject({
        id: target.id,
        ownerFamilyId: null,
      });

      const bBatches = await database
        .select()
        .from(batches)
        .where(eq(batches.familyId, familyB));
      expect(bBatches).toHaveLength(1);
      expect(bBatches[0]).toMatchObject({
        ingredientId: target.id,
        leafCategoryId: GROUND_SPICES,
      });
      const cBatches = await database
        .select()
        .from(batches)
        .where(eq(batches.familyId, familyC));
      expect(cBatches.map((x) => [x.ingredientId, x.leafCategoryId])).toEqual([
        [target.id, GROUND_SPICES],
      ]);
      for (const table of [
        shoppingItems,
        shoppingTemplateLines,
        recipeIngredientLines,
        staples,
      ]) {
        const rows = await database
          .select({ id: table.ingredientId })
          .from(table)
          .where(inArray(table.ingredientId, [target.id, ...gone]));
        expect(rows.map((x) => x.id)).toEqual([target.id]);
      }
      const history = await database
        .select()
        .from(ingredientStockHistory)
        .where(
          inArray(ingredientStockHistory.ingredientId, [target.id, ...gone]),
        );
      expect(history.map((x) => [x.familyId, x.ingredientId]).sort()).toEqual(
        [
          [familyB, target.id],
          [familyC, target.id],
        ].sort(),
      );
      for (const table of [runningLow, suggestionDismissals]) {
        const rows = await database
          .select({ familyId: table.familyId, id: table.ingredientId })
          .from(table)
          .where(inArray(table.ingredientId, [target.id, ...gone]));
        expect(rows).toEqual([{ familyId: familyB, id: target.id }]);
      }
    });

    it('re-points the Ingredients of Recipe Drafts too, on lines and on Guidance links, and leaves other ids alone', async () => {
      const target = await shared(unique('Afm Draft Target'));
      const copy = await made(a, unique('Afm Draft Copy'));
      const bystander = await made(b, unique('Afm Draft Bystander'));
      const draft = (who: Who, ingredientId: string, linkTarget: string) =>
        who
          .post('/recipe-drafts', {
            kind: 'new_recipe',
            content: {
              title: unique('Afm Draft'),
              servings: '2',
              prepMinutes: '',
              cookMinutes: '',
              difficulty: '',
              lines: [
                {
                  ingredientId,
                  name: '',
                  quantity: '1',
                  unit: 'g',
                  optional: false,
                  note: '',
                },
                {
                  ingredientId: '',
                  name: 'Typed only',
                  quantity: '1',
                  unit: 'g',
                  optional: false,
                  note: '',
                },
              ],
              steps: [{ text: 'Stir', timer: '' }],
              guidance: {
                nutritionNote: '',
                pairings: [
                  {
                    kind: 'food',
                    label: 'Side',
                    reason: '',
                    principle: '',
                    linkType: 'ingredient',
                    linkTarget,
                  },
                ],
                eatingMoments: [],
              },
            },
          })
          .expect(201);
      const mine = (await draft(a, copy.id, copy.id)).body as { id: string };
      const other = (await draft(b, bystander.id, bystander.id)).body as {
        id: string;
      };

      await merge(copy.id, target.id).expect(200);

      const got = (await a.get(`/recipe-drafts/${mine.id}`).expect(200))
        .body as {
        version: number;
        content: {
          lines: { ingredientId: string; name: string }[];
          guidance: { pairings: { linkTarget: string }[] };
        };
      };
      expect(got.content.lines.map((l) => [l.ingredientId, l.name])).toEqual([
        [target.id, ''],
        ['', 'Typed only'],
      ]);
      expect(got.content.guidance.pairings[0].linkTarget).toBe(target.id);
      // The form open elsewhere holds the old content: its next save is a conflict, not a silent undo.
      expect(got.version).toBe(2);
      const stored = (await b.get(`/recipe-drafts/${other.id}`).expect(200))
        .body as {
        version: number;
        content: { lines: { ingredientId: string }[] };
      };
      expect(stored.version).toBe(1);
      expect(stored.content.lines[0].ingredientId).toBe(bystander.id);
    });

    it('de-duplicates rows a Family already holds on both the copy and the target, Family Synonyms included', async () => {
      const name = unique('Afm Dedup');
      const target = await shared(unique('Afm Dedup Target'));
      const copyB = await made(b, name);
      const familyB = await familyIdOf('b');
      const now = new Date();
      const earlier = new Date(now.getTime() - 5 * 86_400_000);
      await database.insert(staples).values([
        { familyId: familyB, ingredientId: copyB.id },
        { familyId: familyB, ingredientId: target.id },
      ]);
      await database.insert(ingredientStockHistory).values([
        { familyId: familyB, ingredientId: copyB.id, lastStockedAt: now },
        { familyId: familyB, ingredientId: target.id, lastStockedAt: earlier },
      ]);
      await database.insert(suggestionDismissals).values([
        { familyId: familyB, ingredientId: copyB.id },
        { familyId: familyB, ingredientId: target.id },
      ]);
      await database.insert(runningLow).values([
        { familyId: familyB, ingredientId: copyB.id },
        { familyId: familyB, ingredientId: target.id },
      ]);
      // The same Family Synonym on both, and one only the copy has.
      const both = unique('Afm Both Alias');
      const onlyCopy = unique('Afm Copy Alias');
      await familySynonymRow(copyB.id, familyB, both);
      await familySynonymRow(copyB.id, familyB, onlyCopy);
      await familySynonymRow(target.id, familyB, both.toUpperCase());

      await merge(copyB.id, target.id).expect(200);

      for (const table of [staples, suggestionDismissals, runningLow]) {
        const rows = await database
          .select()
          .from(table)
          .where(
            and(
              eq(table.familyId, familyB),
              inArray(table.ingredientId, [target.id, copyB.id]),
            ),
          );
        expect(rows.map((x) => x.ingredientId)).toEqual([target.id]);
      }
      const mine = (
        await database
          .select()
          .from(ingredientStockHistory)
          .where(eq(ingredientStockHistory.familyId, familyB))
      ).filter((x) => [target.id, copyB.id].includes(x.ingredientId));
      expect(mine).toHaveLength(1);
      expect(mine[0].ingredientId).toBe(target.id);
      expect(mine[0].lastStockedAt.getTime()).toBe(now.getTime());

      const synonyms = await familySynonymsOf(target.id);
      const byValue = (value: string) =>
        synonyms.filter(
          (x) =>
            x.ownerFamilyId === familyB &&
            x.normalizedValue === normalizeName(value),
        );
      expect(byValue(both)).toHaveLength(1);
      expect(byValue(onlyCopy)).toHaveLength(1);
      // The copy's own name is kept too.
      expect(byValue(name)).toHaveLength(1);
      expect(await familySynonymsOf(copyB.id)).toHaveLength(0);
    });

    it("keeps each copy's name as a Family Synonym for its own Family only, and skips names the target already has", async () => {
      const name = unique('Afm Alias Name');
      const target = await shared(unique('Afm Alias Target'));
      const copyA = await made(a, name);
      const copyB = await made(b, name.toUpperCase());
      const familyA = await familyIdOf('a');
      const familyB = await familyIdOf('b');

      await merge(copyA.id, target.id).expect(200);

      const rows = await familySynonymsOf(target.id);
      expect(
        rows
          .map((x) => [x.ownerFamilyId, x.value, x.kind, x.normalizedValue])
          .sort(),
      ).toEqual(
        [
          [familyA, name, 'synonym', normalizeName(name)],
          [familyB, name.toUpperCase(), 'synonym', normalizeName(name)],
        ].sort(),
      );
      // Marks the destructured value as intentionally unused.
      void copyB;

      // A name equal to the target's own name is not kept.
      // (The Family copy comes first: adding one over a shared name is a 409.)
      const sameName = unique('Afm Same As Target');
      const dup = await made(c, sameName.toUpperCase());
      const target2 = await shared(sameName);
      await merge(dup.id, target2.id).expect(200);
      expect(await familySynonymsOf(target2.id)).toHaveLength(0);

      // Nor a name that is already a shared Synonym of the target.
      const aliasName = unique('Afm Shared Alias');
      const target3 = await shared(unique('Afm Alias Target 3'));
      const dup3 = await made(c, aliasName);
      await sharedSynonymRow(target3.id, aliasName, 'ro');
      await merge(dup3.id, target3.id).expect(200);
      expect(await familySynonymsOf(target3.id)).toHaveLength(0);
    });

    it("matches the Family's typing and Scans on the target, and other Families do not", async () => {
      const name = unique('Afm Matches');
      const target = await shared(unique('Afm Matches Target'));
      const copyA = await made(a, name);
      await made(b, name);
      // Warm the Scan caches of an owner and of an outsider.
      expect(await scan(a, name)).toMatchObject({ id: copyA.id });
      await scan(d, 'warm');

      await merge(copyA.id, target.id).expect(200);

      expect(await searchIds(a, name)).toContain(target.id);
      expect(await searchIds(b, name)).toContain(target.id);
      expect(await searchIds(d, name)).not.toContain(target.id);
      expect(await searchIds(admin, name, '&scope=shared')).not.toContain(
        target.id,
      );
      expect(await scan(a, name)).toMatchObject({ id: target.id });
      expect(await scan(d, name)).toBeNull();
    });

    it('answers 404 for an unknown group, an already shared source, and a target that is unknown or Family-owned, and changes nothing', async () => {
      const target = await shared(unique('Afm 404 Target'));
      const copy = await made(a, unique('Afm 404 Copy'));
      const other = await made(b, unique('Afm 404 Other'));

      for (const [source, targetId, code] of [
        [NONE, target.id, 'family_ingredients.not_found'],
        [
          seedId.ingredient('parmesan'),
          target.id,
          'family_ingredients.not_found',
        ],
        [copy.id, NONE, 'family_ingredients.target_not_found'],
        [copy.id, other.id, 'family_ingredients.target_not_found'],
      ]) {
        const res = await merge(source, targetId);
        expect([res.status, (res.body as { code: string }).code]).toEqual([
          404,
          code,
        ]);
      }
      await admin
        .post('/admin/family-ingredients/merge', { ingredientId: 'nope' })
        .expect(400);
      expect((await rowOf(copy.id)).ownerFamilyId).not.toBeNull();
      expect((await rowOf(other.id)).ownerFamilyId).not.toBeNull();
      expect(await familySynonymsOf(target.id)).toHaveLength(0);
    });

    it('drops every Family cache: a warm Family sees the merge target in Scans', async () => {
      const name = unique('Afm Cached');
      const target = await shared(unique('Afm Cached Target'));
      const copyA = await made(a, name);
      expect(await scan(a, name)).toMatchObject({ id: copyA.id });

      await merge(copyA.id, target.id).expect(200);

      const match = await scan(a, name);
      expect(match).toMatchObject({ id: target.id });
    });
  });

  describe('promote keeps names as Family Synonyms', () => {
    it("keeps the merged copies' names for their Families, and none for the promoted copy's own Family", async () => {
      const name = unique('Afm Promote');
      const keep = await made(a, name);
      await made(b, name.toUpperCase());
      await made(c, ` ${name.toLowerCase()} `);
      const familyA = await familyIdOf('a');
      const familyB = await familyIdOf('b');
      const familyC = await familyIdOf('c');

      await promote(keep.id).expect(200);

      const rows = await familySynonymsOf(keep.id);
      expect(rows.map((x) => x.ownerFamilyId).sort()).toEqual(
        [familyB, familyC].sort(),
      );
      expect(rows.some((x) => x.ownerFamilyId === familyA)).toBe(false);
      expect(rows.find((x) => x.ownerFamilyId === familyB)).toMatchObject({
        value: name.toUpperCase(),
        normalizedValue: normalizeName(name),
        kind: 'synonym',
      });
      // Family Synonyms are not shared: an outsider has none.
      expect(await searchIds(d, name)).toContain(keep.id);
    });

    it("re-points the other Families' Recipe Drafts to the promoted Ingredient", async () => {
      const name = unique('Afm Promote Draft');
      const keep = await made(a, name);
      const copy = await made(b, name);
      const res = await b
        .post('/recipe-drafts', {
          kind: 'new_recipe',
          content: {
            title: unique('Afm Promote Draft'),
            servings: '2',
            prepMinutes: '',
            cookMinutes: '',
            difficulty: '',
            lines: [
              {
                ingredientId: copy.id,
                name: '',
                quantity: '1',
                unit: 'g',
                optional: false,
                note: '',
              },
            ],
            steps: [{ text: 'Stir', timer: '' }],
          },
        })
        .expect(201);
      const { id } = res.body as { id: string };

      await promote(keep.id).expect(200);

      const got = (await b.get(`/recipe-drafts/${id}`).expect(200)).body as {
        content: { lines: { ingredientId: string }[] };
      };
      expect(got.content.lines.map((l) => l.ingredientId)).toEqual([keep.id]);
    });

    it("keeps promote's Family Synonyms when another group is merged into the promoted Ingredient later", async () => {
      const name = unique('Afm Later');
      const keep = await made(a, name);
      await made(b, name);
      await made(c, name);
      const familyB = await familyIdOf('b');
      await promote(keep.id).expect(200);
      expect(await familySynonymsOf(keep.id)).toHaveLength(2);

      const other = await made(d, unique('Afm Later Other'));
      await merge(other.id, keep.id).expect(200);

      const rows = await familySynonymsOf(keep.id);
      expect(rows.filter((x) => x.ownerFamilyId === familyB)).toHaveLength(1);
      expect(
        rows.filter((x) => x.normalizedValue === normalizeName(name)),
      ).toHaveLength(2);
    });
  });

  describe('Synonym candidates', () => {
    it('groups Family Synonyms by (normalised name, Ingredient) with a Family count, ranked by count', async () => {
      const t1 = await shared(unique('Afm Cand Target One'));
      const t2 = await shared(unique('Afm Cand Target Two'));
      const three = unique('Afm Cand Three');
      const two = unique('Afm Cand Two');
      const split = unique('Afm Cand Split');
      await linkSynonym(a, three, t1.id);
      await linkSynonym(b, three.toUpperCase(), t1.id);
      await linkSynonym(c, ` ${three.toLowerCase()} `, t1.id);
      await linkSynonym(a, two, t1.id);
      await linkSynonym(b, two, t1.id);
      // The same name on two Ingredients is two candidates.
      await linkSynonym(a, split, t1.id);
      await linkSynonym(b, split, t2.id);

      const found = await candidatesOf(three, two, split);

      expect(found.map((x) => [x.normalizedName, x.familyCount])).toEqual([
        [normalizeName(three), 3],
        [normalizeName(two), 2],
        [normalizeName(split), 1],
        [normalizeName(split), 1],
      ]);
      expect(found[0]).toMatchObject({
        name: three,
        ingredient: { id: t1.id, name: t1.name },
      });
      expect(
        found
          .slice(2)
          .map((x) => x.ingredient.id)
          .sort(),
      ).toEqual([t1.id, t2.id].sort());
      expect(JSON.stringify(found)).not.toMatch(/familyId|owner/i);
    });

    it('pages with a cursor, continuing without repeating a candidate, and rejects bad paging', async () => {
      const target = await shared(unique('Afm Page Target'));
      const names = [unique('Afm Page One'), unique('Afm Page Two')];
      for (const name of names) await linkSynonym(a, name, target.id);

      const seen: string[] = [];
      const totals = new Set<number>();
      let cursor: string | null = null;
      for (let page = 0; page < 500; page++) {
        const res: request.Response = await admin.get(
          `/admin/family-synonyms?limit=1${cursor ? `&cursor=${cursor}` : ''}`,
        );
        expect(res.status).toBe(200);
        const body = res.body as {
          total: number;
          candidates: Candidate[];
          nextCursor: string | null;
        };
        expect(body.candidates.length).toBeLessThanOrEqual(1);
        totals.add(body.total);
        seen.push(
          ...body.candidates.map(
            (x) => `${x.normalizedName}|${x.ingredient.id}`,
          ),
        );
        cursor = body.nextCursor;
        if (!cursor) break;
      }
      expect(new Set(seen).size).toBe(seen.length);
      // `total` counts the whole queue on every page, not the page.
      expect(seen.length).toBeGreaterThan(1);
      expect([...totals]).toEqual([seen.length]);
      for (const name of names) {
        expect(seen).toContain(`${normalizeName(name)}|${target.id}`);
      }
      await admin.get('/admin/family-synonyms?limit=101').expect(400);
      await admin.get('/admin/family-synonyms?limit=0').expect(400);
      await admin.get('/admin/family-synonyms?cursor=not-a-cursor').expect(400);
    });

    it('adds a candidate as a shared Synonym, removes the Family copies, and matches for every Family', async () => {
      const target = await shared(unique('Afm Add Target'));
      const name = unique('Afm Add Alias');
      await linkSynonym(a, name, target.id);
      await linkSynonym(b, name.toUpperCase(), target.id);
      await linkSynonym(c, name, target.id);
      // Another candidate on the same Ingredient is left alone.
      const untouched = unique('Afm Add Untouched');
      await linkSynonym(a, untouched, target.id);
      expect(await searchIds(d, name)).not.toContain(target.id);
      await scan(d, 'warm');

      const res = await addShared({
        normalizedName: normalizeName(name),
        ingredientId: target.id,
        locale: 'da',
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        ingredientId: target.id,
        name,
        locale: 'da',
      });
      const sharedRows = await database
        .select()
        .from(catalogTranslations)
        .where(
          and(
            eq(catalogTranslations.entityId, target.id),
            eq(catalogTranslations.kind, 'synonym'),
            eq(catalogTranslations.normalizedValue, normalizeName(name)),
          ),
        );
      expect(sharedRows).toHaveLength(1);
      expect(sharedRows[0]).toMatchObject({
        ownerFamilyId: null,
        locale: 'da',
        value: name,
      });
      expect(await candidatesOf(name)).toHaveLength(0);
      expect((await candidatesOf(untouched))[0]).toMatchObject({
        familyCount: 1,
      });
      // Every Family finds it, including one that never had a Family copy.
      for (const who of [a, b, c, d]) {
        expect(await searchIds(who, name)).toContain(target.id);
      }
      expect(await searchIds(admin, name, '&scope=shared')).toContain(
        target.id,
      );
      expect(await scan(d, name)).toMatchObject({ id: target.id });
      expect(await scan(a, name)).toMatchObject({ id: target.id });
    });

    it('leaves out candidates that repeat the Ingredient name, and answers 404 when asked to add one', async () => {
      const name = unique('Afm Own Name');
      const keep = await made(a, name);
      await made(b, name);
      await promote(keep.id).expect(200);
      expect(await familySynonymsOf(keep.id)).toHaveLength(1);

      expect(await candidatesOf(name)).toHaveLength(0);
      const res = await addShared({
        normalizedName: normalizeName(name),
        ingredientId: keep.id,
        locale: 'en',
      });
      expect([res.status, res.body]).toEqual([
        404,
        expect.objectContaining({ code: 'family_synonyms.not_found' }),
      ]);
      expect(await familySynonymsOf(keep.id)).toHaveLength(1);
    });

    it('answers 404 for a name that is no candidate, 400 for a bad locale, and 409 when another Ingredient owns the name', async () => {
      const target = await shared(unique('Afm Err Target'));
      const rival = await shared(unique('Afm Err Rival'));
      const nope = await addShared({
        normalizedName: normalizeName(unique('Afm No Such')),
        ingredientId: target.id,
        locale: 'en',
      });
      expect([nope.status, nope.body]).toEqual([
        404,
        expect.objectContaining({ code: 'family_synonyms.not_found' }),
      ]);

      const asName = rival.name;
      const asSynonym = unique('Afm Rival Alias');
      await sharedSynonymRow(rival.id, asSynonym, 'ro');
      await linkSynonym(a, asName, target.id);
      await linkSynonym(a, asSynonym, target.id);
      await addShared({
        normalizedName: normalizeName(asName),
        ingredientId: target.id,
        locale: 'fr',
      }).expect(400);

      for (const value of [asName, asSynonym]) {
        const res = await addShared({
          normalizedName: normalizeName(value),
          ingredientId: target.id,
          locale: 'en',
        });
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({
          code: 'family_synonyms.shared_name_exists',
          params: { ingredientId: rival.id },
        });
      }
      // Nothing changed: the Family Synonyms are still there, no shared one was added.
      expect(await familySynonymsOf(target.id)).toHaveLength(2);
      const leftover = await database
        .select()
        .from(catalogTranslations)
        .where(
          and(
            eq(catalogTranslations.entityId, target.id),
            eq(catalogTranslations.kind, 'synonym'),
          ),
        );
      expect(leftover.filter((x) => x.ownerFamilyId === null)).toHaveLength(0);
    });
  });
});
