import { useEffect, type RefObject } from 'react';
import { BUBBLE_BOTTOM_VAR } from './bubbleVars';

/**
 * Keeps the Gator bubble above a page's own fixed bottom bar (Scan Review's Save, a Catalog
 * Recipe preview's Add to family): writes the bar's height as `--gator-bubble-bottom` on `:root`
 * while the bar is mounted (the bubble is a sibling of the layout, so a variable on the bar
 * would not reach it), and clears it on unmount.
 */
export function useBubbleBottomBound(bar: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const root = document.documentElement;
    const write = () =>
      root.style.setProperty(
        BUBBLE_BOTTOM_VAR,
        `${element.getBoundingClientRect().height}px`,
      );
    write();
    window.addEventListener('resize', write);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(write);
      observer.observe(element);
    }
    return () => {
      window.removeEventListener('resize', write);
      observer?.disconnect();
      root.style.removeProperty(BUBBLE_BOTTOM_VAR);
    };
  }, [bar]);
}
