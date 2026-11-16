import { createContext, useContext, useMemo, type ReactNode } from 'react';

/** The element the shared layout scrolls in (the working sheet); null outside the layout. */
const ScrollerContext = createContext<HTMLElement | null>(null);

export function ScrollerProvider({
  element,
  children,
}: {
  element: HTMLElement | null;
  children: ReactNode;
}) {
  return <ScrollerContext value={element}>{children}</ScrollerContext>;
}

/** `scrollTo` where the browser has it, a plain `scrollTop` write where it does not (jsdom). */
export function scrollElementTo(
  element: HTMLElement,
  options: ScrollToOptions,
) {
  if (typeof element.scrollTo === 'function') element.scrollTo(options);
  else if (options.top !== undefined) element.scrollTop = options.top;
}

function scrollElementBy(element: HTMLElement, options: ScrollToOptions) {
  if (typeof element.scrollBy === 'function') element.scrollBy(options);
  else element.scrollTop += options.top ?? 0;
}

export type Scroller = {
  /** The sheet's scroll element, or null when the page is not inside the layout (it then scrolls the window). */
  element: HTMLElement | null;
  /** How far the page is scrolled. */
  top: () => number;
  scrollTo: (options: ScrollToOptions) => void;
  scrollBy: (options: ScrollToOptions) => void;
};

/**
 * The page's scroller. Inside `AppLayout` the sheet is the only thing that scrolls, so a page that
 * scrolls itself (to the top on a tab change, a field into view) goes through this, not `window`.
 * Outside the layout, for example a page rendered alone in a test, it falls back to the window.
 */
export function useScroller(): Scroller {
  const element = useContext(ScrollerContext);
  return useMemo<Scroller>(() => {
    if (!element) {
      return {
        element: null,
        top: () => window.scrollY,
        scrollTo: (options) => window.scrollTo(options),
        scrollBy: (options) => window.scrollBy(options),
      };
    }
    return {
      element,
      top: () => element.scrollTop,
      scrollTo: (options) => scrollElementTo(element, options),
      scrollBy: (options) => scrollElementBy(element, options),
    };
  }, [element]);
}
