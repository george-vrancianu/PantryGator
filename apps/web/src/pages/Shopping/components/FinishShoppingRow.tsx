import { Box, Button, PantryIcon, Typography, radius } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

export type FinishShoppingRowProps = {
  checked: number;
  /** Opens the Finish Shopping Review. */
  onFinish: () => void;
};

/** How many are ticked off and Finish Shopping. Shown only once something is checked; the count and progress live in the Canopy header. */
export function FinishShoppingRow({
  checked,
  onFinish,
}: FinishShoppingRowProps) {
  const { t } = useTranslation('shopping');
  if (checked === 0) return null;
  return (
    <Box
      sx={{
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
          minHeight: 44,
          borderRadius: radius.pill,
          px: 1.75,
          fontSize: 13.5,
          fontWeight: 700,
        }}
      >
        {t('summary.moveToPantry', { count: checked })}
      </Button>
    </Box>
  );
}
