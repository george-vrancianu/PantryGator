import { Box, tokens } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

/**
 * "N Recipes hidden by your Allergies · Show", under "Hide Recipes with my Allergies". Shown
 * only while something is hidden; Show asks the list again with the override. While the override
 * is on (`showing`) the list has nothing hidden to count, so the note reads "Showing Recipes hidden
 * by your Allergies · Hide" and Hide drops the override.
 */
export function HiddenByAllergiesNote({
  count,
  showing = false,
  onShow,
  onHide,
}: {
  count: number;
  /** The override is on: the hidden Recipes are in the list. */
  showing?: boolean;
  onShow: () => void;
  onHide?: () => void;
}) {
  const { t } = useTranslation('recipes');
  const revealed = showing && onHide !== undefined;
  if (!revealed && !count) return null;
  return (
    <Box sx={{ fontSize: 13, color: tokens.color.muted }}>
      <Box component="span">
        {revealed
          ? t('hiddenByAllergies.showing')
          : t('hiddenByAllergies.note', { count })}
      </Box>
      {' · '}
      <Box
        component="button"
        type="button"
        onClick={revealed ? onHide : onShow}
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
        {revealed ? t('hiddenByAllergies.hide') : t('hiddenByAllergies.show')}
      </Box>
    </Box>
  );
}
