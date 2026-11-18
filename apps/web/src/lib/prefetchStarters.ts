import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { cookTonightQueryOptions } from './cookTonight';
import { localIso } from './localIso';
import { recipeListQueryOptions, type RecipeBrowse } from './recipes';

/** What the starters list: the Catalog, unfiltered. The page's hooks and the prefetch both take their arguments from here, so the cache keys cannot drift. */
export const STARTER_BROWSE: RecipeBrowse = { search: '', tagIds: [] };
export const STARTER_SCOPE = 'catalog';

/**
 * The two queries the empty Family Recipes page's starters read: the Catalog list and the
 * Catalog Cook Tonight. One definition, so the page and the prefetch share cache keys.
 */
export const starterQueries = (today: string) => ({
  list: recipeListQueryOptions({ ...STARTER_BROWSE, scope: STARTER_SCOPE }),
  cookTonight: cookTonightQueryOptions(today, false, STARTER_SCOPE),
});

/**
 * Warms the starters' queries so they are cached by the time the Member opens Recipes. Call it
 * where the app learns the Family has no Recipes; `enabled` false does nothing.
 */
export function usePrefetchStarters(enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const queries = starterQueries(localIso(new Date()));
    void queryClient.prefetchQuery(queries.list);
    void queryClient.prefetchQuery(queries.cookTonight);
  }, [enabled, queryClient]);
}
