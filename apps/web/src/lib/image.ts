import { RECEIPT_OUTPUT_WIDTH } from './receiptGuide';
import { turnedSize } from './cameraFrame';
import type { ScreenAngle } from './cameraOrientation';
import { guideRect, type GuideView, type Rect } from './scanGuides';

export type { Rect };

/** Longest edge sent to the API. Plenty for reading a label, small enough for a phone connection. */
export const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.8;

/** The size to scale `width` x `height` to so the longest edge is at most `maxEdge`. Never upscales. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge = MAX_IMAGE_EDGE,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Resizes a camera frame or gallery file to a JPEG data URL, ready to send to a scan endpoint.
 * `turn` (a camera frame's photo turn) turns the frame clockwise by that angle first, so the
 * result is in the phone's portrait frame; the default 0 leaves it as it is.
 */
export async function resizeImage(
  source: Blob,
  turn: ScreenAngle = 0,
): Promise<string> {
  const bitmap = await createImageBitmap(source);
  try {
    const turned = turnedSize(bitmap, turn);
    const { width, height } = fitWithin(turned.width, turned.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas unavailable');
    if (turn === 0) {
      context.drawImage(bitmap, 0, 0, width, height);
    } else {
      context.setTransform(
        ...rotatedCropTransform(
          bitmap,
          { x: 0, y: 0, width: turned.width, height: turned.height },
          turn,
          width / turned.width,
        ),
      );
      context.drawImage(
        bitmap,
        -bitmap.width / 2,
        -bitmap.height / 2,
        bitmap.width,
        bitmap.height,
      );
    }
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}

/**
 * The part of a camera frame that sits under the guide. The preview shows the frame with
 * `object-fit: cover` in a `view` box, so a frame of any shape (including a landscape one on
 * a portrait view) is scaled to fill it and the overflow is cut off; `guide` is the on-screen
 * rectangle in that box, in view pixels.
 */
export function guideCropRect(
  frame: { width: number; height: number },
  view: { width: number; height: number },
  guide: Rect,
): Rect {
  // View pixels per frame pixel under cover scaling.
  const scale = Math.max(view.width / frame.width, view.height / frame.height);
  const visibleX = (frame.width - view.width / scale) / 2;
  const visibleY = (frame.height - view.height / scale) / 2;
  const x = Math.max(0, visibleX + guide.x / scale);
  const y = Math.max(0, visibleY + guide.y / scale);
  const width = Math.min(frame.width - x, guide.width / scale);
  const height = Math.min(frame.height - y, guide.height / scale);
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * The part of a camera frame under the guide once the frame is turned clockwise by `turn`: the
 * crop, in the turned photo's pixels. `view` and `guide` are in the phone's portrait frame, so a
 * landscape frame at 90 or 270 gives the portrait crop that is on screen under the guide.
 */
export function turnedGuideCrop(
  frame: { width: number; height: number },
  view: { width: number; height: number },
  guide: Rect,
  turn: ScreenAngle,
): Rect {
  return guideCropRect(turnedSize(frame, turn), view, guide);
}

/** The size a receipt crop is sent at: at most `outputWidth` wide, keeping the crop's aspect, never upscaled. */
export function receiptOutputSize(
  cropWidth: number,
  cropHeight: number,
  outputWidth = RECEIPT_OUTPUT_WIDTH,
): { width: number; height: number } {
  if (cropWidth <= outputWidth) return { width: cropWidth, height: cropHeight };
  // Floor the height: rounding up could add a row, and with it another billed tile.
  return {
    width: outputWidth,
    height: Math.max(1, Math.floor((cropHeight * outputWidth) / cropWidth)),
  };
}

/** The size of the smallest axis-aligned box that holds a `width` x `height` image rotated by `degrees`. */
export function rotatedBounds(
  width: number,
  height: number,
  degrees: number,
): { width: number; height: number } {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
}

/**
 * The canvas transform (`setTransform` arguments) that draws a source image, rotated by
 * `degrees` about its centre, so that `crop` lands on an output canvas `scale` times its size.
 * `crop` is in the coordinates of the rotated image's bounding box (react-easy-crop's
 * `croppedAreaPixels`). Draw the image at (-width / 2, -height / 2, width, height).
 */
export function rotatedCropTransform(
  image: { width: number; height: number },
  crop: Rect,
  degrees: number,
  scale: number,
): [number, number, number, number, number, number] {
  const radians = (degrees * Math.PI) / 180;
  const bounds = rotatedBounds(image.width, image.height, degrees);
  const cos = Math.cos(radians) * scale;
  const sin = Math.sin(radians) * scale;
  return [
    cos,
    sin,
    -sin,
    cos,
    (bounds.width / 2 - crop.x) * scale,
    (bounds.height / 2 - crop.y) * scale,
  ];
}

/**
 * Cuts `crop` (in the rotated image's bounding-box coordinates; unrotated when `degrees` is 0)
 * out of `bitmap` and scales it to the receipt output size, never upscaling.
 */
function cropReceiptRegion(
  bitmap: ImageBitmap,
  crop: Rect,
  degrees: number,
): string {
  const { width, height } = receiptOutputSize(crop.width, crop.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas unavailable');
  // Downscaling a big photo to 512 wide: smooth it, or small print aliases.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.setTransform(
    ...rotatedCropTransform(bitmap, crop, degrees, width / crop.width),
  );
  context.drawImage(
    bitmap,
    -bitmap.width / 2,
    -bitmap.height / 2,
    bitmap.width,
    bitmap.height,
  );
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

/**
 * Crops a receipt camera frame to the on-screen guide and scales it to the receipt output size.
 * `view` is the size of the aspect-filled feed on screen and its safe-area insets; the guide is
 * centred in the clear area between the bars. `turn` is the photo turn captured at the shutter:
 * the frame is turned first, and `view` is the phone's portrait frame.
 */
export async function cropToReceiptGuide(
  frame: Blob,
  view: GuideView,
  turn: ScreenAngle = 0,
): Promise<string> {
  const bitmap = await createImageBitmap(frame);
  try {
    const crop = turnedGuideCrop(
      bitmap,
      view,
      guideRect('receipt', view),
      turn,
    );
    return cropReceiptRegion(bitmap, crop, turn);
  } finally {
    bitmap.close();
  }
}

/**
 * Crops a gallery photo to the area the Member framed in the crop step. `crop` is in the
 * coordinates of the photo rotated by `degrees` (what react-easy-crop reports).
 */
export async function cropToReceiptArea(
  photo: Blob,
  crop: Rect,
  degrees: number,
): Promise<string> {
  // Honour the photo's EXIF orientation: the crop step shows it that way up.
  const bitmap = await createImageBitmap(photo, {
    imageOrientation: 'from-image',
  });
  try {
    return cropReceiptRegion(bitmap, crop, degrees);
  } finally {
    bitmap.close();
  }
}
