import type { TFunction } from 'i18next';
import type { BubbleSummary } from './bubbleState';

/**
 * The state as a sentence: "3 ready to review", "2 ready to review, 1 could not be read". Reading
 * is spelled out only when nothing is ready or failed (the badges carry it otherwise); All done
 * says everything was read.
 */
export function bubbleSentence(
  t: TFunction<'background'>,
  { state, reading, ready, failed }: BubbleSummary,
): string {
  if (state === 'allDone') return t('bubble.allDone', { count: ready });
  if (state === 'reading') return t('bubble.reading', { count: reading });
  return [
    ready > 0 ? t('bubble.ready', { count: ready }) : null,
    failed > 0 ? t('bubble.failed', { count: failed }) : null,
  ]
    .filter(Boolean)
    .join(', ');
}
