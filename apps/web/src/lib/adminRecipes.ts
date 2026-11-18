import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ScanLanguage } from '../i18n/resources';
import { apiRequest } from './api';
import type { GuidanceSuggestion } from './guidanceSuggestion';
import type { Unit } from './catalog';
import { recipeChangeQueryKeys } from './queryKeys';
import type { RecipeAllergens } from './recipes';
import type {
  Difficulty,
  PairingKind,
  PairingPrinciple,
} from './recipeVocabulary';

export type RecipeLine = {
  id: string;
  ingredientId: string | null;
  quantity: number | null;
  unit: Unit | null;
  optional: boolean;
  note: string | null;
};
export type RecipeStep = {
  id: string;
  text: string;
  timerSeconds: number | null;
};
export type RecipeTip = { id: string; stepId: string | null; text: string };
export const MAX_PAIRINGS = 10;
export const MAX_EATING_MOMENTS = 10;
export const MAX_NUTRITION_NOTE = 500;

export type RecipePairing = {
  id: string;
  kind: PairingKind;
  label: string;
  reason: string;
  principle: PairingPrinciple | null;
  linkedIngredientId: string | null;
  linkedRecipeId: string | null;
};
export type EatingMomentPolarity = 'good_for' | 'avoid';
export type RecipeEatingMoment = {
  eatingMomentId: string;
  polarity: EatingMomentPolarity;
  reason: string | null;
};

export type RecipeLocaleText = {
  title: string | null;
  steps: Record<string, string>;
  lines: Record<string, string>;
  tips: Record<string, string>;
  nutritionNote: string | null;
  pairings: Record<string, { label: string; reason: string }>;
  /** Reason per Eating Moment id. */
  eatingMoments: Record<string, string>;
};

/** The Admin's view of one Catalog Recipe (mirror of the API's `AdminRecipeDetail`). */
export type AdminRecipe = {
  id: string;
  parentId: string | null;
  title: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  difficulty: Difficulty | null;
  /** The ids of the Recipe's Tags; names come from the pickable Tags. */
  tagIds: string[];
  archived: boolean;
  lines: RecipeLine[];
  steps: RecipeStep[];
  tips: RecipeTip[];
  /** A Variant's base Recipe-level Tips with whether this Variant hides each. */
  parentTips: (RecipeTip & { hidden: boolean })[] | null;
  nutritionNote: string | null;
  pairings: RecipePairing[];
  eatingMoments: RecipeEatingMoment[];
  translations: Record<string, RecipeLocaleText>;
};

export type AdminRecipeListItem = {
  id: string;
  parentId: string | null;
  title: string;
  servings: number;
  difficulty: Difficulty | null;
  archived: boolean;
};

/** The document an Admin saves: lines and Steps with an `id` are updated in place. */
export type RecipeDocument = {
  title: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  difficulty: Difficulty | null;
  tagIds: string[];
  lines: Array<{
    id?: string;
    ingredientId: string | null;
    quantity: number | null;
    unit: Unit | null;
    optional: boolean;
    note: string | null;
  }>;
  steps: Array<{ id?: string; text: string; timerSeconds: number | null }>;
};

export type TranslationsInput = {
  title?: string | null;
  steps?: Record<string, string | null>;
  lines?: Record<string, string | null>;
  tips?: Record<string, string | null>;
  nutritionNote?: string | null;
  pairings?: Record<string, { label: string; reason: string } | null>;
  eatingMoments?: Record<string, string | null>;
};

/** What the guidance endpoint replaces: a Pairing with an `id` keeps its translations. */
export type GuidanceInput = {
  nutritionNote: string | null;
  pairings: Array<{
    id?: string;
    kind: PairingKind;
    label: string;
    reason: string;
    principle: PairingPrinciple | null;
    linkedIngredientId: string | null;
    linkedRecipeId: string | null;
  }>;
  eatingMoments: Array<{
    eatingMomentId: string;
    polarity: EatingMomentPolarity;
    reason: string | null;
  }>;
};

export const adminRecipesQueryKey = ['admin-recipes'] as const;
const recipeKey = (id: string) => [...adminRecipesQueryKey, 'detail', id];

export function useAdminRecipes() {
  return useQuery({
    queryKey: [...adminRecipesQueryKey, 'list'],
    queryFn: () => apiRequest<AdminRecipeListItem[]>('/admin/recipes'),
  });
}

export function useAdminRecipe(id: string | null) {
  return useQuery({
    queryKey: recipeKey(id ?? ''),
    queryFn: () => apiRequest<AdminRecipe>(`/admin/recipes/${id}`),
    enabled: id !== null,
  });
}

