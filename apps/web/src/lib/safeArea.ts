import { frameInsets } from './cameraFrame';
import type { ScreenAngle } from './cameraOrientation';
import type { Insets } from './scanGuides';

/**
 * The device's safe-area insets in pt. CSS `env()` cannot be read from script, so a probe element
 * takes them as padding and reports the computed result. Browsers with no safe areas, and jsdom,
 * give 0. `angle` is the camera's rotate-back: the browser's insets follow its own orientation,
 * so they are mapped to the edges of the rotated-back frame (0 reads them as they are).
 */
export function readSafeAreaInsets(angle: ScreenAngle = 0): Insets {
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px)';
  document.body.appendChild(probe);
  try {
    const style = getComputedStyle(probe);
    const read = (value: string) => Number.parseFloat(value) || 0;
    return frameInsets(
      {
        top: read(style.paddingTop),
        right: read(style.paddingRight),
        bottom: read(style.paddingBottom),
        left: read(style.paddingLeft),
      },
      angle,
    );
  } finally {
    probe.remove();
  }
}
