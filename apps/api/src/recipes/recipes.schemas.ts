import { z } from 'zod';
import { CATALOG_LOCALES, FALLBACK_LOCALE } from '../catalog/catalog.schemas';
import { MAX_QUANTITY } from '../common/quantity';
import { ingredientUnit, recipeDifficulty } from '../database/schema';
import type { AllergyOwner, AllergyWarningOwner } from './matching/allergens';
import type { PlateMatch } from './plate-matches';
import { sourceLinkInput } from './source-link';
import type { RecipeTag } from '../tags/recipe-tags';
import type { RecipeDiff } from './recipe-diff';
import {
  guidanceBody,
  guidanceTranslationsBody,
  type AdminGuidance,
  type GuidanceBody,
  type GuidanceTranslationsView,
  type ResolvedGuidance,
} from './recipe-guidance.schemas';

const id = z.uuid();
export const MAX_TITLE = 200;
export const MAX_LONG_TEXT = 2000;
export const MAX_LINE_NOTE = 200;
export const MAX_RAW_NAME = 100;
const title = z.string().trim().min(1).max(MAX_TITLE);
const longText = z.string().trim().min(1).max(MAX_LONG_TEXT);
const note = z.string().trim().min(1).max(MAX_LINE_NOTE);
const minutes = z.number().int().min(0).max(100_000).nullable();

export const MAX_LINES = 100;
export const MAX_STEPS = 100;
export const MAX_TIPS = 200;
/** Most Tags one Recipe can carry (ADR 0033); the service refuses the 11th with a coded error. */
export const MAX_RECIPE_TAGS = 10;

/** An Ingredient Line quantity, numeric(10,3): positive, at most 3 decimals. */
const lineQuantity = z
  .number()
  .min(0.001)
  .max(MAX_QUANTITY)
  .refine((value) => Math.abs(Math.round(value * 1000) - value * 1000) < 1e-6, {
    message: 'at most 3 decimals',
  });

/**
 * Quantity and unit are both set or both null, and a Catalog line needs an
 * Ingredient; the service enforces those two with coded errors, so the schema
 * lets `ingredientId`, `quantity` and `unit` be null independently.
 */
export const lineInput = z
  .object({
    /** Present on an existing line: it is updated and keeps its id. */
    id: id.optional(),
    ingredientId: id.nullable(),
    quantity: lineQuantity.nullable().default(null),
    unit: z.enum(ingredientUnit.enumValues).nullable().default(null),
    optional: z.boolean().default(false),
    note: note.nullable().default(null),
  })
  .strict();

export const stepInput = z
  .object({
    /** Present on an existing Step: it is updated and keeps its id (and its Tips). */
    id: id.optional(),
    text: longText,
    timerSeconds: z
      .number()
      .int()
      .min(0)
      .max(1_000_000)
      .nullable()
      .default(null),
  })
  .strict();

/** The whole Recipe document an Admin edits. Position is the array order. */
export const recipeDocument = z
  .object({
    title,
    servings: z.number().int().min(1).max(1000),
    prepMinutes: minutes.default(null),
    cookMinutes: minutes.default(null),
    difficulty: z.enum(recipeDifficulty.enumValues).nullable().default(null),
    // Capped in the service (`recipes.tags_too_many`); the schema only bounds the payload.
    tagIds: z.array(id).max(100).default([]),
    lines: z.array(lineInput).max(MAX_LINES).default([]),
    steps: z.array(stepInput).max(MAX_STEPS).default([]),
  })
  .strict();

/** Creating a Variant: the title is required, anything else overrides the copy. */
export const variantCreate = z
  .object({
    title,
  })
  .strict();

/** A Family line: an Ingredient or an Unmatched name, exactly one (the service checks, with a coded error). */
export const familyLineInput = lineInput.extend({
  ingredientId: id.nullable().default(null),
  rawName: z.string().trim().min(1).max(MAX_RAW_NAME).nullable().default(null),
});

/**
 * Carries the Member's Catalog Language into the services. The request's own
 * value is ignored, whatever it is (the controller overwrites it from the
 * stored Preference), so it may be left out; it is only here so the document
 * keeps its shape.
 */
