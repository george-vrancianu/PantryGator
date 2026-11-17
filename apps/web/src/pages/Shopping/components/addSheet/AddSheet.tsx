import { Box, Sheet } from '@pocket-pantry/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NewShoppingItem } from '../../../../lib/shopping';
import type { Suggestions } from '../../../../lib/suggestions';
import {
  emptyIngredients,
  IngredientsSearch,
  type IngredientsState,
} from './IngredientsSearch';

export type AddSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Called once the close transition has finished. */
  onExited?: () => void;
  adding: boolean;
  onAdd: (item: NewShoppingItem) => Promise<boolean>;
  /** Why the last add failed, or null. */
  addError: string | null;
  /** What is gone from the Pantry, and what is running low, shown as tiles while the search is empty. */
  suggestions: Suggestions;
};

/**
 * The Add sheet: the standard X, and the ingredient search (no footer: items are added as the Member goes). It owns
 * everything that belongs to one opening (query, pick, typed amount and
 * unit, adds so far). All of it resets whenever the sheet opens; the lists
 * polled behind it never reset it.
 */
export function AddSheet({
  open,
  onClose,
  onExited,
  adding,
  onAdd,
  addError,
  suggestions,
}: AddSheetProps) {
  const { t } = useTranslation('shopping');
  const [ingredients, setIngredients] =
    useState<IngredientsState>(emptyIngredients);
  const searchRef = useRef<HTMLInputElement>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setIngredients(emptyIngredients);
    }
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      onExited={onExited}
      title={t('addSheet.title')}
      initialFocus={searchRef}
    >
      <Box sx={{ p: '16px 16px 24px' }}>
        <IngredientsSearch
          state={ingredients}
          onStateChange={setIngredients}
          searchRef={searchRef}
          adding={adding}
          onAdd={onAdd}
          error={addError}
          suggestions={suggestions}
        />
      </Box>
    </Sheet>
  );
}
