import {
  Box,
  ChevronRightIcon,
  focusRing,
  radius,
  ShoppingIcon,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

type Props = { count: number; onMove: () => void };

/** Checked Shopping Items waiting to move into the Pantry: one button into Finish Shopping. */
export function TickedBar({ count, onMove }: Props) {
  const { t } = useTranslation('pantry');
  const ticked = t('empty.ticked', { count });
  const move = t('empty.moveThem');
  return (
    <Box
      component="button"
      type="button"
      aria-label={`${ticked} · ${move}`}
      onClick={onMove}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        my: '4px',
        p: '10px 12px',
        font: 'inherit',
        fontSize: 13.5,
        fontWeight: 700,
        textAlign: 'start',
        border: 0,
        borderRadius: radius.card,
        backgroundColor: 'secondary.main',
        color: 'secondary.contrastText',
        cursor: 'pointer',
        ...focusRing,
      }}
    >
      <ShoppingIcon size={20} aria-hidden />
      <Box aria-hidden="true" sx={{ flex: 1 }}>
        {ticked}
      </Box>
      <Box
        aria-hidden="true"
        sx={{ display: 'flex', alignItems: 'center', flex: 'none' }}
      >
        {move}
        <ChevronRightIcon size={16} />
      </Box>
    </Box>
  );
}
