import { Tag, type TagTone } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import type { RowStatus } from '@/lib/review';

const TONE: Record<RowStatus, TagTone> = {
  low: 'urgent',
  qty: 'soon',
  ok: 'accent',
};

/** The tablet's Încredere column: the status as words, beside the status icon, so colour is never the only signal. */
export function ConfidencePill({ status }: { status: RowStatus }) {
  const { t } = useTranslation('review');
  return (
    <Tag tone={TONE[status]} sx={{ justifySelf: 'start' }}>
      {t(`confidence.${status}`)}
    </Tag>
  );
}
