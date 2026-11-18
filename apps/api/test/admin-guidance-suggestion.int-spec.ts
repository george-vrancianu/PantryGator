import { jest } from '@jest/globals';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { count, eq, ilike } from 'drizzle-orm';
import type { StructuredOutputRequest } from '../src/ai/structured-output-ai.service';
import { seedId } from '../src/catalog/seed/seed-catalog';
import { DATABASE } from '../src/database/database.constants';
import type { Database } from '../src/database/database.types';
import {
  eatingMoments,
  family,
  ingredients,
  recipeEatingMoments,
  recipePairings,
  recipes,
  scanUsage,
} from '../src/database/schema';
import type { GuidanceSuggestion } from '../src/recipes/guidance-suggestion.schemas';
import { client, signUp } from './support/admin-session';
import { createTestApp } from './support/create-test-app';
import { promoteToAdmin } from './support/promote-to-admin';

jest.setTimeout(30_000);

const flour = seedId.ingredient('flour');
const MILK = seedId.allergen('milk');
const emptyGuidance = { nutritionNote: null, pairings: [], eatingMoments: [] };

describe('Suggest Guidance for a Catalog Recipe (integration)', () => {
  let app: NestFastifyApplication;
  let database: Database;
  let admin: ReturnType<typeof client>;
  let member: ReturnType<typeof client>;
  let adminSettings: ReturnType<typeof client>;
  let adminId: string;
  let familyId: string;
  let familyRecipeId: string;
  let familyIngredientId: string;
  const prompts: StructuredOutputRequest[] = [];
  let answer: () => Promise<{ data: unknown; requestId: string | null }>;
  const stamp = Date.now();
  let n = 0;
  const tag = `${stamp}`.slice(-8);
  const brunch = crypto.randomUUID();
  const retired = crypto.randomUUID();

  const respondWith = (data: unknown) => {
    answer = () => Promise.resolve({ data, requestId: 'fake-request' });
  };
  const idea = (over: Record<string, unknown> = {}) => ({
    kind: 'food',
    label: 'Berries',
    reason: 'Fresh and tart.',
    principle: null,
    ingredientId: null,
    recipeId: null,
    ...over,
  });
  const propose = (data: Record<string, unknown>) =>
    respondWith({
      nutritionNote: null,
      pairings: null,
      eatingMoments: null,
      ...data,
    });
  const request = (guidance: object = emptyGuidance, extra: object = {}) => ({
    recipe: {
      title: 'Catalog stew',
      servings: 4,
      lines: [{ ingredientId: flour, quantity: 250, unit: 'g' }],
      steps: [{ text: 'Simmer slowly.' }],
    },
    guidance,
    ...extra,
  });
  const suggest = (body: object, who = admin) =>
    who.post('/suggest-guidance', body);
  const catalogRecipe = async (title: string) =>
    (
      await admin
        .post('', {
          title: `${title} ${stamp}-${++n}`,
          servings: 4,
          lines: [{ ingredientId: flour, quantity: 100, unit: 'g' }],
          steps: [{ text: 'Cook' }],
        })
        .expect(201)
    ).body as { id: string; title: string };
  const rowCounts = async () =>
    Promise.all(
      [recipes, recipePairings, recipeEatingMoments].map(
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
    const email = `sg-admin-${stamp}@example.com`;
    const cookie = await signUp(app, email, 'Admin');
    await promoteToAdmin(database, email);
    admin = client(app, cookie, '/api/admin/recipes');
    adminSettings = client(app, cookie, '/api/settings');
    adminId = (
      (await client(app, cookie, '/api/auth').get('/get-session')).body as {
        user: { id: string };
      }
    ).user.id;
    const memberCookie = await signUp(
      app,
      `sg-member-${stamp}@example.com`,
      'M',
    );
    member = client(app, memberCookie, '/api/admin/recipes');

    familyId = crypto.randomUUID();
    await database.insert(family).values({
      id: familyId,
      inviteCode: `sg${stamp}`,
      inviteCodeExpiresAt: new Date(),
    });
    familyRecipeId = crypto.randomUUID();
    await database.insert(recipes).values({
      id: familyRecipeId,
      familyId,
      title: `Family dish ${stamp}`,
      servings: 2,
    });
    familyIngredientId = crypto.randomUUID();
    const [sample] = await database
      .select()
      .from(ingredients)
      .where(eq(ingredients.id, flour));
    await database.insert(ingredients).values({
      ...sample,
      id: familyIngredientId,
      ownerFamilyId: familyId,
      name: `Family flour ${stamp}`,
      normalizedName: `family flour ${stamp}`,
    });
    await database.insert(eatingMoments).values(
      (
        [
          [brunch, 'Brunch', null],
          [retired, 'Retired', new Date()],
        ] as const
      ).map(([id, name, archivedAt], i) => ({
        id,
        name: `${name} ${tag}`,
        normalizedName: `${name} ${tag}`.toLowerCase(),
        sortOrder: 6000 + i,
        archivedAt,
      })),
    );
  });
  afterAll(async () => {
    await database
      .delete(ingredients)
      .where(eq(ingredients.id, familyIngredientId));
    await database.delete(recipes).where(ilike(recipes.title, `%${stamp}%`));
    await database.delete(family).where(eq(family.id, familyId));
    await database
      .delete(eatingMoments)
      .where(ilike(eatingMoments.name, `%${tag}%`));
    await app.close();
  });
  beforeEach(() => {
    prompts.length = 0;
    propose({ nutritionNote: 'Hearty and filling. Light on greens.' });
  });

  it('proposes Guidance for the empty fields and writes nothing', async () => {
    const before = await rowCounts();
    propose({
      nutritionNote: 'Hearty and filling. Light on greens.',
      pairings: [idea({ label: 'Crusty bread' })],
      eatingMoments: [
        { eatingMomentId: brunch, polarity: 'good_for', reason: 'Warming.' },
      ],
    });
    const res = await suggest(request()).expect(200);
    const body = res.body as GuidanceSuggestion;
    expect(body.guidance.nutritionNote).toBe(
      'Hearty and filling. Light on greens.',
    );
    expect(body.guidance.pairings?.map((p) => p.label)).toEqual([
      'Crusty bread',
    ]);
    expect(body.guidance.eatingMoments?.[0].eatingMomentId).toBe(brunch);
    expect(body.noSuggestions).toEqual([]);
    expect(prompts[0].prompt).toContain('Catalog stew');
    expect(prompts[0].prompt).toContain('Simmer slowly.');
    expect(await rowCounts()).toEqual(before);
  });

  it('keeps a half-filled line: an Unmatched name reaches the prompt', async () => {
    await suggest(
      request(emptyGuidance, {
        recipe: {
          title: 'Catalog stew',
          servings: 4,
          lines: [{ ingredientId: null, rawName: 'saffron threads' }],
          steps: [],
        },
      }),
    ).expect(200);
    expect(prompts[0].prompt).toContain('saffron threads');
  });

  it('asks only for the empty fields', async () => {
    const res = await suggest(
      request({
        nutritionNote: 'Mine.',
        pairings: [{ kind: 'food', label: 'Mine', reason: 'Because.' }],
        eatingMoments: [],
      }),
    ).expect(200);
    expect(prompts[0].prompt).toContain('eatingMoments:');
    expect(prompts[0].prompt).not.toContain('nutritionNote:');
    expect(prompts[0].prompt).not.toContain('pairings:');
    expect((res.body as GuidanceSuggestion).guidance).toEqual({});
  });

  it('refuses without an AI call when no field is empty', async () => {
    const res = await suggest(
      request({
        nutritionNote: 'Mine.',
        pairings: [{ kind: 'food', label: 'Mine', reason: 'Because.' }],
        eatingMoments: [
          { eatingMomentId: brunch, polarity: 'good_for', reason: null },
        ],
      }),
    ).expect(400);
    expect((res.body as { code: string }).code).toBe(
      'guidance.nothing_to_suggest',
    );
    expect(prompts).toHaveLength(0);
  });

  it('offers only unarchived Eating Moments', async () => {
    await suggest(request()).expect(200);
    expect(prompts[0].prompt).toContain(brunch);
    expect(prompts[0].prompt).not.toContain(retired);
  });

  it('links only to Catalog Ingredients and Recipes, never to a Family Recipe, nor the Recipe itself', async () => {
    const cat = await catalogRecipe('Catalog side');
    const self = await catalogRecipe('Catalog self');
    propose({
      pairings: [
        idea({ label: 'Catalog side', recipeId: cat.id }),
        idea({ label: 'Family dish', recipeId: familyRecipeId }),
        idea({ label: 'Itself', recipeId: self.id }),
        idea({ label: 'Flour', ingredientId: flour }),
        idea({ label: 'Family flour', ingredientId: familyIngredientId }),
      ],
    });
    const res = await suggest(
      request(emptyGuidance, { recipeId: self.id }),
    ).expect(200);
    const pairings = (res.body as GuidanceSuggestion).guidance.pairings ?? [];
    expect(pairings.map((p) => [p.label, p.linkedRecipeId])).toEqual([
      ['Catalog side', cat.id],
      ['Family dish', null],
      ['Itself', null],
      ['Flour', null],
      ['Family flour', null],
    ]);
    expect(pairings[3].linkedIngredientId).toBe(flour);
    expect(pairings[4].linkedIngredientId).toBeNull();
    expect(prompts[0].prompt).toContain(cat.id);
    expect(prompts[0].prompt).not.toContain(familyRecipeId);
    expect(prompts[0].prompt).not.toContain(self.id);
  });

  it('considers no Allergies, even the Admin’s own', async () => {
    await adminSettings.put('/allergies', { allergenIds: [MILK] }).expect(200);
    try {
      await suggest(request()).expect(200);
      expect(prompts[0].prompt).toContain('No Allergies are known.');
      expect(prompts[0].prompt).not.toContain('Allergies to');
    } finally {
      await adminSettings.put('/allergies', { allergenIds: [] }).expect(200);
    }
  });

  it("writes in the Catalog's base language, whatever the Admin's own Preferences", async () => {
    await adminSettings
      .put('/preferences', { locale: 'ro', catalogLanguage: 'ro' })
      .expect(200);
    await suggest(request()).expect(200);
    expect(prompts[0].prompt).toContain('write in English.');
    await adminSettings
      .put('/preferences', { locale: 'en', catalogLanguage: 'en' })
      .expect(200);
  });

  it('refuses a non-Admin without an AI call, and a signed-out caller', async () => {
    await suggest(request(), member).expect(403);
    await client(app, '', '/api/admin/recipes')
      .post('/suggest-guidance', request())
      .expect(401);
    expect(prompts).toHaveLength(0);
  });

  it('is never counted: more requests than the Guidance Cap all succeed and leave no usage', async () => {
    // The test env sets GUIDANCE_DAILY_CAP to 2.
    for (let i = 0; i < 4; i += 1) await suggest(request()).expect(200);
    // An empty answer is a normal answer too, and nothing is refunded either.
    propose({});
    await suggest(request()).expect(200);
    expect(prompts).toHaveLength(5);
    const rows = await database
      .select()
      .from(scanUsage)
      .where(eq(scanUsage.memberId, adminId));
    expect(rows).toEqual([]);
  });
});
