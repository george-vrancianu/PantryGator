import { jest } from '@jest/globals';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { asc, eq, ilike } from 'drizzle-orm';
import { seedId } from '../src/catalog/seed/seed-catalog';
import { DATABASE } from '../src/database/database.constants';
import type { Database } from '../src/database/database.types';
import {
  eatingMoments,
  recipeEatingMoments,
  recipeHiddenTips,
  recipeIngredientLines,
  recipeIngredientLineTranslations,
  recipePairings,
  recipes,
  recipeStepTranslations,
  recipeSteps,
  recipeTips,
  recipeTranslations,
  unmatchedEntries,
  user,
} from '../src/database/schema';
import type { RecipeListItem } from '../src/recipes/recipes.schemas';
import { client, signUp } from './support/admin-session';
import { createTestApp } from './support/create-test-app';
import { storeLanguages } from './support/stored-language';

jest.setTimeout(30_000);

// Spec: #561 / #563. POST /recipes/:id/copy (Add to Family) and `familyCopyId` on the list.
describe('Add to Family (integration)', () => {
  let app: NestFastifyApplication;
  let database: Database;
  let ana: ReturnType<typeof client>;
  let ben: ReturnType<typeof client>;
  let anaCookie: string;
  let anaFamily: string;
  let benFamily: string;
  const stamp = Date.now();
  let moment: string;
  let momentCreated = false;

  const newId = () => crypto.randomUUID();

  /** A Catalog Base with two Steps, a Recipe Tip, a Step Tip, a Pairing, a Nutrition Note and an Eating Moment. */
  const makeBase = async (title = `Copy ${stamp}-base`) => {
    const id = newId();
    const linked = newId();
    await database.insert(recipes).values([
      {
        id: linked,
        title: `Copy ${stamp}-linked`,
        servings: 2,
      },
      {
        id,
        title,
        servings: 4,
        prepMinutes: 10,
        cookMinutes: 20,
        difficulty: 'medium',
        nutritionNote: 'Light on salt',
      },
    ]);
    const lineId = newId();
    await database.insert(recipeIngredientLines).values({
      id: lineId,
      recipeId: id,
      position: 0,
      ingredientId: seedId.ingredient('flour'),
      quantity: 200,
      unit: 'g',
      note: 'sifted',
    });
    const step1 = newId();
    const step2 = newId();
    await database.insert(recipeSteps).values([
      { id: step1, recipeId: id, position: 0, text: 'Mix', timerSeconds: 60 },
      {
        id: step2,
        recipeId: id,
        position: 1,
        text: 'Bake',
        timerSeconds: null,
      },
    ]);
    const recipeTip = newId();
    await database.insert(recipeTips).values([
      {
        id: recipeTip,
        recipeId: id,
        stepId: null,
        position: 0,
        text: 'Base tip',
      },
      {
        id: newId(),
        recipeId: id,
        stepId: step2,
        position: 1,
        text: 'Step tip',
      },
    ]);
    await database.insert(recipePairings).values({
      id: newId(),
      recipeId: id,
      position: 0,
      kind: 'drink',
      label: 'Red wine',
      reason: 'Goes well',
      linkedRecipeId: linked,
    });
    await database.insert(recipeEatingMoments).values({
      id: newId(),
      recipeId: id,
      eatingMomentId: moment,
      position: 0,
      polarity: 'good_for',
      reason: 'Hearty',
    });
    return { id, lineId, step1, recipeTip, linked };
  };

  const copy = (as: ReturnType<typeof client>, id: string) =>
    as.post(`/${id}/copy`);
  const copyId = async (as: ReturnType<typeof client>, id: string) =>
    ((await copy(as, id).expect(200)).body as { id: string }).id;
  const row = async (id: string) =>
    (await database.select().from(recipes).where(eq(recipes.id, id)))[0];

  beforeAll(async () => {
    app = await createTestApp();
    database = app.get<Database>(DATABASE);
    const email = `copy-ana-${stamp}@example.com`;
    anaCookie = await signUp(app, email, 'Ana');
    ana = client(app, anaCookie, '/api/recipes');
    const benEmail = `copy-ben-${stamp}@example.com`;
    ben = client(app, await signUp(app, benEmail, 'Ben'), '/api/recipes');
    const family = async (e: string) =>
      (
        await database
          .select({ id: user.familyId })
          .from(user)
          .where(eq(user.email, e))
      )[0].id;
    anaFamily = await family(email);
    benFamily = await family(benEmail);
    const [existing] = await database.select().from(eatingMoments).limit(1);
    if (existing) moment = existing.id;
    else {
      moment = newId();
      momentCreated = true;
      await database.insert(eatingMoments).values({
        id: moment,
        name: `Copy ${stamp}`,
        normalizedName: `copy ${stamp}`,
        sortOrder: 0,
      });
    }
  });

  afterEach(async () => {
    // Copies first (they point at their sources), then Variants, then Bases.
    await database.delete(recipes).where(eq(recipes.familyId, anaFamily));
    await database.delete(recipes).where(eq(recipes.familyId, benFamily));
    await database
      .delete(recipes)
      .where(ilike(recipes.title, `%Copy ${stamp}-v%`));
    await database
      .delete(recipes)
      .where(ilike(recipes.title, `%Copy ${stamp}-%`));
  });

  afterAll(async () => {
    if (momentCreated) {
      await database.delete(eatingMoments).where(eq(eatingMoments.id, moment));
    }
    await app.close();
  });

  it('copies a Catalog Base into a Family Base with its content and no Source Link', async () => {
    const src = await makeBase();
    const first = (await copy(ana, src.id).expect(200)).body as {
      id: string;
      created: boolean;
    };
    expect(first.created).toBe(true);
    const id = first.id;
    expect(id).not.toBe(src.id);

    const made = await row(id);
    expect(made).toMatchObject({
      familyId: anaFamily,
      parentId: null,
      copiedFromId: src.id,
      title: `Copy ${stamp}-base`,
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 20,
      difficulty: 'medium',
      nutritionNote: 'Light on salt',
      sourceLink: null,
      archivedAt: null,
    });
    const lines = await database
      .select()
      .from(recipeIngredientLines)
      .where(eq(recipeIngredientLines.recipeId, id));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      ingredientId: seedId.ingredient('flour'),
      quantity: 200,
      unit: 'g',
      note: 'sifted',
    });
    expect(lines[0].id).not.toBe(src.lineId);
    const steps = await database
      .select()
      .from(recipeSteps)
      .where(eq(recipeSteps.recipeId, id))
      .orderBy(asc(recipeSteps.position));
    expect(steps.map((s) => [s.text, s.timerSeconds])).toEqual([
      ['Mix', 60],
      ['Bake', null],
    ]);
    const tips = await database
      .select()
      .from(recipeTips)
      .where(eq(recipeTips.recipeId, id))
      .orderBy(asc(recipeTips.position));
    expect(tips.map((t) => [t.text, t.stepId])).toEqual([
      ['Base tip', null],
      ['Step tip', steps[1].id],
    ]);
    const pairings = await database
      .select()
      .from(recipePairings)
      .where(eq(recipePairings.recipeId, id));
    expect(pairings).toHaveLength(1);
    expect(pairings[0]).toMatchObject({
      label: 'Red wine',
      linkedRecipeId: src.linked,
    });
    const moments = await database
      .select()
      .from(recipeEatingMoments)
      .where(eq(recipeEatingMoments.recipeId, id));
    expect(moments).toHaveLength(1);
    expect(moments[0]).toMatchObject({
      eatingMomentId: moment,
      polarity: 'good_for',
      reason: 'Hearty',
    });
  });

  it('copies a Catalog Variant into a Family Variant of the same Catalog Base, still inheriting its Tips', async () => {
    const base = await makeBase();
    const variantId = newId();
    await database.insert(recipes).values({
      id: variantId,
      parentId: base.id,
      title: `Copy ${stamp}-variant`,
      servings: 2,
    });
    await database.insert(recipeHiddenTips).values({
      recipeId: variantId,
      tipId: base.recipeTip,
    });
    await database.insert(recipeTips).values({
      id: newId(),
      recipeId: variantId,
      stepId: null,
      position: 0,
      text: 'Variant tip',
    });

    const id = await copyId(ana, variantId);
    expect(await row(id)).toMatchObject({
      familyId: anaFamily,
      parentId: base.id,
      copiedFromId: variantId,
    });
    const own = await database
      .select()
      .from(recipeTips)
      .where(eq(recipeTips.recipeId, id));
    expect(own.map((t) => t.text)).toEqual(['Variant tip']);
    const hidden = await database
      .select()
      .from(recipeHiddenTips)
      .where(eq(recipeHiddenTips.recipeId, id));
    expect(hidden.map((h) => h.tipId)).toEqual([base.recipeTip]);
  });

  it("writes the text in the Member's Catalog Language", async () => {
    const src = await makeBase();
    await database
      .insert(recipeTranslations)
      .values({ recipeId: src.id, locale: 'da', title: `Kopi ${stamp}-titel` });
    await database.insert(recipeStepTranslations).values({
      stepId: src.step1,
      locale: 'da',
      text: 'Bland',
    });
    await database.insert(recipeIngredientLineTranslations).values({
      lineId: src.lineId,
      locale: 'da',
      note: 'sigtet',
    });
    await storeLanguages(app, anaCookie, { catalogLanguage: 'da' });
    try {
      const id = await copyId(ana, src.id);
      expect((await row(id)).title).toBe(`Kopi ${stamp}-titel`);
      const steps = await database
        .select()
        .from(recipeSteps)
        .where(eq(recipeSteps.recipeId, id))
        .orderBy(asc(recipeSteps.position));
      expect(steps[0].text).toBe('Bland');
      const [line] = await database
        .select()
        .from(recipeIngredientLines)
        .where(eq(recipeIngredientLines.recipeId, id));
      expect(line.note).toBe('sigtet');
    } finally {
      await storeLanguages(app, anaCookie, { catalogLanguage: 'en' });
    }
  });

  it('is idempotent, including two adds at once, and makes a fresh copy after the copy is archived', async () => {
    const src = await makeBase();
    const [a, b] = await Promise.all([
      copyId(ana, src.id),
      copyId(ana, src.id),
    ]);
    expect(a).toBe(b);
    const again = (await copy(ana, src.id).expect(200)).body as {
      id: string;
      created: boolean;
    };
    expect(again).toEqual({ id: a, created: false });
    const live = await database
      .select()
      .from(recipes)
      .where(eq(recipes.copiedFromId, src.id));
    expect(live).toHaveLength(1);

    await ana.post(`/${a}/archive`).expect(200);
    const fresh = await copyId(ana, src.id);
    expect(fresh).not.toBe(a);
    expect((await row(a)).archivedAt).not.toBeNull();
    expect((await row(fresh)).archivedAt).toBeNull();
  });

  it('keeps the name of an Unmatched ingredient line', async () => {
    const src = await makeBase();
    await database.insert(recipeIngredientLines).values({
      id: newId(),
      recipeId: src.id,
      position: 5,
      rawName: 'Secret spice',
      normalizedName: 'secret spice',
    });
    const copy = await copyId(ana, src.id);
    const lines = await database
      .select()
      .from(recipeIngredientLines)
      .where(eq(recipeIngredientLines.recipeId, copy));
    expect(lines.find((l) => l.rawName === 'Secret spice')).toMatchObject({
      ingredientId: null,
      normalizedName: 'secret spice',
    });
  });

  it('queues the Unmatched lines of a copy for Admin matching, once', async () => {
    const src = await makeBase();
    await database.insert(recipeIngredientLines).values({
      id: newId(),
      recipeId: src.id,
      position: 6,
      rawName: 'Secret Spice',
      normalizedName: 'secret spice',
    });
    const copy = await copyId(ana, src.id);
    await copyId(ana, src.id);
    const queued = await database
      .select({ entry: unmatchedEntries })
      .from(unmatchedEntries)
      .innerJoin(
        recipeIngredientLines,
        eq(recipeIngredientLines.id, unmatchedEntries.ingredientLineId),
      )
      .where(eq(recipeIngredientLines.recipeId, copy));
    expect(queued).toHaveLength(1);
    expect(queued[0].entry).toMatchObject({
      rawName: 'Secret Spice',
      normalizedName: 'secret spice',
      source: 'recipe',
      locale: 'en',
    });
  });

  it('gives each Family its own copy', async () => {
    const src = await makeBase();
    const mine = await copyId(ana, src.id);
    const theirs = await copyId(ben, src.id);
    expect(mine).not.toBe(theirs);
    expect((await row(theirs)).familyId).toBe(benFamily);
  });

  it("refuses a Family Recipe, another Family's Recipe, an archived Catalog Recipe and an unknown id", async () => {
    const src = await makeBase();
    const mine = await copyId(ana, src.id);
    const own = await copy(ana, mine).expect(409);
    expect(own.body).toMatchObject({ code: 'recipes.copy_family_recipe' });
    const other = await copy(ben, mine).expect(404);
    expect(other.body).toMatchObject({ code: 'recipes.not_found' });

    const gone = await makeBase(`Copy ${stamp}-gone`);
    await database
      .update(recipes)
      .set({ archivedAt: new Date() })
      .where(eq(recipes.id, gone.id));
    const archived = await copy(ana, gone.id).expect(409);
    expect(archived.body).toMatchObject({ code: 'recipes.copy_archived' });

    await copy(ana, newId()).expect(404);
  });

  it('refuses a Variant whose Catalog Base is archived', async () => {
    const base = await makeBase(`Copy ${stamp}-oldbase`);
    const variantId = newId();
    await database.insert(recipes).values({
      id: variantId,
      parentId: base.id,
      title: `Copy ${stamp}-orphan`,
      servings: 2,
    });
    await database
      .update(recipes)
      .set({ archivedAt: new Date() })
      .where(eq(recipes.id, base.id));
    const res = await copy(ana, variantId).expect(409);
    expect(res.body).toMatchObject({ code: 'recipes.parent_archived' });
  });

  it('puts familyCopyId on Catalog list items: the live copy, null after Undo or for another Family', async () => {
    const src = await makeBase();
    const find = async (as: ReturnType<typeof client>) =>
      (
        (
          await as
            .get(
              `?locale=en&scope=catalog&search=${encodeURIComponent(`Copy ${stamp}-base`)}`,
            )
            .expect(200)
        ).body as { recipes: RecipeListItem[] }
      ).recipes.find((r) => r.id === src.id)!;
    expect((await find(ana)).familyCopyId).toBeNull();
    const id = await copyId(ana, src.id);
    expect((await find(ana)).familyCopyId).toBe(id);
    expect((await find(ben)).familyCopyId).toBeNull();
    await ana.post(`/${id}/archive`).expect(200);
    expect((await find(ana)).familyCopyId).toBeNull();
  });

  it('puts familyCopyId on the Catalog Recipe detail, preview Variants included', async () => {
    const src = await makeBase();
    const variantId = newId();
    await database.insert(recipes).values({
      id: variantId,
      parentId: src.id,
      title: `Copy ${stamp}-detail-variant`,
      servings: 2,
    });
    const detail = async (as: ReturnType<typeof client>) =>
      (await as.get(`/${src.id}?locale=en`).expect(200)).body as {
        familyCopyId: string | null;
        variants: { id: string; familyCopyId: string | null }[];
      };
    const variantCopy = async (as: ReturnType<typeof client>) =>
      (await detail(as)).variants.find((v) => v.id === variantId)!.familyCopyId;
    expect((await detail(ana)).familyCopyId).toBeNull();
    const id = await copyId(ana, src.id);
    expect((await detail(ana)).familyCopyId).toBe(id);
    expect((await detail(ben)).familyCopyId).toBeNull();
    expect(await variantCopy(ana)).toBeNull();
    const copiedVariant = await copyId(ana, variantId);
    expect(await variantCopy(ana)).toBe(copiedVariant);
    expect(await variantCopy(ben)).toBeNull();
    const viaVariant = (await ana.get(`/${variantId}?locale=en`).expect(200))
      .body as { base: { familyCopyId: string | null } };
    expect(viaVariant.base.familyCopyId).toBe(id);
    const own = (await ana.get(`/${id}?locale=en`).expect(200)).body as {
      familyCopyId: string | null;
    };
    expect(own.familyCopyId).toBeNull();
  });

  it('puts familyCopyId on a Pairing link to a Catalog Recipe: the live copy, null without one or for another Family', async () => {
    const src = await makeBase();
    const linkOf = async (as: ReturnType<typeof client>) =>
      (
        (await as.get(`/${src.id}?locale=en`).expect(200)).body as {
          guidance: {
            pairings: { link: { id: string; familyCopyId?: string | null } }[];
          };
        }
      ).guidance.pairings[0].link;
    expect((await linkOf(ana)).familyCopyId).toBeNull();
    const id = await copyId(ana, src.linked);
    expect(await linkOf(ana)).toMatchObject({
      id: src.linked,
      familyCopyId: id,
    });
    expect((await linkOf(ben)).familyCopyId).toBeNull();
    expect(await linkOf(ana)).toMatchObject({ owner: 'catalog' });
  });

  it('marks a Pairing link to a Family Recipe as family-owned, with no familyCopyId', async () => {
    const src = await makeBase();
    const own = (
      (
        await ana
          .post('', {
            title: `Copy ${stamp}-own`,
            servings: 2,
            locale: 'en',
            parentId: null,
            lines: [],
          })
          .expect(201)
      ).body as { id: string }
    ).id;
    const copied = await copyId(ana, src.id);
    await database
      .update(recipePairings)
      .set({ linkedRecipeId: own })
      .where(eq(recipePairings.recipeId, copied));
    const link = (
      (await ana.get(`/${copied}?locale=en`).expect(200)).body as {
        guidance: { pairings: { link: Record<string, unknown> }[] };
      }
    ).guidance.pairings[0].link;
    expect(link).toMatchObject({ type: 'recipe', id: own, owner: 'family' });
    expect(link.familyCopyId).toBeUndefined();
  });

  it("lists the Family's Variants of the Catalog Base on the copy's detail, and no one else's", async () => {
    const src = await makeBase();
    const id = await copyId(ana, src.id);
    const mine = newId();
    const theirs = newId();
    await database.insert(recipes).values([
      {
        id: mine,
        familyId: anaFamily,
        parentId: src.id,
        title: `Copy ${stamp}-mine`,
        servings: 2,
      },
      {
        id: theirs,
        familyId: benFamily,
        parentId: src.id,
        title: `Copy ${stamp}-theirs`,
        servings: 2,
      },
    ]);
    const ids = async () =>
      (
        (await ana.get(`/${id}?locale=en`).expect(200)).body as {
          variants: { id: string }[];
        }
      ).variants.map((v) => v.id);
    expect(await ids()).toEqual([mine]);
  });
  describe('Make a Variant draft on a copy', () => {
    type Draft = {
      parentId: string;
      title: string;
      lines: { quantity: number | null }[];
    };
    const draftOf = async (id: string) =>
      (await ana.get(`/${id}/variant-draft`).expect(200)).body as Draft;
    it('branches from the Catalog Base a copy was Copied From, prefilled from the copy', async () => {
      const src = await makeBase();
      const id = await copyId(ana, src.id);
      await database
        .update(recipes)
        .set({ title: `Copy ${stamp}-edited` })
        .where(eq(recipes.id, id));
      await database
        .update(recipeIngredientLines)
        .set({ quantity: 350 })
        .where(eq(recipeIngredientLines.recipeId, id));
      const draft = await draftOf(id);
      expect(draft.parentId).toBe(src.id);
      expect(draft.title).toBe(`Copy ${stamp}-edited`);
      expect(draft.lines[0].quantity).toBe(350);
      // The draft saves end to end under the Catalog Base.
      const saved = await ana
        .post('', {
          title: draft.title,
          servings: 2,
          locale: 'en',
          parentId: draft.parentId,
          lines: [
            {
              ingredientId: seedId.ingredient('flour'),
              quantity: 350,
              unit: 'g',
            },
          ],
          steps: [{ text: 'Mix' }],
        })
        .expect(201);
      expect((saved.body as { parentId: string }).parentId).toBe(src.id);
    });

    it('resolves a copy of a Catalog Variant to its Catalog Base, prefilled from the copy', async () => {
      const src = await makeBase();
      const variant = newId();
      await database.insert(recipes).values({
        id: variant,
        parentId: src.id,
        title: `Copy ${stamp}-variant`,
        servings: 2,
      });
      const id = await copyId(ana, variant);
      await database
        .update(recipes)
        .set({ title: `Copy ${stamp}-vedited` })
        .where(eq(recipes.id, id));
      const draft = await draftOf(id);
      expect(draft.parentId).toBe(src.id);
      expect(draft.title).toBe(`Copy ${stamp}-vedited`);
    });

    it('refuses with parent_archived when the Catalog Base is archived', async () => {
      const src = await makeBase();
      const variant = newId();
      await database.insert(recipes).values({
        id: variant,
        parentId: src.id,
        title: `Copy ${stamp}-variant2`,
        servings: 2,
      });
      const baseCopy = await copyId(ana, src.id);
      const variantCopy = await copyId(ana, variant);
      await database
        .update(recipes)
        .set({ archivedAt: new Date() })
        .where(eq(recipes.id, src.id));
      for (const id of [baseCopy, variantCopy]) {
        expect(
          (await ana.get(`/${id}/variant-draft`).expect(409)).body,
        ).toMatchObject({
          code: 'recipes.parent_archived',
        });
      }
    });

    it('still refuses a Family Base that is not a copy', async () => {
      const plain = newId();
      await database.insert(recipes).values({
        id: plain,
        familyId: anaFamily,
        title: `Copy ${stamp}-plain`,
        servings: 2,
      });
      expect(
        (await ana.get(`/${plain}/variant-draft`).expect(404)).body,
      ).toMatchObject({
        code: 'recipes.parent_not_found',
      });
    });

    it('reports the Catalog Base a copy came from on its detail', async () => {
      const src = await makeBase();
      const id = await copyId(ana, src.id);
      const detail = (await ana.get(`/${id}?locale=en`).expect(200)).body as {
        copiedFrom: { id: string; archived: boolean } | null;
      };
      expect(detail.copiedFrom).toEqual({ id: src.id, archived: false });
    });
  });
});
