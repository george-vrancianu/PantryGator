import { randomUUID } from 'node:crypto';
import { generateRandomString, hashPassword } from 'better-auth/crypto';
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { seedId } from '../catalog/seed/seed-ids';
import { normalizeName } from '../catalog/normalize';
import type { Database, Tx } from '../database/database.types';
import {
  account,
  batches,
  creditEntry,
  family,
  ingredients,
  mealPlanSlots,
  mealPlans,
  recipeIngredientLines,
  recipes,
  recipeSteps,
  runningLow,
  shoppingItems,
  shoppingItemSourceRecipes,
  shoppingLists,
  staples,
  user,
} from '../database/schema';
import { generateInviteCode, inviteCodeExpiry } from '../family/invite-code';
import { RecipeCopyService } from '../recipes/recipe-copy.service';
import type { SettingsService } from '../settings/settings.service';
import {
  DEMO_BATCHES,
  DEMO_COPIED_RECIPE,
  DEMO_CREDITS,
  DEMO_GRANT_REASON,
  DEMO_NAME,
  DEMO_PLAN,
  DEMO_PLAN_SERVINGS,
  DEMO_RECIPES,
  DEMO_RUNNING_LOW,
  DEMO_SHOPPING,
  DEMO_STAPLES,
  type DemoSlotRecipe,
} from './demo-plan';

/** Raised when the seed refuses to run; nothing was written. */
export class DemoSeedRefusedError extends Error {}

export type DemoSeedInput = {
  email: string;
  password: string;
  /** The seed day, YYYY-MM-DD: expiry dates and the Meal Plan count from it. */
  today: string;
  /** False: run everything, then roll back (a dry run). */
  apply: boolean;
};

export type DemoSeedReport = {
  applied: boolean;
  replacedExisting: boolean;
  userId: string;
  familyId: string;
  counts: Record<string, number>;
};

/** Thrown inside the transaction to roll a dry run back. */
class DryRun extends Error {
  constructor(readonly report: DemoSeedReport) {
    super('dry run');
  }
}

const MIN_PASSWORD = 8;
const DAY_MS = 86_400_000;
const CATALOG_RECIPES = [
  'omelette',
  'chicken-salad',
  'fried-chicken',
  DEMO_COPIED_RECIPE,
];

