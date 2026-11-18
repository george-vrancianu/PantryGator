import { z } from 'zod';
import { modelJsonSchema } from '../ai/model-json-schema';
import { catalogIndexSchema } from '../ingredients/ingredient-catalog';
import {
  MAX_PAIRING_LABEL,
  MAX_PAIRING_REASON,
  guidanceBody,
  pairingInput,
  type GuidanceBody,
  type PairingInput,
} from './recipe-guidance.schemas';
import { familyLineInput, recipeDocument, MAX_LINES } from './recipes.schemas';

/** Structured-output schema name of a Suggest Guidance answer. */
export const GUIDANCE_SUGGESTION_SCHEMA_NAME = 'recipe_guidance_suggestion';

/** The three fields of Guidance, in the order the form shows them. */
export const GUIDANCE_FIELDS = [
  'pairings',
  'nutritionNote',
  'eatingMoments',
] as const;
export type GuidanceField = (typeof GUIDANCE_FIELDS)[number];

/**
 * The fields Suggest Guidance proposes. A field joins this list with one entry in the answer
 * schema, one `asks` line in the prompt and one case in `suggestionOf`; the request, the
 * empty check and the response already carry all three.
 */
export const COVERED_GUIDANCE_FIELDS: readonly GuidanceField[] = [
  'pairings',
  'nutritionNote',
  'eatingMoments',
];

/** The page's current Recipe content, as the Family Recipe form holds it (unsaved edits included). */
const suggestionRecipe = recipeDocument.extend({
  // The form may be half done: a missing Title or Servings is simply not told to the model.
  title: recipeDocument.shape.title.optional(),
  servings: recipeDocument.shape.servings.optional(),
  lines: z.array(familyLineInput).max(MAX_LINES).default([]),
});

/**
 * A Pairing row as the form holds it: a started one may lack its label or reason, because a
 * request is never saved (the save schema stays strict). A blank row is one with no label,
 * no reason and no link.
 */
const formPairing = pairingInput.extend({
  label: z.string().trim().max(MAX_PAIRING_LABEL),
  reason: z.string().trim().max(MAX_PAIRING_REASON),
});
export const formGuidance = guidanceBody.extend({
  pairings: z.array(formPairing).max(100),
});
type FormGuidance = z.infer<typeof formGuidance>;

/**
 * Suggest Guidance for a Family Recipe (ADR 0026): what the page holds now, and the Guidance
 * already on the form (all of it, so the empty fields can be told).
 */
export const suggestGuidanceBody = z
  .object({
    recipe: suggestionRecipe,
    guidance: formGuidance,
    /** The saved Family Recipe being edited, if any: Pairings may never link to it. */
    recipeId: z.uuid().optional(),
  })
  .strict();
export type SuggestGuidanceBody = z.infer<typeof suggestGuidanceBody>;

/** What the model returns; the service judges every value, so it is loosely typed. */
export const guidanceSuggestionSchema = z.object({
  /** Up to 10 ideas; null when there are none. */
  pairings: z
    .array(
      z.object({
        kind: z.string(),
        label: z.string(),
        reason: z.string(),
        /** One of the fixed Pairing Principles, null when none fits. */
        principle: z.string().nullable(),
        /** An offered Catalog Ingredient, by its index in the Catalog text, or null. */
        ingredientIndex: catalogIndexSchema,
        /** An offered Recipe id, or null. */
        recipeId: z.string().nullable(),
      }),
    )
    .nullable(),
  /** Good and bad, no values; null when there is nothing worth saying. */
  nutritionNote: z.string().nullable(),
  /** Up to 10 ideas, each about an offered Eating Moment; null when there are none. */
  eatingMoments: z
    .array(
      z.object({
        /** An offered Eating Moment id. */
        eatingMomentId: z.string(),
        /** "good_for" or "avoid". */
        polarity: z.string(),
        reason: z.string(),
      }),
    )
    .nullable(),
});
export type GuidanceSuggestionAnswer = z.infer<typeof guidanceSuggestionSchema>;

export const guidanceSuggestionJsonSchema = modelJsonSchema(
  guidanceSuggestionSchema,
);

/** A proposed Pairing: the Guidance body's Pairing, plus the name of what it links to, so the form can show it. */
export type SuggestedPairing = PairingInput & {
  linkedIngredientName: string | null;
  linkedRecipeTitle: string | null;
};

/**
 * The answer: the Guidance body restricted to the fields that were empty and got a
 * proposal, and the empty, covered fields with nothing worth proposing.
 */
export type GuidanceSuggestion = {
  guidance: Partial<Omit<GuidanceBody, 'pairings'>> & {
    pairings?: SuggestedPairing[];
  };
  noSuggestions: GuidanceField[];
};

/** Which fields of the Guidance on the form are empty (Pairings: no row with anything in it; Nutrition Note: null or blank; Eating Moments: none). */
export function emptyGuidanceFields(
  guidance: Pick<FormGuidance, GuidanceField>,
): GuidanceField[] {
  return GUIDANCE_FIELDS.filter((field) => {
    switch (field) {
      case 'pairings':
        // A started row is the Member's own work; only rows with nothing in them are empty.
        return guidance.pairings.every(
          (p) =>
            p.label === '' &&
            p.reason === '' &&
            p.linkedIngredientId === null &&
            p.linkedRecipeId === null,
        );
      case 'nutritionNote':
        return (guidance.nutritionNote ?? '').trim() === '';
      case 'eatingMoments':
        return guidance.eatingMoments.length === 0;
    }
  });
}

/**
 * Suggest Guidance for a Catalog Recipe (an Admin): what the editor holds now, with Catalog
 * lines (an Ingredient or an Unmatched name, as in the Family request), and the Guidance already on the form.
 */
export const adminSuggestGuidanceBody = z
  .object({
    recipe: recipeDocument.extend({
      title: recipeDocument.shape.title.optional(),
      servings: recipeDocument.shape.servings.optional(),
      lines: z.array(familyLineInput).max(MAX_LINES).default([]),
    }),
    guidance: formGuidance,
    /** The saved Catalog Recipe being edited, if any: Pairings may never link to it. */
    recipeId: z.uuid().optional(),
  })
  .strict();
export type AdminSuggestGuidanceBody = z.infer<typeof adminSuggestGuidanceBody>;
