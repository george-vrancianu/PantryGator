import {
  dockBottomPx,
  DOCK_HEIGHT,
  DOCK_OVERHANG,
  usePrefersReducedMotion,
} from '@pocket-pantry/ui';
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { useScroller } from '@/lib/scroller';

/** The bottom of the viewport the Dock covers (its larger height, so it holds on every width),
 * with the capsule's overhang, from the Dock's real bottom (the home-indicator inset on a Face ID iPhone). */
const dockZone = () => dockBottomPx() + DOCK_HEIGHT.md + DOCK_OVERHANG;
/** Room left between the scrolled-in card and the Dock. */
const BREATHING = 14;
/** The open body is at full height at once; wait a beat so the scroll does not land on the tap itself. */
const SETTLE_MS = 60;

/**
 * Once an Ingredient has opened, scroll its block up if its bottom is under the Dock: smoothly, or at once
 * under reduce-motion.
 */
export function useOpenIntoView(
  target: RefObject<HTMLElement | null>,
  open: boolean,
) {
  const reduceMotion = usePrefersReducedMotion();
  const scroller = useScroller();
  const reduceMotionNow = useRef(reduceMotion);
  useLayoutEffect(() => {
    reduceMotionNow.current = reduceMotion;
  });
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const element = target.current;
      if (!element) return;
      const limit = window.innerHeight - dockZone();
      const { bottom } = element.getBoundingClientRect();
      if (bottom <= limit) return;
      scroller.scrollBy({
        top: bottom - limit + BREATHING,
        behavior: reduceMotionNow.current ? 'auto' : 'smooth',
      });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
    // Re-runs when the Ingredient opens, its target or the scroller changes, not when the motion setting changes while it is open.
  }, [open, target, scroller]);
}
