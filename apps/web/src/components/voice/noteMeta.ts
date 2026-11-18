import type { TFunction } from 'i18next';
import type { ScanLanguage } from '@/i18n/resources';
import { formatClock } from '@/lib/voice';
import type { VoiceDefaultTarget } from '@/lib/voice';

function listName(t: TFunction, defaultTarget: VoiceDefaultTarget): string {
  return defaultTarget === 'none'
    ? t('voice:inbox.noList')
    : t(`voice:review.lists.${defaultTarget}`);
}

/**
 * The small line under a Voice Note in the Voice Inbox: its list and Spoken Language "Shopping list ·
 * English". Needs the `voice` and `settings` namespaces.
 */
export function noteListMeta(
  t: TFunction,
  defaultTarget: VoiceDefaultTarget,
  language: ScanLanguage,
): string {
  return [
    listName(t, defaultTarget),
    t(`settings:languageNames.${language}`),
  ].join(' · ');
}

/** The same line in "What I heard": the language and length of the recording. */
export function noteHeardMeta(
  t: TFunction,
  defaultTarget: VoiceDefaultTarget,
  language: ScanLanguage,
  durationMs: number,
): string {
  return [
    listName(t, defaultTarget),
    t('voice:review.heardMeta', {
      language: t(`settings:languageNames.${language}`),
      duration: formatClock(durationMs),
    }),
  ].join(' · ');
}
