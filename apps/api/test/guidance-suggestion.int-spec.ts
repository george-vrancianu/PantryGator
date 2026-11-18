import { jest } from '@jest/globals';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, count, eq, ilike } from 'drizzle-orm';
import type { StructuredOutputRequest } from '../src/ai/structured-output-ai.service';
import { StructuredOutputAiError } from '../src/ai/structured-output-ai.service';
import { seedId } from '../src/catalog/seed/seed-catalog';
import { DATABASE } from '../src/database/database.constants';
import type { Database } from '../src/database/database.types';
import {
  catalogTranslations,
  eatingMoments,
  ingredientAllergens,
  recipeEatingMoments,
  recipeIngredientLines,
  recipePairings,
  recipes,
  scanUsage,
  tags,
} from '../src/database/schema';
import type { GuidanceSuggestion } from '../src/recipes/guidance-suggestion.schemas';
import { ScanCapService } from '../src/scan/scan-cap.service';
import { client, signUp } from './support/admin-session';
import { catalogIndexIn } from './support/catalog-indices';
import { createTestApp } from './support/create-test-app';
import { promoteToAdmin } from './support/promote-to-admin';

jest.setTimeout(30_000);

const flour = seedId.ingredient('flour');

const recipe = (overrides: Record<string, unknown> = {}) => ({
  title: 'Pancakes 8841',
  servings: 4,
  lines: [
    { ingredientId: flour, quantity: 250, unit: 'g' },
    { ingredientId: null, rawName: 'grandma spice' },
  ],
  steps: [{ text: 'Whisk everything.' }, { text: 'Fry each side.' }],
  ...overrides,
});
const emptyGuidance = { nutritionNote: null, pairings: [], eatingMoments: [] };
/** An Eating Moment already on the form: that field is the Member's own, so it is not asked for. */
const filledMoments = [
  {
    eatingMomentId: '3f0c8a5e-6b1d-4c53-9a53-0d4f6f5e9a12',
    polarity: 'good_for',
    reason: null,
  },
];
const request = (guidance: object = emptyGuidance, extra: object = {}) => ({
  recipe: recipe(),
  guidance,
  ...extra,
});

