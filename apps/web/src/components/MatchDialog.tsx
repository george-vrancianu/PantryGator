import { Sheet } from '@pocket-pantry/ui';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogSearch } from '@/components/catalogSearch/CatalogSearch/CatalogSearch';
import type { CatalogSearchResult } from '../lib/catalog';

type Props = {
  open: boolean;
  /** The name of the line being matched. */
  name: string;
  /** Pre-types the search: a barcode product the lookup could not match with confidence. */
  defaultQuery?: string;
  /** Ticked in the Contains row if the Member adds a new Family Ingredient: the Allergens a barcode product lists. */
  newIngredientAllergenIds?: readonly string[];
  onSelect: (match: CatalogSearchResult) => void;
  /** The X, Escape or a scrim tap: the line stays as it was. */
  onClose: () => void;
};

/**
 * Pick the Ingredient a Review line matches: a content-sized Sheet. Tapping a
 * row picks; the X leaves the line as it was.
 */
export function MatchDialog({
  open,
  name,
  defaultQuery,
  newIngredientAllergenIds,
  onSelect,
  onClose,
}: Props) {
  const { t } = useTranslation('review');
  const searchRef = useRef<HTMLInputElement>(null);
  return (
    <Sheet
      size="content"
      open={open}
      onClose={onClose}
      title={t('review:match.dialogTitle', { name })}
      initialFocus={searchRef}
    >
      <CatalogSearch
        inputRef={searchRef}
        showUnit={false}
        defaultQuery={defaultQuery}
        newIngredientAllergenIds={newIngredientAllergenIds}
        onSelect={onSelect}
      />
    </Sheet>
  );
}
