import {
  type QueryClient,
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ApiError, apiRequest } from './api';
import type { RecipeTag } from './tags';
import type {
  Difficulty,
  PairingKind,
  PairingPrinciple,
} from './recipeVocabulary';
import type { Unit } from './catalog';
import { useDebounced } from './catalog';
import { localIso } from './localIso';
import { shoppingListChangeQueryKeys } from './queryKeys';
import { shoppingListQueryKey, type ShoppingList } from './shopping';

export type RecipeOwner = 'catalog' | 'family';
export type NamedRef = { id: string; name: string };

/**
 * The Allergy Warning as a list row, strip tile or match carries it (mirror of the API's
 * `CompactAllergyWarning`): one item per Allergen, same severity as on Recipe detail.
 */
export type CompactAllergyWarning = {
  severity: 'strong' | 'soft';
  /** Empty when only Unchecked lines raise the warning. */
  allergens: {
    id: string;
    name: string;
    tier: 'yours' | 'members';
    severity: 'strong' | 'soft';
    /** Whose Allergy it is: you, a Family Allergy (with its label) or another Member by name. */
    owners: CompactAllergyOwner[];
  }[];
  uncheckedCount: number;
};

export type CompactAllergyOwner =
  | { kind: 'own' }
  | { kind: 'family'; label: string | null }
  | { kind: 'member'; name: string };

/** One row of the Recipe list (mirror of the API's `RecipeListItem`). */
export type RecipeListItem = {
  id: string;
  title: string;
  parentId: string | null;
  base: { id: string; title: string } | null;
  tags: RecipeTag[];
  variantCount: number;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  difficulty: Difficulty | null;
  owner: RecipeOwner;
  /** On a Catalog Recipe: the Family's live copy of it (Add to Family), else null. */
  familyCopyId: string | null;
  /** On a Family copy: the Catalog Recipe it was Copied From, else null. */
  copiedFromId: string | null;
  allergyWarning: CompactAllergyWarning | null;
};

/** The Recipe list with how many Recipes "Hide Recipes with my Allergies" left out (mirror of the API's `RecipeList`). */
export type RecipeList = {
  recipes: RecipeListItem[];
  hiddenByAllergiesCount: number;
};

/**
 * The Family has no Recipes to list: the (unfiltered) list is empty and nothing is hidden by
 * Allergies. Archived Recipes aren't listed so they don't count; Recipes hidden by Allergies do.
 * False until the list has loaded.
 */
export function hasNoFamilyRecipes(list: RecipeList | undefined): boolean {
  return (
    list !== undefined &&
    list.recipes.length === 0 &&
    list.hiddenByAllergiesCount === 0
  );
}

/** A Variant as listed on its base's detail. */
export type RecipeVariantItem = {
  id: string;
  title: string;
  tags: RecipeTag[];
  owner: RecipeOwner;
  /** The Family's live copy of a Catalog Variant, else null. */
  familyCopyId: string | null;
};

export type RecipeDetailLine = {
  id: string;
  ingredientId: string | null;
  ingredientName: string;
  quantity: number | null;
  unit: Unit | null;
  optional: boolean;
  note: string | null;
};
export type RecipeDetailStep = {
  id: string;
  text: string;
  timerSeconds: number | null;
};
export type RecipeDetailTip = {
  id: string;
  stepId: string | null;
  text: string;
  inherited: boolean;
};
export type DiffEntry = {
  id: string;
  ingredientName: string;
  quantity: number | null;
  unit: Unit | null;
};
export type RecipeDiff = {
  added: DiffEntry[];
  removed: DiffEntry[];
  swapped: { from: DiffEntry; to: DiffEntry }[];
};

export type PairingLink =
  | { type: 'ingredient'; id: string; name: string }
  | {
      type: 'recipe';
      id: string;
      title: string;
      owner: RecipeOwner;
      /** The Family's live copy when the linked Recipe is a Catalog Recipe, else null. */
      familyCopyId?: string | null;
    };
