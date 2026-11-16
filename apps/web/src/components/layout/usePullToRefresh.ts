import { useEffect, useRef } from 'react';

/** How far, in px, the Member pulls down before letting go refreshes. */
export const PULL_THRESHOLD = 64;

/**
 * Pull-to-refresh on a scroller. A pull counts only when the touch began with the scroller at the top
 * and moves down; scrolling the other way, or a scroller that is not at the top, never starts one.
 * Letting go past `PULL_THRESHOLD` calls `onRefresh`. The scroller sets `overscroll-behavior: contain`,
 * so the browser adds no pull of its own.
 */
export function usePullToRefresh(
  scroller: HTMLElement | null,
  { enabled, onRefresh }: { enabled: boolean; onRefresh: () => void },
) {
  const refresh = useRef(onRefresh);
  useEffect(() => {
    refresh.current = onRefresh;
  });

  useEffect(() => {
    if (!scroller || !enabled) return;
    let startY: number | null = null;
    let distance = 0;
    const onStart = (event: TouchEvent) => {
      distance = 0;
      startY =
        event.touches.length === 1 && scroller.scrollTop <= 0
          ? event.touches[0]!.clientY
          : null;
    };
    const onMove = (event: TouchEvent) => {
      if (startY === null) return;
      const dy = (event.touches[0]?.clientY ?? startY) - startY;
      if (dy <= 0 || scroller.scrollTop > 0) {
        startY = null;
        distance = 0;
        return;
      }
      distance = dy;
      if (event.cancelable) event.preventDefault();
    };
    const onEnd = () => {
      const pulled = startY !== null && distance >= PULL_THRESHOLD;
      startY = null;
      distance = 0;
      if (pulled) refresh.current();
    };
    const onCancel = () => {
      startY = null;
      distance = 0;
    };
    scroller.addEventListener('touchstart', onStart, { passive: true });
    scroller.addEventListener('touchmove', onMove, { passive: false });
    scroller.addEventListener('touchend', onEnd);
    scroller.addEventListener('touchcancel', onCancel);
    return () => {
      scroller.removeEventListener('touchstart', onStart);
      scroller.removeEventListener('touchmove', onMove);
      scroller.removeEventListener('touchend', onEnd);
      scroller.removeEventListener('touchcancel', onCancel);
    };
  }, [scroller, enabled]);
}