describe('Suggest Guidance (integration)', () => {
  let app: NestFastifyApplication;
  let database: Database;
  let member: ReturnType<typeof client>;
  let settings: ReturnType<typeof client>;
  let cookieOf: string;
  const prompts: StructuredOutputRequest[] = [];
  let answer: () => Promise<{ data: unknown; requestId: string | null }>;
  const stamp = Date.now();
  let memberCount = 0;

  const respondWith = (data: unknown) => {
    answer = () => Promise.resolve({ data, requestId: 'fake-request' });
  };
  const suggest = (body: object, who = member) =>
    who.post('/suggest-guidance', body);
  const rowCounts = async () =>
    Promise.all(
      [recipes, recipeIngredientLines, recipePairings, recipeEatingMoments].map(
        async (table) =>
          (await database.select({ n: count() }).from(table))[0].n,
      ),
    );

  beforeAll(async () => {
    app = await createTestApp([], {
      generate: (input) => {
        prompts.push(input);
        return answer();
      },
    });
    database = app.get<Database>(DATABASE);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    const cookie = await signUp(
      app,
      `guidance-${stamp}-${++memberCount}@example.com`,
      'G',
    );
    cookieOf = cookie;
    member = client(app, cookie, '/api/recipes');
    settings = client(app, cookie, '/api/settings');
    prompts.length = 0;
    respondWith({
      nutritionNote: 'Filling and rich in carbs. Light on fibre.',
      pairings: null,
      eatingMoments: null,
    });
  });

  it('requires authentication', async () => {
    await client(app, '', '/api/recipes')
      .post('/suggest-guidance', request())
      .expect(401);
  });

  it('proposes a Nutrition Note for an empty one and writes nothing', async () => {
    const before = await rowCounts();
    const res = await suggest(request()).expect(200);

    expect(res.body as GuidanceSuggestion).toEqual({
      guidance: { nutritionNote: 'Filling and rich in carbs. Light on fibre.' },
      noSuggestions: ['pairings', 'eatingMoments'],
    });
    expect(prompts).toHaveLength(1);
    // The page's current content reaches the model, matched lines by name.
    expect(prompts[0].prompt).toContain('Pancakes 8841');
    expect(prompts[0].prompt).toContain('Flour');
    expect(prompts[0].prompt).toContain('grandma spice');
    expect(prompts[0].prompt).toContain('Fry each side.');
    expect(await rowCounts()).toEqual(before);
  });

  it('does not offer, propose or create Tags (#714)', async () => {
    const tagCount = async () =>
      (await database.select({ id: tags.id }).from(tags)).length;
    const tagWords = /tagIds|tagIndexes|"tags"/;
    const before = await tagCount();
    const res = await suggest(request()).expect(200);
    expect(JSON.stringify(res.body)).not.toMatch(tagWords);
    expect(prompts[0].prompt).not.toContain('Tags:');
    expect(JSON.stringify(prompts[0].schema)).not.toMatch(tagWords);
    expect(await tagCount()).toBe(before);
  });

  it('leaves the stored Recipe untouched when called with its recipeId', async () => {
    const created = await member
      .post('', {
        title: 'Stored 8841',
        servings: 2,
        locale: 'en',
        parentId: null,
        lines: [{ ingredientId: flour, quantity: 50, unit: 'g' }],
        steps: [{ text: 'Whisk' }],
      })
      .expect(201);
    const recipeId = (created.body as { id: string }).id;
    const stored = async () => ({
      row: (
        await database.select().from(recipes).where(eq(recipes.id, recipeId))
      )[0],
      counts: await rowCounts(),
    });
    const before = await stored();
    expect(before.row.nutritionNote).toBeNull();

    await suggest(request(emptyGuidance, { recipeId })).expect(200);

    expect(prompts).toHaveLength(1);
    expect(await stored()).toEqual(before);
  });

  it('refuses without an AI call when the Nutrition Note is filled', async () => {
    const res = await suggest(
      request({
        nutritionNote: 'Mine.',
        pairings: [{ kind: 'food', label: 'Mine', reason: 'Because.' }],
        eatingMoments: filledMoments,
      }),
    ).expect(400);
    expect((res.body as { code: string }).code).toBe(
      'guidance.nothing_to_suggest',
    );
    expect(prompts).toHaveLength(0);
  });

  it('accepts the Guidance of a form with Pairings and Eating Moments, and the id of the Recipe being edited', async () => {
    const res = await suggest(
      request(
        {
          ...emptyGuidance,
          pairings: [{ kind: 'food', label: 'Berries', reason: 'Fresh.' }],
        },
        { recipeId: '3f0c8a5e-6b1d-4c53-9a53-0d4f6f5e9a11' },
      ),
    ).expect(200);
    expect(
      (res.body as GuidanceSuggestion).guidance.nutritionNote,
    ).toBeTruthy();
  });

  it('accepts a page without a Title or Servings yet', async () => {
    await suggest({
      recipe: { lines: [], steps: [] },
      guidance: emptyGuidance,
    }).expect(200);
  });

  it('trims a note over 500 characters', async () => {
    respondWith({
      nutritionNote: `  ${'x'.repeat(700)}  `,
      pairings: null,
      eatingMoments: null,
    });
    const res = await suggest(request()).expect(200);
    expect(
      (res.body as GuidanceSuggestion).guidance.nutritionNote,
    ).toHaveLength(500);
  });

  it('reports a field with nothing to propose instead of filling it', async () => {
    respondWith({ nutritionNote: '   ', pairings: null, eatingMoments: null });
    const res = await suggest(request()).expect(200);
    expect(res.body as GuidanceSuggestion).toEqual({
      guidance: {},
      noSuggestions: ['pairings', 'nutritionNote', 'eatingMoments'],
    });
  });

  it('rejects an invalid Recipe or Guidance body', async () => {
    await suggest({ guidance: emptyGuidance }).expect(400);
    await suggest(request({ nutritionNote: 5 })).expect(400);
    expect(prompts).toHaveLength(0);
  });

  it('fails with a coded error when the answer is unusable, and when the provider fails', async () => {
    respondWith({ nope: true });
    const bad = await suggest(request()).expect(502);
    expect((bad.body as { code: string }).code).toBe('scan.result_invalid');

    answer = () => Promise.reject(new StructuredOutputAiError('failed', null));
    const down = await suggest(request()).expect(502);
    expect((down.body as { code: string }).code).toBe(
      'scan.provider_unavailable',
    );
  });

  it('writes in the language of the Recipe, falling back to the Catalog Language', async () => {
    await settings
      .put('/preferences', { locale: 'en', catalogLanguage: 'ro' })
      .expect(200);
    await suggest(request()).expect(200);
    expect(prompts[0].prompt).toContain('Romanian');
  });

  describe('Pairings', () => {
    const butter = seedId.ingredient('butter');
    const parmesan = seedId.ingredient('parmesan'); // milk
    const peanuts = seedId.ingredient('peanuts'); // peanuts
    const MILK = seedId.allergen('milk');
    const PEANUT = seedId.allergen('peanuts');
    const idea = (over: Record<string, unknown> = {}) => ({
      kind: 'food',
      label: 'Berries',
      reason: 'Fresh and tart.',
      principle: null,
      ingredientId: null,
      recipeId: null,
      ...over,
    });
    const propose = (...pairings: object[]) =>
      respondWith({ nutritionNote: null, pairings, eatingMoments: null });
    const pairingsOf = async (body: object = request()) =>
      ((await suggest(body).expect(200)).body as GuidanceSuggestion).guidance
        .pairings;
    const familyRecipe = async (who = member, title = 'Own dish') =>
      (
        await who
          .post('', {
            title: `${title} ${stamp}-${++recipeCount}`,
            servings: 2,
            locale: 'en',
            parentId: null,
            lines: [{ ingredientId: flour, quantity: 50, unit: 'g' }],
            steps: [{ text: 'Cook' }],
          })
          .expect(201)
      ).body as { id: string; title: string };
    let recipeCount = 0;
    let admin: ReturnType<typeof client>;

    beforeAll(async () => {
      const email = `guidance-admin-${stamp}@example.com`;
      const cookie = await signUp(app, email, 'Admin');
      await promoteToAdmin(database, email);
      admin = client(app, cookie, '/api/admin/recipes');
    });
    const catalogRecipe = async (ingredientId: string, title = 'Cat dish') =>
      (
        await admin
          .post('', {
            title: `${title} ${stamp}-${++recipeCount}`,
            servings: 4,
            lines: [{ ingredientId, quantity: 100, unit: 'g' }],
            steps: [{ text: 'Cook' }],
          })
          .expect(201)
      ).body as { id: string; title: string };

    it('proposes up to 10 Pairings with a kind, label, reason and principle, linked to an offered Ingredient and Recipe, named', async () => {
      const dish = await familyRecipe();
      propose(
        idea({
          label: 'Butter',
          principle: 'fat_carries_flavour',
          ingredientId: butter,
        }),
        idea({ kind: 'drink', label: 'Tea', recipeId: dish.id }),
      );
      const res = await suggest(request()).expect(200);
      expect(res.body as GuidanceSuggestion).toEqual({
        guidance: {
          pairings: [
            {
              kind: 'food',
              label: 'Butter',
              reason: 'Fresh and tart.',
              principle: 'fat_carries_flavour',
              linkedIngredientId: butter,
              linkedIngredientName: 'Butter',
              linkedRecipeId: null,
              linkedRecipeTitle: null,
            },
            {
              kind: 'drink',
              label: 'Tea',
              reason: 'Fresh and tart.',
              principle: null,
              linkedIngredientId: null,
              linkedIngredientName: null,
              linkedRecipeId: dish.id,
              linkedRecipeTitle: dish.title,
            },
          ],
        },
        noSuggestions: ['nutritionNote', 'eatingMoments'],
      });
      // The offered Ingredients (by index, never by id) and Recipes reach the model.
      expect(catalogIndexIn(prompts[0].prompt, 'Butter')).toEqual(
        expect.any(Number),
      );
      expect(prompts[0].prompt).not.toContain(butter);
      expect(prompts[0].prompt).toContain(dish.id);
      // A Pairing links only to exactly that Ingredient, never a looser match.
      expect(prompts[0].prompt).not.toContain('semantic match');
    });

    it('offers a Catalog Recipe and links to it', async () => {
      const cat = await catalogRecipe(flour);
      propose(idea({ recipeId: cat.id }));
      const pairings = await pairingsOf();
      expect(pairings?.[0].linkedRecipeId).toBe(cat.id);
      expect(prompts[0].prompt).toContain(cat.id);
    });

    it('keeps a link the model was not offered, or gave as a UUID in place of an index, as an unlinked label', async () => {
      const archived = await familyRecipe(member, 'Archived');
      await member.post(`/${archived.id}/archive`).expect(200);
      propose(
        idea({
          label: 'A',
          ingredientIndex: '3f0c8a5e-6b1d-4c53-9a53-0d4f6f5e9a11',
        }),
        idea({ label: 'B', recipeId: '3f0c8a5e-6b1d-4c53-9a53-0d4f6f5e9a12' }),
        idea({ label: 'C', recipeId: archived.id }),
        idea({ label: 'D', ingredientIndex: 100_000 }),
        idea({ label: 'E', ingredientIndex: -1 }),
        idea({ label: 'F', ingredientIndex: 2.5 }),
      );
      const pairings = await pairingsOf();
      expect(pairings?.map((p) => p.label)).toEqual([
        'A',
        'B',
        'C',
        'D',
        'E',
        'F',
      ]);
      for (const p of pairings ?? []) {
        expect(p.linkedIngredientId).toBeNull();
        expect(p.linkedRecipeId).toBeNull();
      }
      expect(prompts[0].prompt).not.toContain(archived.id);
    });

    it("does not link to another Family's Recipe", async () => {
      const outsider = client(
        app,
        await signUp(
          app,
          `guidance-out-${stamp}-${++memberCount}@example.com`,
          'O',
        ),
        '/api/recipes',
      );
      const theirs = await familyRecipe(outsider, 'Theirs');
      propose(idea({ recipeId: theirs.id }));
      const pairings = await pairingsOf();
      expect(pairings).toHaveLength(1);
      expect(pairings?.[0].linkedRecipeId).toBeNull();
      expect(prompts[0].prompt).not.toContain(theirs.id);
    });

    it("ignores another Family's recipeId, and never links the Recipe itself", async () => {
      const outsider = client(
        app,
        await signUp(
          app,
          `guidance-out-${stamp}-${++memberCount}@example.com`,
          'O',
        ),
        '/api/recipes',
      );
      const theirs = await familyRecipe(outsider, 'Theirs');
      const mine = await familyRecipe();
      const other = await familyRecipe(member, 'Sibling');
      propose(
        idea({ label: 'Self', recipeId: mine.id }),
        idea({ label: 'Sibling', recipeId: other.id }),
      );
      const pairings = await pairingsOf(
        request(emptyGuidance, { recipeId: mine.id }),
      );
      expect(pairings?.[0].linkedRecipeId).toBeNull();
      expect(pairings?.[1].linkedRecipeId).toBe(other.id);
      expect(prompts[0].prompt).not.toContain(mine.id);

      // Another Family's id behaves like no id: nothing leaks, nothing changes.
      await pairingsOf(request(emptyGuidance, { recipeId: theirs.id }));
      expect(prompts[1].prompt).toContain(mine.id);
      expect(prompts[1].prompt).not.toContain(theirs.id);
    });

    it("names a Member's Allergy in the prompt and drops Pairings linked to it", async () => {
      const unsafeRecipe = await catalogRecipe(parmesan, 'Cheesy');
      const safeRecipe = await catalogRecipe(flour, 'Plain');
      await settings.put('/allergies', { allergenIds: [MILK] }).expect(200);
      propose(
        idea({ label: 'Cheesy dish', recipeId: unsafeRecipe.id }),
        idea({ label: 'Plain dish', recipeId: safeRecipe.id }),
        idea({ label: 'Berries' }),
      );
      const pairings = await pairingsOf();
      expect(pairings?.map((p) => p.label)).toEqual(['Plain dish', 'Berries']);
      expect(prompts[0].prompt).toContain('Milk');
      // An Ingredient with the Allergen is never offered, so the model cannot link to it.
      expect(() => catalogIndexIn(prompts[0].prompt, 'Parmesan')).toThrow();
    });

    it("names the Member's Allergies in their Catalog Language", async () => {
      await settings
        .put('/preferences', { locale: 'en', catalogLanguage: 'ro' })
        .expect(200);
      await settings.put('/allergies', { allergenIds: [MILK] }).expect(200);
      const roName = (
        await database
          .select({ value: catalogTranslations.value })
          .from(catalogTranslations)
          .where(
            and(
              eq(catalogTranslations.entityType, 'allergen'),
              eq(catalogTranslations.entityId, MILK),
              eq(catalogTranslations.locale, 'ro'),
              eq(catalogTranslations.kind, 'name'),
            ),
          )
      )[0].value;
      expect(roName).not.toBe('Milk');
      propose(idea());
      await pairingsOf();
      expect(prompts[0].prompt).toContain(`Allergies to: ${roName}.`);
    });

    it('avoids the Allergies of the other Members of the Family', async () => {
      const invite = (
        await client(app, cookieOf, '/api/family').get('').expect(200)
      ).body as { inviteCode: string };
      const benCookie = await signUp(
        app,
        `guidance-ben-${stamp}-${++memberCount}@example.com`,
        'Ben',
      );
      await client(app, benCookie, '/api/family')
        .post('/join', { code: invite.inviteCode })
        .expect(201);
      await client(app, benCookie, '/api/settings')
        .put('/allergies', { allergenIds: [PEANUT] })
        .expect(200);
      const unsafe = await catalogRecipe(peanuts, 'Nutty');
      propose(idea({ label: 'Nutty dish', recipeId: unsafe.id }));
      expect(await pairingsOf()).toBeUndefined();
      expect(prompts[0].prompt).toContain('Peanuts');
      expect(() => catalogIndexIn(prompts[0].prompt, 'Peanuts')).toThrow();
    });

    it('avoids a Family Allergy', async () => {
      await settings
        .post('/family-allergies', { allergenId: MILK })
        .expect(201);
      const unsafe = await catalogRecipe(parmesan, 'Cheesy');
      propose(idea({ label: 'Cheesy dish', recipeId: unsafe.id }));
      const res = await suggest(request()).expect(200);
      expect(res.body as GuidanceSuggestion).toEqual({
        guidance: {},
        noSuggestions: ['pairings', 'nutritionNote', 'eatingMoments'],
      });
      expect(prompts[0].prompt).toContain('Milk');
      expect(() => catalogIndexIn(prompts[0].prompt, 'Parmesan')).toThrow();
    });

    it('ignores an optional Ingredient Line when judging a Recipe', async () => {
      await settings.put('/allergies', { allergenIds: [MILK] }).expect(200);
      const optional = (
        await admin
          .post('', {
            title: `Optional ${stamp}-${++recipeCount}`,
            servings: 2,
            lines: [
              { ingredientId: flour, quantity: 1, unit: 'g' },
              {
                ingredientId: parmesan,
                quantity: 1,
                unit: 'g',
                optional: true,
              },
            ],
            steps: [{ text: 'Cook' }],
          })
          .expect(201)
      ).body as { id: string };
      propose(idea({ recipeId: optional.id }));
      expect((await pairingsOf())?.[0].linkedRecipeId).toBe(optional.id);
    });

    it('trims to 10 Pairings and to the label and reason lengths, instead of rejecting', async () => {
      propose(
        idea({ label: 'L'.repeat(300), reason: 'R'.repeat(1500) }),
        ...Array.from({ length: 14 }, (_, i) => idea({ label: `Extra ${i}` })),
      );
      const pairings = await pairingsOf();
      expect(pairings).toHaveLength(10);
      expect(pairings?.[0].label).toHaveLength(200);
      expect(pairings?.[0].reason).toHaveLength(1000);
    });

    it('clips emoji-heavy label and reason to the save limits in UTF-16 units, without splitting a pair', async () => {
      propose(
        idea({ label: `a${'😀'.repeat(300)}`, reason: `a${'😀'.repeat(900)}` }),
      );
      const [pairing] = (await pairingsOf()) ?? [];
      expect(pairing.label.length).toBeLessThanOrEqual(200);
      expect(pairing.reason.length).toBeLessThanOrEqual(1000);
      expect(pairing.label).toBe(`a${'😀'.repeat(99)}`);
      expect(pairing.reason).toBe(`a${'😀'.repeat(499)}`);
    });

    it('drops an unknown principle but keeps the Pairing, and skips unusable ones', async () => {
      propose(
        idea({ label: 'Wine', principle: 'because_i_said_so' }),
        idea({ label: '   ' }),
        idea({ label: 'Odd', kind: 'dessert' }),
      );
      const pairings = await pairingsOf();
      expect(pairings).toHaveLength(1);
      expect(pairings?.[0]).toMatchObject({ label: 'Wine', principle: null });
    });

    it('keeps Pairings already on the form: no replacing, no topping up', async () => {
      respondWith({
        nutritionNote: 'A note.',
        pairings: [idea()],
        eatingMoments: null,
      });
      const res = await suggest(
        request({
          ...emptyGuidance,
          pairings: [{ kind: 'food', label: 'Mine', reason: 'Because.' }],
        }),
      ).expect(200);
      expect(res.body as GuidanceSuggestion).toEqual({
        guidance: { nutritionNote: 'A note.' },
        noSuggestions: ['eatingMoments'],
      });
    });

    it('drops a Recipe whose required line has an avoided Allergen on an Unchecked Ingredient', async () => {
      await settings.put('/allergies', { allergenIds: [MILK] }).expect(200);
      // A Family Ingredient nobody has marked as checked, with a milk tag stored on it.
      const unchecked = (
        await client(app, cookieOf, '/api')
          .post('/catalog/family-ingredients?locale=en', {
            name: `Mystery ${stamp}-${++recipeCount}`,
            leafCategoryId: seedId.leaf('ground-spices'),
            defaultUnit: 'g',
          })
          .expect(201)
      ).body as { id: string };
      await database
        .insert(ingredientAllergens)
        .values({ ingredientId: unchecked.id, allergenId: MILK });
      const dish = (
        await member
          .post('', {
            title: `Mystery dish ${stamp}-${++recipeCount}`,
            servings: 2,
            locale: 'en',
            parentId: null,
            lines: [{ ingredientId: unchecked.id, quantity: 1, unit: 'g' }],
            steps: [{ text: 'Cook' }],
          })
          .expect(201)
      ).body as { id: string };
      propose(idea({ label: 'Mystery', recipeId: dish.id }), idea());
      const pairings = await pairingsOf();
      expect(pairings?.map((p) => p.label)).toEqual(['Berries']);
    });

    it('leaves Pairings alone when a row is started, even without its reason', async () => {
      respondWith({
        nutritionNote: 'A note.',
        pairings: [idea()],
        eatingMoments: null,
      });
      const res = await suggest(
        request({
          ...emptyGuidance,
          pairings: [{ kind: 'food', label: 'Half way', reason: '' }],
        }),
      ).expect(200);
      expect(res.body as GuidanceSuggestion).toEqual({
        guidance: { nutritionNote: 'A note.' },
        noSuggestions: ['eatingMoments'],
      });

      // With the note filled too, nothing is left to ask for.
      await suggest(
        request({
          nutritionNote: 'Mine.',
          pairings: [{ kind: 'food', label: '', reason: 'Why' }],
          eatingMoments: filledMoments,
        }),
      ).expect(400);
    });

    it('treats a row with nothing in it as empty', async () => {
      propose(idea());
      const res = await suggest(
        request({
          ...emptyGuidance,
          pairings: [{ kind: 'food', label: '', reason: '' }],
        }),
      ).expect(200);
      expect((res.body as GuidanceSuggestion).guidance.pairings).toHaveLength(
        1,
      );
    });

    it('reports no suggestions for Pairings when the model has none', async () => {
      propose();
      const res = await suggest(request()).expect(200);
      expect((res.body as GuidanceSuggestion).noSuggestions).toContain(
        'pairings',
      );
    });
  });

  describe('Eating Moments', () => {
    const tag = `${stamp}`.slice(-8);
    const ids = {
      brunch: crypto.randomUUID(),
      supper: crypto.randomUUID(),
      picnic: crypto.randomUUID(),
      retired: crypto.randomUUID(),
    };
    const use = (id: string, polarity = 'good_for', reason = 'Because.') => ({
      eatingMomentId: id,
      polarity,
      reason,
    });
    const propose = (...eatingMoments: object[]) =>
      respondWith({ nutritionNote: null, pairings: null, eatingMoments });
    const momentsOf = async (body: object = request()) =>
      ((await suggest(body).expect(200)).body as GuidanceSuggestion).guidance
        .eatingMoments;

    beforeAll(async () => {
      await database.insert(eatingMoments).values(
        (
          [
            ['brunch', 'Brunch', null],
            ['supper', 'Supper', null],
            ['picnic', 'Picnic', null],
            ['retired', 'Retired', new Date()],
          ] as const
        ).map(([key, name, archivedAt], i) => ({
          id: ids[key],
          name: `${name} ${tag}`,
          normalizedName: `${name} ${tag}`.toLowerCase(),
          sortOrder: 5000 + i,
          archivedAt,
        })),
      );
    });

    afterAll(async () => {
      await database
        .delete(eatingMoments)
        .where(ilike(eatingMoments.name, `%${tag}%`));
    });

    it('offers only unarchived Eating Moments, by id, and proposes Good for and Avoid with reasons', async () => {
      propose(
        use(ids.brunch, 'good_for', '  Light and quick.  '),
        use(ids.supper, 'avoid', 'Too light to fill a supper.'),
      );
      const before = await rowCounts();
      const res = await suggest(request()).expect(200);
      expect(res.body as GuidanceSuggestion).toEqual({
        guidance: {
          eatingMoments: [
            use(ids.brunch, 'good_for', 'Light and quick.'),
            use(ids.supper, 'avoid', 'Too light to fill a supper.'),
          ],
        },
        noSuggestions: ['pairings', 'nutritionNote'],
      });
      const { prompt } = prompts[0];
      for (const id of [ids.brunch, ids.supper, ids.picnic]) {
        expect(prompt).toContain(id);
      }
      expect(prompt).not.toContain(ids.retired);
      expect(await rowCounts()).toEqual(before);
    });

    it('drops unknown and archived ids', async () => {
      propose(
        use(crypto.randomUUID()),
        use(ids.retired),
        use('not-an-id'),
        use(ids.picnic),
      );
      expect(await momentsOf()).toEqual([use(ids.picnic)]);
    });

    it('keeps the first use of a moment: never twice, never both Good for and Avoid', async () => {
      propose(
        use(ids.brunch, 'avoid', 'First.'),
        use(ids.brunch, 'good_for', 'Conflict.'),
        use(ids.brunch, 'avoid', 'Again.'),
        use(ids.supper, 'good_for', 'Fine.'),
      );
      expect(await momentsOf()).toEqual([
        use(ids.brunch, 'avoid', 'First.'),
        use(ids.supper, 'good_for', 'Fine.'),
      ]);
    });

    it('drops an unknown polarity and keeps a blank reason as none', async () => {
      propose(use(ids.brunch, 'maybe'), use(ids.supper, 'good_for', '   '));
      expect(await momentsOf()).toEqual([
        { eatingMomentId: ids.supper, polarity: 'good_for', reason: null },
      ]);
    });

    it('trims long reasons instead of rejecting them', async () => {
      propose(use(ids.brunch, 'good_for', `  ${'r'.repeat(1500)}  `));
      const moments = await momentsOf();
      expect(moments?.[0].reason).toHaveLength(1000);
    });

    it('clips an emoji-heavy reason to 1000 UTF-16 units, without splitting a pair', async () => {
      propose(use(ids.brunch, 'good_for', `a${'😀'.repeat(900)}`));
      const moments = await momentsOf();
      expect(moments?.[0].reason).toBe(`a${'😀'.repeat(499)}`);
    });

    it('trims to 10 Eating Moments', async () => {
      const real = Array.from({ length: 12 }, () => crypto.randomUUID());
      await database.insert(eatingMoments).values(
        real.map((id, i) => ({
          id,
          name: `Real ${tag} ${i}`,
          normalizedName: `real ${tag} ${i}`,
          sortOrder: 7000 + i,
        })),
      );
      propose(...real.map((id) => use(id)));
      expect(await momentsOf()).toHaveLength(10);
    });

    it('keeps Eating Moments already on the form: not asked, not returned', async () => {
      respondWith({
        nutritionNote: 'A note.',
        pairings: null,
        eatingMoments: [use(ids.brunch)],
      });
      const res = await suggest(
        request({ ...emptyGuidance, eatingMoments: [use(ids.supper)] }),
      ).expect(200);
      expect(res.body as GuidanceSuggestion).toEqual({
        guidance: { nutritionNote: 'A note.' },
        noSuggestions: ['pairings'],
      });
      expect(prompts[0].prompt).not.toContain(ids.brunch);
      expect(prompts[0].prompt).not.toContain('eatingMoments:');
    });

    it('reports no suggestions and hands the use back when every moment was dropped', async () => {
      propose(use(crypto.randomUUID()), use(ids.retired));
      const cookie = await signUp(
        app,
        `guidance-moments-${stamp}-${++memberCount}@example.com`,
        'M',
      );
      const who = client(app, cookie, '/api/recipes');
      const memberId = (
        (await client(app, cookie, '/api/auth').get('/get-session')).body as {
          user: { id: string };
        }
      ).user.id;
      for (let i = 0; i < 3; i++) {
        const res = await suggest(
          request({ ...emptyGuidance, nutritionNote: 'Mine.' }),
          who,
        ).expect(200);
        expect(res.body as GuidanceSuggestion).toEqual({
          guidance: {},
          noSuggestions: ['pairings', 'eatingMoments'],
        });
      }
      const [row] = await database
        .select({ count: scanUsage.count })
        .from(scanUsage)
        .where(
          and(eq(scanUsage.memberId, memberId), eq(scanUsage.kind, 'guidance')),
        );
      expect(row?.count ?? 0).toBe(0);
    });
  });

  describe('the Guidance Cap', () => {
    // The test env sets GUIDANCE_DAILY_CAP to 2 and LINK_DAILY_CAP to 2.
    let cookie: string;
    let memberId: string;
    const usage = async (kind: 'guidance' | 'link') =>
      (
        await database
          .select({ count: scanUsage.count })
          .from(scanUsage)
          .where(
            and(eq(scanUsage.memberId, memberId), eq(scanUsage.kind, kind)),
          )
      )[0]?.count ?? 0;

    beforeEach(async () => {
      cookie = await signUp(
        app,
        `guidance-cap-${stamp}-${++memberCount}@example.com`,
        'C',
      );
      member = client(app, cookie, '/api/recipes');
      memberId = (
        (await client(app, cookie, '/api/auth').get('/get-session')).body as {
          user: { id: string };
        }
      ).user.id;
    });

    it('counts a request that gets a proposal and refuses the next at the cap with the time it lifts and no AI call', async () => {
      await suggest(request()).expect(200);
      expect(await usage('guidance')).toBe(1);
      await suggest(request()).expect(200);
      expect(prompts).toHaveLength(2);

      const res = await suggest(request()).expect(429);
      const body = res.body as {
        code: string;
        params: { cap: number; resetsAt: string };
      };
      expect(body.code).toBe('guidance.cap_reached');
      expect(body.params.cap).toBe(2);
      const resetsAt = Date.parse(body.params.resetsAt);
      expect(resetsAt).toBeGreaterThan(Date.now());
      expect(resetsAt - Date.now()).toBeLessThanOrEqual(86_400_000);
      expect(new Date(resetsAt).toISOString()).toMatch(/T00:00:00\.000Z$/);
      expect(prompts).toHaveLength(2);
      expect(await usage('guidance')).toBe(2);
    });

    it('hands back a request the provider failed or whose answer was unusable', async () => {
      answer = () =>
        Promise.reject(new StructuredOutputAiError('failed', null));
      await suggest(request()).expect(502);
      respondWith({ nope: true });
      await suggest(request()).expect(502);
      expect(await usage('guidance')).toBe(0);

      respondWith({
        nutritionNote: 'Rich and filling.',
        pairings: null,
        eatingMoments: null,
      });
      await suggest(request()).expect(200);
      await suggest(request()).expect(200);
      await suggest(request()).expect(429);
    });

    it('hands back a request where no field got a proposal, as a normal answer', async () => {
      respondWith({ nutritionNote: null, pairings: null, eatingMoments: null });
      for (let i = 0; i < 3; i++) {
        const res = await suggest(request()).expect(200);
        expect(res.body as GuidanceSuggestion).toEqual({
          guidance: {},
          noSuggestions: ['pairings', 'nutritionNote', 'eatingMoments'],
        });
      }
      expect(await usage('guidance')).toBe(0);
    });

    it('does not count the refusal when no field is empty', async () => {
      const res = await suggest(
        request({
          nutritionNote: 'Already written.',
          pairings: [{ kind: 'food', label: 'Mine', reason: 'Because.' }],
          eatingMoments: filledMoments,
        }),
      ).expect(400);
      expect((res.body as { code: string }).code).toBe(
        'guidance.nothing_to_suggest',
      );
      await suggest(request()).expect(200);
      expect(await usage('guidance')).toBe(1);
    });

    it('is separate from the Link Cap in both directions', async () => {
      const caps = app.get(ScanCapService);
      await suggest(request()).expect(200);
      await suggest(request()).expect(200);
      await suggest(request()).expect(429);
      // A full Guidance Cap leaves the Link Cap alone.
      await caps.consume(memberId, new Date(), 'link');
      await caps.consume(memberId, new Date(), 'link');
      await expect(
        caps.consume(memberId, new Date(), 'link'),
      ).rejects.toMatchObject({ code: 'link.cap_reached' });

      // A full Link Cap, in turn, leaves Suggest Guidance alone.
      const other = await signUp(
        app,
        `guidance-cap-link-${stamp}-${++memberCount}@example.com`,
        'L',
      );
      const otherId = (
        (await client(app, other, '/api/auth').get('/get-session')).body as {
          user: { id: string };
        }
      ).user.id;
      await caps.consume(otherId, new Date(), 'link');
      await caps.consume(otherId, new Date(), 'link');
      await suggest(request(), client(app, other, '/api/recipes')).expect(200);
      expect(await usage('link')).toBe(2);
    });
  });
});
