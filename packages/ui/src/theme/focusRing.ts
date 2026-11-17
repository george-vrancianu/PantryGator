import { canopy, palette } from './themeVars';

/** Handoff section 7: a 2 px `accent` ring with a 2 px offset in every Theme. */
export const focusRingStyle = {
  outline: `2px solid ${palette('pp-accent')}`,
  outlineOffset: '2px',
} as const;

/**
 * The keyboard focus ring. MUI's ButtonBase resets `outline`, so controls
 * built on it set the ring themselves rather than relying on the global
 * `:focus-visible` rule.
 */
export const focusRing = {
  '&.Mui-focusVisible, &:focus-visible': focusRingStyle,
} as const;

/** The same ring drawn inside the edge, for a row whose container clips it; also for a virtually focused row (an active descendant). */
export const insetFocusRingStyle = {
  outline: `2px solid ${palette('pp-accent')}`,
  outlineOffset: '-2px',
} as const;

/** {@link focusRing} drawn inside the edge, for full-width rows in a clipped list. */
export const insetFocusRing = {
  '&.Mui-focusVisible, &:focus-visible': insetFocusRingStyle,
} as const;

/**
 * The keyboard focus ring on the Canopy (the dark green header, search field, tabs and Dock):
 * `gold`, because the accent green is hard to see there. Same 2 px / +2 geometry as {@link focusRingStyle}.
 */
export const canopyFocusRingStyle = {
  outline: `2px solid ${canopy.gold}`,
  outlineOffset: '2px',
} as const;

/** {@link focusRing} in the Canopy's gold, for a control that sits on the Canopy. */
export const canopyFocusRing = {
  '&.Mui-focusVisible, &:focus-visible': canopyFocusRingStyle,
} as const;
