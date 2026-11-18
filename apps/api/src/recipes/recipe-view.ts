import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import {
  catalogScope,
  type CatalogScope,
  SHARED_ONLY,
} from '../catalog/catalog-scope';
import { loadDisplayNames } from '../catalog/display-names';
import type { CatalogLocale } from '../catalog/catalog.schemas';
import type { Executor } from '../database/database.types';
import {
  ingredients as ingredientTable,
  recipeHiddenTips,
  recipeIngredientLines,
  recipeIngredientLineTranslations,
  recipes,
  recipeStepTranslations,
  recipeSteps,
  recipeTipTranslations,
  recipeTips,
  recipeTranslations,
} from '../database/schema';
import { loadRecipeTagIds, loadRecipeTags } from '../tags/recipe-tags';
import {
  emptyGuidanceTranslations,
  loadAdminGuidance,
  loadGuidanceTranslations,
  loadResolvedGuidance,
} from './recipe-guidance';
import { inOrder } from './recipe-queries';
import type {
  AdminRecipeDetail,
  RecipeLineView,
  RecipeOwner,
  RecipeStepView,
  RecipeTipView,
  RecipeTranslationsView,
  RecipeScope,
  ResolvedRecipe,
} from './recipes.schemas';

type RecipeRow = typeof recipes.$inferSelect;

const lineView = (
  row: typeof recipeIngredientLines.$inferSelect,
  owners: ReadonlyMap<string, RecipeOwner>,
): RecipeLineView => ({
  id: row.id,
  ingredientId: row.ingredientId,
  ingredientOwner: row.ingredientId
    ? (owners.get(row.ingredientId) ?? null)
    : null,
  quantity: row.quantity,
  unit: row.unit,
  optional: row.optional,
  note: row.note,
});

const stepView = (row: typeof recipeSteps.$inferSelect): RecipeStepView => ({
  id: row.id,
  text: row.text,
  timerSeconds: row.timerSeconds,
});

const tipView = (row: typeof recipeTips.$inferSelect): RecipeTipView => ({
  id: row.id,
  stepId: row.stepId,
  text: row.text,
});

/** The Catalog Recipe row (no Family owner), or undefined. */
export async function findCatalogRecipe(
  executor: Executor,
  id: string,
): Promise<RecipeRow | undefined> {
  const [row] = await executor
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), isNull(recipes.familyId)));
  return row;
}

/** The Recipe row when it is owned by `familyId`, else undefined. */
export async function findFamilyRecipe(
  executor: Executor,
  id: string,
  familyId: string,
): Promise<RecipeRow | undefined> {
  const [row] = await executor
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.familyId, familyId)));
  return row;
}

async function loadParts(executor: Executor, recipeId: string) {
  const [lines, steps, tips] = await inOrder([
    executor
      .select()
      .from(recipeIngredientLines)
      .where(eq(recipeIngredientLines.recipeId, recipeId))
      .orderBy(asc(recipeIngredientLines.position)),
    executor
      .select()
      .from(recipeSteps)
      .where(eq(recipeSteps.recipeId, recipeId))
      .orderBy(asc(recipeSteps.position)),
    executor
      .select()
      .from(recipeTips)
      .where(eq(recipeTips.recipeId, recipeId))
      .orderBy(asc(recipeTips.position)),
  ]);
  const owners = await ingredientOwners(
    executor,
    lines.flatMap((l) => (l.ingredientId ? [l.ingredientId] : [])),
  );
  return { lines, steps, tips, owners };
}

/** Who owns each Ingredient: a Family Ingredient has an owner Family, a Catalog one has none. */
async function ingredientOwners(
  executor: Executor,
  ids: string[],
): Promise<Map<string, RecipeOwner>> {
  if (ids.length === 0) return new Map();
  const rows = await executor
    .select({
      id: ingredientTable.id,
      ownerFamilyId: ingredientTable.ownerFamilyId,
    })
    .from(ingredientTable)
    .where(inArray(ingredientTable.id, ids));
  return new Map(
    rows.map((r): [string, RecipeOwner] => [
      r.id,
      r.ownerFamilyId === null ? 'catalog' : 'family',
    ]),
  );
}

