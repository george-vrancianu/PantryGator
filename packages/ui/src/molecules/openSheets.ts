import { useEffect, useSyncExternalStore } from 'react';

/** How many Sheets are open right now. Module state: Sheets mount anywhere in the tree. */
let openCount = 0;
const listeners = new Set<() => void>();

const change = (by: 1 | -1) => {
  openCount += by;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Called by `Sheet`: counts it while `open`. */
export function useRegisterOpenSheet(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    change(1);
    return () => change(-1);
  }, [open]);
}

/** True while any Sheet is open: floating things (the Gator bubble) hide under it. */
export function useAnySheetOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => openCount > 0,
    () => false,
  );
}
