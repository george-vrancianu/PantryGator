import { jest } from '@jest/globals';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, ilike } from 'drizzle-orm';
import { seedId } from '../src/catalog/seed/seed-catalog';
import { DATABASE } from '../src/database/database.constants';
import type { Database } from '../src/database/database.types';
import {
  batches,
  ingredients,
  mealPlans,
  recipeIngredientLines,
  recipes,
  user,
} from '../src/database/schema';
import type { CompactAllergyWarning } from '../src/recipes/recipes.schemas';
import { client, signUp } from './support/admin-session';
import { createTestApp } from './support/create-test-app';

jest.setTimeout(30_000);

type Slot = {
  dayIndex: number;
  mealtime: string;
  recipeId: string;
  allergyWarning: CompactAllergyWarning | null;
};
type PlanDetail = {
  id: string;
  slots: Slot[];
  fill?: { filled: number; emptyForAllergies: number };
};
type Window = { days: { slots: Slot[] }[] };

/** A write's today must be near the server's UTC date. */
const TODAY = new Date().toISOString().slice(0, 10);
const MILK = seedId.allergen('milk');

// Spec: #350 / #361, ADR 0014, ADR 0012. Plan Slots carry the Allergy Warning naming whose
// Allergy it is and are never hidden; Fill never picks a Recipe with any Member's or a Family
// Allergy in a required, checked line, whatever the hide preference.
describe('Meal Plans and Allergies (integration)', () => {
  let app: NestFastifyApplication;
  let database: Database;
  const stamp = Date.now();
  let n = 0;

  beforeAll(async () => {
    app = await createTestApp();
    database = app.get<Database>(DATABASE);
  });
  afterAll(async () => {
    const owners = await database
      .select({ familyId: user.familyId })
      .from(user)
      .where(ilike(user.email, `mpa-%-${stamp}-%`));
    for (const { familyId } of owners) {
      await database.delete(mealPlans).where(eq(mealPlans.familyId, familyId));
    }
    await database.delete(recipes).where(ilike(recipes.title, `%${stamp}-%`));
    await app.close();
  });

  async function member(label: string) {
    const email = `mpa-${label}-${stamp}-${++n}@example.com`;
    const cookie = await signUp(app, email, label);
    return {
      email,
      cookie,
      plans: client(app, cookie, '/api/meal-plans'),
      settings: client(app, cookie, '/api/settings'),
    };
  }
  async function join(joiner: { cookie: string }, owner: { cookie: string }) {
    const { inviteCode } = (
      await client(app, owner.cookie, '/api/family').get('').expect(200)
    ).body as { inviteCode: string };
    await client(app, joiner.cookie, '/api/family')
      .post('/join', { code: inviteCode })
      .expect(201);
  }

  async function familyIdOf(email: string) {
    const [{ familyId }] = await database
      .select({ familyId: user.familyId })
      .from(user)
      .where(eq(user.email, email));
    return familyId;
  }
  const milkRecipeIds: string[] = [];
  /** A Family Recipe (Plans take no other) with a milk line, required or optional, and any other required lines. */
  async function milkRecipe(
    email: string,
    optional = false,
    otherSlugs: string[] = [],
  ) {
    const id = crypto.randomUUID();
    milkRecipeIds.push(id);
    await database.insert(recipes).values({
      id,
      familyId: await familyIdOf(email),
      title: `Milk dish ${stamp}-${++n}`,
      servings: 4,
    });
    await database.insert(recipeIngredientLines).values({
      id: crypto.randomUUID(),
      recipeId: id,
      position: 0,
      ingredientId: seedId.ingredient('milk'),
      quantity: 100,
      unit: 'ml',
      optional,
    });
    if (otherSlugs.length > 0) {
      await database.insert(recipeIngredientLines).values(
        otherSlugs.map((slug, i) => ({
          id: crypto.randomUUID(),
          recipeId: id,
          position: i + 1,
          ingredientId: seedId.ingredient(slug),
          quantity: 2,
          unit: 'pcs' as const,
        })),
      );
    }
    return id;
  }
  /** Expiring Soon milk so a milk Recipe is the best ranked one Fill could pick. */
  async function stockMilk(
    email: string,
    slug = 'milk',
    quantity = 5000,
    unit: 'ml' | 'pcs' = 'ml',
  ) {
    const [{ familyId }] = await database
      .select({ familyId: user.familyId })
      .from(user)
      .where(eq(user.email, email));
    const [{ leaf }] = await database
      .select({ leaf: ingredients.leafCategoryId })
      .from(ingredients)
      .where(eq(ingredients.id, seedId.ingredient(slug)));
    await database.insert(batches).values({
      familyId,
      ingredientId: seedId.ingredient(slug),
      leafCategoryId: leaf,
      location: 'fridge',
      quantity,
      unit,
      expiryDate: TODAY,
    });
  }
  /** A milk-free Recipe on Expiring Soon eggs, so Fill has a milk-free Recipe to place. */
  async function milkFreeRecipe(email: string) {
    await stockMilk(email, 'eggs', 50, 'pcs');
    const id = crypto.randomUUID();
    await database.insert(recipes).values({
      id,
      familyId: await familyIdOf(email),
      title: `Egg dish ${stamp}-${++n}`,
      servings: 4,
    });
    await database.insert(recipeIngredientLines).values({
      id: crypto.randomUUID(),
      recipeId: id,
      position: 0,
      ingredientId: seedId.ingredient('eggs'),
      quantity: 2,
      unit: 'pcs',
    });
    return id;
  }
  /** Fill placed the milk-free Recipe, and never a Recipe this file made with milk. */
  const expectFilledWithoutMilkRecipes = (
    plan: PlanDetail,
    milkFree: string,
  ) => {
    const placed = plan.slots.map((s) => s.recipeId);
    expect(placed).toContain(milkFree);
    for (const id of milkRecipeIds) expect(placed).not.toContain(id);
  };
  const q = `?locale=en&today=${TODAY}`;
  const createPlan = async (api: ReturnType<typeof client>) =>
    (await api.post(q, { startDate: TODAY, days: 1 }).expect(201))
      .body as PlanDetail;
  const fill = async (api: ReturnType<typeof client>, planId: string) =>
    (await api.post(`/${planId}/fill${q}`, { onlyWhatIHave: true }).expect(201))
      .body as PlanDetail;

  describe('warnings on Plan Slots', () => {
    it('names whose Allergy it is on the plan and in the window, and never hides the slot', async () => {
      const ana = await member('warn-ana');
      const bob = await member('warn-bob');
      await join(bob, ana);
      await ana.settings.put('/allergies', { allergenIds: [MILK] }).expect(200);
      await ana.settings
        .put('/preferences', { hideRecipesWithAllergies: true })
        .expect(200);
      const recipe = await milkRecipe(ana.email);
      const plan = await createPlan(bob.plans);
      await bob.plans
        .put(`/${plan.id}/slots/0/dinner${q}`, { recipeId: recipe })
        .expect(200);

      // Bob sees Ana's Allergy named; the hide preference of Ana does not matter to him.
      const asBob = (await bob.plans.get(`/${plan.id}${q}`).expect(200))
        .body as PlanDetail;
      expect(asBob.slots[0].allergyWarning).toEqual({
        severity: 'strong',
        allergens: [
          {
            id: MILK,
            name: expect.any(String) as string,
            tier: 'members',
            severity: 'strong',
            owners: [{ kind: 'member', name: 'warn-ana' }],
          },
        ],
        uncheckedCount: 0,
      });

      // Ana has hiding on and still sees the slot, with her own Allergy.
      const asAna = (await ana.plans.get(`/${plan.id}${q}`).expect(200))
        .body as PlanDetail;
      expect(asAna.slots).toHaveLength(1);
      expect(asAna.slots[0].allergyWarning).toMatchObject({
        severity: 'strong',
        allergens: [{ id: MILK, tier: 'yours', owners: [{ kind: 'own' }] }],
      });
      const window = (await ana.plans.get(`/window${q}`).expect(200))
        .body as Window;
      expect(window.days.flatMap((d) => d.slots)).toEqual([
        expect.objectContaining({
          recipeId: recipe,
          allergyWarning: expect.objectContaining({
            severity: 'strong',
          }) as object,
        }),
      ]);
    });

    it('has no warning without a matching Allergy', async () => {
      const ana = await member('warn-none');
      const recipe = await milkRecipe(ana.email);
      const plan = await createPlan(ana.plans);
      await ana.plans
        .put(`/${plan.id}/slots/0/dinner${q}`, { recipeId: recipe })
        .expect(200);
      const read = (await ana.plans.get(`/${plan.id}${q}`).expect(200))
        .body as PlanDetail;
      expect(read.slots[0].allergyWarning).toBeNull();
    });
  });

  describe('Fill avoids Allergies', () => {
    it('places the best milk Recipe when nobody is allergic', async () => {
      const ana = await member('fill-free');
      await stockMilk(ana.email);
      const recipe = await milkRecipe(ana.email);
      const plan = await fill(ana.plans, (await createPlan(ana.plans)).id);
      expect(plan.slots.map((s) => s.recipeId)).toContain(recipe);
    });

    it("skips a Recipe with another Member's Allergy, whatever the hide preference", async () => {
      const ana = await member('fill-member-ana');
      const bob = await member('fill-member-bob');
      await join(bob, ana);
      await stockMilk(ana.email);
      await bob.settings.put('/allergies', { allergenIds: [MILK] }).expect(200);
      // Neither Member hides: the Family's Allergies still bind Fill.
      await milkRecipe(ana.email);
      const milkFree = await milkFreeRecipe(ana.email);
      const plan = await fill(ana.plans, (await createPlan(ana.plans)).id);
      expectFilledWithoutMilkRecipes(plan, milkFree);
    });

    it('skips a Recipe with a Family Allergy', async () => {
      const ana = await member('fill-family');
      await stockMilk(ana.email);
      await ana.settings
        .post('/family-allergies', { allergenId: MILK, label: 'Mia' })
        .expect(201);
      await milkRecipe(ana.email);
      const milkFree = await milkFreeRecipe(ana.email);
      const plan = await fill(ana.plans, (await createPlan(ana.plans)).id);
      expectFilledWithoutMilkRecipes(plan, milkFree);
    });

    it('says how many slots it filled and none stayed empty for Allergies when nobody is allergic', async () => {
      const ana = await member('fill-result-free');
      await stockMilk(ana.email);
      await milkRecipe(ana.email);
      const plan = await fill(ana.plans, (await createPlan(ana.plans)).id);
      expect(plan.fill).toEqual({
        filled: plan.slots.length,
        emptyForAllergies: 0,
      });
      expect(plan.slots.length).toBeGreaterThan(0);
    });

    it('counts no slot for Allergies when a safe Recipe fills the slot, however often Fill is pressed', async () => {
      const ana = await member('fill-result-safe');
      await ana.settings.put('/allergies', { allergenIds: [MILK] }).expect(200);
      // No milk in the Pantry: the milk Recipe fits no slot under "Only what I have".
      await milkRecipe(ana.email);
      const milkFree = await milkFreeRecipe(ana.email);
      const planId = (await createPlan(ana.plans)).id;
      for (let i = 0; i < 5; i++) {
        const plan = await fill(ana.plans, planId);
        expect(plan.slots.map((s) => s.recipeId)).toContain(milkFree);
        expect(plan.fill?.emptyForAllergies).toBe(0);
        for (const { mealtime } of plan.slots) {
          await ana.plans.del(`/${planId}/slots/0/${mealtime}${q}`).expect(204);
        }
      }
    });

    it('counts none for Allergies when the blocked Recipe could not have been placed anyway', async () => {
      const ana = await member('fill-result-unusable');
      await ana.settings.put('/allergies', { allergenIds: [MILK] }).expect(200);
      // No milk in the Pantry, so under "Only what I have" the milk Recipe fits no slot.
      await milkRecipe(ana.email);
      const plan = await fill(ana.plans, (await createPlan(ana.plans)).id);
      expect(plan.slots).toHaveLength(0);
      expect(plan.fill).toEqual({ filled: 0, emptyForAllergies: 0 });
    });

    // One Recipe fills one slot of the day: Fill never repeats a Recipe within two days.
    it('counts the slots left empty only because Allergies ruled the Recipe out', async () => {
      const ana = await member('fill-result-blocked');
      await stockMilk(ana.email);
      await ana.settings.put('/allergies', { allergenIds: [MILK] }).expect(200);
      await milkRecipe(ana.email);
      const plan = await fill(ana.plans, (await createPlan(ana.plans)).id);
      expect(plan.slots).toHaveLength(0);
      expect(plan.fill).toEqual({
        filled: 0,
        emptyForAllergies: 1,
      });
    });

    it('still picks a Recipe whose only match is an optional line', async () => {
      const ana = await member('fill-optional');
      await stockMilk(ana.email, 'eggs', 50, 'pcs');
      await ana.settings.put('/allergies', { allergenIds: [MILK] }).expect(200);
      // Its eggs are Expiring Soon, so it outranks the rest; the milk is optional.
      const recipe = await milkRecipe(ana.email, true, ['eggs']);
      const plan = await fill(ana.plans, (await createPlan(ana.plans)).id);
      expect(plan.slots.map((s) => s.recipeId)).toContain(recipe);
    });

    it('keeps a milk Recipe the Member put in a slot', async () => {
      const ana = await member('fill-kept');
      await ana.settings.put('/allergies', { allergenIds: [MILK] }).expect(200);
      const recipe = await milkRecipe(ana.email);
      const plan = await createPlan(ana.plans);
      await ana.plans
        .put(`/${plan.id}/slots/0/dinner${q}`, { recipeId: recipe })
        .expect(200);
      const filled = await fill(ana.plans, plan.id);
      expect(filled.slots.find((s) => s.mealtime === 'dinner')).toMatchObject({
        recipeId: recipe,
      });
    });
  });
});
