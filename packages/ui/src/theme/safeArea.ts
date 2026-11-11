/**
 * The device's safe-area insets as CSS lengths (ADR 0040). The app draws edge to edge
 * (`viewport-fit=cover`) and pads itself by these; a device with no notch, island or home
 * indicator reports 0, so every expression below falls back to its plain value.
 */
export const SAFE_TOP = 'env(safe-area-inset-top, 0px)';
export const SAFE_BOTTOM = 'env(safe-area-inset-bottom, 0px)';
export const SAFE_LEFT = 'env(safe-area-inset-left, 0px)';
export const SAFE_RIGHT = 'env(safe-area-inset-right, 0px)';

/** `px` of gutter, or the left inset when that is larger (iPhone landscape). */
export const gutterLeft = (px: number) => `max(${px}px, ${SAFE_LEFT})`;
/** `px` of gutter, or the right inset when that is larger. */
export const gutterRight = (px: number) => `max(${px}px, ${SAFE_RIGHT})`;
/** `px` of gutter on both sides, or the larger side inset: keeps a centred box centred. */
export const gutterBoth = (px: number) =>
  `max(${px}px, ${SAFE_LEFT}, ${SAFE_RIGHT})`;
/** The Dock's distance from the bottom edge, and the line everything above it is measured from. */
export const dockBottom = (px: number) => `max(${px}px, ${SAFE_BOTTOM})`;
/** `px` of padding or clearance plus the bottom inset, for bars that replace the Dock. */
export const plusBottomInset = (px: number) => `calc(${px}px + ${SAFE_BOTTOM})`;
/** The room a tall Sheet leaves above itself so its grab handle stays reachable. */
export const sheetTopRoom = `calc(${SAFE_TOP} + 12px)`;
/**
 * A header's own `px` of top room, less the top inset: the room gives way to the inset instead of
 * stacking on it, so the header starts at `max(px, inset)` inside a page padded by the inset.
 */
export const topRoomBelowInset = (px: number) =>
  `max(0px, calc(${px}px - ${SAFE_TOP}))`;
