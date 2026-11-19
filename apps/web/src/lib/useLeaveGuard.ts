import { useEffect, useLayoutEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Asks before the Member leaves while `shouldAsk()` is true (unsaved work).
 *
 * The app runs on a data router (`createBrowserRouter`), so this uses
 * React Router's `useBlocker`:
 *  - in-app navigation (links, `navigate(...)`, `navigate(-1)`) and the
 *    browser's Back and Forward buttons are all blocked the same way; on
 *    "blocked" it asks with `window.confirm` (the same dialog the Scan screen
 *    uses) and then `proceed()`s or `reset()`s. A navigation to the same
 *    pathname (such as putting `?draft=` in the address) never asks;
 *  - closing, reloading or leaving the site: `beforeunload`, with the browser's
 *    own wording.
 * `shouldAsk` is read at the moment of leaving, so it is current even in the
 * same tick as the state change that cleared it.
 *
 * A guarded page's own back or
 * cancel must be a link or a path `navigate(...)`, not `navigate(-1)`, to keep
 * the in-app ask: `navigate(-1)` with no earlier entry leaves the app, and then
 * only `beforeunload` asks.
 *
 * React Router allows one active blocker at a time: mount one guard per page.
 */
export function useLeaveGuard(shouldAsk: () => boolean, message: string): void {
  const latest = useRef({ shouldAsk, message });
  useLayoutEffect(() => {
    latest.current = { shouldAsk, message };
  });

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname &&
      latest.current.shouldAsk(),
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(latest.current.message)) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    const onUnload = (event: BeforeUnloadEvent) => {
      if (!latest.current.shouldAsk()) return;
      event.preventDefault();
      // Older browsers read this.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);
}
