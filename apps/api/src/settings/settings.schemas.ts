import { z } from 'zod';
import { CATALOG_LOCALES, SCAN_LANGUAGES } from '../catalog/catalog.schemas';

export const categoryIdParam = z.uuid();

export const updateFamilySettingsBody = z.object({
  staleThresholdDays: z.number().int().min(1).max(365),
});
export type UpdateFamilySettingsBody = z.infer<typeof updateFamilySettingsBody>;

export const expiryOverrideBody = z.object({
  days: z.number().int().min(1).max(3650),
});
export type ExpiryOverrideBody = z.infer<typeof expiryOverrideBody>;

/** The Theme ids a Member can choose: the UI package's THEME_IDS (packages/ui/src/theme/themeIds.test.ts fails if they drift). */
export const THEME_IDS = ['light', 'dark'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/**
 * Maps a stored or sent Theme id to a current one: `warm` and `minimal` (the
 * pre-Canopy Themes) become `light`, with no cut-off. Anything else is `null`.
 */
export function normalizeTheme(value: unknown): ThemeId | null {
  if (value === 'dark') return 'dark';
  if (value === 'light' || value === 'warm' || value === 'minimal') {
    return 'light';
  }
  return null;
}

/** A Theme id as sent: a current one or a pre-Canopy one, always stored as a current one. */
const themeBody = z
  .enum(['light', 'dark', 'warm', 'minimal'])
  .transform((value): ThemeId => (value === 'dark' ? 'dark' : 'light'));

/** A partial save: whatever is omitted keeps its stored value. An empty body has nothing to update and is rejected. */
export const updatePreferencesBody = z
  .object({
    locale: z.enum(CATALOG_LOCALES).optional(),
    /** A catalog locale, or `null` for "Same as UI Language". */
    catalogLanguage: z.enum(CATALOG_LOCALES).nullable().optional(),
    /** A Scan Language, or `null` for "Same as UI Language". */
    scanLanguage: z.enum(SCAN_LANGUAGES).nullable().optional(),
    /** A Spoken Language (Scan Languages list), or `null` for "Same as UI Language". */
    spokenLanguage: z.enum(SCAN_LANGUAGES).nullable().optional(),
    theme: themeBody.optional(),
    hideRecipesWithAllergies: z.boolean().optional(),
    /** The Member reached the Dashboard from the Intro. Only `true` is accepted: the Intro is never undone. */
    introDone: z.literal(true).optional(),
  })
  .refine(
    (body) =>
      body.locale !== undefined ||
      body.catalogLanguage !== undefined ||
      body.scanLanguage !== undefined ||
      body.spokenLanguage !== undefined ||
      body.theme !== undefined ||
      body.hideRecipesWithAllergies !== undefined ||
      body.introDone !== undefined,
    { message: 'Nothing to update' },
  );
export type UpdatePreferencesBody = z.infer<typeof updatePreferencesBody>;

export type ExpiryOverrideView = {
  categoryId: string;
  /** Localised Category name. */
  name: string;
  days: number;
};

export type FamilySettingsView = {
  staleThresholdDays: number;
  expiryOverrides: ExpiryOverrideView[];
};

/** `catalogDays`: the Catalog's Default Expiry in days, before any Family override. */
export type CategoryOptionView = {
  id: string;
  name: string;
  catalogDays: number | null;
};

export type CategoryOptionsView = {
  parents: (CategoryOptionView & { leaves: CategoryOptionView[] })[];
};

export type PreferencesView = {
  /** The UI Language; `null` until chosen. */
  locale: (typeof CATALOG_LOCALES)[number] | null;
  /** The Catalog Language; `null` is "Same as UI Language". */
  catalogLanguage: (typeof CATALOG_LOCALES)[number] | null;
  /** The Catalog Language the Member gets right now (resolved against the UI Language, then English). */
  effectiveCatalogLanguage: (typeof CATALOG_LOCALES)[number];
  /** The Scan Language; `null` is "Same as UI Language". */
  scanLanguage: (typeof SCAN_LANGUAGES)[number] | null;
  /** The Scan Language the Member gets right now (resolved against the UI Language, then English). */
  effectiveScanLanguage: (typeof SCAN_LANGUAGES)[number];
  /** The Spoken Language (Voice Notes); `null` is "Same as UI Language". */
  spokenLanguage: (typeof SCAN_LANGUAGES)[number] | null;
  /** The Spoken Language the Member gets right now (resolved against the UI Language, then English). */
  effectiveSpokenLanguage: (typeof SCAN_LANGUAGES)[number];
  theme: ThemeId | null;
  /** Leave out Recipes with the Member's own or Family Allergies (#359). */
  hideRecipesWithAllergies: boolean;
  /** The Member has been through (or past) the Intro; `false` sends them to Set up or skip. */
  introDone: boolean;
};

/** A Member replaces their own Allergies wholesale. */
export const replaceAllergiesBody = z.object({
  allergenIds: z.array(z.uuid()).max(100),
});
export type ReplaceAllergiesBody = z.infer<typeof replaceAllergiesBody>;

/** The Allergen list (curated order, named in the locale) and which of them the Member has as Allergies. */
export type AllergiesView = {
  allergens: { id: string; name: string }[];
  allergenIds: string[];
};

const FAMILY_ALLERGY_LABEL_MAX = 60;

/** Any Member adds a Family Allergy: an Allergen and an optional label such as "Mia". */
export const addFamilyAllergyBody = z.object({
  allergenId: z.uuid(),
  label: z.string().trim().max(FAMILY_ALLERGY_LABEL_MAX).nullish(),
});
export type AddFamilyAllergyBody = z.infer<typeof addFamilyAllergyBody>;

export const familyAllergyIdParam = z.uuid();

/** An Allergy the Family records for someone without an account. */
export type FamilyAllergyView = {
  id: string;
  allergen: { id: string; name: string };
  label: string | null;
};

/**
 * The Family tab's Allergies: the Allergen list (for the picker), the Family Allergies, and
 * the other Members' Allergies (read-only; the viewer's own are in `AllergiesView`).
 */
export type FamilyAllergiesView = {
  allergens: { id: string; name: string }[];
  familyAllergies: FamilyAllergyView[];
  members: {
    id: string;
    name: string;
    allergens: { id: string; name: string }[];
  }[];
};
