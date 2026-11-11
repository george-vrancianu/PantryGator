import { Snackbar } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { FEED_BOTTOM_IN_RAIL, useFeedArea } from './CameraFrame';

/**
 * A toast over the camera feed. Under a footer it sits `aboveFooter` px up (the bottom edge when
 * left out); in the rail layout it sits near the bottom and is centred in the feed, clear of the rail.
 */
export function CameraToast({
  open,
  onClose,
  aboveFooter,
  children,
}: {
  open: boolean;
  onClose: () => void;
  aboveFooter?: number;
  children: ReactNode;
}) {
  const feed = useFeedArea();
  return (
    <Snackbar
      open={open}
      onClose={onClose}
      bottom={
        feed.layout === 'rail' || aboveFooter !== undefined
          ? feed.bottom(aboveFooter ?? 0, FEED_BOTTOM_IN_RAIL)
          : undefined
      }
      right={feed.layout === 'rail' ? feed.right(0) : undefined}
    >
      {children}
    </Snackbar>
  );
}