export type DetailPairing = {
  id: string;
  kind: PairingKind;
  label: string;
  reason: string;
  principle: PairingPrinciple | null;
  /** Null for no link, or when the linked Recipe is archived or not visible. */
  link: PairingLink | null;
};
export type DetailEatingMoment = {
  eatingMomentId: string;
  name: string;
  polarity: 'good_for' | 'avoid';
  reason: string | null;
};
/** Recipe guidance in the Member's locale (mirror of the API's `ResolvedGuidance`). */
export type RecipeGuidance = {
  nutritionNote: string | null;
  pairings: DetailPairing[];
  eatingMoments: DetailEatingMoment[];
};

/** An Allergen a Recipe is known to contain, with its source lines (mirror of the API's `RecipeAllergenItem`). */
export type RecipeAllergenItem = {
  allergen: { id: string; name: string };
  lines: { id: string; ingredientName: string; optional: boolean }[];
  /** Every source line is optional. */
  optionalOnly: boolean;
};
export type RecipeAllergens = {
  items: RecipeAllergenItem[];
  /** Lines that could not be checked for Allergens. */
  uncheckedCount: number;
};

/** Whose Allergy it is (mirror of the API's `AllergyOwner`). */
export type AllergyOwner =
  | { kind: 'own' }
  | { kind: 'family'; label: string | null }
  | { kind: 'member'; memberId: string; name: string };

/** One person's Allergy a Recipe contains and the lines that contain it (mirror of the API's `AllergyWarningEntryView`). */
export type AllergyWarningEntry = {
  allergen: { id: string; name: string };
  /** The viewer's own and Family Allergies come first, other Members' after. */
  owner: AllergyOwner;
  /** `yours` counts as the viewer's own (their own, the Family's); `members` is another Member's. */
  tier: 'yours' | 'members';
  /** `strong` when a required line contains it, `soft` when only optional lines do. */
  severity: 'strong' | 'soft';
  /** Every line that contains it, each with its own severity (`soft` for an optional line). */
  lines: { lineId: string; severity: 'strong' | 'soft' }[];
};
/** The Allergy Warning on a Recipe (mirror of the API's `AllergyWarningView`). */
export type AllergyWarning = {
  severity: 'strong' | 'soft';
  entries: AllergyWarningEntry[];
  /** Lines that could not be checked for Allergens. */
  uncheckedCount: number;
};

/** The Member's Recipe detail (mirror of the API's `RecipeDetail`). */
export type RecipeDetail = {
  id: string;
  parentId: string | null;
  owner: RecipeOwner;
  title: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  difficulty: Difficulty | null;
  tags: RecipeTag[];
  archived: boolean;
  lines: RecipeDetailLine[];
  steps: RecipeDetailStep[];
  tips: RecipeDetailTip[];
  base: {
    id: string;
    title: string;
    archived: boolean;
    /** The Family's live copy of a Catalog base, else null. */
    familyCopyId: string | null;
  } | null;
  variants: RecipeVariantItem[];
  /** The Family's live copy of a Catalog Recipe, else null. */
  familyCopyId: string | null;
  /** The Catalog Base a Family Base was Copied From, else null. */
  copiedFrom: { id: string; archived: boolean } | null;
  diff: RecipeDiff | null;
  guidance: RecipeGuidance;
  allergens: RecipeAllergens;
  /** Null when nothing the viewer must avoid is, or might be, in the Recipe. */
  allergyWarning: AllergyWarning | null;
  /** The page the Recipe was read from, when it was read from a link. */
  sourceLink: string | null;
  /** The language a Recipe read from a page was translated from (a lower-case code), or null. */
  sourceLanguage: string | null;
};

/** Pickers' options; browsing uses Tags, the Family editor adds Eating Moments. */
export type RecipeFilterOptions = {
  /** The Tags in use in the asked scope: Family Tags first, then Catalog Tags by group. */
  tags: RecipeTag[];
  eatingMoments: NamedRef[];
};

export type RecipeBrowse = {
  search: string;
  /** Tags a Recipe must all have, in the order they were picked. */
  tagIds: string[];
};