async function loadTranslations(
  executor: Executor,
  recipeId: string,
  parts: Awaited<ReturnType<typeof loadParts>>,
): Promise<RecipeTranslationsView> {
  const ids = (rows: { id: string }[]) => rows.map((row) => row.id);
  const [titles, stepRows, lineRows, tipRows] = await inOrder([
    executor
      .select()
      .from(recipeTranslations)
      .where(eq(recipeTranslations.recipeId, recipeId)),
    parts.steps.length === 0
      ? []
      : executor
          .select()
          .from(recipeStepTranslations)
          .where(inArray(recipeStepTranslations.stepId, ids(parts.steps))),
    parts.lines.length === 0
      ? []
      : executor
          .select()
          .from(recipeIngredientLineTranslations)
          .where(
            inArray(recipeIngredientLineTranslations.lineId, ids(parts.lines)),
          ),
    parts.tips.length === 0
      ? []
      : executor
          .select()
          .from(recipeTipTranslations)
          .where(inArray(recipeTipTranslations.tipId, ids(parts.tips))),
  ]);
  const result: RecipeTranslationsView = {};
  const of = (locale: string) =>
    (result[locale] ??= {
      title: null,
      steps: {},
      lines: {},
      tips: {},
      ...emptyGuidanceTranslations(),
    });
  for (const row of titles) of(row.locale).title = row.title;
  for (const row of stepRows) of(row.locale).steps[row.stepId] = row.text;
  for (const row of lineRows) of(row.locale).lines[row.lineId] = row.note;
  for (const row of tipRows) of(row.locale).tips[row.tipId] = row.text;
  for (const [locale, guidance] of Object.entries(
    await loadGuidanceTranslations(executor, recipeId),
  )) {
    Object.assign(of(locale), guidance);
  }
  return result;
}

/**
 * The editing view of a Catalog Recipe (`familyId` null) or of one owned by
 * that Family, or null when there is no such Recipe in that scope.
 */
export async function loadAdminDetail(
  executor: Executor,
  id: string,
  familyId: string | null = null,
): Promise<AdminRecipeDetail | null> {
  const row =
    familyId === null
      ? await findCatalogRecipe(executor, id)
      : await findFamilyRecipe(executor, id, familyId);
  if (!row) return null;
  const parts = await loadParts(executor, id);
  let parentTips: AdminRecipeDetail['parentTips'] = null;
  if (row.parentId) {
    const [baseTips, hidden] = await inOrder([
      executor
        .select()
        .from(recipeTips)
        .where(
          and(eq(recipeTips.recipeId, row.parentId), isNull(recipeTips.stepId)),
        )
        .orderBy(asc(recipeTips.position)),
      executor
        .select({ tipId: recipeHiddenTips.tipId })
        .from(recipeHiddenTips)
        .where(eq(recipeHiddenTips.recipeId, id)),
    ]);
    const hiddenIds = new Set(hidden.map((h) => h.tipId));
    parentTips = baseTips.map((tip) => ({
      ...tipView(tip),
      hidden: hiddenIds.has(tip.id),
    }));
  }
  return {
    id: row.id,
    parentId: row.parentId,
    title: row.title,
    servings: row.servings,
    prepMinutes: row.prepMinutes,
    cookMinutes: row.cookMinutes,
    difficulty: row.difficulty,
    tagIds: await loadRecipeTagIds(executor, id),
    archived: row.archivedAt !== null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    sourceLink: row.sourceLink,
    sourceLanguage: row.sourceLanguage,
    lines: parts.lines.map((line) => lineView(line, parts.owners)),
    steps: parts.steps.map(stepView),
    tips: parts.tips.map(tipView),
    ...(await loadAdminGuidance(executor, id, row.nutritionNote)),
    parentTips,
    // Family Recipes are never translated.
    translations:
      familyId === null ? await loadTranslations(executor, id, parts) : {},
  };
}

