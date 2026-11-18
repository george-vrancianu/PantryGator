import type { ThemeId } from '@pocket-pantry/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiRequest } from './api';
import {
  catalogAllergensQueryKey,
  catalogSearchQueryKey,
  type CatalogAllergen,
} from './catalog';
import { familyCatalogQueryKey } from './familyCatalog';
import { recipesQueryKey } from './recipes';
import {
  mealPlanQueryKey,
  recipeMatchingQueryKeys,
  suggestionsQueryKey,
} from './queryKeys';
import type { Locale, ScanLanguage } from '../i18n/resources';
import { languagePicksBody, type LanguagePicks } from './intro';

export type ExpiryOverride = {
  categoryId: string;
  name: string;
  days: number;
};

export type FamilySettings = {
  staleThresholdDays: number;
  expiryOverrides: ExpiryOverride[];
};

/**
 * A category a Default Expiry override can target. `catalogDays` is the Catalog's default for it in
 * days (a Leaf without its own has its Parent's); `null` leaves the Catalog comparison out.
 */
export type CategoryOption = {
  id: string;
  name: string;
  catalogDays: number | null;
};

export type CategoryOptions = {
  parents: (CategoryOption & { leaves: CategoryOption[] })[];
};

/** `null` means never chosen: the default applies. */
export type MemberPreferences = {
  locale: Locale | null;
  /** `null` is "Same as UI Language". */
  catalogLanguage: Locale | null;
  /** The language Pantry and Shopping names are shown in, worked out by the API. */
  effectiveCatalogLanguage: Locale;
  /** `null` is "Same as UI Language". */
  scanLanguage: ScanLanguage | null;
  /** The language Scans are read in by default, worked out by the API. */
  effectiveScanLanguage: ScanLanguage;
  /** The language Voice Notes are spoken in; `null` is "Same as UI Language". */
  spokenLanguage: ScanLanguage | null;
  /** The language Voice Notes are spoken in by default, worked out by the API. */
  effectiveSpokenLanguage: ScanLanguage;
  theme: ThemeId | null;
  /** Leave out Recipes with the Member's own or Family Allergies; off by default. */
  hideRecipesWithAllergies: boolean;
  /** The Member has been through the Intro and reached the Dashboard from it; never undone. */
  introDone: boolean;
};

export const preferencesQueryKey = ['settings', 'preferences'] as const;
export const familySettingsQueryKey = ['settings', 'family'] as const;

export function useFamilySettings() {
  return useQuery({
    queryKey: familySettingsQueryKey,
    queryFn: () => apiRequest<FamilySettings>('/settings/family'),
  });
}

/** The API's default Stale Threshold, used for expiry tags until Family Settings have loaded (or if they fail). */
const DEFAULT_STALE_THRESHOLD_DAYS = 3;

/** The Family's Stale Threshold, which colours every expiry tag. Changing it re-colours them on the next render. */
export function useStaleThresholdDays(): number {
  return (
    useFamilySettings().data?.staleThresholdDays ?? DEFAULT_STALE_THRESHOLD_DAYS
  );
}

const categoryOptionsQueryKey = ['settings', 'categories'] as const;

export function useCategoryOptions() {
  return useQuery({
    queryKey: categoryOptionsQueryKey,
    queryFn: () => apiRequest<CategoryOptions>('/settings/categories'),
    staleTime: 5 * 60_000,
  });
}

/** Anything derived from Family Settings (expiry tags, form pre-fill) must refetch after a change. */
function useRefreshAfterFamilyChange() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: familySettingsQueryKey }),
      queryClient.invalidateQueries({ queryKey: ['pantry'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-search'] }),
      ...recipeMatchingQueryKeys.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    ]);
}

export function useSetStaleThreshold() {
  const refresh = useRefreshAfterFamilyChange();
  return useMutation({
    mutationFn: (staleThresholdDays: number) =>
      apiRequest('/settings/family', {
        method: 'PATCH',
        body: { staleThresholdDays },
      }),
    onSuccess: refresh,
  });
}

