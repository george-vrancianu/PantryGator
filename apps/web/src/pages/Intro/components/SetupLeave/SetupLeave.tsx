import { Box, color, palette } from '@pocket-pantry/ui';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmPrompt } from '@/components/editor/ConfirmAction/ConfirmAction';

/**
 * How a Setup step is left early, shared by Snap (and its Review) and Say it. The step says whether it
 * `unsaved` holds something (Scan Session cards, Voice Inbox notes), what Skip would lose in words, and
 * where Next and Skip go. Nothing here knows which collection it is.
 */
export type SetupLeaveInput = {
  /** The step holds something that Skip would lose and Next would carry out. */
  unsaved: boolean;
  /** The confirm's question, naming what is lost ("Skip and lose these 2 photos? ..."). */
  lostMessage: string;
  /** Move on and leave the collection untouched. */
  onNext: () => void;
  /** Drop the collection and move on. Only called after the confirm when `unsaved`. */
  onSkip: () => void;
};

export type SetupLeave = {
  unsaved: boolean;
  onNext: () => void;
  /** Skip's click: asks first when `unsaved`, otherwise skips straight away. */
  onSkip: () => void;
  /** Attach to the Skip control: Cancel returns focus to it. */
  skipTarget: (el: HTMLButtonElement | null) => void;
  /** The confirm, to render under the top row while it is asking (else null). */
  prompt: ReactNode;
};

/** The Skip confirm's state for one Setup step: call it with the step's condition and wording. */
export function useSetupLeave({
  unsaved,
  lostMessage,
  onNext,
  onSkip,
}: SetupLeaveInput): SetupLeave {
  const [asking, setAsking] = useState(false);
  const [skipEl, setSkipEl] = useState<HTMLButtonElement | null>(null);
  // Nothing left to lose (e.g. the last note discarded): the question is moot, and must not return later.
  if (!unsaved && asking) setAsking(false);
  return {
    skipTarget: setSkipEl,
    unsaved,
    onNext,
    onSkip: () => (unsaved ? setAsking(true) : onSkip()),
    prompt:
      asking && unsaved ? (
        <ConfirmPrompt
          message={lostMessage}
          onConfirm={() => {
            setAsking(false);
            onSkip();
          }}
          onCancel={() => {
            setAsking(false);
            skipEl?.focus();
          }}
        />
      ) : null,
  };
}

type Tone = 'olive' | 'cream';

/** The Setup top rows' text-link button: Next, Skip and Back share it (colour set by the caller). */
export const linkButtonStyle = {
  p: 0,
  border: 0,
  background: 'none',
  font: 'inherit',
  fontSize: 15,
  fontWeight: 600,
  textDecoration: 'underline',
  cursor: 'pointer',
} as const;

/** The Setup top row's Next, beside Skip: shown only while the step holds something unsaved. */
export function SetupNextButton({
  leave,
  tone,
}: {
  leave: SetupLeave;
  tone: Tone;
}) {
  const { t } = useTranslation('onboarding');
  if (!leave.unsaved) return null;
  return (
    <Box
      component="button"
      type="button"
      onClick={leave.onNext}
      sx={{
        ...linkButtonStyle,
        color: tone === 'olive' ? color.cardBg : palette('pp-accent'),
      }}
    >
      {t('setupStep.next')}
    </Box>
  );
}