/** The Family's live copy of each Catalog Recipe it has added, by source id. */
export async function liveCopiesOf(
  executor: Executor,
  familyId: string,
  sourceIds: string[],
): Promise<Map<string, string>> {
  if (sourceIds.length === 0) return new Map();
  const rows = await executor
    .select({ id: recipes.id, copiedFromId: recipes.copiedFromId })
    .from(recipes)
    .where(
      and(
        eq(recipes.familyId, familyId),
        inArray(recipes.copiedFromId, sourceIds),
        isNull(recipes.archivedAt),
      ),
    );
  return new Map(rows.map((r) => [r.copiedFromId!, r.id]));
}

/** Who owns the Recipe: the Catalog or a Family. */
export const ownerOf = (row: Pick<RecipeRow, 'familyId'>): RecipeOwner =>
  row.familyId === null ? 'catalog' : 'family';

/** A Recipe the Family may see: a Catalog one or one of its own. */
export const visibleTo = (familyId: string) =>
  or(isNull(recipes.familyId), eq(recipes.familyId, familyId));

/** `visibleTo`, narrowed to the Family's own or the Catalog's Recipes when a scope is given. */
export const inScope = (familyId: string, scope: RecipeScope | undefined) =>
  scope === 'family'
    ? eq(recipes.familyId, familyId)
    : scope === 'catalog'
      ? isNull(recipes.familyId)
      : visibleTo(familyId);

/** The Recipe row when it is a Catalog Recipe or owned by `familyId`, else undefined. */
export async function findVisibleRecipe(
  executor: Executor,
  id: string,
  familyId: string,
): Promise<RecipeRow | undefined> {
  const [row] = await executor
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), visibleTo(familyId)));
  return row;
}

/**
 * A Catalog Recipe with its text resolved for `locale`: a translation when
 * there is one, else the source text. A Variant also shows its base's
 * Recipe-level Tips it does not hide. Archived Recipes are returned (flagged);
 * whether to show them is the caller's call. Null for an unknown or
 * Family-owned Recipe.
 */
export async function loadCatalogRecipe(
  executor: Executor,
  id: string,
  locale: CatalogLocale,
): Promise<ResolvedRecipe | null> {
  const row = await findCatalogRecipe(executor, id);
  return row
    ? resolveRecipe(executor, catalogScope(SHARED_ONLY), row, locale)
    : null;
}

/**
 * A Recipe row with its text resolved for `locale`. Family Recipes are never
 * translated, so they always show their source text; a Variant of a Catalog
 * Recipe still shows the base's inherited Tips in the locale.
 */
