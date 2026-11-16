import { useEffect, useRef } from 'react';

/** How far, in px, the Member pulls down before letting go refreshes. */
export const PULL_THRESHOLD = 64;

/** How far, in px, a touch moves before it is judged vertical (a pull) or horizontal (not one). */
const AXIS_SLOP = 8;

/** Whether `target` sits inside a scroller below `scroller` that is itself scrolled down (so the pull is its scroll back up). */
function insideScrolledInnerScroller(
  target: EventTarget | null,
  scroller: HTMLElement,
) {
  let node = target instanceof Element ? target : null;
  while (node && node !== scroller) {
    if (node instanceof HTMLElement && node.scrollTop > 0) {
      const { overflowY } = getComputedStyle(node);
      if (
        (overflowY === 'auto' || overflowY === 'scroll') &&
        node.scrollHeight > node.clientHeight
      )
        return true;
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Pull-to-refresh on a scroller. A pull counts only when the touch began with the scroller at the top
 * and moves down, mostly vertically (a horizontal swipe, such as on a chip row, is left to the browser;
 * so is a touch inside an inner scroller that is scrolled down); scrolling the other way, or a scroller that is not at the top, never starts one.
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
    let startX = 0;
    let vertical = false;
    let distance = 0;
    const onStart = (event: TouchEvent) => {
      distance = 0;
      vertical = false;
      const touch = event.touches[0];
      const starts =
        event.touches.length === 1 &&
        touch !== undefined &&
        scroller.scrollTop <= 0 &&
        !insideScrolledInnerScroller(event.target, scroller);
      startY = starts ? touch.clientY : null;
      startX = starts ? touch.clientX : 0;
    };
    const onMove = (event: TouchEvent) => {
      if (startY === null) return;
      const touch = event.touches[0];
      const dy = (touch?.clientY ?? startY) - startY;
      const dx = (touch?.clientX ?? startX) - startX;
      if (dy < 0 || scroller.scrollTop > 0) {
        startY = null;
        distance = 0;
        return;
      }
      if (!vertical) {
        if (Math.max(Math.abs(dx), dy) < AXIS_SLOP) return;
        if (Math.abs(dx) >= dy) {
          startY = null;
          distance = 0;
          return;
        }
        vertical = true;
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
