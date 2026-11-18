import { Alert } from '@pocket-pantry/ui';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MAX_APPLY_ACTIONS,
  useVoiceNoteState,
  voiceNote,
} from '@/lib/voiceNote';

/**
 * The background sheet's group action for Voice Notes: "Review all (N)", offered for two or more
 * reviewable notes. `primary` is the Sheet's role (absent below two); `notice` is the refusal Alert
 * for when there are too many Voice Actions for one Apply, to be drawn in the sheet's content.
 */
export function useVoiceReviewAll(onClose: () => void): {
  primary: { label: string; onClick: () => void } | undefined;
  notice: ReactNode;
  /** Forget a refusal (call when the sheet has closed). */
  reset: () => void;
} {
  const { t } = useTranslation('voice');
  const { inbox } = useVoiceNoteState();
  // "Review all" was refused: too many Voice Actions for one Apply.
  const [refusedAt, setRefusedAt] = useState<number | null>(null);
  const reviewable = inbox.notes.filter((n) => n.hasActions).length;
  const reset = () => setRefusedAt(null);
  if (reviewable <= 1) return { primary: undefined, notice: null, reset };
  // The refusal holds only for the notes it was made for.
  const tooMany = refusedAt === reviewable;
  return {
    reset,
    primary: {
      label: t('inbox.reviewAll', { count: reviewable }),
      onClick: () => {
        const outcome = voiceNote.openMerged();
        setRefusedAt(outcome === 'tooMany' ? reviewable : null);
        if (outcome === 'opened') onClose();
      },
    },
    notice: tooMany ? (
      <Alert>{t('inbox.reviewAllTooMany', { max: MAX_APPLY_ACTIONS })}</Alert>
    ) : null,
  };
}
