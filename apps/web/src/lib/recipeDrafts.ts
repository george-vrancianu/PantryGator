import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from './api';
import type { CatalogSearchResult } from './catalog';
import { draftWritesSettled, trackDraftWrite } from './recipeDraftWrites';
import type { Difficulty } from './recipeVocabulary';
import type { PairingKind, PairingPrinciple } from './recipeVocabulary';
import type { EatingMomentPolarity } from './adminRecipes';

/**
 * Recipe Drafts, kept on the server per Member (ADR 0028). Content mirrors the
 * API's strict `recipeDraftContent`: the form as typed, strings included, and
 * no React keys (an unknown key is a 400).
 */
export type RecipeDraftKind = 'new_recipe' | 'variant';

export type RecipeDraftContent = {
  title: string;
  servings: string;
  prepMinutes: string;
  cookMinutes: string;
  difficulty: Difficulty | '';
  /** The picked Tags (ADR 0033). */
  tagIds: string[];
  lines: {
    id?: string;
    /** Empty for an Unmatched name. */
    ingredientId: string;
    /** Read-only: the server adds it when it reads the draft. Never sent back (autosave drops it). */
    ingredientOwner?: CatalogSearchResult['owner'];
    name: string;
    quantity: string;
    unit: string;
    optional: boolean;
    note: string;
  }[];
  steps: {
    id?: string;
    text: string;
    timer: string;
    tips?: { text: string }[];
  }[];
  /** Tips of the whole Recipe; absent on a draft saved before they existed. */
  tips?: { text: string }[];
  guidance: null | {
    nutritionNote: string;
    nutritionNoteSuggested?: boolean;
    pairings: {
      id?: string;
      kind: PairingKind;
      label: string;
      reason: string;
      principle: PairingPrinciple | '';
      linkType: 'none' | 'ingredient' | 'recipe';
      linkTarget: string;
      linkName?: string;
      linkTitle?: string;
      suggested?: boolean;
    }[];
    eatingMoments: {
      eatingMomentId: string;
      polarity: EatingMomentPolarity;
      reason: string;
      suggested?: boolean;
    }[];
  };
  /** Plate Scan: the base the Member picked, by search. */
  pickedBaseId: string | null;
  sourceLink: string | null;
  sourceLanguage: string | null;
  /** True for a Recipe Draft that came from a Plate Scan. */
  plateScan: boolean;
  /** The editor offers the closest Base Recipes on resume (a link read). */
  offersBases?: boolean;
};

export type RecipeDraftSummary = {
  id: string;
  kind: RecipeDraftKind;
  baseRecipeId: string | null;
  baseRecipeName: string | null;
  title: string;
  origin: { type: 'link'; domain: string } | { type: 'plate_scan' } | null;
  updatedAt: string;
  expiresAt: string;
  version: number;
};

export type RecipeDraftView = {
  id: string;
  kind: RecipeDraftKind;
  baseRecipeId: string | null;
  baseRecipeName: string | null;
  /** False when the base is deleted, archived or not visible. */
  baseAvailable: boolean;
  content: RecipeDraftContent;
  version: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export const recipeDraftsQueryKey = ['recipe-drafts'] as const;
export const recipeDraftsListKey = [...recipeDraftsQueryKey, 'list'] as const;

/** The Member's Recipe Drafts, newest edit first. */
export function useRecipeDrafts(
  enabled = true,
  refetchOnMount: 'always' | boolean = true,
) {
  return useQuery({
    queryKey: recipeDraftsListKey,
    queryFn: async () => {
      await draftWritesSettled();
      return apiRequest<RecipeDraftSummary[]>('/recipe-drafts');
    },
    enabled,
    refetchOnMount,
  });
}

/** One Recipe Draft to resume; null waits. Pass the form's `instance` so each visit fetches afresh. It is a snapshot the form takes over: never refetched, never kept. */
export function useRecipeDraft(id: string | null, instance = '') {
  return useQuery({
    // `instance` (one per visit to the form) keeps a re-entered Recipe Draft from reusing an older snapshot and version.
    queryKey: [...recipeDraftsQueryKey, 'detail', id, instance],
    queryFn: async () => {
      // The form just left may still be sending its last edit.
      await draftWritesSettled();
      return apiRequest<RecipeDraftView>(`/recipe-drafts/${id}`);
    },
    enabled: id !== null,
    staleTime: Infinity,
    gcTime: 0,
  });
}

/** Writes refresh the list only: the open form is the truth for its own Recipe Draft. */
function useDraftWrite<Input, Result>(send: (input: Input) => Promise<Result>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: recipeDraftsListKey }),
  });
}

export function useCreateRecipeDraft() {
  return useDraftWrite(
    (input: {
      kind: RecipeDraftKind;
      baseRecipeId?: string | null;
      content: RecipeDraftContent;
      keepalive?: boolean;
    }) =>
      apiRequest<{ id: string; version: number }>('/recipe-drafts', {
        method: 'POST',
        body: {
          kind: input.kind,
          baseRecipeId: input.baseRecipeId,
          content: input.content,
        },
        keepalive: input.keepalive,
      }),
  );
}

/** `version` is the one last seen; a stale one is a 409. */
export function useUpdateRecipeDraft() {
  return useDraftWrite(
    (input: {
      id: string;
      version: number;
      content: RecipeDraftContent;
      keepalive?: boolean;
    }) =>
      apiRequest<{ id: string; version: number }>(
        `/recipe-drafts/${input.id}`,
        {
          method: 'PUT',
          body: { version: input.version, content: input.content },
          keepalive: input.keepalive,
        },
      ),
  );
}

export function useDeleteRecipeDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      const sending = apiRequest<void>(`/recipe-drafts/${id}`, {
        method: 'DELETE',
      });
      // A Recipe Draft read right after waits for the delete.
      trackDraftWrite(sending);
      return sending;
    },
    // Out of the list at once, so it cannot flash back on a page that reads the cached list before the refetch.
    onMutate: (id) =>
      queryClient.setQueryData<RecipeDraftSummary[]>(
        recipeDraftsListKey,
        (list) => list?.filter((draft) => draft.id !== id),
      ),
    // Settled, so a failed delete brings the row back from the server.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: recipeDraftsListKey }),
  });
}