export function useSetExpiryOverride() {
  const refresh = useRefreshAfterFamilyChange();
  return useMutation({
    mutationFn: (input: { categoryId: string; days: number }) =>
      apiRequest(`/settings/family/expiry-overrides/${input.categoryId}`, {
        method: 'PUT',
        body: { days: input.days },
      }),
    onSuccess: refresh,
  });
}

export function useRemoveExpiryOverride() {
  const refresh = useRefreshAfterFamilyChange();
  return useMutation({
    mutationFn: (categoryId: string) =>
      apiRequest(`/settings/family/expiry-overrides/${categoryId}`, {
        method: 'DELETE',
      }),
    onSuccess: refresh,
  });
}

/** The Member's Preferences. The API works the effective languages out from what is stored, so nothing about the device goes along. */
export function useMemberPreferences() {
  return useQuery({
    queryKey: preferencesQueryKey,
    queryFn: () => apiRequest<MemberPreferences>('/settings/preferences'),
    retry: false,
  });
}

/**
 * Patches the language fields a save returned into the cache. Names come back in the Catalog Language, which
 * the query keys do not name, so they refetch when the effective one changed (a Scan or Spoken Language save
 * leaves it alone).
 */
function useApplySavedLanguages() {
  const queryClient = useQueryClient();
  return (saved: MemberPreferences) => {
    const before =
      queryClient.getQueryData<MemberPreferences>(
        preferencesQueryKey,
      )?.effectiveCatalogLanguage;
    // Only the language fields; a Theme save may have landed meanwhile.
    queryClient.setQueryData<MemberPreferences>(preferencesQueryKey, (old) =>
      old
        ? {
            ...old,
            locale: saved.locale,
            catalogLanguage: saved.catalogLanguage,
            effectiveCatalogLanguage: saved.effectiveCatalogLanguage,
            scanLanguage: saved.scanLanguage,
            effectiveScanLanguage: saved.effectiveScanLanguage,
            spokenLanguage: saved.spokenLanguage,
            effectiveSpokenLanguage: saved.effectiveSpokenLanguage,
          }
        : saved,
    );
    if (before === saved.effectiveCatalogLanguage) return undefined;
    return Promise.all(
      catalogNameQueryKeys.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };
}

const putLocale = (locale: Locale) =>
  apiRequest<MemberPreferences>('/settings/preferences', {
    method: 'PUT',
    body: { locale },
  });

export function useSaveLocale() {
  const apply = useApplySavedLanguages();
  return useMutation({
    mutationFn: putLocale,
    onSuccess: apply,
  });
}

/**
 * Saves the UI Language being shown, once, when the Member has none stored (sign-in). If the Member picked
 * another one while this was in flight (its save already landed, or the UI has moved off the language sent),
 * the reply is dropped so it cannot put the old language back.
 */
export function useSaveInitialLocale() {
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();
  const apply = useApplySavedLanguages();
  return useMutation({
    mutationFn: putLocale,
    onSuccess: (saved, sent) =>
      queryClient.getQueryData<MemberPreferences>(preferencesQueryKey)
        ?.locale || (i18n.resolvedLanguage ?? i18n.language) !== sent
        ? undefined
        : apply(saved),
  });
}

/**
 * Saves one of the three language Preferences (Catalog, Scan or Spoken Language); `null` is "Same as UI
 * Language".
 */
export function useSaveLanguagePreference(
  field: 'catalogLanguage' | 'scanLanguage' | 'spokenLanguage',
) {
  const apply = useApplySavedLanguages();
  return useMutation({
    mutationFn: (language: ScanLanguage | null) =>
      apiRequest<MemberPreferences>('/settings/preferences', {
        method: 'PUT',
        body: { [field]: language },
      }),
    onSuccess: apply,
  });
}

/**
 * Saves the language picks made on Languages, in one call, once the account exists. A row left on "Same"
 * is not in the body, so it stores nothing.
 */
export function saveIntroLanguages(picks: LanguagePicks) {
  return apiRequest<MemberPreferences>('/settings/preferences', {
    method: 'PUT',
    body: languagePicksBody(picks),
  });
}

/** Marks the Member done with the Intro (they reached the Dashboard from it). Idempotent on the API. */
export function useMarkIntroDone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<MemberPreferences>('/settings/preferences', {
        method: 'PUT',
        body: { introDone: true },
      }),
    onSuccess: () =>
      queryClient.setQueryData<MemberPreferences>(preferencesQueryKey, (old) =>
        old ? { ...old, introDone: true } : old,
      ),
  });
}

