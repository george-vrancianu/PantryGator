import { Box, palette } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { IngredientIconSlot } from '@/components/catalog/IngredientIconSlot/IngredientIconSlot';

/** The non-interactive "No match for “…”" row with its hint. */
export function NoMatchRow({
  query,
  inAisle = false,
}: {
  query: string;
  /** Inside an opened Aisle the hint points at the Aisle instead. */
  inAisle?: boolean;
}) {
  const { t } = useTranslation('catalog');
  return (
    <Box
      onMouseDown={(event) => event.preventDefault()}
      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: '10px 14px' }}
    >
      <Box sx={{ color: palette('text-secondary'), display: 'flex' }}>
        <IngredientIconSlot />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ fontSize: 15, fontWeight: 600 }}>
          {t('search.noMatchFor', { query })}
        </Box>
        <Box sx={{ fontSize: 13, color: palette('text-secondary') }}>
          {t(inAisle ? 'search.noMatchAisleHint' : 'search.noMatchHint')}
        </Box>
      </Box>
    </Box>
  );
}
