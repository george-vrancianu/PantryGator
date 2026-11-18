import { Box, PeopleIcon, radius, palette } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

/** The butter "In your Recipes" pill that follows a Catalog Recipe's title once the Family has added it. */
export function InFamilyPill() {
  const { t } = useTranslation('recipes');
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
        bgcolor: palette('secondary-main'),
        color: palette('secondary-contrastText'),
        fontSize: 11.5,
        fontWeight: 700,
        lineHeight: 1.2,
      }}
    >
      <PeopleIcon size={14} />
      {t('preview.inFamily')}
    </Box>
  );
}