/**
 * The Allergens a Catalog Recipe is known to contain, derived from its lines' Ingredient tags.
 * Under the Recipe's detail key, so any Recipe save or Ingredient tag change refetches it.
 */
export function useAdminRecipeAllergens(id: string | null) {
  return useQuery({
    queryKey: [...recipeKey(id ?? ''), 'allergens'],
    queryFn: () =>
      apiRequest<RecipeAllergens>(`/admin/recipes/${id}/allergens`),
    enabled: id !== null,
  });
}

/** A write that refreshes the list and details; a returned Recipe seeds its detail. */
function useRecipeWrite<Input>(send: (input: Input) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: (result) => {
      const detail = result as Partial<AdminRecipe> | undefined;
      if (detail?.id && detail.lines) {
        queryClient.setQueryData(recipeKey(detail.id), detail);
      }
      // Members browse the same Recipes.
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: adminRecipesQueryKey }),
        ...recipeChangeQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ]);
    },
  });
}

export function useCreateRecipe() {
  return useRecipeWrite((document: RecipeDocument) =>
    apiRequest<AdminRecipe>('/admin/recipes', {
      method: 'POST',
      body: document,
    }),
  );
}
export function useUpdateRecipe(id: string) {
  return useRecipeWrite((document: RecipeDocument) =>
    apiRequest<AdminRecipe>(`/admin/recipes/${id}`, {
      method: 'PUT',
      body: document,
    }),
  );
}
export function useArchiveRecipe(id: string) {
  return useRecipeWrite(() =>
    apiRequest<AdminRecipe>(`/admin/recipes/${id}/archive`, {
      method: 'POST',
    }),
  );
}
export function useMakeVariant(baseId: string) {
  return useRecipeWrite((input: { title: string }) =>
    apiRequest<AdminRecipe>(`/admin/recipes/${baseId}/variants`, {
      method: 'POST',
      body: input,
    }),
  );
}

/** Tip writes return no Recipe, so the detail is refetched. */
export function useTipWrites(id: string) {
  const path = `/admin/recipes/${id}`;
  const add = useRecipeWrite((input: { text: string; stepId: string | null }) =>
    apiRequest(`${path}/tips`, { method: 'POST', body: input }),
  );
  const update = useRecipeWrite(
    ({ tipId, text }: { tipId: string; text: string }) =>
      apiRequest(`${path}/tips/${tipId}`, { method: 'PATCH', body: { text } }),
  );
  const remove = useRecipeWrite((tipId: string) =>
    apiRequest(`${path}/tips/${tipId}`, { method: 'DELETE' }),
  );
  const reorder = useRecipeWrite((ids: string[]) =>
    apiRequest(`${path}/tips/order`, { method: 'PUT', body: { ids } }),
  );
  const hide = useRecipeWrite((tipIds: string[]) =>
    apiRequest(`${path}/hidden-tips`, { method: 'PUT', body: { tipIds } }),
  );
  return { add, update, remove, reorder, hide };
}

export function useSetRecipeTranslations(id: string) {
  return useRecipeWrite(
    ({ locale, input }: { locale: ScanLanguage; input: TranslationsInput }) =>
      apiRequest(`/admin/recipes/${id}/translations/${locale}`, {
        method: 'PUT',
        body: input,
      }),
  );
}

export function useSetGuidance(id: string) {
  return useRecipeWrite((input: GuidanceInput) =>
    apiRequest<AdminRecipe>(`/admin/recipes/${id}/guidance`, {
      method: 'PUT',
      body: input,
    }),
  );
}

/** What Suggest Guidance sends for a Catalog Recipe: the editor as it is now, and the Guidance on the form. */
export type SuggestCatalogGuidanceRequest = {
  recipe: Partial<Pick<RecipeDocument, 'title' | 'servings'>> &
    Omit<RecipeDocument, 'title' | 'servings' | 'lines'> & {
      /** A line without an Ingredient carries its typed name, as on the Family request. */
      lines: Array<
        RecipeDocument['lines'][number] & { rawName: string | null }
      >;
    };
  guidance: GuidanceInput;
  /** The saved Catalog Recipe being edited. */
  recipeId?: string;
};

/** Ask for Guidance for the empty fields of a Catalog Recipe. Admin only; nothing is saved. */
export function suggestCatalogGuidance(body: SuggestCatalogGuidanceRequest) {
  return apiRequest<GuidanceSuggestion>('/admin/recipes/suggest-guidance', {
    method: 'POST',
    body,
  });
}