/** Minutes for a Recipe (prep plus cook), or null when it has neither. */
export function totalMinutes(times: {
  prepMinutes: number | null;
  cookMinutes: number | null;
}): number | null {
  return times.prepMinutes === null && times.cookMinutes === null
    ? null
    : (times.prepMinutes ?? 0) + (times.cookMinutes ?? 0);
}

export const recipesQueryKey = ['recipes'] as const;

/** Whether a search or a filter is active (the list then includes Variants). */
export const isFiltering = (browse: RecipeBrowse) =>
  browse.search.trim() !== '' || browse.tagIds.length > 0;

/** The Recipe list's query, shared by `useRecipes` and a prefetch so both fill the same cache entry. */
export const recipeListQueryOptions = ({
  search,
  tagIds,
  includeVariants = false,
  showHidden = false,
  scope,
}: {
  search: string;
  tagIds: string[];
  includeVariants?: boolean;
  showHidden?: boolean;
  scope?: 'family' | 'catalog';
}) => ({
  queryKey: [
    ...recipesQueryKey,
    'list',
    scope ?? 'all',
    search,
    // Not debounced: a Tag pick is a tap, not typing.
    tagIds.join(','),
    ...(includeVariants ? ['variants'] : []),
    ...(showHidden ? ['showHidden'] : []),
  ],
  queryFn: () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (tagIds.length > 0) params.set('tagIds', tagIds.join(','));
    if (includeVariants) params.set('includeVariants', 'true');
    if (showHidden) params.set('showHidden', 'true');
    if (scope) params.set('scope', scope);
    return apiRequest<RecipeList>(`/recipes?${params}`);
  },
});

/** The Recipe list; the search is debounced, the shown rows stay while the next load runs. */
export function useRecipes(
  browse: RecipeBrowse,
  {
    searchOnly = false,
    includeVariants = false,
    showHidden = false,
    scope,
    enabled = true,
  }: {
    searchOnly?: boolean;
    includeVariants?: boolean;
    /**
     * Ask for Recipes "Hide Recipes with my Allergies" would leave out. The Meal Plan and the
     * Pairing picker always pass it: Plan Slots and Pairing links never hide.
     */
    showHidden?: boolean;
    /** `catalog` lists Catalog Recipes (Explore); `family` the Family's own. Omitted: both, as before. */
    scope?: 'family' | 'catalog';
    enabled?: boolean;
  } = {},
) {
  const search = useDebounced(browse.search.trim(), 300);
  return useQuery({
    ...recipeListQueryOptions({
      search,
      tagIds: browse.tagIds,
      includeVariants,
      showHidden,
      scope,
    }),
    // `searchOnly`: nothing to fetch until a search term has settled (the debounce has run).
    enabled: enabled && (!searchOnly || search !== ''),
    placeholderData: keepPreviousData,
  });
}

/** The filter pickers' options; `scope` narrows the Tags to those in use on the Family's or the Catalog's Recipes. */
export function useRecipeFilters(enabled = true, scope?: 'family' | 'catalog') {
  return useQuery({
    enabled,
    queryKey: [...recipesQueryKey, 'filters', scope ?? 'all'],
    queryFn: () =>
      apiRequest<RecipeFilterOptions>(
        `/recipes/filters${scope ? `?scope=${scope}` : ''}`,
      ),
  });
}

/**
 * Every Tag the editor can put on a Recipe: a Member gets the Catalog Tags and the Family's own
 * (named in the Catalog Language), an Admin the Catalog Tags in English. Family Tags come first.
 */
export function usePickableTags(scope: 'family' | 'admin') {
  return useQuery({
    queryKey: [...recipesQueryKey, 'pickable-tags', scope],
    queryFn: () =>
      apiRequest<RecipeTag[]>(
        scope === 'admin' ? '/admin/recipes/tags' : '/recipes/tags',
      ),
  });
}

/**
 * Resolves a name typed in the Tag field: the Catalog Tag it matches (in any language), else the
 * Family's Tag, else a new Family Tag. The answer is added to the pickable Tags' cache.
 */
