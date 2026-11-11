import { SAFE_BOTTOM, SAFE_TOP } from './safeArea';
import { DOCK_BOTTOM } from './dock';

/**
 * The device's top and bottom safe-area insets in px, for JavaScript geometry (popover and scroll limits).
 * `env()` is only readable through a CSS property, so a hidden probe takes the insets as padding and we read the
 * computed pixels back. A browser or test DOM that does not know `env()` reports 0, as a device with no notch does.
 */
export function readSafeInsets(): { top: number; bottom: number } {
  if (typeof document === 'undefined' || !document.body)
    return { top: 0, bottom: 0 };
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;padding-top:${SAFE_TOP};padding-bottom:${SAFE_BOTTOM}`;
  document.body.appendChild(probe);
  try {
    const style = window.getComputedStyle(probe);
    const top = Number.parseFloat(style.paddingTop);
    const bottom = Number.parseFloat(style.paddingBottom);
    return {
      top: Number.isFinite(top) ? top : 0,
      bottom: Number.isFinite(bottom) ? bottom : 0,
    };
  } finally {
    probe.remove();
  }
}

/** The Dock's real distance from the bottom edge in px: the JavaScript twin of `DOCK_BOTTOM_CSS`. */
export const dockBottomPx = () =>
  Math.max(DOCK_BOTTOM, readSafeInsets().bottom);
