import { Tag } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { keyframesSx } from '@/lib/keyframesSx';

/** Scale .4 -> 1 with an overshoot, as the flag turns on (Pantry batches handoff, section 6). */
const popSx = keyframesSx(
  'pp-running-low-pop',
  '420ms cubic-bezier(.2,.8,.2,1.4)',
  {
    from: { transform: 'scale(.4)', opacity: 0 },
    to: { transform: 'none', opacity: 1 },
  },
);

/**
 * The "Running low" chip, in the expiry tag's style (the `soon` tone). The caller shows it while the
 * Ingredient is flagged; `pop` animates it in when the Member has just turned the flag on.
 */
export function RunningLowChip({ pop = false }: { pop?: boolean }) {
  const { t } = useTranslation('pantry');

  return (
    <Tag tone="soon" sx={pop ? popSx : undefined}>
      {t('runningLow.chip')}
    </Tag>
  );
}
