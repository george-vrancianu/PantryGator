import { Box, canopy, radius } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import {
  linkButtonStyle,
  SetupNextButton,
  type SetupLeave,
} from '../SetupLeave/SetupLeave';
import { SetupProgress } from '../SetupProgress/SetupProgress';

const linkSx = { ...linkButtonStyle, color: canopy.ink } as const;

type Props = {
  /** The "‹ label" link back, when the screen has one. */
  back?: { label: string; onClick: () => void };
  step?: 1 | 2;
  /** Next and Skip, with the Skip confirm: from `useSetupLeave`. */
  leave: SetupLeave;
};

/** The Setup screens' top row on the Canopy: an optional "‹ Back" link, the step's progress ("1 of 2"), Next and Skip, in its ink. */
export function SetupTopRow({ back, step = 1, leave }: Props) {
  const { t } = useTranslation('onboarding');
  const { skipTarget, onSkip } = leave;
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {back ? (
          <Box
            component="button"
            type="button"
            onClick={back.onClick}
            sx={linkSx}
          >
            <span aria-hidden>‹ </span>
            {back.label}
          </Box>
        ) : null}
        <SetupProgress step={step} />
        <SetupNextButton leave={leave} />
        <Box
          component="button"
          type="button"
          ref={skipTarget}
          onClick={onSkip}
          sx={linkSx}
        >
          {t('setupStep.skip')}
        </Box>
      </Box>
      {leave.prompt ? (
        // A card of its own: the confirm's buttons are made for the light page, not the Canopy.
        <Box
          sx={{
            mt: '12px',
            p: '12px',
            borderRadius: radius.card,
            backgroundColor: 'pp.cardBg',
            color: 'text.primary',
          }}
        >
          {leave.prompt}
        </Box>
      ) : null}
    </>
  );
}
