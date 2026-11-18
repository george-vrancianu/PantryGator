import type { BaseRecipeOption } from '@/lib/baseRecipeOption';
import { ApiError } from '@/lib/api';
import { usePlateMatches } from '@/lib/plateRecipe';
import type { RecipeDraftForm } from '@/lib/recipeDraftContent';
import { retryUnlessGone, useRecipe } from '@/lib/recipes';

/** What Plate matches are asked from: the title and the Matched Ingredients of the lines. */
export function plateMatchInput(
  title: string,
  lines: { ingredientId?: string | null }[],
) {
  return {
    dishTitle: title,
    ingredientIds: [
      ...new Set(
        lines.flatMap((line) => (line.ingredientId ? [line.ingredientId] : [])),
      ),
    ],
  };
}

/**
 * Whether a resumed Recipe Draft had the base picker: a Plate Scan, a base was picked, or the
 * server marked it as read from a link (the server stores a link read as a Recipe Draft, ADR 0031, and the closest
 * Base Recipes are asked again from its title and lines).
 */
const offersBases = (form: RecipeDraftForm | null) =>
  form !== null &&
  (form.plateScan === true ||
    form.offersBases === true ||
    Boolean(form.pickedBaseId));

/**
 * Resuming a Recipe Draft that offered a base (ADR 0028): the Plate matches are
 * asked again from its title and lines (they are never stored), and the base
 * picked before leaving is looked up by id for its name, since one picked
 * through search is stored only as `pickedBaseId`.
 */
export function useResumedPlateBases(
  form: RecipeDraftForm | null,
  /** False once the Recipe is being saved: the queries stop, so the save's refetches do not wait on them. */
  active = true,
): {
  closest: BaseRecipeOption[];
  hiddenByAllergiesCount: number;
  /** The base picked before leaving, once named; null when there was none or it is gone. */
  picked: BaseRecipeOption | null;
  /** The picked base was deleted or archived since: the pick is dropped and the picker moves on. */
  gone: boolean;
  /** The picker may be shown: the picked base (if any) is named. If its name cannot be looked up, the picker stays away and the pick is kept as it is. */
  ready: boolean;
} {
  const asks = offersBases(form);
  const matches = usePlateMatches(
    plateMatchInput(form?.draft.title ?? '', form?.draft.lines ?? []),
    asks && active,
  );
  const pickedId = asks ? (form?.pickedBaseId ?? '') : '';
  const base = useRecipe(pickedId, pickedId !== '' && active, retryUnlessGone);
  const gone =
    base.data?.archived === true ||
    (base.error instanceof ApiError && base.error.status === 404);
  return {
    closest: matches.data?.matches ?? [],
    hiddenByAllergiesCount: matches.data?.hiddenByAllergiesCount ?? 0,
    gone,
    picked:
      base.data && !gone
        ? // The picker's compact warning is not derived from the detail's: the pick is named only.
          { id: base.data.id, title: base.data.title, allergyWarning: null }
        : null,
    ready: pickedId === '' || base.data !== undefined || gone,
  };
}
