import { Box, palette, radius, shadow, Sheet } from '@pocket-pantry/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { focusVoiceButton } from '@/lib/voiceFocus';
import { usePreferredSpokenLanguage } from '@/lib/usePreferredSpokenLanguage';
import { useVoiceNoteState, voiceNote } from '@/lib/voiceNote';
import { AddToShoppingListButton } from '../AddToShoppingListButton/AddToShoppingListButton';
import { HeardCard } from '../HeardCard/HeardCard';
import { PantryAnswerRow } from '../PantryAnswerRow/PantryAnswerRow';

/** The answer sheet for a Voice Note of only Pantry Questions: read-only, closed with the X. */
export function VoiceAnswers() {
  const { phase } = useVoiceNoteState();
  return phase === 'answers' ? <AnswerSheet /> : null;
}

function AnswerSheet() {
  const { t } = useTranslation('voice');
  const { proposal, recording } = useVoiceNoteState();
  const { spokenLanguage } = usePreferredSpokenLanguage();
  const body = useRef<HTMLDivElement>(null);
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
      title={t('answers.title')}
      {...(added ? {} : { subtitle: t('answers.subline') })}
    >
      <Box
        ref={body}
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
            // The button that was pressed is gone: focus the dialog itself.
            body.current?.closest<HTMLElement>('[role="dialog"]')?.focus();
          }}
        />
      </Box>
    </Sheet>
  );
}
