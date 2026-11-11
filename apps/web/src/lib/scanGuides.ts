import type { CameraLayout, DeviceClass } from './cameraOrientation';
import type { CameraMode } from './cameraMode';

export type Rect = { x: number; y: number; width: number; height: number };

/** Safe-area insets in pt (`env(safe-area-inset-*)`); 0 where the device has none. */
export type Insets = { top: number; bottom: number };

/**
 * The camera screen: its size and safe-area insets. The insets default to none, the device class to
 * a phone, the layout to the footer. In the rail layout the clear area has no footer and stops
 * `RAIL_WIDTH` short of the right edge; only tablet guides take that shape (a phone is never in it).
 */
export type GuideView = {
  width: number;
  height: number;
  insets?: Insets;
  deviceClass?: DeviceClass;
  layout?: CameraLayout;
  /**
   * How much of the rail lies over this view (rail layout only). Defaults to the whole rail, for
   * a feed that runs under it, as the viewfinder does today; a feed that stops short of the rail
   * has less of it over it (0 when it ends where the rail begins), so the rail is not taken off twice.
   */
  railOverlap?: number;
};

/**
 * Bar heights of the camera chrome (handoff sections 2.1 and 5.1), in pt, without the safe areas.
 * The glass top bar and the footer must use these same constants, because the guide is centred in
 * the clear area between them.
 */
export const TOP_BAR_HEIGHT = 52;
export const SHUTTER_ROW_HEIGHT = 104;
export const MODE_SLIDER_HEIGHT = 40;
export const FOOTER_HEIGHT = SHUTTER_ROW_HEIGHT + MODE_SLIDER_HEIGHT;
/**
 * The least room under the mode slider, so it never sits on the screen's edge. It is a floor on the
 * bottom safe area, not added to it: a home indicator already leaves room.
 */
export const FOOTER_MIN_BOTTOM = 20;

/**
 * The width of the rail (pt, without the safe area): the shared constant of the rail component and
 * the guide maths, because the guide is centred in the clear area left of it. The guide maths ignores
 * the right safe-area inset the on-screen rail adds on top (none on tablets and desktops today).
 */
export const RAIL_WIDTH = 168;

/** The guide sits this far above the middle of the clear area (room for the zoom pill later). */
export const GUIDE_LIFT = 14;

/** Each camera mode's guide as a fraction of the screen width x the clear-area height (handoff 3.2). */
export const SCAN_GUIDES: Record<
  CameraMode,
  { width: number; height: number }
> = {
  receipt: { width: 0.56, height: 0.78 },
  product: { width: 0.62, height: 0.56 },
  ingredients: { width: 0.88, height: 0.5 },
  plate: { width: 0.8, height: 0.6 },
  // Barcode is a camera mode, not a Scan Mode: a wide, shallow guide to aim at the bars.
  barcode: { width: 0.8, height: 0.3 },
};

/** The part of the screen between the bars, as its top edge and height. */
export function clearArea(view: GuideView): { top: number; height: number } {
  const { top, height } = clearBox(view);
  return { top, height };
}

/** The clear area with its horizontal extent: with the rail (if any) taken off its right, from x = 0. */
export function clearBox(view: GuideView): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const insets = view.insets ?? { top: 0, bottom: 0 };
  const top = insets.top + TOP_BAR_HEIGHT;
  const rail = view.layout === 'rail';
  // The rail runs the full height, so there is no footer to leave room for.
  const bottom = rail
    ? view.height - insets.bottom
    : view.height -
      (Math.max(insets.bottom, FOOTER_MIN_BOTTOM) + FOOTER_HEIGHT);
  return {
    left: 0,
    top,
    width: view.width - (rail ? (view.railOverlap ?? RAIL_WIDTH) : 0),
    height: bottom - top,
  };
}

/** The reference portrait phone (no insets) whose guide shapes a tablet keeps. */
const REFERENCE_PHONE: GuideView = { width: 390, height: 844 };

/** A tablet guide is at most this share of the clear area's height... */
export const TABLET_GUIDE_MAX_HEIGHT = 0.8;
/**
 * ...and of its width. 0.9 sits just above the widest phone guide (Ingredients, 0.88 of the width),
 * so only the wide Barcode guide in a narrow clear area is ever held back by it.
 */
export const TABLET_GUIDE_MAX_WIDTH = 0.9;

/** A guide's width over height on the reference portrait phone. */
function referenceRatio(mode: CameraMode): number {
  const clear = clearBox(REFERENCE_PHONE);
  return (
    (REFERENCE_PHONE.width * SCAN_GUIDES[mode].width) /
    (clear.height * SCAN_GUIDES[mode].height)
  );
}

/** The guide for a camera mode on `view`, in pt from the screen's top left. */
export function guideRect(mode: CameraMode, view: GuideView): Rect {
  const clear = clearBox(view);
  // Centred in the clear area, then lifted: 14 pt above its middle.
  // In the rail layout there is no zoom pill over the guide's room, so it is not lifted.
  const lift = view.layout === 'rail' ? 0 : GUIDE_LIFT;
  const centreY = (height: number) =>
    clear.top + clear.height / 2 - lift - height / 2;
  if (view.deviceClass === 'tablet') {
    const ratio = referenceRatio(mode);
    const height = Math.min(
      clear.height * TABLET_GUIDE_MAX_HEIGHT,
      (clear.width * TABLET_GUIDE_MAX_WIDTH) / ratio,
    );
    const width = height * ratio;
    return {
      x: clear.left + clear.width / 2 - width / 2,
      y: centreY(height),
      width,
      height,
    };
  }
  const width = view.width * SCAN_GUIDES[mode].width;
  const height = clear.height * SCAN_GUIDES[mode].height;
  return { x: (view.width - width) / 2, y: centreY(height), width, height };
}
