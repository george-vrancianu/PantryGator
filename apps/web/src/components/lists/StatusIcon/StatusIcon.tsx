import {
  AlertIcon,
  CheckCircleIcon,
  WarningIcon,
  tokens,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import type { RowStatus } from '@/lib/review';

/** The row's status as an icon whose shape differs per status, so colour is never the only signal. */
export function StatusIcon({ status }: { status: RowStatus }) {
  const { t } = useTranslation('review');
  const props = {
    size: 18,
    strokeWidth: 2,
    role: 'img',
    'aria-hidden': undefined,
    'aria-label': t(`icon.${status}`),
    style: { flexShrink: 0 },
  } as const;
  if (status === 'low')
    return <WarningIcon {...props} color={tokens.color.urgentFg} />;
  if (status === 'qty')
    return <AlertIcon {...props} color={tokens.color.soonIcon} />;
  return <CheckCircleIcon {...props} color={tokens.color.accent} />;
}
