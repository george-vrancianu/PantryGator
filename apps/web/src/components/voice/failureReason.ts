import type { TFunction } from 'i18next';
import { translateErrorCode } from '@/i18n/translateApiError';
import type { useVoiceNoteState } from '@/lib/voiceNote';

type State = ReturnType<typeof useVoiceNoteState>;

/** The title and hint a failed Voice Note shows, shared by the Voice Inbox sheet and strip. */
export function failureReason(
  t: TFunction,
  error: State['error'],
  rawError: State['rawError'],
  cap: number,
): { title: string; hint: string } | undefined {
  switch (error) {
    case 'failed':
      return {
        title: t('voice:send.failed'),
        hint: rawError
          ? translateErrorCode(t, rawError.code, rawError.params)
          : t('voice:send.failedHint'),
      };
    case 'unavailable':
      return {
        title: t('voice:send.noRecording'),
        hint: t('voice:unavailable'),
      };
    case 'tooLong':
      return {
        title: t('voice:send.tooLongTitle'),
        hint: t('voice:send.tooLong'),
      };
    case 'unsupported':
      return {
        title: t('voice:send.unsupportedTitle'),
        hint: t('voice:send.unsupported'),
      };
    case 'nothingHeard':
      return {
        title: t('voice:send.nothing'),
        hint: t('voice:send.nothingHint'),
      };
    case 'capReached':
      return {
        title: t('voice:send.cap', { cap }),
        hint: t('voice:send.capHint'),
      };
    case 'outOfCredits':
      return {
        title: t('voice:send.outOfCredits'),
        hint: t('voice:send.outOfCreditsHint'),
      };
    default:
      return undefined;
  }
}
