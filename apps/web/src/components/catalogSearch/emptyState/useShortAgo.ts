import { useTranslation } from 'react-i18next';
import { daysSince } from '@/lib/relativeDays';

/** Short relative time: today, 3d ago, 2w ago, 4mo ago. */
export function useShortAgo() {
  const { t } = useTranslation('catalog');
  return (iso: string) => {
    const days = daysSince(iso);
    if (days === 0) return t('search.when.today');
    if (days < 14) return t('search.when.days', { count: days });
    if (days < 60)
      return t('search.when.weeks', { count: Math.floor(days / 7) });
    return t('search.when.months', { count: Math.floor(days / 30) });
  };
}
