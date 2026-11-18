import { Box, canopy, radius, Typography } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

/** The Setup step's progress on the Canopy: two bars (those up to `step` filled, in gold) and "1 of 2". */
export function SetupProgress({ step = 1 }: { step?: 1 | 2 }) {
  const { t } = useTranslation('onboarding');
  const filled = canopy.gold;
  const empty = canopy.progressTrack;
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
        sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}
      >
        {t('setupStep.progress', { step })}
      </Typography>
    </Box>
  );
}
