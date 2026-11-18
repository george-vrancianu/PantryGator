import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { Locale, ScanLanguage } from '../i18n/resources';
import { adminCatalogQueryKey, type IngredientInput } from './admin';
import { apiRequest } from './api';
import { catalogSearchQueryKey } from './catalog';
import {
  mealPlanQueryKey,
  suggestionsQueryKey,
  templateDetailsQueryKey,
} from './queryKeys';
import { familySynonymsQueueKey } from './queryKeys';
import { recipesQueryKey } from './recipes';
import { shoppingListQueryKey } from './shopping';
import type { ScanMode } from './scan';

export type UnmatchedStatus = 'open' | 'dismissed';
export type UnmatchedSource =
  ScanMode | 'manual' | 'finish_shopping' | 'recipe' | 'voice';

export type UnmatchedReference = {
  type: 'batch' | 'shopping_item' | 'recipe_line';
  id: string;
  source: UnmatchedSource;
  locale: Locale;
  rawName: string;
  /** The text as printed, and the Scan Language it was read in; null when not recorded. */
  sourceText: string | null;
  sourceLanguage: ScanLanguage | null;
};

/** Every Batch and Shopping Item carrying one normalised raw name. */
export type UnmatchedEntry = {
  normalizedName: string;
  rawName: string;
  count: number;
  /** Locale of the most recent row: the default language of the Synonym. */
  locale: Locale;
  locales: Locale[];
  /** Printed text of the most recent row that has one, with its Scan Language. */
  sourceText: string | null;
  sourceLanguage: ScanLanguage | null;
  sources: UnmatchedSource[];
  dismissed: boolean;
  references: UnmatchedReference[];
};

export type UnmatchedResolution = {
  ingredientId: string;
  locale: Locale;
  relinkedBatches: number;
  relinkedShoppingItems: number;
  relinkedTemplateLines: number;
  synonymAdded: boolean;
  /** A Synonym of the printed text was added. */
  sourceSynonymAdded: boolean;
  /** Why no printed-text Synonym was added: no printed text, already a Synonym of the target, or owned by another Ingredient. Null when added or not asked for. */
  sourceSynonymSkipped: 'none' | 'exists' | 'taken' | null;
};

export type ResolveInput = {
  normalizedName: string;
  /** Language of the Synonym made from the raw name: a catalog locale. */
  locale: Locale;
  /** Also make a Synonym of the printed text, in its own Scan Language. */
  sourceSynonym?: boolean;
} & ({ ingredientId: string } | { newIngredient: IngredientInput });

/** Every Unmatched queue query, whatever its status. */
export const unmatchedQueueKey = ['admin-unmatched'] as const;

/** The query key of the queue with this status. */
export const unmatchedQueueQueryKey = (status: UnmatchedStatus) =>
  [...unmatchedQueueKey, status] as const;

export type UnmatchedPage = {
  /** Every name with this status, not just this page. */
  total: number;
  entries: UnmatchedEntry[];
  nextCursor: string | null;
};

/** The queue one page at a time; `fetchNextPage` follows the server's cursor. */
export function useUnmatchedQueue(status: UnmatchedStatus) {
  return useInfiniteQuery({
    queryKey: unmatchedQueueQueryKey(status),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiRequest<UnmatchedPage>(
        `/admin/unmatched?${new URLSearchParams({
          status,
          ...(pageParam ? { cursor: pageParam } : {}),
        })}`,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Counts move between pages, so a name can repeat: keep its first appearance.
    select: (data) => ({
      entries: [
        ...new Map(
          data.pages
            .flatMap((page) => page.entries)
            .map((e) => [e.normalizedName, e]),
        ).values(),
      ],
      // The newest page's total: a refetch walks the pages in order.
      total: data.pages.at(-1)?.total ?? 0,
    }),
  });
}

export function useResolveUnmatched() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResolveInput) =>
      apiRequest<UnmatchedResolution>('/admin/unmatched/resolve', {
        method: 'POST',
        body: input,
      }),
    // Resolving can create an Ingredient and a Synonym, and relinks Pantry and
    // Shopping List rows, so everything that shows them is stale.
    onSuccess: () =>
      Promise.all(
        [
          unmatchedQueueKey,
          familySynonymsQueueKey,
          adminCatalogQueryKey,
          catalogSearchQueryKey,
          ['pantry'],
          shoppingListQueryKey,
          suggestionsQueryKey,
          templateDetailsQueryKey,
          recipesQueryKey,
          mealPlanQueryKey,
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });
}

export function useDismissUnmatched() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (normalizedName: string) =>
      apiRequest('/admin/unmatched/dismiss', {
        method: 'POST',
        body: { normalizedName },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: unmatchedQueueKey }),
  });
}

export function useUndismissUnmatched() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (normalizedName: string) =>
      apiRequest('/admin/unmatched/undismiss', {
        method: 'POST',
        body: { normalizedName },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: unmatchedQueueKey }),
  });
}
