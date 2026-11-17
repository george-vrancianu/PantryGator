import { dockBottom } from './safeArea';

/** Gap between the floating Dock and the bottom edge, px: lifted so the rocker's overhang stays on screen. */
export const DOCK_BOTTOM = 26;
/** How far the Camera/Mic rocker reaches past the Dock's top and bottom edges, px. */
export const DOCK_OVERHANG = 13;
/** The Dock's padding, px: none, the tabs fill the bar and the rocker overhangs its edge. */
export const DOCK_PADDING = 0;
/** Width of the Camera/Mic capsule, px. */
export const CAPSULE_WIDTH = 58;
/** Width of the camera-only capsule, px. */
export const CAPSULE_CAMERA_ONLY_WIDTH = 52;
/** Width of the Dock's middle slot, px (the `66px` column): the rocker plus air. */
export const DOCK_CENTRE_WIDTH = 66;
/** Dock height in px: phone, then from the `md` breakpoint. */
export const DOCK_HEIGHT = { xs: 66, md: 66 } as const;

/** Air between the capsule's top and anything that sits above the Dock. */
const DOCK_GAP = DOCK_OVERHANG + 6;
/** The Dock's CSS `bottom`: 26 px, or the device's bottom inset when that is larger (the home indicator). */
export const DOCK_BOTTOM_CSS = dockBottom(DOCK_BOTTOM);
/** Air between the capsule's overhang and a page's last row, px. */
const DOCK_CLEARANCE_AIR = 10;
/** Room above the Dock's own bottom that a page's last row needs: the Dock, the rocker's overhang, and air (89 px). */
const DOCK_CLEARANCE_ABOVE =
  DOCK_HEIGHT.xs + DOCK_OVERHANG + DOCK_CLEARANCE_AIR;
/** PageLayout's bottom padding that keeps a page's last row clear of the Dock and its capsule (115 px with no inset). */
export const DOCK_CLEARANCE = `calc(${DOCK_BOTTOM_CSS} + ${DOCK_CLEARANCE_ABOVE}px)`;
/** CSS `bottom` that clears the floating Dock of the given height, measured from the Dock's own bottom. */
export const aboveDock = (height: number) =>
  `calc(${DOCK_BOTTOM_CSS} + ${height + DOCK_GAP}px)`;
