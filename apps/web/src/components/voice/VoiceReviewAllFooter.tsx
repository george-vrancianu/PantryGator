import {
  Alert,
  Box,
  Button,
  gutterLeft,
  gutterRight,
  plusBottomInset,
} from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MAX_APPLY_ACTIONS,
  useVoiceNoteState,
  voiceNote,
} from '../../lib/voiceNote';

/** The background sheet's group action for Voice Notes: "Review all (N)", shown for two or more. */
export function VoiceReviewAllFooter({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('voice');
  const { inbox } = useVoiceNoteState();
  // "Review all" was refused: too many Voice Actions for one Apply.
  const [refusedAt, setRefusedAt] = useState<number | null>(null);
  const reviewable = inbox.notes.filter((n) => n.hasActions).length;
  // The refusal holds only for the notes it was made for.
  const tooMany = refusedAt === reviewable;
  if (reviewable <= 1) return null;
  return (
    <Box
      sx={{
        pt: '12px',
        pl: gutterLeft(16),
        pr: gutterRight(16),
        pb: plusBottomInset(20),
      }}
    >
      {tooMany ? (
        <Box sx={{ mb: '10px' }}>
          <Alert>
            {t('inbox.reviewAllTooMany', { max: MAX_APPLY_ACTIONS })}
          </Alert>
        </Box>
      ) : null}
      <Button
        fullWidth
        onClick={() => {
          const outcome = voiceNote.openMerged();
          setRefusedAt(outcome === 'tooMany' ? reviewable : null);
          if (outcome === 'opened') onClose();
        }}
      >
        {t('inbox.reviewAll', { count: reviewable })}
      </Button>
    </Box>
  );
}
