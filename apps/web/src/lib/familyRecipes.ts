import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from './api';
import type { Unit } from './catalog';
import type { GuidanceSuggestion } from './guidanceSuggestion';
import type { GuidanceInput, RecipeStep, RecipeTip } from './adminRecipes';
import type { Difficulty } from './recipeVocabulary';
import { recipeChangeQueryKeys } from './queryKeys';
import { recipeDraftsListKey } from './recipeDrafts';
import { recipesQueryKey } from './recipes';

type GuidanceInputWithIds = {
  nutritionNote: string | null;
  pairings: (GuidanceInput['pairings'][number] & {
    id: string;
    linkedIngredientName: string | null;
    /** Null when the linked Recipe is archived or not visible. */
    linkedRecipeTitle: string | null;
  })[];
  eatingMoments: GuidanceInput['eatingMoments'];
};

/** An unsaved "Make a variant" draft (mirror of the API's `FamilyRecipeDraft`). */
export type FamilyRecipeDraft = {
  parentId: string;
  title: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  difficulty: Difficulty | null;
  /** Every Tag of the source: a new Variant starts with its Base's Tags. */
  tagIds: string[];
  lines: {
    ingredientId: string | null;
    rawName: string | null;
    ingredientName: string;
    quantity: number | null;
    unit: Unit | null;
    optional: boolean;
    note: string | null;
  }[];
  steps: { text: string; timerSeconds: number | null }[];
  /** The source's own step Tips; `stepIndex` is an index into `steps`. */
  tips: { stepIndex: number; text: string }[];
  /** The source's guidance in the Member's locale, ready to post (Pairings without ids). */
  guidance: GuidanceInput;
};

/** The editable view of a Family Recipe (mirror of the API's `FamilyRecipeEdit`). */
export type FamilyRecipeEdit = {
  id: string;
  parentId: string | null;
  title: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  difficulty: Difficulty | null;
  tagIds: string[];
  /** A Variant's Catalog base title, in the Member's language; null on a Base Recipe. */
  parentTitle: string | null;
  archived: boolean;
  /** The page the Recipe was read from; null otherwise. It can be removed, never changed. */
  sourceLink: string | null;
  /** The language the page was translated from; null otherwise. */
  sourceLanguage: string | null;
  lines: {
    id: string;
    ingredientId: string | null;
    /** Whose Ingredient: a Family's own or the Catalog's; null on an Unmatched line. */
    ingredientOwner: 'catalog' | 'family' | null;
    rawName: string | null;
    ingredientName: string;
    quantity: number | null;
    unit: Unit | null;
    optional: boolean;
    note: string | null;
  }[];
  steps: RecipeStep[];
  tips: RecipeTip[];
  parentTips: (RecipeTip & { hidden: boolean })[] | null;
} & GuidanceInputWithIds;

/** The document a Member saves: each line has an Ingredient or a free-text name. */
export type FamilyRecipeDocument = {
  title: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  difficulty: Difficulty | null;
  tagIds: string[];
  lines: Array<{
    id?: string;
    ingredientId: string | null;
    rawName: string | null;
    quantity: number | null;
    unit: Unit | null;
    optional: boolean;
    note: string | null;
  }>;
  steps: Array<{ id?: string; text: string; timerSeconds: number | null }>;
  /** Only on create: a draft brings its Tips, in order: `stepIndex` into `steps`, or null for a Tip of the whole Recipe. */
  tips?: { stepIndex: number | null; text: string }[];
  /** Only on create: a saved draft brings its guidance along. */
  guidance?: GuidanceInput;
  /** On create: the page the Recipe was read from. On update: `null` removes the Source Link (and its language); it can't be set or changed. */
  sourceLink?: string | null;
  /** Only on create, with `sourceLink`: the language the page was translated from. */
  sourceLanguage?: string;
  /** Only on create: the Member's Recipe Draft this Recipe finishes; it ends with the create. */
  recipeDraftId?: string;
};

/** The copy of a visible Recipe to start a Family Variant from. */
export function useVariantDraft(sourceId: string) {
  return useQuery({
    queryKey: [...recipesQueryKey, 'variant-draft', sourceId],
    queryFn: () =>
      apiRequest<FamilyRecipeDraft>(`/recipes/${sourceId}/variant-draft`),
    // A draft is a snapshot the Member is editing: never refetch under them.
    staleTime: Infinity,
    gcTime: 0,
  });
}

/** The Family's own Recipe for editing. */
export function useFamilyRecipeEdit(id: string) {
  return useQuery({
    queryKey: [...recipesQueryKey, 'edit', id],
    queryFn: () => apiRequest<FamilyRecipeEdit>(`/recipes/${id}/edit`),
    // Unsaved edits live in the form: never refetch under them.
    refetchOnWindowFocus: false,
  });
}

