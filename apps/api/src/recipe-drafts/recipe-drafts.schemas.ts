import { z } from 'zod';
import { recipeDifficulty } from '../database/schema';
import {
  MAX_EATING_MOMENTS,
  MAX_NUTRITION_NOTE,
  MAX_PAIRINGS,
} from '../recipes/recipe-guidance.schemas';
import {
  MAX_LINES,
  MAX_RECIPE_TAGS,
  MAX_STEPS,
  MAX_TIPS,
} from '../recipes/recipes.schemas';

/**
 * A Recipe Draft holds the form as typed, so its text caps are looser than the
 * saved Recipe's: this many times the Recipe's own cap.
 */
export const RECIPE_DRAFT_CAP_FACTOR = 10;

/** Most Recipe Drafts one Member can hold (ADR 0028). */
export const MAX_RECIPE_DRAFTS = 20;
/** A Recipe Draft is deleted this many days after its last edit (ADR 0028). */
export const RECIPE_DRAFT_TTL_DAYS = 30;

// Text is stored as typed, so there is no minimum, no trimming and no format.
// Only the counts (lines, Steps, Tips, Pairings, Eating Moments) match the
// Recipe's maximums. Per-string limits are loose safety ceilings, about 10x
// the Recipe's: the form has no maxLength, and a Recipe Draft must never
// refuse what the Member is still typing (the Recipe's own limits apply on save).
const text = (max: number) => z.string().max(max);
const short = text(64); // ids and enum-like values
const typed = text(640); // typed numbers: quantity, timer, minutes

const draftLine = z
  .object({
    id: z.uuid().optional(),
    ingredientId: short,
    name: text(1000),
    quantity: typed,
    unit: short,
    optional: z.boolean(),
    note: text(2000),
  })
  .strict();

const draftTip = z.object({ text: text(20000) }).strict();

const draftStep = z
  .object({
    id: z.uuid().optional(),
    text: text(20000),
    timer: typed,
    tips: z.array(draftTip).max(MAX_TIPS).optional(),
  })
  .strict();

const draftPairing = z
  .object({
    id: z.uuid().optional(),
    kind: short,
    label: text(2000),
    reason: text(10000),
    principle: short,
    linkType: short,
    linkTarget: short,
    linkName: text(2000).optional(),
    linkTitle: text(2000).optional(),
    /** Proposed by Suggest Guidance and not yet kept by the Member. */
    suggested: z.boolean().optional(),
  })
  .strict();

const draftEatingMoment = z
  .object({
    eatingMomentId: short,
    polarity: short,
    reason: text(10000),
    suggested: z.boolean().optional(),
  })
  .strict();

const draftGuidance = z
  .object({
    nutritionNote: text(MAX_NUTRITION_NOTE * RECIPE_DRAFT_CAP_FACTOR),
    /** Proposed by Suggest Guidance and not yet kept by the Member. */
    nutritionNoteSuggested: z.boolean().optional(),
    pairings: z.array(draftPairing).max(MAX_PAIRINGS),
    eatingMoments: z.array(draftEatingMoment).max(MAX_EATING_MOMENTS),
  })
  .strict();

/**
 * The Family Recipe form state as typed: meta fields as strings, Ingredient
 * Lines, Steps (with their Tips and timers), Guidance, the picked base, the
 * Source Link and its language. The server checks shape and maximums only.
 */
export const recipeDraftContent = z
  .object({
    title: text(2000),
    servings: typed,
    prepMinutes: typed,
    cookMinutes: typed,
    difficulty: z.union([z.enum(recipeDifficulty.enumValues), z.literal('')]),
    /** The Tags picked so far (ADR 0033); the Recipe's own cap applies on save. */
    tagIds: z.array(short).max(MAX_RECIPE_TAGS).default([]),
    lines: z.array(draftLine).max(MAX_LINES),
    steps: z.array(draftStep).max(MAX_STEPS),
    /** Tips of the whole Recipe (absent on a draft saved before they existed); Step Tips live on their Step. */
    tips: z.array(draftTip).max(MAX_TIPS).optional(),
    guidance: draftGuidance.nullable().default(null),
    /** Plate Scan: the Base Recipe the Member picked from the closest matches. */
    pickedBaseId: short.nullable().default(null),
    sourceLink: text(10240).nullable().default(null),
    sourceLanguage: text(40).nullable().default(null),
    /** The fill came from a Plate Scan (the list shows "Plate scan"). */
    plateScan: z.boolean().default(false),
    /** The editor offers the closest Base Recipes on resume (a link read, ADR 0031): they are asked again from the title and lines. */
    offersBases: z.boolean().default(false),
  })
  .strict()
  .superRefine((content, ctx) => {
    const tips = content.steps.reduce(
      (sum, step) => sum + (step.tips?.length ?? 0),
      content.tips?.length ?? 0,
    );
    if (tips > MAX_TIPS) {
      ctx.addIssue({
        code: 'custom',
        path: ['steps'],
        message: 'too many Tips',
      });
    }
  });

export type RecipeDraftContent = z.infer<typeof recipeDraftContent>;

export const recipeDraftKinds = ['new_recipe', 'variant'] as const;
export type RecipeDraftKind = (typeof recipeDraftKinds)[number];

export const recipeDraftCreate = z
  .object({
    kind: z.enum(recipeDraftKinds),
    baseRecipeId: z.uuid().nullable().default(null),
    content: recipeDraftContent,
  })
  .strict()
  .refine((body) => body.kind === 'variant' || body.baseRecipeId === null, {
    message: 'a New Recipe has no base',
    path: ['baseRecipeId'],
  });
export type RecipeDraftCreate = z.infer<typeof recipeDraftCreate>;

export const recipeDraftUpdate = z
  .object({
    /** The version the client last saw. */
    version: z.number().int().min(1),
    content: recipeDraftContent,
  })
  .strict();
export type RecipeDraftUpdate = z.infer<typeof recipeDraftUpdate>;

export const recipeDraftParam = z.object({ id: z.uuid() });

export type RecipeDraftOrigin =
  { type: 'link'; domain: string } | { type: 'plate_scan' } | null;

export type RecipeDraftSummary = {
  id: string;
  kind: RecipeDraftKind;
  baseRecipeId: string | null;
  baseRecipeName: string | null;
  title: string;
  origin: RecipeDraftOrigin;
  updatedAt: string;
  expiresAt: string;
  version: number;
};

export type RecipeDraftView = {
  id: string;
  kind: RecipeDraftKind;
  baseRecipeId: string | null;
  baseRecipeName: string | null;
  /** The base still exists, is not archived and is one the Family can see. */
  baseAvailable: boolean;
  content: RecipeDraftContent;
  version: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};