const memberLocale = z.enum(CATALOG_LOCALES).catch(FALLBACK_LOCALE);

/** Replacing a Family Recipe's document; its base is fixed at creation. */
export const familyRecipeUpdate = recipeDocument
  .extend({ lines: z.array(familyLineInput).max(MAX_LINES).default([]) })
  .extend({
    locale: memberLocale,
    /**
     * Only `null` is meaningful: it clears the Source Link and the source language.
     * Any string is refused by the service (`recipes.source_link_locked`), so the
     * client gets the specific code rather than a generic validation error.
     */
    sourceLink: z.string().nullable().optional(),
    /** Only `null` is meaningful: it clears the source language alone. Same refusal as above. */
    sourceLanguage: z.string().nullable().optional(),
  });

/** A Tip in a create document: it refers to a Step of the document by index, or is a Tip of the whole Recipe (`stepIndex` null). */
const newStepTip = z
  .object({ stepIndex: z.number().int().min(0).nullable(), text: longText })
  .strict();

/**
 * Which language a reading (a link now, pasted text in ticket 512) writes the Recipe in:
 * the Member's Catalog Language (the default) or the source's own ("keep the page's language").
 */
export const readingLanguage = z.enum(['catalog', 'source']);
export type ReadingLanguage = z.infer<typeof readingLanguage>;

/** A detected source language: a short lower-case code such as "en" or "pt-br". */
export const sourceLanguageInput = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2,3}(-[a-z0-9]{2,5})?$/);

/** Creating a Family Recipe: `parentId` makes it a Variant, null/absent a standalone Base Recipe. */
export const familyRecipeCreate = familyRecipeUpdate
  .extend({
    parentId: id.nullable().default(null),
    /** Optional: a saved draft brings its guidance along; edits go through the guidance endpoint. */
    guidance: guidanceBody.optional(),
    /**
     * Optional step Tips for a new Recipe (a Variant draft brings the source's).
     * `stepIndex` is the position of a Step in `steps` of this same document;
     * the array order is the Tip order. Later edits use the Tip endpoints.
     */
    tips: z.array(newStepTip).max(MAX_TIPS).optional(),
    /** Optional: the page a Recipe from Link was read from, normalised on the way in. Set at creation only; an update can only clear it. */
    sourceLink: sourceLinkInput.optional(),
    /** Optional: the language a translated Recipe from Link was read in. Set at creation only. */
    sourceLanguage: sourceLanguageInput.optional(),
    /**
     * Optional: the Member's Recipe Draft this save ends (ADR 0028). It is deleted in the
     * same transaction as the create; an unknown, malformed (up to 64 characters) or another Member's id is ignored.
     */
    recipeDraftId: z.string().max(64).optional(),
  })
  .refine(
    (body) => body.sourceLanguage === undefined || Boolean(body.sourceLink),
    { message: 'sourceLanguage needs a sourceLink', path: ['sourceLanguage'] },
  );

/** The most pasted recipe text one read takes. */
export const MAX_PASTED_TEXT_CHARS = 50_000;

/**
 * Reading a page, or pasted recipe text, into an unsaved Family Recipe draft: exactly one
 * of `url` and `text`. Blank text counts as absent. `force` skips the "already in your Recipes" check
 * of a link; for pasted text there is no such check, so it is accepted and ignored.
 */
export const fromLinkBody = z
  .object({
    locale: memberLocale,
    url: z.string().trim().min(1).max(4096).optional(),
    text: z
      .string()
      .trim()
      .max(MAX_PASTED_TEXT_CHARS)
      .transform((text) => text || undefined)
      .optional(),
    language: readingLanguage.default('catalog'),
    force: z.boolean().optional(),
  })
  .strict()
  .refine((body) => (body.url === undefined) !== (body.text === undefined), {
    message: 'give exactly one of url and text',
  });

/** The link the sheet asks about before it reads (not normalised here: the server does that, as a read does). */
export const linkCheckQuery = z.object({
  url: z.string().trim().min(1).max(4096),
});
export type LinkCheckQuery = z.infer<typeof linkCheckQuery>;

/** `GET /api/recipes/link-check`: the live Family Recipe the link already is, or null. */
export type LinkCheck = { recipeId: string | null };

