import { Box, EyeIcon, radius, palette } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

/** The dashed note that ends every tab of a Catalog Recipe's preview. */
export function PreviewNote() {
  const { t } = useTranslation('recipes');
  return (
    <Box
      role="note"
      sx={{
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-start',
        px: '12px',
        py: '10px',
        bgcolor: palette('pp-subtle'),
        border: `1px dashed ${palette('pp-line')}`,
        borderRadius: radius.control,
        fontSize: 12.5,
        color: palette('text-secondary'),
      }}
    >
      <Box
        aria-hidden
        sx={{ display: 'flex', color: palette('pp-accent'), mt: '1px' }}
      >
        <EyeIcon size={16} />
      </Box>
      <span>{t('preview.note')}</span>
    </Box>
  );
}
