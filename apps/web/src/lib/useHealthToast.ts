import { useTranslation } from 'react-i18next';
import { pantryHealth, type HealthInput } from './health';

/**
 * What every Health fix toast shares (spec 323): the message with the score the fix leads to (Undo toasts
 * come from `useUndoToast`).
 */
export function useHealthToast() {
  const { t } = useTranslation('dashboard');

  /** `message` (already translated) with the score of `after`, or alone while the Pantry is not scored. */
  const messageWithScore = (after: HealthInput, message: string) => {
    const health = pantryHealth(after);
    return health.scored
      ? t('health.toast.withScore', { message, score: health.total })
      : message;
  };

  return { messageWithScore };
}
