import {
  Box,
  Button,
  gutterLeft,
  gutterRight,
  palette,
  plusBottomInset,
  radius,
  shadow,
  Sheet,
  Typography,
} from '@pocket-pantry/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { focusVoiceButton } from '../../lib/voiceFocus';
import { usePreferredSpokenLanguage } from '../../lib/usePreferredSpokenLanguage';
import { useVoiceNoteState, voiceNote } from '../../lib/voiceNote';
import { AddToShoppingListButton } from './AddToShoppingListButton';
import { HeardCard } from './HeardCard';
import { PantryAnswerRow } from './PantryAnswerRow';

/** The answer sheet for a Voice Note of only Pantry Questions: read-only, closed with Done. */
export function VoiceAnswers() {
  const { phase } = useVoiceNoteState();
  return phase === 'answers' ? <AnswerSheet /> : null;
}

function AnswerSheet() {
  const { t } = useTranslation('voice');
  const { proposal, recording } = useVoiceNoteState();
  const { spokenLanguage } = usePreferredSpokenLanguage();
  const title = useRef<HTMLHeadingElement>(null);
  const [added, setAdded] = useState(false);
  const answers = proposal?.answers ?? [];

  const done = () => {
    voiceNote.closeAnswers();
    focusVoiceButton();
  };

  return (
    <Sheet
      open
      onClose={done}
      initialFocus={title}
      label={t('answers.title')}
      header={
        <Box sx={{ px: 2.5, pt: 1.5, pb: 1.5 }}>
          <Typography
            component="h2"
            variant="h2"
            tabIndex={-1}
            ref={title}
            sx={{ outline: 'none' }}
          >
            {t('answers.title')}
          </Typography>
          {added ? null : (
            <Typography sx={{ fontSize: 13, color: palette('text-secondary') }}>
              {t('answers.subline')}
            </Typography>
          )}
        </Box>
      }
      footer={
        <Box
          sx={{
            pt: '12px',
            pl: gutterLeft(16),
            pr: gutterRight(16),
            pb: plusBottomInset(20),
          }}
        >
          <Button fullWidth onClick={done}>
            {t('answers.done')}
          </Button>
        </Box>
      }
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          px: 2,
          pb: 2,
        }}
      >
        <HeardCard
          transcript={proposal?.transcript ?? ''}
          language={recording?.spokenLanguage ?? spokenLanguage}
          durationMs={recording?.durationMs}
          defaultOpen={false}
        />
        <Box
          component="ul"
          aria-label={t('answers.list')}
          sx={{
            m: 0,
            p: 0,
            listStyle: 'none',
            backgroundColor: palette('background-paper'),
            border: `1px solid ${palette('pp-line')}`,
            borderRadius: radius.card,
            boxShadow: shadow.card,
            overflow: 'hidden',
          }}
        >
          {answers.map((answer) => (
            <PantryAnswerRow key={answer.id} answer={answer} />
          ))}
        </Box>
        <AddToShoppingListButton
          answers={answers}
          onAdded={() => {
            setAdded(true);
            title.current?.focus();
          }}
        />
      </Box>
    </Sheet>
  );
}