/** A write that refreshes every Recipe query (list, detail, edit). */
function useFamilyWrite<Input, Result>(
  send: (input: Input) => Promise<Result>,
  { refetchNow = true }: { refetchNow?: boolean } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: (result) => {
      const edit = result as Partial<FamilyRecipeEdit> | undefined;
      if (edit?.id && edit.lines) {
        // The write returned the edit view: seed it so the editor does not flash stale.
        queryClient.setQueriesData(
          { queryKey: [...recipesQueryKey, 'edit', edit.id] },
          edit,
        );
      }
      return Promise.all(
        recipeChangeQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({
            queryKey,
            // Archiving navigates away: mark stale, do not refetch the archived page.
            ...(refetchNow ? {} : { refetchType: 'none' as const }),
          }),
        ),
      );
    },
  });
}

/** Create a Variant under `parentId` (or, with null, a standalone Base Recipe). */
export function useCreateFamilyRecipe() {
  const queryClient = useQueryClient();
  return useFamilyWrite(
    async (input: {
      parentId: string | null;
      document: FamilyRecipeDocument;
    }) => {
      const saved = await apiRequest<FamilyRecipeEdit>('/recipes', {
        method: 'POST',
        body: { ...input.document, parentId: input.parentId },
      });
      // The server ended that Recipe Draft with the create (ADR 0028): the list is old now.
      if (input.document.recipeDraftId) {
        void queryClient.invalidateQueries({ queryKey: recipeDraftsListKey });
      }
      return saved;
    },
  );
}

export function useUpdateFamilyRecipe(id: string) {
  return useFamilyWrite((document: FamilyRecipeDocument) =>
    apiRequest<FamilyRecipeEdit>(`/recipes/${id}`, {
      method: 'PUT',
      body: document,
    }),
  );
}

/** The UI's Delete: the Recipe is archived, never removed. */
export function useArchiveFamilyRecipe(id: string) {
  return useFamilyWrite(
    () =>
      apiRequest<FamilyRecipeEdit>(`/recipes/${id}/archive`, {
        method: 'POST',
      }),
    { refetchNow: false },
  );
}

/** Tip writes for a Family Recipe: add, edit, delete and hide, on the same endpoints shape as the Admin's. */
export function useFamilyTipWrites(id: string) {
  const path = `/recipes/${id}`;
  const add = useFamilyWrite((input: { text: string; stepId: string | null }) =>
    apiRequest<unknown>(`${path}/tips`, {
      method: 'POST',
      body: input,
    }),
  );
  const update = useFamilyWrite(
    ({ tipId, text }: { tipId: string; text: string }) =>
      apiRequest<unknown>(`${path}/tips/${tipId}`, {
        method: 'PATCH',
        body: { text },
      }),
  );
  const remove = useFamilyWrite((tipId: string) =>
    apiRequest<unknown>(`${path}/tips/${tipId}`, { method: 'DELETE' }),
  );
  const reorder = useFamilyWrite((ids: string[]) =>
    apiRequest<unknown>(`${path}/tips/order`, {
      method: 'PUT',
      body: { ids },
    }),
  );
  const hide = useFamilyWrite((tipIds: string[]) =>
    apiRequest<unknown>(`${path}/hidden-tips`, {
      method: 'PUT',
      body: { tipIds },
    }),
  );
  return { add, update, remove, reorder, hide };
}

/** Replace the guidance of the Family's own Recipe (its own save, apart from the document). */
export function useSetFamilyGuidance(id: string) {
  return useFamilyWrite((input: GuidanceInput) =>
    apiRequest<FamilyRecipeEdit>(`/recipes/${id}/guidance`, {
      method: 'PUT',
      body: input,
    }),
  );
}

/** What Suggest Guidance sends for a Family Recipe: the page as it is now, and the Guidance on the form. */
export type SuggestFamilyGuidanceRequest = {
  recipe: Partial<Pick<FamilyRecipeDocument, 'title' | 'servings'>> &
    Pick<
      FamilyRecipeDocument,
      'prepMinutes' | 'cookMinutes' | 'tagIds' | 'lines' | 'steps'
    >;
  guidance: GuidanceInput;
  /** The saved Recipe being edited, if any. */
  recipeId?: string;
};

/** Ask for Guidance for the empty fields of a Family Recipe page. Nothing is saved. */
export function suggestFamilyGuidance(body: SuggestFamilyGuidanceRequest) {
  return apiRequest<GuidanceSuggestion>('/recipes/suggest-guidance', {
    method: 'POST',
    body,
  });
}
