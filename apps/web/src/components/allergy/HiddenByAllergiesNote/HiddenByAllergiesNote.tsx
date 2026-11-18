import { Box, tokens } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

/**
 * "N Recipes hidden by your Allergies · Show", under "Hide Recipes with my Allergies". Shown
 * only while something is hidden; Show asks the list again with the override.
 */
export function HiddenByAllergiesNote({
  count,
  onShow,
}: {
  count: number;
  onShow: () => void;
}) {
  const { t } = useTranslation('recipes');
  if (!count) return null;
  return (
    <Box sx={{ fontSize: 13, color: tokens.color.muted }}>
      <Box component="span">{t('hiddenByAllergies.note', { count })}</Box>
      {' · '}
      <Box
        component="button"
        type="button"
        onClick={onShow}
        sx={{
          font: 'inherit',
          fontWeight: 700,
          color: tokens.color.accent,
          background: 'none',
          border: 0,
          p: 0,
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        {t('hiddenByAllergies.show')}
      </Box>
    </Box>
  );
}
