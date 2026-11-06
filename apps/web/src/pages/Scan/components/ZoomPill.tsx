import { Box, radius, tokens } from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { glassFocusRing, shade } from '../../../components/camera/glass';

/** The two zoom levels of the pill (handoff 3.3). */
const LEVELS = [1, 2] as const;
type Level = (typeof LEVELS)[number];

const button = {
  height: 32,
  width: 32,
  p: 0,
  border: 0,
  borderRadius: radius.card,
  fontFamily: 'inherit',
  fontSize: 11.5,
  fontWeight: 800,
  cursor: 'pointer',
  backgroundColor: shade(35),
  color: tokens.color.ink,
  transition: 'width 200ms, color 200ms',
  '&[aria-pressed="true"]': { width: 38, color: tokens.color.accent },
  '&:focus-visible': glassFocusRing,
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
};

type Props = {
  /** Zooms the camera track; resolves to whether it took the level. */
  onZoom: (level: number) => Promise<boolean>;
};

/**
 * The 1× / 2 zoom pill above the camera footer (handoff 3.3). It sets the track's own zoom and
 * never crops digitally, so the receipt crop still matches the guide. Hosts render it only when
 * the camera reports the zoom capability.
 */
export function ZoomPill({ onZoom }: Props) {
  const { t } = useTranslation('scan');
  const [level, setLevel] = useState<Level>(1);
  const pick = async (next: Level) => {
    if (next !== level && (await onZoom(next))) setLevel(next);
  };
  return (
    <Box
      role="group"
      aria-label={t('zoom.label')}
      sx={{
        display: 'flex',
        gap: '4px',
        p: '3px',
        borderRadius: radius.pill,
        backgroundColor: shade(28),
      }}
    >
      {LEVELS.map((item) => (
        <Box
          key={item}
          component="button"
          type="button"
          aria-pressed={item === level}
          aria-label={t('zoom.level', { level: item })}
          onClick={() => void pick(item)}
          sx={button}
        >
          {item === 1 ? '1×' : item}
        </Box>
      ))}
    </Box>
  );
}