/** The Plate Scan dish the Review wants the closest Catalog Base Recipe for. */
export const plateMatchesBody = z
  .object({
    locale: memberLocale,
    dishTitle: z.string().trim().max(200),
    ingredientIds: z.array(id).max(100),
    /** The "show hidden" override for "Hide Recipes with my Allergies" (#359). */
    showHidden: z.boolean().optional(),
  })
  .strict();

export const tipCreate = z
  .object({ text: longText, stepId: id.nullable().default(null) })
  .strict();
export const tipUpdate = z
  .object({ text: longText, stepId: id.nullable() })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required',
  });
/** Every Tip of the Recipe, in the wanted order. */
export const tipOrder = z.object({
  ids: z
    .array(id)
    .refine((ids) => new Set(ids).size === ids.length, 'ids must be unique'),
});

/** The base Recipe-level Tips a Variant hides (the full set; empty shows all). */
export const hiddenTipsBody = z.object({
  tipIds: z
    .array(id)
    .refine((ids) => new Set(ids).size === ids.length, 'ids must be unique'),
});

const optionalText = <T extends z.ZodType<string>>(schema: T) =>
  z.union([schema, z.null()]);

/**
 * One locale's translations of a Recipe's text. Keys not mentioned stay as
 * they are; `null` deletes that translation (the source text shows again).
 */
export const translationsBody = z
  .object({
    title: optionalText(title).optional(),
    steps: z.record(id, optionalText(longText)).default({}),
    lines: z.record(id, optionalText(note)).default({}),
    tips: z.record(id, optionalText(longText)).default({}),
    ...guidanceTranslationsBody,
  })
  .strict();

export const translationLocaleParam = z.object({
  id,
  locale: z.enum(CATALOG_LOCALES),
});

export const recipeListQuery = z.object({
  /** Only Base Recipes (no parent): the "new Variant" picker. */
  baseOnly: z.enum(['true', 'false']).default('false'),
  /** Include archived Recipes; the picker leaves them out. */
  archived: z.enum(['include', 'exclude']).default('include'),
});

/** The `showHidden` query flag, as a boolean. */
const showHiddenQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/** Whose Recipes a Member read lists: the Family's own or the Catalog's. Absent means both. */
export const recipeScopeQuery = z.enum(['family', 'catalog']).optional();
export type RecipeScope = NonNullable<z.infer<typeof recipeScopeQuery>>;

/** The most Tags one browse can ask for. */
const MAX_FILTER_TAGS = 20;

/** Member browsing: no search or filter lists Base Recipes only. */
export const browseQuery = z.object({
  /**
   * `family`: the Family's live Recipes, Variants included. `catalog`: Catalog Bases, or Catalog
   * Variants while searching or filtering, counting Catalog Variants only. Absent: both mixed.
   */
  scope: recipeScopeQuery,
  search: z.string().trim().max(100).optional(),
  /**
   * Tag ids, all of which a Recipe must have (AND). Comma-separated (`tagIds=a,b`) or repeated.
   * A Variant is matched on its own Tags.
   */
  tagIds: z
    .preprocess(
      (value) =>
        typeof value === 'string' ? value.split(',').filter(Boolean) : value,
      z.array(id).max(MAX_FILTER_TAGS),
    )
    .optional(),
  /** Opt in to Variants alongside Base Recipes with no search or filter. */
  includeVariants: z.enum(['true', 'false']).optional(),
  /**
   * The "show hidden" override (#359): list Recipes even when the Member's "Hide Recipes with my
   * Allergies" is on. The Meal Plan picker, the Pairing picker and the Plate Scan title search
   * all pass it, since those never hide (ADR 0012).
   */
  showHidden: showHiddenQuery,
});

/** The filter pickers' options; `scope` narrows the Tags offered to those in use in it. */
export const filtersQuery = z.object({ scope: recipeScopeQuery });

export const recipeParam = z.object({ id });
export const recipeTipParam = z.object({ id, tipId: id });

