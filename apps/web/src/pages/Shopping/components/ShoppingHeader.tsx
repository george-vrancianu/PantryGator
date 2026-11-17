import {
  Box,
  ProgressBar,
  Typography,
  canopy,
  displayType,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

export type ShoppingHeaderProps = {
  /** Undefined while the list loads: the header keeps its size. */
  summary: { remaining: number; checked: number } | undefined;
};

/** The Canopy header's block (Canopy handoff section 7.2): the open count, how many are checked, and the progress bar. */
export function ShoppingHeader({ summary }: ShoppingHeaderProps) {
  const { t } = useTranslation('shopping');
  const remaining = summary?.remaining ?? 0;
  const checked = summary?.checked ?? 0;
  const total = remaining + checked;
  return (
    <Box
      role="group"
      aria-label={
        total === 0
          ? t('summary.nothing')
          : t('summary.toBuy', { count: remaining })
      }
      aria-busy={summary ? undefined : true}
      sx={{
        mt: '18px',
        px: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        // Reserves the header's final height while the list loads.
        visibility: summary ? 'visible' : 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <Typography
            component="span"
            sx={{
              ...displayType,
              fontWeight: 800,
              fontSize: 54,
              lineHeight: 0.85,
              letterSpacing: '-0.05em',
              color: canopy.gold,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {remaining}
          </Typography>
          <Typography
            component="span"
            sx={{ fontSize: 16, fontWeight: 600, lineHeight: 1 }}
          >
            {t('summary.toBuyLabel')}
          </Typography>
        </Box>
        <Typography
          component="span"
          sx={{
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1,
            color: canopy.muted,
          }}
        >
          {total === 0
            ? t('summary.empty')
            : t('summary.inBasket', { checked, total })}
        </Typography>
      </Box>
      {total > 0 ? (
        <ProgressBar
          tone="canopy"
          label={t('summary.progress')}
          value={checked}
          max={total}
        />
      ) : (
        // No bar for an empty list, but the header keeps its size.
        <Box sx={{ height: 5 }} />
      )}
    </Box>
  );
}
