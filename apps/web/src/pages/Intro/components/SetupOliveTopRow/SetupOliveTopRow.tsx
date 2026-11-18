import { color, Box, Link } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import {
  linkButtonStyle,
  SetupNextButton,
  type SetupLeave,
} from '../SetupLeave/SetupLeave';
import { SetupProgress } from '../SetupProgress/SetupProgress';

const skipStyle = {
  color: color.cardBg,
  fontWeight: 600,
  fontSize: 15,
} as const;

type Props = {
  step?: 1 | 2;
  /** Where Skip goes: the Intro module's rule, never a path written by the page. */
  skipTo: string;
  /** Next and the Skip confirm while the step holds something unsaved; without it Skip is the plain link. */
  leave?: SetupLeave;
};

/** The olive Setup screens' top row: the step's progress ("1 of 2") and a Skip link, in cream. */
export function SetupOliveTopRow({ step = 1, skipTo, leave }: Props) {
  const { t } = useTranslation('onboarding');
  const skipTarget = leave?.skipTarget;
  const onSkip = leave?.onSkip;
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <SetupProgress tone="olive" step={step} />
        {leave ? <SetupNextButton leave={leave} tone="olive" /> : null}
        {leave?.unsaved ? (
          <Box
            component="button"
            type="button"
            ref={skipTarget}
            onClick={onSkip}
            sx={{ ...linkButtonStyle, color: color.cardBg }}
          >
            {t('setupStep.skip')}
          </Box>
        ) : (
          <Link
            href={skipTo}
            underline="always"
            sx={{ ...skipStyle, '&:hover': { color: color.cardBg } }}
          >
            {t('setupStep.skip')}
          </Link>
        )}
      </Box>
      {leave?.prompt}
    </>
  );
}
