import { createContext, useContext } from 'react';
import type { LayoutKind } from '../../lib/layoutKind';

/** `leaving` is the held outgoing page, `entering` the new one while the hold lasts, `idle` otherwise. */
export type PagePhase = 'idle' | 'entering' | 'leaving';

export type LayoutRegion = 'topBar' | 'header';

export type LayoutSlots = {
  /** Where a `Screen` portals its top bar and header; null until the layout has mounted them. */
  topBarEl: HTMLElement | null;
  headerEl: HTMLElement | null;
  /** The measured height of a region, reported by the current page. */
  setHeight: (region: LayoutRegion, height: number) => void;
  kind: LayoutKind;
  /** Table screens lift the 960 px cap on the top bar, header and content to 1180 px. */
  wide: boolean;
  /** A collapsed header, for short phones and the keyboard. Always false for now; the layout only exposes it. */
  collapsed: boolean;
};

export const LayoutSlotsContext = createContext<LayoutSlots | undefined>(
  undefined,
);

export type PageInstance = {
  /** Stable for the page's life, to find its own wrapper among the ones a transition holds. */
  id: number;
  phase: PagePhase;
  /** Set by a `Screen` when it mounts, so the layout can tell a page that has none (the camera aside). */
  markScreen: () => void;
};

export const PageInstanceContext = createContext<PageInstance | undefined>(
  undefined,
);

/** The layout's slots, or undefined for a page rendered outside `AppLayout`. */
export function useLayoutSlots() {
  return useContext(LayoutSlotsContext);
}

export function usePageInstance() {
  return useContext(PageInstanceContext);
}

/** The layout's header state, for pages that want to react to it. */
export function useLayoutState() {
  const slots = useContext(LayoutSlotsContext);
  return { collapsed: slots?.collapsed ?? false, kind: slots?.kind ?? 'page' };
}
