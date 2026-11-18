import { Box, color, radius, tokens, Typography } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

const TONES = {
  olive: {
    filled: tokens.color.butter,
    empty: `color-mix(in srgb, ${color.cardBg} 28%, transparent)`,
    text: undefined,
  },
  cream: {
    filled: tokens.color.accent,
    empty: tokens.color.line,
    text: tokens.color.muted,
  },
} as const;

/** The Setup step's progress: two bars (those up to `step` filled) and "1 of 2". `tone` is the ground it stands on. */
export function SetupProgress({
  tone,
  step = 1,
}: {
  tone: 'olive' | 'cream';
  step?: 1 | 2;
}) {
  const { t } = useTranslation('onboarding');
  const { filled, empty, text } = TONES[tone];
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
      <Box aria-hidden sx={{ display: 'flex', gap: '6px', flex: 1 }}>
        {[1, 2].map((bar) => (
          <Box
            key={bar}
            sx={{
              flex: 1,
              height: 6,
              borderRadius: radius.tag,
              backgroundColor: bar <= step ? filled : empty,
            }}
          />
        ))}
      </Box>
      <Typography
        component="span"
        sx={{ fontWeight: 600, whiteSpace: 'nowrap', color: text }}
      >
        {t('setupStep.progress', { step })}
      </Typography>
    </Box>
  );
}
