import { SAFE_BOTTOM, SAFE_LEFT, SAFE_RIGHT, SAFE_TOP } from './safeArea';
import { DOCK_BOTTOM } from './dock';

/** The device's safe-area insets in px. */
export type SafeInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/**
 * The device's safe-area insets in px, for JavaScript geometry (popover, scroll and camera limits).
 * `env()` is only readable through a CSS property, so a hidden probe takes the insets as padding and we read the
 * computed pixels back. A browser or test DOM that does not know `env()` reports 0, as a device with no notch does.
 */
export function readSafeInsets(): SafeInsets {
  const none = { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof document === 'undefined' || !document.body) return none;
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.setAttribute('data-safe-area-probe', '');
  probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;padding-top:${SAFE_TOP};padding-right:${SAFE_RIGHT};padding-bottom:${SAFE_BOTTOM};padding-left:${SAFE_LEFT}`;
  document.body.appendChild(probe);
  try {
    const style = window.getComputedStyle(probe);
    const read = (value: string) => {
      const px = Number.parseFloat(value);
      return Number.isFinite(px) ? px : 0;
    };
    return {
      top: read(style.paddingTop),
      right: read(style.paddingRight),
      bottom: read(style.paddingBottom),
      left: read(style.paddingLeft),
    };
  } finally {
    probe.remove();
  }
}

/** The Dock's real distance from the bottom edge in px: the JavaScript twin of `DOCK_BOTTOM_CSS`. Pass insets already read to skip a second probe. */
export const dockBottomPx = (insets: { bottom: number } = readSafeInsets()) =>
  Math.max(DOCK_BOTTOM, insets.bottom);