export function useResolveTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiRequest<RecipeTag>('/recipes/tags', {
        method: 'POST',
        body: { name },
      }),
    onSuccess: (tag) => {
      queryClient.setQueryData<RecipeTag[]>(
        [...recipesQueryKey, 'pickable-tags', 'family'],
        (old) =>
          old === undefined || old.some((t) => t.id === tag.id)
            ? old
            : [...old, tag],
      );
    },
  });
}

/**
 * For a lookup that waits on the answer (the base of a resumed Recipe Draft): a
 * Recipe that is gone or hidden answers 404 or 403 for good, so it settles at
 * once instead of after the retries; other failures get two.
 */
export function retryUnlessGone(failureCount: number, error: unknown) {
  if (
    error instanceof ApiError &&
    (error.status === 404 || error.status === 403)
  )
    return false;
  return failureCount < 2;
}

/** One Recipe with its text, plus its base, Variants and ingredient diff. */
export function useRecipe(
  id: string,
  enabled = true,
  /** `false` to fail at once instead of retrying (a side lookup that must not hold a form); `retryUnlessGone` to settle at once on a 404 or 403 and retry other failures. */
  retry?: boolean | typeof retryUnlessGone,
) {
  return useQuery({
    ...(retry === undefined ? {} : { retry }),
    queryKey: [...recipesQueryKey, 'detail', id],
    queryFn: () => apiRequest<RecipeDetail>(`/recipes/${id}`),
    enabled,
  });
}

export type PantryLineStatus = 'covered' | 'short' | 'missing';

/** One Ingredient Line against the Pantry (mirror of the API's `PantryLineView`). */
export type PantryLine = {
  lineId: string;
  ingredientId: string | null;
  name: string | null;
  status: PantryLineStatus;
  optional: boolean;
  pantryBasic: boolean;
  /** The line's quantity scaled to the match's Servings. */
  quantity: number | null;
  unit: Unit | null;
  shortfall: { quantity: number; unit: Unit } | null;
  usesExpiringSoon: boolean;
  onShoppingList: boolean;
};

export type PantryMatch = {
  servings: number;
  canMake: boolean;
  shortOrMissingCount: number;
  expiringCoveredCount: number;
  coverageRatio: number;
  lines: PantryLine[];
};

const matchKey = (id: string) =>
  [...recipesQueryKey, 'pantry-match', id] as const;

/** A Recipe's per-line Pantry status at `servings`; the last answer stays while the next loads. */
export function useRecipePantryMatch(
  id: string,
  servings: number,
  enabled = true,
) {
  // oxlint-disable-next-line react/purity -- "today" must follow the clock across midnight; freezing it would leave a Member on a stale day
  const today = localIso(new Date());
  return useQuery({
    queryKey: [...matchKey(id), servings, today],
    queryFn: () =>
      apiRequest<PantryMatch>(
        `/recipes/${id}/pantry-match?${new URLSearchParams({ today, servings: String(servings) })}`,
      ),
    enabled,
    // Only the same Recipe's previous answer may stand in (another Servings).
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === 'pantry-match' &&
      previousQuery.queryKey[2] === id
        ? previous
        : undefined,
  });
}

/** After an add: the answer is the updated Shopping List; Suggestions and the Pantry match are now out of date. */
function shoppingListUpdated(queryClient: QueryClient) {
  return (list: ShoppingList) => {
    queryClient.setQueryData(shoppingListQueryKey, list);
    return Promise.all(
      shoppingListChangeQueryKeys.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };
}

/** Adds the Recipe's short and missing lines to the Shopping List; the answer is the updated list. */
export function useAddMissingToShoppingList(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (servings: number) =>
      apiRequest<ShoppingList>(`/recipes/${id}/add-missing`, {
        method: 'POST',
        body: { today: localIso(new Date()), servings },
      }),
    onSuccess: shoppingListUpdated(queryClient),
  });
}

/** Adds one Ingredient Line of the Recipe, at the Servings picked, to the Shopping List. */
export function useAddLineToShoppingList(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, servings }: { lineId: string; servings: number }) =>
      apiRequest<ShoppingList>(`/recipes/${id}/add-line`, {
        method: 'POST',
        body: { lineId, servings, today: localIso(new Date()) },
      }),
    onSuccess: shoppingListUpdated(queryClient),
  });
}
