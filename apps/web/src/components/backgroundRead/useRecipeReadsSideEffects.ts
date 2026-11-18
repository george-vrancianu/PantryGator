import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { haptic } from '@/lib/haptic';
import { recipeReads } from '@/lib/recipeReads';
import { recipeDraftsListKey } from '@/lib/recipeDrafts';

/**
 * What a finished recipe read does whichever page the Member is on: tells the Recipe Drafts list that a
 * draft was kept (so "Drafts (N)" counts it without a refresh) and buzzes once. Mounted once, by the
 * app layout, which outlives the Dock pages and the strip.
 */
export function useRecipeReadsSideEffects() {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      recipeReads.onDraftKept(() => {
        haptic(14);
        void queryClient.invalidateQueries({ queryKey: recipeDraftsListKey });
      }),
    [queryClient],
  );
}
