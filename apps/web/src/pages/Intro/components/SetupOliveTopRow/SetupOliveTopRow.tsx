import { color, Box } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import {
  linkButtonStyle,
  SetupNextButton,
  type SetupLeave,
} from '../SetupLeave/SetupLeave';
import { SetupProgress } from '../SetupProgress/SetupProgress';

type Props = {
  step?: 1 | 2;
  /** Next, and Skip with its confirm while the step holds something unsaved; where Skip goes is the step's rule. */
  leave: SetupLeave;
};

/** The olive Setup screens' top row: the step's progress ("1 of 2") and a Skip button, in cream. */
export function SetupOliveTopRow({ step = 1, leave }: Props) {
  const { t } = useTranslation('onboarding');
  const { skipTarget, onSkip } = leave;
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <SetupProgress tone="olive" step={step} />
        <SetupNextButton leave={leave} tone="olive" />
        <Box
          component="button"
          type="button"
          ref={skipTarget}
          onClick={onSkip}
          sx={{ ...linkButtonStyle, color: color.cardBg }}
        >
          {t('setupStep.skip')}
        </Box>
      </Box>
      {leave.prompt}
    </>
  );
}
