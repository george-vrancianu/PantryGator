import { Box, tokens } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import {
  linkButtonStyle,
  SetupNextButton,
  type SetupLeave,
} from '../SetupLeave/SetupLeave';
import { SetupProgress } from '../SetupProgress/SetupProgress';

const linkSx = { ...linkButtonStyle, color: tokens.color.accent } as const;

type Props = {
  /** The "‹ label" link back, when the screen has one. */
  back?: { label: string; onClick: () => void };
  /** Next and Skip, with the Skip confirm: from `useSetupLeave`. */
  leave: SetupLeave;
};

/** The Setup Review's top row on the cream ground: an optional "‹ Back" link, the step's progress ("1 of 2"), Skip. */
export function SetupTopRow({ back, leave }: Props) {
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
        <SetupProgress tone="cream" />
        <SetupNextButton leave={leave} tone="cream" />
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
      {leave.prompt}
    </>
  );
}