/** Saves "Hide Recipes with my Allergies"; Recipe lists and matches depend on it. */
export function useSaveHideRecipesWithAllergies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hideRecipesWithAllergies: boolean) =>
      apiRequest<MemberPreferences>('/settings/preferences', {
        method: 'PUT',
        body: { hideRecipesWithAllergies },
      }),
    onSuccess: async (saved) => {
      // Only this preference; a locale or Theme save may have landed meanwhile.
      queryClient.setQueryData<MemberPreferences>(preferencesQueryKey, (old) =>
        old
          ? {
              ...old,
              hideRecipesWithAllergies: saved.hideRecipesWithAllergies,
            }
          : saved,
      );
      await queryClient.invalidateQueries({ queryKey: recipesQueryKey });
    },
  });
}

/** The Allergen list and which of them are the Member's own Allergies. */
export type Allergies = {
  allergens: CatalogAllergen[];
  allergenIds: string[];
};

export const allergiesQueryKey = ['settings', 'allergies'] as const;

export function useAllergies() {
  return useQuery({
    queryKey: allergiesQueryKey,
    queryFn: () => apiRequest<Allergies>('/settings/allergies'),
  });
}

/** Replaces the Member's own Allergies. Every Recipe's Allergy Warning depends on them. */
export function useSaveAllergies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (allergenIds: string[]) =>
      apiRequest<Allergies>('/settings/allergies', {
        method: 'PUT',
        body: { allergenIds },
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(allergiesQueryKey, saved);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: allergiesQueryKey }),
        queryClient.invalidateQueries({ queryKey: recipesQueryKey }),
      ]);
    },
  });
}

/** An Allergy the Family records for someone without an account (mirror of the API's `FamilyAllergyView`). */
export type FamilyAllergy = {
  id: string;
  allergen: CatalogAllergen;
  label: string | null;
};

/** The Family tab's Allergies (mirror of the API's `FamilyAllergiesView`): Family Allergies and the other Members' own. */
export type FamilyAllergies = {
  allergens: CatalogAllergen[];
  familyAllergies: FamilyAllergy[];
  members: { id: string; name: string; allergens: CatalogAllergen[] }[];
};

export const familyAllergiesQueryKey = [
  'settings',
  'family-allergies',
] as const;

export function useFamilyAllergies() {
  return useQuery({
    queryKey: familyAllergiesQueryKey,
    queryFn: () => apiRequest<FamilyAllergies>('/settings/family-allergies'),
  });
}

/** Any Member can change the Family's Allergies, and every Recipe's Allergy Warning depends on them. */
function useChangedFamilyAllergies() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: familyAllergiesQueryKey }),
      queryClient.invalidateQueries({ queryKey: recipesQueryKey }),
    ]);
}

export function useAddFamilyAllergy() {
  const changed = useChangedFamilyAllergies();
  return useMutation({
    mutationFn: (body: { allergenId: string; label: string | null }) =>
      apiRequest<FamilyAllergy>('/settings/family-allergies', {
        method: 'POST',
        body,
      }),
    onSuccess: changed,
  });
}

export function useRemoveFamilyAllergy() {
  const changed = useChangedFamilyAllergies();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ id: string }>(`/settings/family-allergies/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: changed,
  });
}

/** Ingredient, Category and Aisle names in these come back in the Member's Catalog Language, which their keys do not name. Declared last: it reads keys defined further down. */
const catalogNameQueryKeys = [
  ['pantry'],
  ['shopping-list'],
  ['shopping-templates'],
  ['staples'],
  suggestionsQueryKey,
  recipesQueryKey,
  mealPlanQueryKey,
  catalogSearchQueryKey,
  ['catalog-parents'],
  ['catalog-aisles'],
  ['catalog-categories'],
  catalogAllergensQueryKey,
  familyCatalogQueryKey,
  familySettingsQueryKey,
  categoryOptionsQueryKey,
  allergiesQueryKey,
  familyAllergiesQueryKey,
] as const;
