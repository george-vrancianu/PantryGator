import { Button, Dialog } from '@pocket-pantry/ui';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogSearch } from './catalogSearch/CatalogSearch';
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
  /** Escape, backdrop click, or Cancel: the line stays as it was. */
  onClose: () => void;
};

/**
 * Pick the Ingredient a Review line matches: a bottom sheet on a phone, a
 * centred dialog on a wide screen. One instance serves every layout.
 */
export function MatchDialog({
  open,
  name,
  defaultQuery,
  newIngredientAllergenIds,
  onSelect,
  onClose,
}: Props) {
  const { t } = useTranslation(['review', 'common']);
  const searchRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('review:match.dialogTitle', { name })}
      initialFocus={searchRef}
      actions={
        <Button variant="ghost" onClick={onClose}>
          {t('common:cancel')}
        </Button>
      }
    >
      <CatalogSearch
        inputRef={searchRef}
        showUnit={false}
        defaultQuery={defaultQuery}
        newIngredientAllergenIds={newIngredientAllergenIds}
        onSelect={onSelect}
      />
    </Dialog>
  );
}