export type RecipeDocument = z.infer<typeof recipeDocument>;
export type LineInput = z.infer<typeof lineInput>;
export type StepInput = z.infer<typeof stepInput>;
export type FamilyLineInput = z.infer<typeof familyLineInput>;
export type FamilyRecipeUpdate = z.infer<typeof familyRecipeUpdate>;
export type FamilyRecipeCreate = z.infer<typeof familyRecipeCreate>;
export type PlateMatchesBody = z.infer<typeof plateMatchesBody>;
export type FromLinkBody = z.infer<typeof fromLinkBody>;
export type VariantCreate = z.infer<typeof variantCreate>;
export type TipCreate = z.infer<typeof tipCreate>;
export type TipUpdate = z.infer<typeof tipUpdate>;
export type TipOrder = z.infer<typeof tipOrder>;
export type HiddenTipsBody = z.infer<typeof hiddenTipsBody>;
export type TranslationsBody = z.infer<typeof translationsBody>;
export type RecipeListQuery = z.infer<typeof recipeListQuery>;
export type BrowseQuery = z.infer<typeof browseQuery>;
export type FiltersQuery = z.infer<typeof filtersQuery>;

export type RecipeLineView = {
  id: string;
  ingredientId: string | null;
  /** Whose Ingredient the line uses: a Family's own or the Catalog's; null on an Unmatched line. */
  ingredientOwner: RecipeOwner | null;
  quantity: number | null;
  unit: (typeof ingredientUnit.enumValues)[number] | null;
  optional: boolean;
  note: string | null;
};
export type RecipeStepView = {
  id: string;
  text: string;
  timerSeconds: number | null;
};
export type RecipeTipView = {
  id: string;
  stepId: string | null;
  text: string;
};
export type RecipeTranslationsView = Record<
  string,
  {
    title: string | null;
    steps: Record<string, string>;
    lines: Record<string, string>;
    tips: Record<string, string>;
  } & GuidanceTranslationsView
>;

/** The Admin's view of a Catalog Recipe: source text plus every translation. */
export type AdminRecipeDetail = AdminGuidance & {
  id: string;
  parentId: string | null;
  title: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  difficulty: (typeof recipeDifficulty.enumValues)[number] | null;
  /** The ids of this Recipe's Tags (the editor resolves them against the pickable Tags). */
  tagIds: string[];
  archived: boolean;
  archivedAt: string | null;
  /** The normalised page a Recipe from Link was read from; null otherwise. */
  sourceLink: string | null;
  /** The language a translated Recipe from Link was read in; null otherwise. */
  sourceLanguage: string | null;
  lines: RecipeLineView[];
  steps: RecipeStepView[];
  /** This Recipe's own Tips, in order; `stepId` null for Recipe-level Tips. */
  tips: RecipeTipView[];
  /** A Variant's base Recipe-level Tips with whether this Variant hides each; null on a Base Recipe. */
  parentTips: (RecipeTipView & { hidden: boolean })[] | null;
  translations: RecipeTranslationsView;
};

export type AdminRecipeListItem = {
  id: string;
  parentId: string | null;
  title: string;
  servings: number;
  difficulty: AdminRecipeDetail['difficulty'];
  archived: boolean;
};

export type RecipeOwner = 'catalog' | 'family';

/** A Recipe with its text resolved for one locale (source text as fallback). */
export type ResolvedRecipe = {
  id: string;
  parentId: string | null;
  /** Whose Recipe it is: the Catalog's, or the Member's Family's own. */
  owner: RecipeOwner;
  locale: string;
  title: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  difficulty: AdminRecipeDetail['difficulty'];
  /** Every Tag on the Recipe in the viewer's language: Family Tags first, then Catalog Tags by Tag Group. */
  tags: RecipeTag[];
  archived: boolean;
  /** The normalised page a Recipe from Link was read from; null otherwise (and always on a Catalog Recipe). */
  sourceLink: string | null;
  /** The language a translated Recipe from Link was read in; null otherwise (and always on a Catalog Recipe). */
  sourceLanguage: string | null;
  lines: (RecipeLineView & { ingredientName: string })[];
  steps: RecipeStepView[];
  /** Own Tips plus, on a Variant, the base's non-hidden Recipe-level Tips (`inherited`). */
  tips: (RecipeTipView & { inherited: boolean })[];
  /** Pairings, Eating Moments and the Nutrition Note, resolved for the locale. */
  guidance: ResolvedGuidance;
};