export async function resolveRecipe(
  executor: Executor,
  scope: CatalogScope,
  row: RecipeRow,
  locale: CatalogLocale,
): Promise<ResolvedRecipe> {
  const id = row.id;
  const ingredients = scope.ingredients(executor);
  const translated = row.familyId === null;
  const parts = await loadParts(executor, id);
  const lineIds = translated ? parts.lines.map((l) => l.id) : [];
  const stepIds = translated ? parts.steps.map((s) => s.id) : [];

  const inherited = row.parentId
    ? await loadInheritedTips(executor, id, row.parentId)
    : [];
  const tipRows = [...(translated ? parts.tips : []), ...inherited];
  const tipIds = tipRows.map((t) => t.id);

  const [titleRow, lineT, stepT, tipT, tagsByRecipe, names] = await Promise.all(
    [
      translated
        ? executor
            .select()
            .from(recipeTranslations)
            .where(
              and(
                eq(recipeTranslations.recipeId, id),
                eq(recipeTranslations.locale, locale),
              ),
            )
        : [],
      lineIds.length === 0
        ? []
        : executor
            .select()
            .from(recipeIngredientLineTranslations)
            .where(
              and(
                inArray(recipeIngredientLineTranslations.lineId, lineIds),
                eq(recipeIngredientLineTranslations.locale, locale),
              ),
            ),
      stepIds.length === 0
        ? []
        : executor
            .select()
            .from(recipeStepTranslations)
            .where(
              and(
                inArray(recipeStepTranslations.stepId, stepIds),
                eq(recipeStepTranslations.locale, locale),
              ),
            ),
      tipIds.length === 0
        ? []
        : executor
            .select()
            .from(recipeTipTranslations)
            .where(
              and(
                inArray(recipeTipTranslations.tipId, tipIds),
                eq(recipeTipTranslations.locale, locale),
              ),
            ),
      loadRecipeTags(executor, scope, locale, [id]),
      loadDisplayNames(executor, scope, locale, [
        ...parts.lines.flatMap((l) => (l.ingredientId ? [l.ingredientId] : [])),
      ]),
    ],
  );
  const lineNote = new Map(lineT.map((t) => [t.lineId, t.note]));
  const stepText = new Map(stepT.map((t) => [t.stepId, t.text]));
  const tipText = new Map(tipT.map((t) => [t.tipId, t.text]));

  const ingredientRows = await executor
    .select({ id: ingredients.id, name: ingredients.name })
    .from(ingredients)
    .where(
      inArray(
        ingredients.id,
        parts.lines.flatMap((l) => (l.ingredientId ? [l.ingredientId] : [])),
      ),
    );
  const canonical = new Map(ingredientRows.map((i) => [i.id, i.name]));

  return {
    id: row.id,
    parentId: row.parentId,
    owner: ownerOf(row),
    locale,
    title: titleRow[0]?.title ?? row.title,
    servings: row.servings,
    prepMinutes: row.prepMinutes,
    cookMinutes: row.cookMinutes,
    difficulty: row.difficulty,
    tags: tagsByRecipe.get(id) ?? [],
    archived: row.archivedAt !== null,
    sourceLink: row.sourceLink,
    sourceLanguage: row.sourceLanguage,
    lines: parts.lines.map((line) => ({
      ...lineView(line, parts.owners),
      note: line.note === null ? null : (lineNote.get(line.id) ?? line.note),
      ingredientName: line.ingredientId
        ? names.pick(
            'ingredient',
            line.ingredientId,
            canonical.get(line.ingredientId) ?? '',
          )
        : (line.rawName ?? ''),
    })),
    steps: parts.steps.map((step) => ({
      ...stepView(step),
      text: stepText.get(step.id) ?? step.text,
    })),
    tips: [
      ...inherited.map((tip) => ({
        ...tipView(tip),
        text: tipText.get(tip.id) ?? tip.text,
        inherited: true,
      })),
      ...parts.tips.map((tip) => ({
        ...tipView(tip),
        text: tipText.get(tip.id) ?? tip.text,
        inherited: false,
      })),
    ],
    guidance: await loadResolvedGuidance(executor, scope, id, locale),
  };
}

/** The base's Recipe-level Tips this Variant has not hidden, in the base's order. */
async function loadInheritedTips(
  executor: Executor,
  variantId: string,
  parentId: string,
) {
  const [baseTips, hidden] = await Promise.all([
    executor
      .select()
      .from(recipeTips)
      .where(and(eq(recipeTips.recipeId, parentId), isNull(recipeTips.stepId)))
      .orderBy(asc(recipeTips.position)),
    executor
      .select({ tipId: recipeHiddenTips.tipId })
      .from(recipeHiddenTips)
      .where(eq(recipeHiddenTips.recipeId, variantId)),
  ]);
  const hiddenIds = new Set(hidden.map((h) => h.tipId));
  return baseTips.filter((tip) => !hiddenIds.has(tip.id));
}

/** Title per Recipe in `locale`; Family Recipes and untranslated ones show the source title. */
export async function recipeTitles(
  executor: Executor,
  rows: RecipeRow[],
  locale: CatalogLocale,
): Promise<Map<string, string>> {
  const catalogIds = rows.filter((r) => r.familyId === null).map((r) => r.id);
  const translated =
    catalogIds.length === 0
      ? []
      : await executor
          .select()
          .from(recipeTranslations)
          .where(
            and(
              inArray(recipeTranslations.recipeId, catalogIds),
              eq(recipeTranslations.locale, locale),
            ),
          );
  const byId = new Map(translated.map((t) => [t.recipeId, t.title]));
  return new Map(rows.map((r) => [r.id, byId.get(r.id) ?? r.title]));
}
