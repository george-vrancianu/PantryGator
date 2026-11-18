import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { cookTonightQueryOptions } from './cookTonight';
import { localIso } from './pantry';
import { recipeListQueryOptions } from './recipes';

/**
 * Warms the two queries the empty Family Recipes page's starters read (the Catalog list and the
 * Catalog Cook Tonight), so they are cached by the time the Member opens Recipes. Call it where
 * the app learns the Family has no Recipes; `enabled` false does nothing.
 */
export function usePrefetchStarters(enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    void queryClient.prefetchQuery(
      recipeListQueryOptions({ search: '', tagIds: [], scope: 'catalog' }),
    );
    void queryClient.prefetchQuery(
      cookTonightQueryOptions(localIso(new Date()), false, 'catalog'),
    );
  }, [enabled, queryClient]);
}
