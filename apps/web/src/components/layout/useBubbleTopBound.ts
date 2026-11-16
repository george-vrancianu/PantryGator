import { useEffect } from 'react';
import { BUBBLE_TOP_VAR } from '../background/bubble/GatorBubble';

/**
 * Keeps the Gator bubble below the header: writes the distance from the top of the screen to the
 * bottom of the header region as `--gator-bubble-top` on `:root` (the bubble is a sibling of the
 * layout, so a variable on the layout would not reach it). Follows the regions' sizes, which
 * animate between pages. Clears it when `header` is `null` (the camera) and on unmount.
 */
export function useBubbleTopBound(
  header: HTMLElement | null,
  topBar: HTMLElement | null,
) {
  useEffect(() => {
    const root = document.documentElement;
    if (!header) {
      root.style.removeProperty(BUBBLE_TOP_VAR);
      return;
    }
    const write = () =>
      root.style.setProperty(
        BUBBLE_TOP_VAR,
        `${header.getBoundingClientRect().bottom}px`,
      );
    write();
    window.addEventListener('resize', write);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(write);
      observer.observe(header);
      if (topBar) observer.observe(topBar);
    }
    return () => {
      window.removeEventListener('resize', write);
      observer?.disconnect();
      root.style.removeProperty(BUBBLE_TOP_VAR);
    };
  }, [header, topBar]);
}