type NamedRef = { id: string; name: string };

export type { RecipeTag };

/** One row of the Member's Recipe list. */
export type RecipeListItem = {
  id: string;
  title: string;
  parentId: string | null;
  /** The base of a Variant (its title in the requested locale), null on a Base Recipe. */
  base: { id: string; title: string } | null;
  /** Every Tag on the Recipe in the viewer's language: Family Tags first, then Catalog Tags by Tag Group. */
  tags: RecipeTag[];
  /** Live Variants of a Base Recipe; 0 on a Variant. */
  variantCount: number;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  difficulty: AdminRecipeDetail['difficulty'];
  owner: RecipeOwner;
  /** On a Catalog Recipe: the Family's live copy of it (Add to Family), else null. Always null on a Family Recipe. */
  familyCopyId: string | null;
  /** On a Family copy: the Catalog Recipe it was Copied From, else null. Groups a Family Variant under the Family's copy of its Base. */
  copiedFromId: string | null;
  /** The compact Allergy Warning, judged on this Recipe's own lines; null when nothing the viewer must avoid is, or might be, in it. */
  allergyWarning: CompactAllergyWarning | null;
};

/** The Member's Recipe list, with how many Recipes "Hide Recipes with my Allergies" left out (#359). */
export type RecipeList = {
  recipes: RecipeListItem[];
  /** 0 when the preference is off or `showHidden` was passed. */
  hiddenByAllergiesCount: number;
};

/** A Variant as listed on its base's detail. */
export type RecipeVariantItem = {
  id: string;
  title: string;
  tags: RecipeTag[];
  owner: RecipeOwner;
  /** The Family's live copy of a Catalog Variant, else null. */
  familyCopyId: string | null;
};

/** One Allergen a Recipe is known to contain, with the lines it comes from. */
export type RecipeAllergenItem = {
  allergen: { id: string; name: string };
  lines: { id: string; ingredientName: string; optional: boolean }[];
  /** Every source line is optional, so the Allergen can be left out. */
  optionalOnly: boolean;
};

/** A Recipe's Allergens, derived from its own Ingredient Lines (ADR 0014). */
export type RecipeAllergens = {
  /** In the Admin-curated Allergen order. */
  items: RecipeAllergenItem[];
  /** Lines that could not be checked: untagged Family Ingredients and Unmatched lines. */
  uncheckedCount: number;
};

/** One person's Allergy a Recipe contains, with the lines that contain it (markers in the Ingredients tab). */
export type AllergyWarningEntryView = {
  allergen: { id: string; name: string };
  /** Whose Allergy it is; the viewer's own and Family Allergies come first. */
  owner: AllergyOwner;
  /** `yours` when it counts as the viewer's own (their own, the Family's), `members` for another Member's. */
  tier: 'yours' | 'members';
  /** `strong` when a required, checked line contains it, `soft` when only optional or Unchecked lines do. */
  severity: 'strong' | 'soft';
  /** Every line that contains it, each with its own severity (`soft` for an optional or Unchecked line). */
  lines: { lineId: string; severity: 'strong' | 'soft' }[];
};

/**
 * The Allergy Warning on a Recipe, from the viewer's Allergies (ADR 0014). Null when the
 * Recipe holds none of them and every line could be checked.
 */
export type AllergyWarningView = {
  /** `strong` when any entry is strong; `soft` when only optional or Unchecked lines raise it. */
  severity: 'strong' | 'soft';
  /** The Allergies the Recipe contains: own and Family first, then other Members'. Empty when only Unchecked lines raise it. */
  entries: AllergyWarningEntryView[];
  /** Lines that could not be checked for Allergens. */
  uncheckedCount: number;
};

/**
 * The Allergy Warning as a list row, strip tile or match shows it: the same severity as on
 * Recipe detail, one item per Allergen (not per person) named in the viewer's locale, with
 * whose Allergy it is (`owners`). The line markers stay on detail. Null when nothing the viewer must avoid is,
 * or might be, in the Recipe.
 *
 * Hiding (`hidden`, `hiddenByAllergiesCount`) is reported beside this warning, not inside it.
 */
