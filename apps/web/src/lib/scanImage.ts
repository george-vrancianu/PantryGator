import { cropToReceiptGuide, resizeImage } from './image';
import type { ScreenAngle } from './cameraOrientation';
import type { ScanMode } from './scan';
import type { GuideView } from './scanGuides';

/** Where the image came from: a live camera frame, or a file the Member picked from their gallery. */
export type ImageOrigin = 'camera' | 'gallery';

/** Turns a camera frame or gallery file into the JPEG data URL a Scan Mode sends to its endpoint. */
export type ImagePreparation = (
  source: Blob,
  origin: ImageOrigin,
  /** On-screen size and safe-area insets of the feed the frame came from; the receipt guide is mapped through it. */
  view?: GuideView,
  /** The photo turn captured at the shutter; applies to camera frames only. */
  turn?: ScreenAngle,
) => Promise<string>;

const resizeOnly: ImagePreparation = (source, origin, _view, turn) =>
  resizeImage(source, origin === 'camera' ? turn : 0);

/** How each Scan Mode prepares its image before sending it. */
export const IMAGE_PREPARATION: Record<ScanMode, ImagePreparation> = {
  product: resizeOnly,
  // A camera frame is cropped to the viewfinder's guide. A gallery file is cropped by the
  // Member from its card in Review instead (cropToReceiptArea), so it never comes through here. Rejecting is deliberate, not a TODO.
  receipt: (source, origin, view, turn) =>
    origin === 'camera' && view
      ? cropToReceiptGuide(source, view, turn)
      : Promise.reject(new Error('gallery receipts go through the crop step')),
  plate: resizeOnly,
  ingredients: resizeOnly,
};
