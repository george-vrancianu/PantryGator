import { Box, displayType, radius, palette } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

export type Counts = { save: number; check: number; excluded: number };

/** How each counter looks, on phone tiles and tablet chips alike. */
export const COUNTER_TONE = {
  save: {
    bgcolor: palette('background-paper'),
    border: `1px solid ${palette('pp-line')}`,
    color: palette('text-primary'),
  },
  check: {
    bgcolor: palette('error-light'),
    border: '1px solid transparent',
    color: palette('error-main'),
  },
  excluded: {
    bgcolor: palette('pp-chip'),
    border: '1px solid transparent',
    color: palette('text-secondary'),
  },
} as const;

/** Three live tiles: lines to save, lines to check, lines excluded. */
export function ReviewCounters({ save, check, excluded }: Counts) {
  const { t } = useTranslation('review');
  const tiles = [
    { key: 'save', value: save },
    { key: 'check', value: check },
    { key: 'excluded', value: excluded },
  ] as const;
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        mt: '14px',
      }}
    >
      {tiles.map((tile) => (
        <Box
          key={tile.key}
          sx={{
            borderRadius: radius.control,
            px: '12px',
            py: '10px',
            ...COUNTER_TONE[tile.key],
          }}
        >
          <Box
            sx={{
              ...displayType,
              fontSize: 24,
              lineHeight: 1.1,
            }}
          >
            {tile.value}
          </Box>
          <Box sx={{ fontSize: 12, fontWeight: 600 }}>
            {t(`counter.${tile.key}`)}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