export type CompactAllergyWarning = {
  /** As on Recipe detail: `strong` when any Allergen is in a required, checked line; `soft` when only optional or Unchecked lines raise it. */
  severity: 'strong' | 'soft';
  /** The Allergens behind the warning, in the Allergy Warning's order. Empty when only Unchecked lines raise it. */
  allergens: {
    id: string;
    name: string;
    /** `yours` when it is the viewer's own or a Family Allergy, `members` when only another Member's. */
    tier: 'yours' | 'members';
    /** `strong` when a required, checked line contains it for anyone listed, `soft` when only optional or Unchecked lines do. */
    severity: 'strong' | 'soft';
    /**
     * Whose Allergy it is, decided by `deriveAllergens`: the viewer (`own`), a Family Allergy
     * by its optional label, or another Member by name. The viewer's own and Family
     * Allergies come first.
     */
    owners: AllergyWarningOwner[];
  }[];
  /** Lines that could not be checked for Allergens. */
  uncheckedCount: number;
};

/**
 * The Member's Recipe detail. Extend with more sections (guidance, Pantry
 * status per line id) by adding fields here.
 */
export type RecipeDetail = ResolvedRecipe & {
  /** Null on a Base Recipe. */
  base: {
    id: string;
    title: string;
    archived: boolean;
    /** The Family's live copy of a Catalog base, else null. */
    familyCopyId: string | null;
  } | null;
  /** The live Variants of a Base Recipe, ordered by title; empty on a Variant. */
  variants: RecipeVariantItem[];
  /** The Family's live copy of a Catalog Recipe, else null (always null on a Family Recipe). */
  familyCopyId: string | null;
  /** The Catalog Base a Family Base was Copied From, else null. */
  copiedFrom: { id: string; archived: boolean } | null;
  /** Ingredients that differ from the base; null on a Base Recipe. */
  diff: RecipeDiff | null;
  /** What the Recipe is known to contain, worked out from its own lines. */
  allergens: RecipeAllergens;
  /** Null when nothing the viewer must avoid is, or might be, in the Recipe. */
  allergyWarning: AllergyWarningView | null;
};

export type RecipeFilters = {
  /**
   * The Tags used on at least one live Recipe in `scope` (Family Tags only the Family's own),
   * in the viewer's language: Family Tags first, then Catalog Tags by Tag Group order, then by name.
   */
  tags: RecipeTag[];
  /** Live Eating Moments in sort order. They feed the guidance editor's picker, not a browsing filter. */
  eatingMoments: NamedRef[];
};

/** The draft a link reading returns: the variant-draft shape without a base, and Servings empty when the page had none. */
export type LinkRecipeDraft = Omit<
  FamilyRecipeDraft,
  'parentId' | 'servings'
> & {
  servings: number | null;
};

/**
 * The result of `POST /api/recipes/from-link`, told apart by `kind`. `duplicate` is the Member's own Recipe
 * for the same link; `draft` is the reading.
 */
export type RecipeFromLink = RecipeFromLinkDraft | RecipeFromLinkDuplicate;

/** The link is already a live Recipe of the Member's Family (and `force` was not set): nothing was fetched, read or counted. */
export type RecipeFromLinkDuplicate = { kind: 'duplicate'; recipeId: string };

export type RecipeFromLinkDraft = {
  kind: 'draft';
  /**
   * The Member's Recipe Draft the server stored for this read (ADR 0031): open the New Recipe
   * editor on it. The read is already in Drafts, so a reload loses nothing.
   */
  recipeDraftId: string;
  draft: LinkRecipeDraft;
  /** The normalised link, to send back on the create request; null for pasted text. */
  sourceLink: string | null;
  /**
   * The detected language of the page, only when the draft is written in another one (a translation);
   * null when it is the same or unknown, and always with the "source" language choice. Send it back on create.
   */
  sourceLanguage: string | null;
  /** The Catalog Base Recipes closest to the draft, ranked as for a Plate Scan. */
  closestBases: PlateMatchView[];
  /** How many of the closest were left out by "Hide Recipes with my Allergies". */
  hiddenByAllergiesCount: number;
};

/** What `createIn` takes: the create body without the transport-level locale default. */
export type FamilyRecipeDocument = Omit<FamilyRecipeCreate, 'locale'>;