const shiftDate = (today: string, days: number) =>
  new Date(Date.parse(`${today}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
/** Midday on the seed day minus `days`, so a Batch's added date is the same in every timezone near UTC. */
const addedAt = (today: string, days: number) =>
  new Date(Date.parse(`${today}T12:00:00Z`) - days * DAY_MS);

/**
 * Seeds the Demo Family (see demo-plan.ts) for one email, in one transaction. A re-run deletes the
 * Demo Member and their Family and builds both again, so the Credit Balance and Pantry Health go
 * back to the planned values. Refuses, writing nothing, when the email belongs to anyone other than
 * a Demo Member made by this seed, or when someone else has joined the Demo Family.
 */
export async function seedDemoAccount(
  db: Database,
  input: DemoSeedInput,
): Promise<DemoSeedReport> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new DemoSeedRefusedError(`"${input.email}" is not an email address.`);
  if (input.password.length < MIN_PASSWORD)
    throw new DemoSeedRefusedError(
      `The password must be at least ${MIN_PASSWORD} characters.`,
    );
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.today) ||
    Number.isNaN(Date.parse(input.today))
  )
    throw new DemoSeedRefusedError(
      `"${input.today}" is not a YYYY-MM-DD date.`,
    );
  // Hash outside the transaction: scrypt is slow and needs no lock.
  const passwordHash = await hashPassword(input.password);

  try {
    return await db.transaction(async (tx) => {
      const replacedExisting = await removeExistingDemo(tx, email);
      const report = await build(tx, { ...input, email }, passwordHash);
      const result = { ...report, replacedExisting, applied: input.apply };
      if (!input.apply) throw new DryRun(result);
      return result;
    });
  } catch (error) {
    if (error instanceof DryRun) return error.report;
    throw error;
  }
}

/** Deletes a previous Demo Member and Family; refuses if the email is anyone else's. */
async function removeExistingDemo(tx: Tx, email: string): Promise<boolean> {
  const [existing] = await tx
    .select()
    .from(user)
    .where(eq(user.email, email))
    .for('update');
  if (!existing) return false;

  const [marker] = await tx
    .select({ id: creditEntry.id })
    .from(creditEntry)
    .where(
      and(
        eq(creditEntry.familyId, existing.familyId),
        eq(creditEntry.kind, 'grant'),
        eq(creditEntry.reason, DEMO_GRANT_REASON),
      ),
    )
    .limit(1);
  if (existing.name !== DEMO_NAME || existing.familyRole !== 'owner' || !marker)
    throw new DemoSeedRefusedError(
      `${email} belongs to a Member this seed did not create; nothing was changed.`,
    );

  const others = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.familyId, existing.familyId), ne(user.id, existing.id)));
  if (others.length > 0)
    throw new DemoSeedRefusedError(
      `Someone else has joined the Demo Family (${others.length} other Member(s)); nothing was changed.`,
    );

  await tx
    .select({ id: family.id })
    .from(family)
    .where(eq(family.id, existing.familyId))
    .for('update');
  // The Member first: user.family_id does not cascade. Sessions and the account go with the Member;
  // everything the Family owns cascades from the Family.
  await tx.delete(user).where(eq(user.id, existing.id));
  // Plan Slots point at Recipes without a cascade, so the Plans must go before the Family's Recipes.
  await tx.delete(mealPlans).where(eq(mealPlans.familyId, existing.familyId));
  await tx.delete(family).where(eq(family.id, existing.familyId));
  return true;
}

async function build(
  tx: Tx,
  input: DemoSeedInput,
  passwordHash: string,
): Promise<Omit<DemoSeedReport, 'applied' | 'replacedExisting'>> {
  const catalog = await catalogIngredients(tx);
  const catalogRecipes = await catalogRecipeIds(tx);
  const now = new Date();

  // The Family, the Member and the password, as signup writes them.
  const [{ id: familyId }] = await tx
    .insert(family)
    .values({
      inviteCode: generateInviteCode(),
      inviteCodeExpiresAt: inviteCodeExpiry(),
    })
    .returning({ id: family.id });
  const userId = generateRandomString(32, 'a-z', 'A-Z', '0-9');
  await tx.insert(user).values({
    id: userId,
    name: DEMO_NAME,
    email: input.email,
    emailVerified: true,
    role: 'regular',
    familyId,
    familyRole: 'owner',
    locale: 'en',
    introDoneAt: now,
  });
  await tx.insert(account).values({
    id: generateRandomString(32, 'a-z', 'A-Z', '0-9'),
    accountId: userId,
    providerId: 'credential',
    userId,
    password: passwordHash,
  });

  await tx.insert(creditEntry).values({
    familyId,
    memberId: null,
    kind: 'grant',
    reason: DEMO_GRANT_REASON,
    amount: DEMO_CREDITS,
  });

  // The Pantry.
  await tx.insert(batches).values(
    DEMO_BATCHES.map((batch) => {
      const at = addedAt(input.today, batch.addedDaysAgo);
      return {
        familyId,
        ingredientId: catalog.id(batch.ingredient),
        leafCategoryId: catalog.leaf(batch.ingredient),
        quantity: batch.quantity,
        unit: batch.unit,
        location: batch.location,
        expiryDate:
          batch.expiresIn === null
            ? null
            : shiftDate(input.today, batch.expiresIn),
        createdAt: at,
        updatedAt: at,
      };
    }),
  );
  await tx.insert(staples).values(
    DEMO_STAPLES.map((slug) => ({
      familyId,
      ingredientId: catalog.id(slug),
    })),
  );
  await tx.insert(runningLow).values(
    DEMO_RUNNING_LOW.map((slug) => ({
      familyId,
      ingredientId: catalog.id(slug),
    })),
  );

  // Family Recipes, Bases before their Variants.
  const recipeIds = new Map<string, string>();
  const ordered = [...DEMO_RECIPES].sort(
    (a, b) => Number(Boolean(a.variantOf)) - Number(Boolean(b.variantOf)),
  );
  for (const recipe of ordered) {
    const id = randomUUID();
    recipeIds.set(recipe.key, id);
    await tx.insert(recipes).values({
      id,
      familyId,
      parentId: recipe.variantOf ? recipeIds.get(recipe.variantOf)! : null,
      title: recipe.title,
      servings: recipe.servings,
      prepMinutes: recipe.prepMinutes,
      cookMinutes: recipe.cookMinutes,
      difficulty: recipe.difficulty,
    });
    await tx.insert(recipeIngredientLines).values(
      recipe.lines.map((line, position) => ({
        id: randomUUID(),
        recipeId: id,
        position,
        ingredientId: line.ingredient ? catalog.id(line.ingredient) : null,
        rawName: line.rawName ?? null,
        normalizedName: line.rawName ? normalizeName(line.rawName) : null,
        quantity: line.quantity ?? null,
        unit: line.unit ?? null,
        optional: line.optional ?? false,
        note: line.note ?? null,
      })),
    );
    await tx.insert(recipeSteps).values(
      recipe.steps.map((step, position) => ({
        id: randomUUID(),
        recipeId: id,
        position,
        text: step.text,
        timerSeconds: step.timerSeconds ?? null,
      })),
    );
  }

  // Add to Family, through the app's own copy. Its inner transaction becomes a savepoint in ours;
  // `copyFor` never reads the Member's settings, so it needs no SettingsService.
  const copier = new RecipeCopyService(
    tx,
    undefined as unknown as SettingsService,
  );
  const copy = await copier.copyFor(
    familyId,
    catalogRecipes(DEMO_COPIED_RECIPE),
    'en',
  );

  // The Shopping List, with the Family Recipes that added each item.
  const [{ id: listId }] = await tx
    .insert(shoppingLists)
    .values({ familyId })
    .returning({ id: shoppingLists.id });
  for (const item of DEMO_SHOPPING) {
    const [{ id: itemId }] = await tx
      .insert(shoppingItems)
      .values({
        listId,
        ingredientId: item.ingredient ? catalog.id(item.ingredient) : null,
        name: item.name ?? null,
        normalizedName: item.name ? normalizeName(item.name) : null,
        quantity: String(item.quantity),
        unit: item.unit,
        checked: item.checked,
      })
      .returning({ id: shoppingItems.id });
    if (item.from?.length)
      await tx.insert(shoppingItemSourceRecipes).values(
        item.from.map((key) => ({
          shoppingItemId: itemId,
          recipeId: recipeIds.get(key)!,
        })),
      );
  }

  // The 7-day Meal Plan from the seed day, every Mealtime filled.
  const slotRecipe = (slot: DemoSlotRecipe) =>
    'family' in slot
      ? recipeIds.get(slot.family)!
      : 'catalog' in slot
        ? catalogRecipes(slot.catalog)
        : copy.id;
  const [{ id: planId }] = await tx
    .insert(mealPlans)
    .values({
      familyId,
      name: 'This week',
      startDate: input.today,
      days: DEMO_PLAN.length,
      servings: DEMO_PLAN_SERVINGS,
    })
    .returning({ id: mealPlans.id });
  const mealtimes = ['breakfast', 'lunch', 'dinner'] as const;
  await tx.insert(mealPlanSlots).values(
    DEMO_PLAN.flatMap((day, dayIndex) =>
      day.map((slot, m) => ({
        mealPlanId: planId,
        dayIndex,
        mealtime: mealtimes[m],
        recipeId: slotRecipe(slot),
      })),
    ),
  );

  return {
    userId,
    familyId,
    counts: {
      batches: DEMO_BATCHES.length,
      staples: DEMO_STAPLES.length,
      runningLow: DEMO_RUNNING_LOW.length,
      shoppingItems: DEMO_SHOPPING.length,
      familyRecipes: DEMO_RECIPES.length + 1,
      planSlots: DEMO_PLAN.length * mealtimes.length,
      credits: DEMO_CREDITS,
    },
  };
}

/** Every Catalog Ingredient the plan names, by slug; refuses if one is missing. */
async function catalogIngredients(tx: Tx) {
  const slugs = new Set<string>([
    ...DEMO_BATCHES.map((b) => b.ingredient),
    ...DEMO_STAPLES,
    ...DEMO_RUNNING_LOW,
    ...DEMO_SHOPPING.flatMap((i) => (i.ingredient ? [i.ingredient] : [])),
    ...DEMO_RECIPES.flatMap((r) =>
      r.lines.flatMap((l) => (l.ingredient ? [l.ingredient] : [])),
    ),
  ]);
  const ids = new Map(
    [...slugs].map((slug) => [slug, seedId.ingredient(slug)]),
  );
  const rows = await tx
    .select({ id: ingredients.id, leaf: ingredients.leafCategoryId })
    .from(ingredients)
    .where(
      and(
        inArray(ingredients.id, [...ids.values()]),
        isNull(ingredients.ownerFamilyId),
      ),
    );
  const leaves = new Map(rows.map((row) => [row.id, row.leaf]));
  const missing = [...ids]
    .filter(([, id]) => !leaves.has(id))
    .map(([slug]) => slug);
  if (missing.length > 0)
    throw new DemoSeedRefusedError(
      `The Catalog is missing Ingredients: ${missing.join(', ')}. Run db:seed first.`,
    );
  return {
    id: (slug: string) => ids.get(slug)!,
    leaf: (slug: string) => leaves.get(ids.get(slug)!)!,
  };
}

/** The live Catalog Recipes the plan uses, by slug; refuses if one is missing or archived. */
async function catalogRecipeIds(tx: Tx) {
  const ids = new Map(
    CATALOG_RECIPES.map((slug) => [slug, seedId.recipe(slug)]),
  );
  const rows = await tx
    .select({ id: recipes.id })
    .from(recipes)
    .where(
      and(
        inArray(recipes.id, [...ids.values()]),
        isNull(recipes.familyId),
        isNull(recipes.archivedAt),
      ),
    );
  const live = new Set(rows.map((row) => row.id));
  const missing = [...ids]
    .filter(([, id]) => !live.has(id))
    .map(([slug]) => slug);
  if (missing.length > 0)
    throw new DemoSeedRefusedError(
      `The Catalog is missing live Recipes: ${missing.join(', ')}. Run db:seed first.`,
    );
  return (slug: string) => ids.get(slug)!;
}
