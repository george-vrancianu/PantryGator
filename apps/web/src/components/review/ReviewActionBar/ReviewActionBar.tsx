import {
  ReviewActionBar as UiReviewActionBar,
  type ReviewActionBarProps,
} from '@pocket-pantry/ui';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBubbleBottomBound } from '@/components/layout/useBubbleBottomBound';

type Props = Omit<ReviewActionBarProps, 'discardLabel' | 'ref'> & {
  /** "Discard" unless a screen has its own word for leaving (Setup says "Retake"). */
  discardLabel?: string;
};

/** `ReviewActionBar` from `@pocket-pantry/ui`, keeping the Gator bubble above it. */
export function ReviewActionBar({ discardLabel, ...props }: Props) {
  const { t } = useTranslation('review');
  const bar = useRef<HTMLDivElement>(null);
  useBubbleBottomBound(bar);
  return (
    <UiReviewActionBar
      {...props}
      ref={bar}
      discardLabel={discardLabel ?? t('discard')}
    />
  );
}
