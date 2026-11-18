import type { BaseRecipeOption } from './baseRecipeOption';
import { apiRequest } from './api';
import type { FamilyRecipeDraft } from './familyRecipes';

/** What a link was read into (mirror of the API's `RecipeFromLink`): an unsaved draft and where it came from. */
export type RecipeFromLink = RecipeFromLinkDraft | RecipeFromLinkDuplicate;

/** The link is already a live Recipe of the Family (and `force` was not sent): nothing was read. */
export type RecipeFromLinkDuplicate = { kind: 'duplicate'; recipeId: string };

export type RecipeFromLinkDraft = {
  kind: 'draft';
  /** The Member's Recipe Draft the server stored for this read; open the New Recipe editor on it. */
  recipeDraftId: string;
  /** Like a "Make a variant" draft, but with no base yet and Servings possibly unknown. */
  draft: Omit<FamilyRecipeDraft, 'parentId' | 'servings'> & {
    servings: number | null;
  };
  /** The normalised link of the page; null for pasted text. */
  sourceLink: string | null;
  /** The page's language (a lower-case code like "fr") when the draft was translated from it; null when not. */
  sourceLanguage: string | null;
  /** The closest Base Recipes to offer as the base, ranked as for a Plate Scan. */
  closestBases: BaseRecipeOption[];
  /** How many of the closest "Hide Recipes with my Allergies" left out. */
  hiddenByAllergiesCount: number;
};

/** The longest link the link field takes. */
export const MAX_LINK_LENGTH = 2048;
/** The longest pasted text the text field takes (the API refuses more). */
export const MAX_PASTED_TEXT_LENGTH = 50_000;

/** `catalog`: write the Recipe in the Member's Catalog Language; `source`: keep the page's language. */
export type ReadingLanguage = 'catalog' | 'source';

/** What to read: a link or pasted text, never both. */
export type ReadLinkInput = (
  | {
      url: string;
      /** Read even though the link is already one of the Family's Recipes. */
      force?: boolean;
      text?: never;
    }
  | { text: string; url?: never; force?: never }
) & {
  language: ReadingLanguage;
  /** Aborting it abandons the read on this side; the caller must then ignore the outcome. */
  signal?: AbortSignal;
};

/** The answer of the duplicate check: the live Family Recipe a link already is, or null. */
export type LinkCheck = { recipeId: string | null };

/**
 * Asks whether a link is already one of the Family's Recipes, before reading it. The server normalises
 * the link as a read does; this never fetches the page, calls the AI or counts against the Link Cap.
 */
export function checkRecipeLink(url: string, signal?: AbortSignal) {
  return apiRequest<LinkCheck>(
    `/recipes/link-check?url=${encodeURIComponent(url)}`,
    signal ? { signal } : {},
  );
}

/** Read the recipe on a web page; the server keeps it as the Member's Recipe Draft (no Recipe is saved). */
export function readRecipeLink({
  url,
  text,
  language,
  force,
  signal,
}: ReadLinkInput) {
  return apiRequest<RecipeFromLink>('/recipes/from-link', {
    method: 'POST',
    body: {
      ...(url !== undefined ? { url } : { text }),
      language,
      ...(force ? { force } : {}),
    },
    ...(signal ? { signal } : {}),
  });
}
