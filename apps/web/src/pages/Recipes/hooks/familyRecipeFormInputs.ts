import { type RecipeDraftRouteProps } from './useRecipeDraftFormSession';
import type { useRecipeDraftRoute } from './useRecipeDraftRoute';
import { type FamilyRecipeDraft } from '@/lib/familyRecipes';
import { toGuidanceDraft, type GuidanceDraft } from '@/lib/guidanceDraft';
import { type RecipeDetail } from '@/lib/recipes';

/** The draft's guidance with its Pairing links named from the source Recipe (same order). */
export function namedGuidance(
  draft: Pick<FamilyRecipeDraft, 'guidance'>,
  source: RecipeDetail | undefined,
): GuidanceDraft {
  const guidance = toGuidanceDraft(draft.guidance);
  const pairings = source?.guidance.pairings ?? [];
  return {
    ...guidance,
    pairings: guidance.pairings.map((pairing, index) => {
      const link = pairings[index]?.link;
      if (link?.type === 'ingredient' && link.id === pairing.linkTarget) {
        return { ...pairing, linkName: link.name };
      }
      if (link?.type === 'recipe' && link.id === pairing.linkTarget) {
        return { ...pairing, linkTitle: link.title };
      }
      return pairing;
    }),
  };
}

/** The route's Recipe Draft handles, as one object for the form. */
export function routePropsOf(
  route: ReturnType<typeof useRecipeDraftRoute>,
): RecipeDraftRouteProps {
  return {
    resumed: route.resumed,
    onDraftId: route.onDraftId,
    clearState: route.clearState,
    onLoadLatest: route.adopt,
  };
}
