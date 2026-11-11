import { readSafeInsets } from '@pocket-pantry/ui';
import { frameInsets } from './cameraFrame';
import type { ScreenAngle } from './cameraOrientation';
import type { Insets } from './scanGuides';

/**
 * The device's safe-area insets in pt, read by the shared probe (`readSafeInsets`). Browsers with no safe areas,
 * and jsdom, give 0. `angle` is the camera's rotate-back: the browser's insets follow its own orientation,
 * so they are mapped to the edges of the rotated-back frame (0 reads them as they are).
 */
export const readSafeAreaInsets = (angle: ScreenAngle = 0): Insets =>
  frameInsets(readSafeInsets(), angle);
