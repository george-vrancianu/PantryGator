import { Box, Spinner } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

export function FullPageSpinner() {
  const { t } = useTranslation('common');
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Spinner label={t('loading')} />
    </Box>
  );
}