/**
 * The editable view of a Family Recipe (`GET /api/recipes/:id/edit` and the
 * response of every Family write). Lines carry ids, the Ingredient's name in
 * the requested locale (or the raw name) and `rawName` for Unmatched lines.
 */
export type FamilyRecipeEdit = Omit<
  AdminRecipeDetail,
  'translations' | 'lines' | 'pairings'
> & {
  /** A Variant's Catalog base title in the requested locale; null on a Base Recipe. */
  parentTitle: string | null;
  /** Pairings with display names for their links: null without a link, or when the Recipe is archived or not visible. */
  pairings: (AdminGuidance['pairings'][number] & {
    linkedIngredientName: string | null;
    linkedRecipeTitle: string | null;
  })[];
  lines: (RecipeLineView & {
    rawName: string | null;
    ingredientName: string;
  })[];
};

/** An unsaved "Make a variant" draft: a document to edit and POST to `/api/recipes`. No ids. */
export type FamilyRecipeDraft = {
  /** The Base Recipe the draft goes under: the source itself, or the source's base. */
  parentId: string;
  title: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  difficulty: AdminRecipeDetail['difficulty'];
  /** Every Tag of the source: a new Variant starts with its Base's Tags. */
  tagIds: string[];
  /** `ingredientName` and `ingredientOwner` are for display only; drop them when posting. */
  lines: {
    ingredientId: string | null;
    rawName: string | null;
    ingredientName: string;
    /** Whose Ingredient the line uses (for the Family pill); null on an Unmatched line. */
    ingredientOwner: RecipeOwner | null;
    quantity: number | null;
    unit: RecipeLineView['unit'];
    optional: boolean;
    note: string | null;
  }[];
  steps: { text: string; timerSeconds: number | null }[];
  /** The source's own step Tips (not inherited ones), in order; `stepIndex` is the index into `steps`. */
  tips: { stepIndex: number; text: string }[];
  /** The source's guidance in the requested locale, ready to post (no ids). */
  guidance: GuidanceBody;
};
/** `today` is the Member's local date; it defaults to the server's UTC date. */
export const cookTonightQuery = z.object({
  /** Only the Family's own Recipes (`family`) or only Catalog ones (`catalog`); absent is both. */
  scope: recipeScopeQuery,
  today: z.iso.date().optional(),
  /** The "show hidden" override for "Hide Recipes with my Allergies" (#359). */
  showHidden: showHiddenQuery,
});
export type CookTonightQuery = z.infer<typeof cookTonightQuery>;

/** One Base Recipe's card: the best matching Recipe of its group. */
export type CookTonightCard = {
  /** The group's Base Recipe (the best match itself on a base or standalone card). */
  base: { id: string; title: string; archived: boolean };
  recipe: {
    id: string;
    title: string;
    parentId: string | null;
    owner: RecipeOwner;
    /** The Family's live copy of a Catalog Recipe, else null. */
    familyCopyId: string | null;
    servings: number;
    prepMinutes: number | null;
    cookMinutes: number | null;
    tags: RecipeTag[];
    allergyWarning: CompactAllergyWarning | null;
  };
  canMake: boolean;
  /** Set only for a near miss: the one short or missing required line. */
  missing: { ingredientId: string | null; name: string } | null;
  expiringCount: number;
  /** Other Recipes in the group the Family can make; near misses are not counted. */
  otherVariantsCount: number;
};

export type CookTonightView = {
  cards: CookTonightCard[];
  /**
   * Every group that "Hide Recipes with my Allergies" left out or swapped for another Recipe of
   * its group, not just the cards a widget shows (0 when off or overridden).
   */
  hiddenByAllergiesCount: number;
};

/** A Plate Scan's matches, with how many "Hide Recipes with my Allergies" left out of the closest five (#359). */
export type PlateMatches = {
  matches: PlateMatchView[];
  hiddenByAllergiesCount: number;
};

/** A Plate Scan's closest-match Base Recipe with the viewer's compact Allergy Warning. */
export type PlateMatchView = PlateMatch & {
  /** The Family's live copy of this Catalog Base, else null. */
  familyCopyId: string | null;
  allergyWarning: CompactAllergyWarning | null;
};
