import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { catalogScope } from '../catalog/catalog-scope';
import type { CatalogLocale } from '../catalog/catalog.schemas';
import { loadDisplayNames } from '../catalog/display-names';
import type { Executor } from '../database/database.types';
import {
  allergens,
  eatingMoments,
  ingredientAllergens,
  recipeIngredientLines,
  recipes,
} from '../database/schema';
import type { IngredientCatalog } from '../ingredients/ingredient-catalog';
import { loadViewerAllergies } from './recipe-allergens';
import { recipeTitles, visibleTo } from './recipe-view';

/**
 * What Suggest Guidance may link to and must steer clear of, decided before the model is
 * asked. A Member's request builds it from their Family (`memberSuggestionContext`); an
 * Admin's (Catalog mode, #556) supplies its own: Catalog-only candidates and no Allergens.
 * The service never looks at who is asking, only at this.
 */
export type SuggestionContext = {
  /** Catalog Ingredients a Pairing may link to, in the form Recipe from Link offers (`catalogPrompt`). */
  catalog: IngredientCatalog;
  /** Recipes a Pairing may link to (Catalog Recipes, the Family's own unarchived ones), never the page's own. */
  linkableRecipes: { id: string; title: string }[];
  /** Allergens to name in the prompt as things to avoid. Empty for none. */
  avoidAllergens: { id: string; name: string }[];
  /**
   * Ingredient and Recipe ids that contain an avoided Allergen. They are left out of the
   * offered lists; a Pairing the model still links to one is dropped, not just unlinked.
   */
  unsafeLinkIds: ReadonlySet<string>;
};

/** The most Catalog Recipes the prompt offers as links, so a big Catalog cannot bloat it. */
export const MAX_LINKABLE_RECIPES = 100;

/**
 * At most `MAX_LINKABLE_RECIPES` of `rows`: the most recently updated first, ties by id, so the
 * same Catalog always gives the same list.
 */
export function capLinkableRecipes<T extends { id: string; updatedAt: Date }>(
  rows: readonly T[],
): T[] {
  return [...rows]
    .sort(
      (a, b) =>
        b.updatedAt.getTime() - a.updatedAt.getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .slice(0, MAX_LINKABLE_RECIPES);
}

/** For requests that do not ask for Pairings: nothing to link to, nothing to avoid. */
export const NO_CONTEXT: SuggestionContext = {
  catalog: { categories: [], ingredients: [] },
  linkableRecipes: [],
  avoidAllergens: [],
  unsafeLinkIds: new Set(),
};

/** The context of a Member: Catalog and Family Recipes to link, the Family's Allergies to avoid. */
export async function memberSuggestionContext(
  executor: Executor,
  input: {
    memberId: string;
    familyId: string;
    locale: CatalogLocale;
    catalog: IngredientCatalog;
    /** The saved Recipe being edited; excluded from the links only when it is the Family's own. */
    recipeId?: string;
  },
): Promise<SuggestionContext> {
  const { familyId, catalog } = input;
  const rows = await executor
    .select()
    .from(recipes)
    .where(and(isNull(recipes.archivedAt), visibleTo(familyId)));
  // A `recipeId` that is not the Family's own matches no row here, so it changes nothing.
  const own = rows.filter(
    (r) => !(r.id === input.recipeId && r.familyId === familyId),
  );
  const titles = await recipeTitles(executor, own, input.locale);

  const allergies = await loadViewerAllergies(
    executor,
    input.memberId,
    familyId,
  );
  const avoidIds = [...new Set(allergies.map((a) => a.allergenId))];
  const allergenRows = avoidIds.length
    ? await executor
        .select({ id: allergens.id, name: allergens.name })
        .from(allergens)
        .where(inArray(allergens.id, avoidIds))
    : [];
  // Named in the Member's Catalog Language, falling back to the base name.
  const allergenNames = await loadDisplayNames(
    executor,
    catalogScope(familyId),
    input.locale,
    avoidIds,
  );
  const avoidAllergens = allergenRows.map((row) => ({
    id: row.id,
    name: allergenNames.pick('allergen', row.id, row.name),
  }));

  const unsafeIngredients = avoidIds.length
    ? new Set(
        (
          await executor
            .select({ id: ingredientAllergens.ingredientId })
            .from(ingredientAllergens)
            .where(
              and(
                inArray(ingredientAllergens.allergenId, avoidIds),
                inArray(
                  ingredientAllergens.ingredientId,
                  catalog.ingredients.map((i) => i.id),
                ),
              ),
            )
        ).map((row) => row.id),
      )
    : new Set<string>();
  // Any required line whose Ingredient is tagged with an avoided Allergen, checked or not: the
  // same raw tags the direct Ingredient check reads. Optional lines can be left out.
  const unsafeRecipes =
    avoidIds.length && own.length
      ? new Set(
          (
            await executor
              .selectDistinct({ id: recipeIngredientLines.recipeId })
              .from(recipeIngredientLines)
              .innerJoin(
                ingredientAllergens,
                eq(
                  ingredientAllergens.ingredientId,
                  recipeIngredientLines.ingredientId,
                ),
              )
              .where(
                and(
                  inArray(
                    recipeIngredientLines.recipeId,
                    own.map((r) => r.id),
                  ),
                  eq(recipeIngredientLines.optional, false),
                  inArray(ingredientAllergens.allergenId, avoidIds),
                ),
              )
          ).map((row) => row.id),
        )
      : new Set<string>();
  const unsafeLinkIds = new Set([...unsafeIngredients, ...unsafeRecipes]);

  return {
    catalog: {
      categories: catalog.categories,
      ingredients: catalog.ingredients.filter(
        (i) => !unsafeIngredients.has(i.id),
      ),
    },
    linkableRecipes: capLinkableRecipes(
      own.filter((r) => !unsafeRecipes.has(r.id)),
    ).map((r) => ({
      id: r.id,
      title: titles.get(r.id) ?? r.title,
    })),
    avoidAllergens,
    unsafeLinkIds,
  };
}

/** The context of an Admin (Catalog mode): Catalog Ingredients and Recipes only, no Allergens to avoid. */
export async function catalogSuggestionContext(
  executor: Executor,
  input: {
    catalog: IngredientCatalog;
    /** The Catalog Recipe being edited, left out of the links. */
    recipeId?: string;
  },
): Promise<SuggestionContext> {
  const rows = await executor
    .select({
      id: recipes.id,
      title: recipes.title,
      updatedAt: recipes.updatedAt,
    })
    .from(recipes)
    .where(and(isNull(recipes.archivedAt), isNull(recipes.familyId)));
  return {
    catalog: input.catalog,
    linkableRecipes: capLinkableRecipes(
      rows.filter((r) => r.id !== input.recipeId),
    ).map((r) => ({ id: r.id, title: r.title })),
    avoidAllergens: [],
    unsafeLinkIds: new Set<string>(),
  };
}

/** The unarchived Eating Moments an Admin's Eating Moments suggestion may name, in sort order. */
export function catalogEatingMoments(executor: Executor) {
  return executor
    .select({ id: eatingMoments.id, name: eatingMoments.name })
    .from(eatingMoments)
    .where(isNull(eatingMoments.archivedAt))
    .orderBy(asc(eatingMoments.sortOrder), asc(eatingMoments.id));
}
