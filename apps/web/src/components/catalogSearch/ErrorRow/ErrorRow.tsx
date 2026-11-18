import { Box, InfoIcon, palette, focusRing, radius } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

/** The inline `role="alert"` row for a failed search, with Retry. */
export function ErrorRow({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation('catalog');
  return (
    <Box
      role="alert"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: '10px 14px',
        backgroundColor: palette('error-light'),
        color: palette('error-main'),
      }}
    >
      <Box aria-hidden="true" sx={{ display: 'flex', flexShrink: 0 }}>
        <InfoIcon size={22} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: 15, fontWeight: 600 }}>
          {t('search.errorTitle')}
        </Box>
        <Box sx={{ fontSize: 13 }}>{t('search.errorHint')}</Box>
      </Box>
      <Box
        component="button"
        type="button"
        // Keep focus in the input for a pointer; onRetry returns it for the keyboard.
        onMouseDown={(event: { preventDefault: () => void }) =>
          event.preventDefault()
        }
        onClick={onRetry}
        sx={{
          flexShrink: 0,
          px: '12px',
          py: '9px',
          border: `1.5px solid ${palette('error-main')}`,
          borderRadius: radius.control,
          background: 'none',
          color: palette('error-main'),
          font: 'inherit',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          ...focusRing,
        }}
      >
        {t('search.retry')}
      </Box>
    </Box>
  );
}
