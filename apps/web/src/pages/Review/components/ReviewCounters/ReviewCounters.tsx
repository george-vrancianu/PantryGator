import { Box, tokens, displayType, radius } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

export type Counts = { save: number; check: number; excluded: number };

/** How each counter looks, on phone tiles and tablet chips alike. */
export const COUNTER_TONE = {
  save: {
    bgcolor: tokens.color.surface,
    border: `1px solid ${tokens.color.line}`,
    color: tokens.color.ink,
  },
  check: {
    bgcolor: tokens.color.urgentBg,
    border: '1px solid transparent',
    color: tokens.color.urgentFg,
  },
  excluded: {
    bgcolor: tokens.color.chipNeutral,
    border: '1px solid transparent',
    color: tokens.color.muted,
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
