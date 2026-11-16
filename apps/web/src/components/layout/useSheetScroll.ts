import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { isTabRoot } from '../../lib/layoutKind';
import { scrollElementTo } from '../../lib/scroller';

/** Gives up waiting for a restored page to grow tall enough after this long. */
const RESTORE_WAIT_MS = 1500;

/**
 * Remembers the sheet's scroll position in memory and applies it on navigation:
 * - Back and Forward restore the position that location had.
 * - A Dock tab root (Home, Shopping, Pantry, Recipes) restores where the tab was left, however it is reached.
 * - Anything else, a drill-in, opens at the top.
 * Only a change of path moves the sheet: a query-string change leaves it where it is.
 * A restore waits for the page to grow tall enough, so content that loads after the swap still lands.
 */
export function useSheetScroll(scroller: HTMLElement | null) {
  const { pathname, key } = useLocation();
  const navigationType = useNavigationType();
  const byKey = useRef(new Map<string, number>());
  const byTab = useRef(new Map<string, number>());
  const here = useRef({ key, pathname });
  const shown = useRef(pathname);

  // Every scroll is filed under the location the sheet shows.
  useEffect(() => {
    if (!scroller) return;
    const onScroll = () => {
      byKey.current.set(here.current.key, scroller.scrollTop);
      if (isTabRoot(here.current.pathname))
        byTab.current.set(here.current.pathname, scroller.scrollTop);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [scroller]);

  const wanted = useRef<{ top: number; until: number } | null>(null);
  useLayoutEffect(() => {
    here.current = { key, pathname };
    if (!scroller || shown.current === pathname) return;
    shown.current = pathname;
    const target =
      navigationType === 'POP'
        ? (byKey.current.get(key) ?? 0)
        : isTabRoot(pathname)
          ? (byTab.current.get(pathname) ?? 0)
          : 0;
    scrollElementTo(scroller, { top: target });
    wanted.current =
      scroller.scrollTop === target
        ? null
        : { top: target, until: Date.now() + RESTORE_WAIT_MS };
  }, [scroller, key, pathname, navigationType]);

  // A restore the page was too short for is retried as it grows, until the Member scrolls or it times out.
  useEffect(() => {
    if (!scroller || typeof ResizeObserver === 'undefined') return;
    const content = scroller.firstElementChild;
    if (!content) return;
    const settle = () => {
      const goal = wanted.current;
      if (goal === null) return;
      if (Date.now() > goal.until) {
        wanted.current = null;
        return;
      }
      scrollElementTo(scroller, { top: goal.top });
      if (scroller.scrollTop === goal.top) wanted.current = null;
    };
    const cancel = () => {
      wanted.current = null;
    };
    const observer = new ResizeObserver(settle);
    observer.observe(content);
    scroller.addEventListener('touchstart', cancel, { passive: true });
    scroller.addEventListener('wheel', cancel, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener('touchstart', cancel);
      scroller.removeEventListener('wheel', cancel);
    };
  }, [scroller]);
}
