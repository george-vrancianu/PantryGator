import type { CompactAllergyWarning } from './recipes';

/** A Catalog Base Recipe offered as the base of a new Family Recipe. */
export type BaseRecipeOption = {
  id: string;
  title: string;
  allergyWarning?: CompactAllergyWarning | null;
  /** The Family's live copy of this Catalog Base, else null (or unknown). */
  familyCopyId?: string | null;
};
