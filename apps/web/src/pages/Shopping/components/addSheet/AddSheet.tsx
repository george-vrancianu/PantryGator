import {
  Box,
  Sheet,
  Typography,
  displayType,
  radius,
  tokens,
} from '@pocket-pantry/ui';
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
 * The Add sheet: a header with Done, and the ingredient search. It owns
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
  const [addedCount, setAddedCount] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setIngredients(emptyIngredients);
      setAddedCount(0);
    }
  }
  const header = (
    <Box sx={{ p: '10px 16px 10px 20px' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          mb: 1.5,
        }}
      >
        <Typography
          component="h2"
          sx={{
            ...displayType,
            fontSize: 22,
          }}
        >
          {t('addSheet.title')}
        </Typography>
        <Box
          component="button"
          type="button"
          onClick={onClose}
          aria-label={
            addedCount > 0
              ? t('sheet.doneCount', { count: addedCount })
              : t('sheet.done')
          }
          sx={{
            height: 36,
            px: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            border: 0,
            borderRadius: radius.pill,
            cursor: 'pointer',
            backgroundColor: tokens.color.ink,
            color: tokens.color.bg,
            font: 'inherit',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {addedCount > 0 ? (
            <Box
              component="span"
              aria-hidden
              sx={{
                minWidth: 20,
                height: 20,
                px: '5px',
                display: 'grid',
                placeItems: 'center',
                borderRadius: radius.pill,
                backgroundColor: tokens.color.bg,
                color: tokens.color.ink,
                fontSize: 11.5,
                fontWeight: 700,
              }}
            >
              {addedCount}
            </Box>
          ) : null}
          <span aria-hidden>{t('sheet.done')}</span>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      onExited={onExited}
      label={t('addSheet.title')}
      header={header}
      initialFocus={searchRef}
    >
      <Box sx={{ p: '4px 20px 24px' }}>
        <IngredientsSearch
          state={ingredients}
          onStateChange={setIngredients}
          searchRef={searchRef}
          adding={adding}
          onAdd={onAdd}
          error={addError}
          suggestions={suggestions}
          onAdded={() => setAddedCount((count) => count + 1)}
        />
      </Box>
    </Sheet>
  );
}
