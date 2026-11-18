import { jest } from '@jest/globals';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, ilike, isNull } from 'drizzle-orm';
import { DATABASE } from '../src/database/database.constants';
import type { Database } from '../src/database/database.types';
import { seedId } from '../src/catalog/seed/seed-catalog';
import {
  batches,
  catalogTranslations,
  eatingMoments,
  ingredients,
  recipes,
  recipeTags,
  tagGroups,
  tags,
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

const code = (res: { body: unknown }) => (res.body as { code: string }).code;

jest.setTimeout(30_000);

describe('Recipes browsing and detail (integration)', () => {
  let app: NestFastifyApplication;
  let database: Database;
  let admin: ReturnType<typeof client>;
  let memberA: ReturnType<typeof client>;
  let memberB: ReturnType<typeof client>;
  let familyA: string;
  let familyB: string;
  let ing: string[];
  // Three Catalog Tags made for this suite.
  let tagA: string;
  let tagB: string;
  let tagC: string;
  const stamp = Date.now();
  let n = 0;
  const title = (label: string) => `${label} ${stamp}-${++n}`;

  const cookies = new Map<object, string>();
  /**
   * A signed-in request's `?locale=` is ignored: the stored UI Language decides.
   * Tests keep naming the language in the query; this stores it and drops it.
   */
  const asLocale = async (who: object, query: string) => {
    const params = new URLSearchParams(query.replace(/^\?/, ''));
    const locale = params.get('locale');
    params.delete('locale');
    await storeUiLanguage(app, cookies.get(who) as string, locale ?? 'en');
    return params.toString();
  };
  const list = async (query = '', who = memberA) =>
    (
      (await who.get(`?${await asLocale(who, query)}`).expect(200)).body as {
        recipes: RecipeListItem[];
      }
    ).recipes.filter((r) => r.title.includes(String(stamp)));
  const titles = (items: RecipeListItem[]) => items.map((r) => r.title);
  const detail = async (id: string, query = '') => {
    const rest = await asLocale(memberA, query);
    return (await memberA.get(`/${id}${rest ? `?${rest}` : ''}`).expect(200))
      .body as RecipeDetail;
  };

  const line = (i: number, quantity = 100) => ({
    ingredientId: ing[i],
    quantity,
    unit: 'g',
  });

  async function base(overrides: Record<string, unknown> = {}) {
    const doc = {
      title: title('Base'),
      servings: 4,
      lines: [line(0), line(1)],
      steps: [{ text: 'Mix' }, { text: 'Bake' }],
      ...overrides,
    };
    const res = await admin.post('', doc);
    expect(res.status).toBe(201);
    return res.body as AdminRecipeDetail;
  }

  async function variant(
    baseId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const created = (
      await admin
        .post(`/${baseId}/variants`, { title: title('Variant') })
        .expect(201)
    ).body as AdminRecipeDetail;
    if (Object.keys(overrides).length === 0) return created;
    const doc = {
      title: created.title,
      servings: created.servings,
      tagIds: created.tagIds,
      // Post the document fields only: the view's `ingredientOwner` is display-only.
      lines: created.lines.map((l) => ({
        id: l.id,
        ingredientId: l.ingredientId,
        quantity: l.quantity,
        unit: l.unit,
        optional: l.optional,
        note: l.note,
      })),
      steps: created.steps.map((s) => ({ ...s })),
      ...overrides,
    };
    return (await admin.put(`/${created.id}`, doc).expect(200))
      .body as AdminRecipeDetail;
  }

  const archive = (id: string) => admin.post(`/${id}/archive`, {}).expect(200);

  beforeAll(async () => {
    app = await createTestApp();
    database = app.get<Database>(DATABASE);
    const adminEmail = `recipes-browse-admin-${stamp}@example.com`;
    const cookie = await signUp(app, adminEmail, 'Browse Admin');
    await promoteToAdmin(database, adminEmail);
    admin = client(app, cookie, '/api/admin/recipes');
    memberA = client(app, cookie, '/api/recipes');
    cookies.set(memberA, cookie);
    const cookieB = await signUp(
      app,
      `recipes-browse-b-${stamp}@example.com`,
      'Member B',
    );
    memberB = client(app, cookieB, '/api/recipes');
    cookies.set(memberB, cookieB);
    const [a] = await database
      .select({ familyId: user.familyId })
      .from(user)
      .where(eq(user.email, adminEmail));
    familyA = a.familyId;
    const [b] = await database
      .select({ familyId: user.familyId })
      .from(user)
      .where(eq(user.email, `recipes-browse-b-${stamp}@example.com`));
    familyB = b.familyId;
    ing = (
      await database
        .select({ id: ingredients.id })
        .from(ingredients)
        .where(isNull(ingredients.ownerFamilyId))
        .limit(5)
    ).map((r) => r.id);
    const [group] = await database
      .select({ id: tagGroups.id })
      .from(tagGroups)
      .limit(1);
    [tagA, tagB, tagC] = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
    ];
    await database.insert(tags).values(
      [
        [tagA, `Tag A ${stamp}`],
        [tagB, `Tag B ${stamp}`],
        [tagC, `Tag C ${stamp}`],
      ].map(([id, name]) => ({
        id,
        name,
        normalizedName: name.toLowerCase(),
        groupId: group.id,
      })),
    );
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
    await database.delete(tags).where(ilike(tags.name, like));
    await app.close();
  });

  it('requires a signed-in Member', async () => {
    const anon = client(app, '', '/api/recipes');
    await anon.get('').expect(401);
    await anon.get('/filters').expect(401);
  });

  describe('list without search or filter', () => {
    it('shows Base Recipes only, with the count of their live Variants', async () => {
      const a = await base();
      const v1 = await variant(a.id);
      const v2 = await variant(a.id);
      await archive(v2.id);
      const archivedBase = await base();
      await variant(archivedBase.id);
      await archive(archivedBase.id);

      const items = await list();
      expect(titles(items)).toContain(a.title);
      expect(titles(items)).not.toContain(v1.title);
      expect(titles(items)).not.toContain(archivedBase.title);
      const item = items.find((r) => r.id === a.id)!;
      expect(item).toMatchObject({
        parentId: null,
        base: null,
        variantCount: 1,
        owner: 'catalog',
        servings: 4,
      });
    });

    it('lists Variants beside their bases when asked with includeVariants', async () => {
      const a = await base();
      const v = await variant(a.id);

      const items = await list('includeVariants=true');
      expect(titles(items)).toEqual(expect.arrayContaining([a.title, v.title]));
      expect(items.find((r) => r.id === v.id)).toMatchObject({
        parentId: a.id,
      });
    });

    it('orders by title and resolves it in the locale with source fallback', async () => {
      const x = await base({ title: `Bbb ${stamp}` });
      const y = await base({ title: `Aaa ${stamp}` });
      await admin
        .put(`/${x.id}/translations/ro`, { title: `Zzz ro ${stamp}` })
        .expect(200);
      expect(titles(await list('locale=en'))).toEqual(
        expect.arrayContaining([`Aaa ${stamp}`, `Bbb ${stamp}`]),
      );
      const en = titles(await list('locale=en')).filter((t) =>
        [`Aaa ${stamp}`, `Bbb ${stamp}`].includes(t),
      );
      expect(en).toEqual([`Aaa ${stamp}`, `Bbb ${stamp}`]);
      const ro = await list('locale=ro');
      expect(ro.find((r) => r.id === x.id)?.title).toBe(`Zzz ro ${stamp}`);
      expect(ro.find((r) => r.id === y.id)?.title).toBe(`Aaa ${stamp}`);
    });
  });

  describe('search and filters', () => {
    it('finds Variants labelled with their base, and a base does not match through its Variant', async () => {
      const b = await base({ title: `Plain ${stamp}` });
      const v = await variant(b.id, { title: `Quinoa twist ${stamp}` });
      const found = await list('search=quinoa');
      expect(titles(found)).toEqual([`Quinoa twist ${stamp}`]);
      expect(found[0]).toMatchObject({
        id: v.id,
        parentId: b.id,
        base: { id: b.id, title: `Plain ${stamp}` },
      });
    });

    it('searches case- and diacritic-insensitively in the locale or the source title', async () => {
      const b = await base({ title: `Gulaș ${stamp}` });
      await admin
        .put(`/${b.id}/translations/ro`, { title: `Tocană ${stamp}` })
        .expect(200);
      expect(titles(await list('search=GULAS'))).toContain(`Gulaș ${stamp}`);
      expect(titles(await list('search=tocana&locale=ro'))).toEqual([
        `Tocană ${stamp}`,
      ]);
      // the English request does not see the ro text
      expect(await list('search=tocana&locale=en')).toEqual([]);
      // a ro request still finds the source title
      expect(titles(await list('search=gulas&locale=ro'))).toEqual([
        `Tocană ${stamp}`,
      ]);
    });

    it('filters by Tags, combined with AND, over bases and Variants', async () => {
      const b = await base({ title: `FBase ${stamp}`, tagIds: [tagA] });
      const vBoth = await variant(b.id, {
        title: `FBoth ${stamp}`,
        tagIds: [tagA, tagC],
      });
      await variant(b.id, { title: `FOther ${stamp}`, tagIds: [tagB] });
      const byTag = await list(`tagIds=${tagA}&search=${stamp}`);
      expect(titles(byTag).sort()).toEqual(
        [`FBase ${stamp}`, `FBoth ${stamp}`].sort(),
      );
      const both = await list(`tagIds=${tagA},${tagC}&search=${stamp}`);
      expect(titles(both)).toEqual([`FBoth ${stamp}`]);
      expect(both[0]).toMatchObject({
        id: vBoth.id,
        base: { id: b.id, title: `FBase ${stamp}` },
      });
      expect(both[0].tags.map((t) => t.id).sort()).toEqual([tagA, tagC].sort());
      // a base is listed by its own Tags only
      expect(titles(await list(`tagIds=${tagC}`))).toEqual([`FBoth ${stamp}`]);
    });

    it('hides archived Variants but keeps Variants of an archived base, labelled with it', async () => {
      const b = await base({ title: `HBase ${stamp}`, tagIds: [tagA] });
      const live = await variant(b.id, {
        title: `HLive ${stamp}`,
        tagIds: [tagA],
      });
      const gone = await variant(b.id, {
        title: `HGone ${stamp}`,
        tagIds: [tagA],
      });
      const familyVariantId = crypto.randomUUID();
      const otherVariantId = crypto.randomUUID();
      await database.insert(recipes).values([
        {
          id: familyVariantId,
          familyId: familyA,
          parentId: b.id,
          title: `HMine ${stamp}`,
          servings: 2,
        },
        {
          id: otherVariantId,
          familyId: familyB,
          parentId: b.id,
          title: `HTheirs ${stamp}`,
          servings: 2,
        },
      ]);
      const otherTagged = crypto.randomUUID();
      await database.insert(recipes).values({
        id: otherTagged,
        familyId: familyA,
        parentId: b.id,
        title: `HOtherTag ${stamp}`,
        servings: 2,
      });
      await database.insert(recipeTags).values([
        { recipeId: familyVariantId, tagId: tagA },
        { recipeId: otherVariantId, tagId: tagA },
        { recipeId: otherTagged, tagId: tagC },
      ]);
      await archive(gone.id);
      expect(titles(await list(`search=HLive ${stamp}`))).toEqual([live.title]);
      expect(await list('search=HGone')).toEqual([]);
      await archive(b.id);
      const label = { id: b.id, title: `HBase ${stamp}` };
      // the archived base itself stays hidden
      expect(await list('search=HBase')).toEqual([]);
      const found = await list(`search=HLive ${stamp}`);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ id: live.id, base: label });
      // filters show them too, Family Variants only to their own Family
      const onlyH = (t: string) => t.startsWith('H');
      const byTag = await list(`tagIds=${tagA}&search=${stamp}`);
      expect(titles(byTag).filter(onlyH).sort()).toEqual(
        [live.title, `HMine ${stamp}`].sort(),
      );
      expect(byTag.find((r) => r.id === familyVariantId)?.base).toEqual(label);
      expect(
        titles(await list(`tagIds=${tagA}&search=${stamp}`, memberB))
          .filter(onlyH)
          .sort(),
      ).toEqual([live.title, `HTheirs ${stamp}`].sort());
      // the filters alone, without a search, find them as well
      expect(
        titles(await list(`tagIds=${tagA}`))
          .filter(onlyH)
          .sort(),
      ).toEqual([live.title, `HMine ${stamp}`].sort());
      expect(titles(await list(`tagIds=${tagC}`)).filter(onlyH)).toEqual([
        `HOtherTag ${stamp}`,
      ]);
      // still reachable by id
      await memberA.get(`/${live.id}`).expect(200);
    });

    it('ignores an unknown locale', async () => {
      await memberA.get('?locale=xx').expect(200);
    });
  });

  describe('Family visibility', () => {
    it('shows a Family its own Recipes (owner family, never translated) and hides other Families', async () => {
      const mineId = crypto.randomUUID();
      const theirsId = crypto.randomUUID();
      await database.insert(recipes).values([
        {
          id: mineId,
          familyId: familyA,
          title: `Mine ${stamp}`,
          servings: 2,
        },
        {
          id: theirsId,
          familyId: familyB,
          title: `Theirs ${stamp}`,
          servings: 2,
        },
      ]);
      const forA = await list('locale=ro');
      expect(titles(forA)).toContain(`Mine ${stamp}`);
      expect(titles(forA)).not.toContain(`Theirs ${stamp}`);
      expect(forA.find((r) => r.id === mineId)?.owner).toBe('family');
      const forB = await list('', memberB);
      expect(titles(forB)).toContain(`Theirs ${stamp}`);
      expect(titles(forB)).not.toContain(`Mine ${stamp}`);

      const mine = await detail(mineId);
      expect(mine.owner).toBe('family');
      expect(mine.base).toBeNull();
      expect(code(await memberB.get(`/${mineId}`).expect(404))).toBe(
        'recipes.not_found',
      );
    });
  });

  describe('Family Variants under a Catalog base', () => {
    it('shows a Family only its own Variants of a Catalog base', async () => {
      const b = await base({ title: `CBase ${stamp}` });
      await admin
        .put(`/${b.id}/translations/ro`, { title: `CBaza ${stamp}` })
        .expect(200);
      await admin.post(`/${b.id}/tips`, { text: 'Catalog tip' }).expect(201);
      const mine = crypto.randomUUID();
      const theirs = crypto.randomUUID();
      await database.insert(recipes).values([
        {
          id: mine,
          parentId: b.id,
          familyId: familyA,
          title: `FamMine ${stamp}`,
          servings: 2,
        },
        {
          id: theirs,
          parentId: b.id,
          familyId: familyB,
          title: `FamTheirs ${stamp}`,
          servings: 2,
        },
      ]);

      const item = (await list()).find((r) => r.id === b.id)!;
      expect(item.variantCount).toBe(1);
      const baseDetail = await detail(b.id);
      expect(baseDetail.variants.map((v) => [v.id, v.owner])).toEqual([
        [mine, 'family'],
      ]);
      const found = await list('search=FamMine');
      expect(found.map((r) => r.id)).toEqual([mine]);
      expect(found[0].base).toEqual({ id: b.id, title: b.title });
      expect(await list('search=FamTheirs')).toEqual([]);

      const d = await detail(mine, '?locale=ro');
      expect(d.owner).toBe('family');
      expect(d.base).toEqual({
        id: b.id,
        title: `CBaza ${stamp}`,
        archived: false,
        familyCopyId: null,
      });
      expect(d.tips.map((t) => [t.text, t.inherited])).toEqual([
        ['Catalog tip', true],
      ]);
    });
  });

  describe('detail', () => {
    it('returns a base with its live Variants, and no diff', async () => {
      const b = await base({ tagIds: [tagA] });
      const v1 = await variant(b.id, {
        title: `VA ${stamp}`,
        tagIds: [tagA, tagC],
      });
      const v2 = await variant(b.id, { title: `VB ${stamp}` });
      const gone = await variant(b.id);
      await archive(gone.id);
      const d = await detail(b.id);
      expect(d).toMatchObject({
        id: b.id,
        owner: 'catalog',
        base: null,
        diff: null,
        archived: false,
      });
      expect(d.tags.map((t) => t.id)).toEqual([tagA]);
      expect(d.lines.map((l) => l.ingredientId)).toEqual([ing[0], ing[1]]);
      expect(typeof d.lines[0].ingredientName).toBe('string');
      expect(d.steps.map((s) => s.text)).toEqual(['Mix', 'Bake']);
      expect(d.variants.map((v) => v.id)).toEqual([v1.id, v2.id]);
      expect(d.variants[0]).toMatchObject({
        title: `VA ${stamp}`,
        owner: 'catalog',
      });
      expect(d.variants[0].tags.map((t) => t.id).sort()).toEqual(
        [tagA, tagC].sort(),
      );
    });

    it('returns a Variant with its base and the ingredient diff', async () => {
      const b = await base({ lines: [line(0), line(1), line(2)] });
      const v = await variant(b.id, {
        lines: [line(0, 300), line(3), line(4)],
      });
      const d = await detail(v.id);
      expect(d.base).toEqual({
        id: b.id,
        title: b.title,
        archived: false,
        familyCopyId: null,
      });
      expect(d.variants).toEqual([]);
      expect(
        d.diff?.swapped.map((s) => [s.from.ingredientId, s.to.ingredientId]),
      ).toEqual([
        [ing[1], ing[3]],
        [ing[2], ing[4]],
      ]);
      expect(d.diff?.added).toEqual([]);
      expect(d.diff?.removed).toEqual([]);
      expect(d.diff?.swapped[0].to).toMatchObject({
        id: d.lines[1].id,
        ingredientName: d.lines[1].ingredientName,
        quantity: 100,
        unit: 'g',
      });
    });

    it('shows own and inherited Recipe-level Tips minus hidden ones, and Step Tips on their step', async () => {
      const b = await base();
      const tip = (text: string, stepId: string | null = null) =>
        admin.post(`/${b.id}/tips`, { text, stepId }).expect(201);
      await tip('Keep me');
      await tip('Hide me');
      await tip('Step tip', b.steps[0].id);
      const tips = (await admin.get(`/${b.id}`).expect(200))
        .body as AdminRecipeDetail;
      const keep = tips.tips.find((t) => t.text === 'Keep me')!;
      const hide = tips.tips.find((t) => t.text === 'Hide me')!;
      const v = await variant(b.id);
      await admin.post(`/${v.id}/tips`, { text: 'Own tip' }).expect(201);
      await admin
        .put(`/${v.id}/hidden-tips`, { tipIds: [hide.id] })
        .expect(200);
      const d = await detail(v.id);
      const recipeLevel = d.tips.filter((t) => t.stepId === null);
      expect(recipeLevel.map((t) => [t.text, t.inherited])).toEqual([
        ['Keep me', true],
        ['Own tip', false],
      ]);
      expect(recipeLevel[0].id).toBe(keep.id);
      expect(d.tips.map((t) => t.text)).not.toContain('Hide me');
      // The copied Step Tip is the Variant's own and anchored to a Variant step
      const stepTip = d.tips.find((t) => t.text === 'Step tip');
      expect(stepTip?.stepId).toBe(d.steps[0].id);
      expect(stepTip?.inherited).toBe(false);
    });

    it('resolves text in the locale with source fallback', async () => {
      const b = await base();
      await admin
        .put(`/${b.id}/translations/ro`, {
          title: `Titlu ${stamp}`,
          steps: { [b.steps[0].id]: 'Amestecă' },
        })
        .expect(200);
      const ro = await detail(b.id, '?locale=ro');
      expect(ro.title).toBe(`Titlu ${stamp}`);
      expect(ro.steps.map((s) => s.text)).toEqual(['Amestecă', 'Bake']);
      expect((await detail(b.id)).steps[0].text).toBe('Mix');
    });

    it('returns an archived Recipe flagged, and its base flagged archived', async () => {
      const b = await base();
      const v = await variant(b.id);
      await archive(b.id);
      expect((await detail(b.id)).archived).toBe(true);
      expect((await detail(v.id)).base).toMatchObject({
        id: b.id,
        archived: true,
      });
    });

    it('answers a coded 404 for an unknown Recipe', async () => {
      const res = await memberA.get(`/${crypto.randomUUID()}`).expect(404);
      expect(code(res)).toBe('recipes.not_found');
      await memberA.get('/not-a-uuid').expect(400);
    });
  });

  describe('filters', () => {
    it('lists the Tags in use by name in the locale', async () => {
      await base({ tagIds: [tagB] });
      const res = (await memberA.get('/filters').expect(200))
        .body as RecipeFilters;
      expect(res.tags.find((t) => t.id === tagB)?.name).toBe(`Tag B ${stamp}`);
    });
  });

  describe('Catalog Language', () => {
    const milk = seedId.ingredient('milk');

    /** A Member whose UI Language is English and whose Catalog Language is `catalogLanguage`. */
    async function member(catalogLanguage: string | null, label: string) {
      const email = `recipes-cl-${label}-${stamp}-${++n}@example.com`;
      const cookie = await signUp(app, email, `Catalog Language ${label}`);
      await client(app, cookie, '/api/settings')
        .put('/preferences', { locale: 'en', catalogLanguage })
        .expect(200);
      const [row] = await database
        .select({ familyId: user.familyId })
        .from(user)
        .where(eq(user.email, email));
      return {
        cookie,
        api: client(app, cookie, '/api/recipes'),
        familyId: row.familyId,
      };
    }

    /** A Catalog Recipe with a Romanian title, step, Tip and Tag, and one Romanian-named milk line. */
    async function translatedRecipe(withTip = true) {
      await database.insert(catalogTranslations).values({
        id: crypto.randomUUID(),
        entityType: 'tag',
        entityId: tagA,
        locale: 'ro',
        kind: 'name',
        value: `Eticheta ${stamp}`,
        normalizedValue: `eticheta ${stamp}`,
      });
      const b = await base({
        lines: [{ ingredientId: milk, quantity: 100, unit: 'ml' }],
        tagIds: [tagA],
      });
      if (withTip) {
        await admin.post(`/${b.id}/tips`, { text: 'Stir slowly' }).expect(201);
      }
      const tipId = withTip
        ? ((await admin.get(`/${b.id}`).expect(200)).body as AdminRecipeDetail)
            .tips[0].id
        : null;
      await admin
        .put(`/${b.id}/translations/ro`, {
          title: `Titlu ro ${stamp}`,
          steps: { [b.steps[0].id]: 'Amestecă' },
          tips: tipId ? { [tipId]: 'Amestecă încet' } : {},
        })
        .expect(200);
      return b;
    }

    afterEach(async () => {
      await database
        .delete(catalogTranslations)
        .where(ilike(catalogTranslations.value, `%${stamp}%`));
    });

    it('shows a Catalog Recipe in the Catalog Language in browse and detail, not the UI Language', async () => {
      const b = await translatedRecipe();
      const { api } = await member('ro', 'detail');

      const listed = (
        (await api.get('?locale=en&search=Titlu').expect(200)).body as {
          recipes: RecipeListItem[];
        }
      ).recipes.find((r) => r.id === b.id);
      expect(listed?.title).toBe(`Titlu ro ${stamp}`);
      expect(listed?.tags.map((t) => t.name)).toEqual([`Eticheta ${stamp}`]);

      const d = (await api.get(`/${b.id}?locale=en`).expect(200))
        .body as RecipeDetail;
      expect(d.title).toBe(`Titlu ro ${stamp}`);
      expect(d.steps.map((s) => s.text)).toEqual(['Amestecă', 'Bake']);
      expect(d.lines[0].ingredientName).toBe('Lapte');
      expect(d.tips.map((t) => t.text)).toEqual(['Amestecă încet']);
      expect(d.tags.map((t) => t.name)).toEqual([`Eticheta ${stamp}`]);
    });

    it('names Tags in the Catalog Language in the filters', async () => {
      await translatedRecipe(false);
      const { api } = await member('ro', 'filters');
      const filters = (await api.get('/filters?locale=en').expect(200))
        .body as RecipeFilters;
      expect(filters.tags.find((t) => t.id === tagA)?.name).toBe(
        `Eticheta ${stamp}`,
      );
    });

    it('names Eating Moments in the Catalog Language in the filters', async () => {
      const momentId = crypto.randomUUID();
      await database.insert(eatingMoments).values({
        id: momentId,
        name: `Brunch ${stamp}`,
        normalizedName: `brunch ${stamp}`,
        sortOrder: 2000,
      });
      await database.insert(catalogTranslations).values({
        id: crypto.randomUUID(),
        entityType: 'eating_moment',
        entityId: momentId,
        locale: 'ro',
        kind: 'name',
        value: `Gustare ${stamp}`,
        normalizedValue: `gustare ${stamp}`,
      });
      try {
        const { api } = await member('ro', 'moments');
        const filters = (await api.get('/filters?locale=en').expect(200))
          .body as RecipeFilters;
        expect(filters.eatingMoments.find((m) => m.id === momentId)?.name).toBe(
          `Gustare ${stamp}`,
        );
        const english = await member('en', 'moments-en');
        const filtersEn = (
          await english.api.get('/filters?locale=ro').expect(200)
        ).body as RecipeFilters;
        expect(
          filtersEn.eatingMoments.find((m) => m.id === momentId)?.name,
        ).toBe(`Brunch ${stamp}`);
      } finally {
        await database
          .delete(eatingMoments)
          .where(eq(eatingMoments.id, momentId));
      }
    });

    it('falls back to the source text for a field with no translation', async () => {
      const b = await base({
        lines: [{ ingredientId: milk, quantity: 100, unit: 'ml' }],
      });
      await admin
        .put(`/${b.id}/translations/ro`, {
          steps: { [b.steps[0].id]: 'Amestecă' },
        })
        .expect(200);
      const { api } = await member('ro', 'fallback');
      const d = (await api.get(`/${b.id}?locale=en`).expect(200))
        .body as RecipeDetail;
      expect(d.title).toBe(b.title);
      expect(d.steps.map((s) => s.text)).toEqual(['Amestecă', 'Bake']);
    });

    it('returns a Family Recipe as written whatever the Catalog Language', async () => {
      const { api } = await member('ro', 'family');
      const created = (
        await api
          .post('', {
            title: `Family dish ${stamp}-${++n}`,
            servings: 2,
            locale: 'en',
            parentId: null,
            lines: [{ ingredientId: milk, quantity: 100, unit: 'ml' }],
            steps: [{ text: 'Mix well' }],
          })
          .expect(201)
      ).body as { id: string; title: string };
      const d = (await api.get(`/${created.id}?locale=en`).expect(200))
        .body as RecipeDetail;
      expect(d.title).toBe(created.title);
      expect(d.steps.map((s) => s.text)).toEqual(['Mix well']);
    });

    it('prefills a Variant draft of a Catalog Recipe in the Catalog Language', async () => {
      const b = await translatedRecipe();
      const { api } = await member('ro', 'draft');
      const draft = (
        await api.get(`/${b.id}/variant-draft?locale=en`).expect(200)
      ).body as FamilyRecipeDraft;
      expect(draft.title).toBe(`Titlu ro ${stamp}`);
      expect(draft.steps.map((s) => s.text)).toEqual(['Amestecă', 'Bake']);
    });

    it('names linked Ingredients of a Family Recipe edit view in the Catalog Language, keeping its own text', async () => {
      const { api } = await member('ro', 'edit');
      const familyTitle = `Family dish ${stamp}-${++n}`;
      const created = (
        await api
          .post('', {
            title: familyTitle,
            servings: 2,
            locale: 'en',
            parentId: null,
            lines: [{ ingredientId: milk, quantity: 100, unit: 'ml' }],
            steps: [{ text: 'Mix well' }],
          })
          .expect(201)
      ).body as FamilyRecipeEdit;
      expect(created.lines[0].ingredientName).toBe('Lapte');
      const edit = (await api.get(`/${created.id}/edit?locale=en`).expect(200))
        .body as FamilyRecipeEdit;
      expect(edit.title).toBe(familyTitle);
      expect(edit.steps.map((s) => s.text)).toEqual(['Mix well']);
      expect(edit.lines[0].ingredientName).toBe('Lapte');
    });

    it('tags the Unmatched names of a new Family Recipe with the Catalog Language', async () => {
      const { api } = await member('ro', 'unmatched');
      const rawName = `Zmeură ${stamp}-${++n}`;
      const created = (
        await api
          .post('', {
            title: `Family dish ${stamp}-${++n}`,
            servings: 2,
            locale: 'en',
            parentId: null,
            lines: [{ rawName, quantity: 1, unit: 'pcs' }],
            steps: [{ text: 'Mix well' }],
          })
          .expect(201)
      ).body as FamilyRecipeEdit;
      const entries = await database
        .select({ locale: unmatchedEntries.locale })
        .from(unmatchedEntries)
        .where(eq(unmatchedEntries.ingredientLineId, created.lines[0].id));
      expect(entries).toEqual([{ locale: 'ro' }]);
    });

    it('uses the UI Language when the Catalog Language is the empty "Same as UI Language"', async () => {
      const b = await translatedRecipe(false);
      const { api, cookie } = await member(null, 'same');
      const english = (await api.get(`/${b.id}?locale=en`).expect(200))
        .body as RecipeDetail;
      expect(english.title).toBe(b.title);
      await client(app, cookie, '/api/settings')
        .put('/preferences', { locale: 'ro' })
        .expect(200);
      const romanian = (await api.get(`/${b.id}?locale=en`).expect(200))
        .body as RecipeDetail;
      expect(romanian.title).toBe(`Titlu ro ${stamp}`);
    });

    it('names Cook tonight cards in the Catalog Language', async () => {
      const b = await translatedRecipe(false);
      const { api, familyId } = await member('ro', 'cook');
      const [{ leaf }] = await database
        .select({ leaf: ingredients.leafCategoryId })
        .from(ingredients)
        .where(eq(ingredients.id, milk));
      await database.insert(batches).values({
        familyId,
        ingredientId: milk,
        leafCategoryId: leaf,
        location: 'fridge',
        quantity: 1000,
        unit: 'ml',
        expiryDate: '2099-01-01',
      });
      const view = (
        await api.get('/cook-tonight?locale=en&today=2030-01-10').expect(200)
      ).body as { cards: { base: { id: string; title: string } }[] };
      expect(view.cards.find((c) => c.base.id === b.id)?.base.title).toBe(
        `Titlu ro ${stamp}`,
      );
    });
  });
});
