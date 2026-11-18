import {
  Box,
  InfoIcon,
  Sheet,
  Stack,
  Typography,
  radius,
  tokens,
} from '@pocket-pantry/ui';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IngredientIconSlot } from '@/components/IngredientIconSlot';
import type { FamilyCatalogSynonym } from '@/lib/familyCatalog';

export type FamilySynonymSheetProps = {
  open: boolean;
  synonym: FamilyCatalogSynonym;
  onClose: () => void;
  onExited: () => void;
  /** "Remove this name": the sheet closes itself, then the caller asks to remove the row. */
  onRemove: () => void;
};

/** A Family Synonym of a shared Catalog Ingredient, read-only: to point it elsewhere, remove and add it again. */
export function FamilySynonymSheet({
  open,
  synonym,
  onClose,
  onExited,
  onRemove,
}: FamilySynonymSheetProps) {
  const { t } = useTranslation(['settings', 'common']);
  const removeRequested = useRef(false);
  const meta = t('settings:familyCatalog.synonymMeta', {
    ingredient: synonym.ingredient.name,
  });
  const quoted = t('settings:familyCatalog.quotedName', { name: synonym.name });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      onExited={() => {
        onExited();
        if (!removeRequested.current) return;
        removeRequested.current = false;
        onRemove();
      }}
      title={quoted}
      subtitle={meta}
      size="content"
      destructive={{
        label: t('settings:familyCatalog.synonymRemoveLink'),
        onClick: () => {
          removeRequested.current = true;
          onClose();
        },
      }}
    >
      <Stack spacing={2} sx={{ px: 3, pt: 1, pb: 3 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1.5,
            borderRadius: radius.control,
            bgcolor: tokens.color.subtle,
          }}
        >
          <IngredientIconSlot ingredientId={synonym.ingredient.id} />
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
              {synonym.ingredient.name}
            </Typography>
            <Typography variant="meta" color="text.secondary">
              {t('settings:familyCatalog.inCatalog')}
            </Typography>
          </Box>
        </Box>
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            p: 1.5,
            borderRadius: radius.control,
            bgcolor: tokens.color.subtle,
            color: tokens.color.ink,
          }}
        >
          <Box sx={{ flexShrink: 0, pt: '2px' }}>
            <InfoIcon size={18} />
          </Box>
          <Typography variant="meta">
            {t('settings:familyCatalog.synonymInfo', {
              name: synonym.name,
              ingredient: synonym.ingredient.name,
            })}
          </Typography>
        </Box>
      </Stack>
    </Sheet>
  );
}
