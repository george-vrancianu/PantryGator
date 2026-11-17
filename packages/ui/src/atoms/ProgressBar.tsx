import Box from '@mui/material/Box';
import { canopy, radius } from '../theme/themeVars';

export type ProgressBarProps = {
  /** Accessible name of the bar. */
  label: string;
  /** Completed amount, between 0 and `max`. */
  value: number;
  max: number;
  /** `large` is 8 px high, `default` 6. */
  size?: 'default' | 'large';
  /** `canopy` is the 5 px gold bar on the Canopy header (Canopy handoff section 7.2). */
  tone?: 'canopy';
};

/** An `accent` fill on the `chip` track. */
export function ProgressBar({
  label,
  value,
  max,
  size = 'default',
  tone,
}: ProgressBarProps) {
  const onCanopy = tone === 'canopy';
  const height = onCanopy ? 5 : size === 'large' ? 8 : 6;
  const corner = onCanopy
    ? { borderRadius: radius.tag }
    : { borderRadius: radius.pill };
  const percent =
    max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  return (
    <Box
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      sx={{
        height,
        ...corner,
        ...(onCanopy
          ? {
              backgroundColor: canopy.progressTrack,
              boxShadow: canopy.progressShadow,
            }
          : { backgroundColor: 'pp.chip' }),
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          height,
          width: `${percent}%`,
          ...corner,
          backgroundColor: onCanopy ? canopy.gold : 'pp.accent',
        }}
      />
    </Box>
  );
}
