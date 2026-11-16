import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { TRANSITION_MS } from './timing';

export type Page = { id: number; pathname: string; element: ReactNode };

/**
 * Holds the outgoing page (the previous `useOutlet()` element) for `TRANSITION_MS` after the path
 * changes, so both pages exist at once and can cross-fade. Navigating again mid-transition drops the
 * held page and jumps to the newest one; it never queues. `canHold` says whether a move between two
 * paths gets a transition at all (the camera and reduced motion do not): without it the swap is instant.
 * Only a change of path counts: a query-string change stays on the same page.
 */
export function usePageTransition(
  outlet: ReactNode,
  pathname: string,
  canHold: (from: string, to: string) => boolean,
) {
  const [state, setState] = useState<{
    id: number;
    pathname: string;
    leaving: Page | null;
  }>({ id: 1, pathname, leaving: null });
  // The outlet drawn last: the page to hold when the path changes.
  const drawn = useRef<ReactNode>(outlet);
  useLayoutEffect(() => {
    drawn.current = outlet;
  });

  let now = state;
  if (pathname !== state.pathname) {
    now = {
      id: state.id + 1,
      pathname,
      leaving:
        state.leaving === null && canHold(state.pathname, pathname)
          ? {
              id: state.id,
              pathname: state.pathname,
              // oxlint-disable-next-line react-hooks-js/refs -- the previous page's element is exactly what the ref holds; render-phase state keeps it mounted without a flash
              element: drawn.current,
            }
          : null,
    };
    setState(now);
  }

  useEffect(() => {
    if (!now.leaving) return;
    const timer = setTimeout(
      () => setState((s) => ({ ...s, leaving: null })),
      TRANSITION_MS,
    );
    return () => clearTimeout(timer);
  }, [now.leaving]);

  const current: Page = { id: now.id, pathname: now.pathname, element: outlet };
  return { current, leaving: now.leaving };
}
