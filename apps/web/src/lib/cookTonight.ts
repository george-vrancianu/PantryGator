import { useQuery } from '@tanstack/react-query';
import { apiRequest } from './api';
import type { RecipeTag } from './tags';
import {
  recipesQueryKey,
  type CompactAllergyWarning,
  type RecipeOwner,
} from './recipes';

/** One Base Recipe's best match tonight (mirror of the API's `CookTonightCard`). */
export type CookTonightCard = {
  base: { id: string; title: string; archived: boolean };
  /** The best-matching Recipe of the group: the base itself or one of its Variants. */
  recipe: {
    id: string;
    title: string;
    parentId: string | null;
    owner: RecipeOwner;
    /** The Family's live copy of a Catalog Recipe, else null. */
    familyCopyId: string | null;
    servings: number;
    prepMinutes: number | null;
    cookMinutes: number | null;
    tags: RecipeTag[];
    allergyWarning: CompactAllergyWarning | null;
  };
  canMake: boolean;
  /** The one short or missing required line of a near miss. */
  missing: { ingredientId: string | null; name: string } | null;
  expiringCount: number;
  otherVariantsCount: number;
};

export type CookTonightView = {
  cards: CookTonightCard[];
  /** Cards "Hide Recipes with my Allergies" left out or swapped for another Recipe of their group. */
  hiddenByAllergiesCount: number;
};

/** The Cook Tonight query, shared by `useCookTonight` and a prefetch so both fill the same cache entry. */
export const cookTonightQueryOptions = (
  today: string,
  showHidden = false,
  scope?: 'family' | 'catalog',
) => ({
  queryKey: [
    ...recipesQueryKey,
    'cook-tonight',
    today,
    ...(showHidden ? ['showHidden'] : []),
    ...(scope ? [scope] : []),
  ],
  queryFn: () => {
    const params = new URLSearchParams({ today });
    if (showHidden) params.set('showHidden', 'true');
    if (scope) params.set('scope', scope);
    return apiRequest<CookTonightView>(`/recipes/cook-tonight?${params}`);
  },
});

/** Cards arrive ranked best first. */
export function useCookTonight(
  today: string,
  /** Also ask for the Recipes "Hide Recipes with my Allergies" would leave out. */
  showHidden = false,
  /** `catalog` ranks the Catalog Recipes (Explore); `family` the Family's own. Omitted: both. */
  scope?: 'family' | 'catalog',
) {
  return useQuery(cookTonightQueryOptions(today, showHidden, scope));
}

/** Cook-tonight cards looked up by Recipe id, for the status pills on the Recipes list. */
export type CardIndex = {
  byRecipe: Map<string, CookTonightCard>;
  byBase: Map<string, CookTonightCard>;
};

export function indexCards(cards: CookTonightCard[]): CardIndex {
  return {
    byRecipe: new Map(cards.map((card) => [card.recipe.id, card])),
    byBase: new Map(cards.map((card) => [card.base.id, card])),
  };
}

/**
 * The card describing a list row: the Recipe's own card first; only a Base Recipe falls back
 * to the card of its group, whose best match may be one of its Variants.
 */
export function cardFor(
  index: CardIndex,
  recipe: { id: string; parentId: string | null },
): CookTonightCard | undefined {
  return (
    index.byRecipe.get(recipe.id) ??
    (recipe.parentId === null ? index.byBase.get(recipe.id) : undefined)
  );
}

/** The cards the Family Can Make, those using Expiring Soon Batches first; the rank decides within each group. */
export function canMakeCards(cards: CookTonightCard[]): CookTonightCard[] {
  return cards
    .filter((card) => card.canMake)
    .sort((a, b) => Number(b.expiringCount > 0) - Number(a.expiringCount > 0));
}

/**
 * The Base Recipes the Family Can Make, most expiring first, each once. A card's best match can
 * be a Variant; its group lists the Base (the Variant is reached through the Base). Cards whose
 * Base is not in `bases` are skipped.
 */
export function canMakeBases<T extends { id: string }>(
  cards: CookTonightCard[],
  bases: T[],
): T[] {
  const byId = new Map(bases.map((base) => [base.id, base]));
  const seen = new Set<string>();
  const rows: T[] = [];
  for (const card of canMakeCards(cards)) {
    const base = byId.get(card.base.id);
    if (base && !seen.has(base.id)) {
      seen.add(base.id);
      rows.push(base);
    }
  }
  return rows;
}
