import { Box, PeopleIcon, tokens, radius } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import type { RecipeOwner } from '../../../lib/recipes';

/** The one place a Family-owned Recipe is marked, as a butter pill; renders nothing for the Catalog's. */
export function OwnerBadge({ owner }: { owner: RecipeOwner }) {
  const { t } = useTranslation('recipes');
  if (owner !== 'family') return null;
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
        px: '8px',
        py: '3px',
        borderRadius: radius.tag,
        bgcolor: tokens.color.butter,
        color: tokens.color.butterInk,
        fontSize: 11.5,
        fontWeight: 700,
        lineHeight: 1.2,
      }}
    >
      <PeopleIcon size={14} />
      {t('familyBadge')}
    </Box>
  );
}
