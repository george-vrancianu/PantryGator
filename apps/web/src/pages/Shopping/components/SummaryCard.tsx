import {
  Box,
  Button,
  PantryIcon,
  ProgressBar,
  Typography,
  Card,
  displayType,
  radius,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

export type SummaryCardProps = {
  remaining: number;
  checked: number;
  /** Opens the Finish Shopping Review. */
  onFinish: () => void;
};

/** Items left to buy, how far the basket is, and Finish Shopping. Import sits in the top bar. */
export function SummaryCard({
  remaining,
  checked,
  onFinish,
}: SummaryCardProps) {
  const { t } = useTranslation('shopping');
  const total = remaining + checked;
  return (
    <Card sx={{ p: '14px 14px 14px 16px' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              ...displayType,
              fontSize: 24,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {total === 0
              ? t('summary.nothing')
              : t('summary.toBuy', { count: remaining })}
          </Typography>
          <Typography
            sx={{ fontSize: 13, fontWeight: 500, mb: total === 0 ? 0 : '9px' }}
            color="text.secondary"
          >
            {total === 0
              ? t('summary.empty')
              : t('summary.inBasket', { checked, total })}
          </Typography>
        </Box>
      </Box>
      {total > 0 ? (
        <ProgressBar
          label={t('summary.progress')}
          value={checked}
          max={total}
          size="large"
        />
      ) : null}
      {checked > 0 ? (
        <Box
          sx={{
            mt: 1.75,
            pt: 1.5,
            borderTop: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
          }}
        >
          <Typography variant="meta" color="text.secondary">
            {t('summary.tickedOff', { count: checked })}
          </Typography>
          <Button
            variant="secondary"
            onClick={onFinish}
            startIcon={<PantryIcon size={16} />}
            sx={{
              minHeight: 36,
              borderRadius: radius.pill,
              px: 1.75,
              fontSize: 13.5,
              fontWeight: 700,
            }}
          >
            {t('summary.moveToPantry', { count: checked })}
          </Button>
        </Box>
      ) : null}
    </Card>
  );
}
