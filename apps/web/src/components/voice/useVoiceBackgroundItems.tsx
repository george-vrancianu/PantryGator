import { GlobeIcon } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { SCAN_LANGUAGES } from '@/i18n/resources';
import { usePreferredSpokenLanguage } from '@/lib/usePreferredSpokenLanguage';
import { formatClock } from '@/lib/voice';
import { useVoiceNoteState, voiceNote } from '@/lib/voiceNote';
import type {
  BackgroundAction,
  BackgroundItem,
  BackgroundStatus,
} from '@/lib/backgroundItem';
import { failureReason } from './failureReason';
import { noteListMeta } from './noteMeta';

type Note = ReturnType<typeof useVoiceNoteState>['inbox']['notes'][number];

const statusOf = (note: Note): BackgroundStatus =>
  note.phase === 'reading'
    ? 'reading'
    : note.phase === 'failed'
      ? 'failed'
      : 'ready';

/**
 * The Voice Inbox seen as background items: one per Voice Note, its row buttons (Review or See,
 * Cancel, Discard, Retry) bound to the Voice Note module. A view: the module keeps the rules.
 */
export function useVoiceBackgroundItems(): BackgroundItem[] {
  const { t } = useTranslation(['voice', 'settings', 'errors']);
  const { inbox, voiceCap } = useVoiceNoteState();
  const { spokenLanguage } = usePreferredSpokenLanguage();

  /** Why a note failed, in the words the pill used. */
  const failureText = (note: Note) => {
    if (note.phase !== 'failed') return undefined;
    const reason = failureReason(
      t,
      note.error,
      note.rawError,
      voiceCap?.cap ?? 0,
    );
    if (!reason) return undefined;
    return note.error === 'nothingHeard' ||
      note.error === 'capReached' ||
      note.error === 'outOfCredits'
      ? `${reason.title}. ${reason.hint}`
      : reason.hint;
  };

  return inbox.notes.map((note): BackgroundItem => {
    const { phase } = note;
    const noteLanguage = note.spokenLanguage ?? spokenLanguage;
    const preview = note.transcript
      ? note.transcript.split('\n')[0]
      : t('voice:inbox.preview', {
          duration: formatClock(note.durationMs ?? 0),
        });
    const meta = noteListMeta(t, note.defaultTarget, noteLanguage);
    const state = failureText(note) ?? t(`voice:inbox.state.${phase}`);
    const isReady = phase === 'review' || phase === 'answers';

    const actions: BackgroundAction[] = [];
    if (phase === 'reading') {
      actions.push({
        type: 'button',
        tone: 'secondary',
        label: t('voice:inbox.cancel'),
        ariaLabel: t('voice:inbox.cancelNote', { preview }),
        onClick: () => voiceNote.cancelReading(note.id),
      });
    } else if (phase === 'failed') {
      actions.push({
        type: 'button',
        tone: 'secondary',
        label: t('voice:send.discard'),
        ariaLabel: t('voice:inbox.discardNote', { preview }),
        onClick: () => voiceNote.dismiss(note.id),
      });
      if (note.canRetry) {
        actions.push({
          type: 'menu',
          label: t('voice:inbox.retryOtherNote', { preview }),
          icon: <GlobeIcon size={20} aria-hidden="true" />,
          items: SCAN_LANGUAGES.map((language) => {
            const name = t(`settings:languageNames.${language}`);
            return {
              label:
                language === noteLanguage
                  ? t('voice:inbox.currentLanguage', { language: name })
                  : name,
              current: language === noteLanguage,
              onClick: () => void voiceNote.retry(note.id, language),
            };
          }),
        });
        actions.push({
          type: 'button',
          tone: 'primary',
          label: t('voice:send.retry'),
          ariaLabel: t('voice:inbox.retryNote', { preview }),
          onClick: () => void voiceNote.retry(note.id),
        });
      }
    }

    return {
      kind: 'voice',
      // Voice Note ids grow with recording order.
      id: String(note.id),
      title: preview,
      detail: `${meta} · ${state}`,
      status: statusOf(note),
      createdAt: note.order,
      open: isReady
        ? {
            label: t(
              phase === 'answers' ? 'voice:inbox.see' : 'voice:inbox.review',
            ),
            ariaLabel: t(
              phase === 'answers'
                ? 'voice:inbox.seeNote'
                : 'voice:inbox.reviewNote',
              { preview },
            ),
            onClick: () => voiceNote.open(note.id),
          }
        : undefined,
      actions,
    };
  });
}
