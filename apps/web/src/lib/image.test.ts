import { describe, expect, it } from 'vitest';
import {
  fitWithin,
  guideCropRect,
  receiptOutputSize,
  rotatedBounds,
  rotatedCropTransform,
} from './image';
import { guideRect } from './scanGuides';

describe('fitWithin', () => {
  it('scales the longest edge down to the limit, keeping the aspect ratio', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('never upscales a small image', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

describe('guideCropRect', () => {
  // A 100 x 200 view with a 60 x 180 guide, centred, given as an on-screen rectangle.
  const view = { width: 100, height: 200 };
  const guide = { x: 20, y: 10, width: 60, height: 180 };

  it('maps the guide onto a frame with the same aspect as the view', () => {
    const rect = guideCropRect({ width: 1000, height: 2000 }, view, guide);
    expect(rect).toEqual({ x: 200, y: 100, width: 600, height: 1800 });
  });

  it('accounts for the preview cropping a wider frame to fill the view', () => {
    // Cover scale is 0.2 view px per frame px: the view shows 500 x 1000 of the frame, centred.
    const rect = guideCropRect({ width: 1500, height: 1000 }, view, guide);
    expect(rect).toEqual({ x: 600, y: 50, width: 300, height: 900 });
  });

  it('handles a landscape frame delivered to a portrait view', () => {
    const rect = guideCropRect({ width: 1920, height: 1080 }, view, guide);
    expect(rect.height).toBeCloseTo(972, 0);
    expect(rect.width).toBeCloseTo(324, 0);
    expect(rect.x + rect.width / 2).toBeCloseTo(960, 0);
    expect(rect.y + rect.height / 2).toBeCloseTo(540, 0);
  });

  it('keeps the crop inside the frame', () => {
    const rect = guideCropRect({ width: 640, height: 480 }, view, {
      x: 0,
      y: 0,
      width: 100,
      height: 200,
    });
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(640);
    expect(rect.y + rect.height).toBeLessThanOrEqual(480);
  });
});

describe('receiptOutputSize', () => {
  it('scales a large crop to exactly 3 tiles: 512 x 1536', () => {
    expect(receiptOutputSize(972, 2916)).toEqual({ width: 512, height: 1536 });
  });

  it('never upscales a smaller crop', () => {
    expect(receiptOutputSize(324, 972)).toEqual({ width: 324, height: 972 });
  });

  it('never rounds a 1:3 downscale up to an extra tile', () => {
    expect(receiptOutputSize(900, 2701).height).toBeLessThanOrEqual(1536);
    expect(receiptOutputSize(1500, 4500)).toEqual({ width: 512, height: 1536 });
  });

  it('follows the configured output width', () => {
    expect(receiptOutputSize(2000, 6000, 768)).toEqual({
      width: 768,
      height: 2304,
    });
  });
});

describe('receipt crop follows the on-screen guide on an aspect-fill feed', () => {
  const phone = { width: 390, height: 844, insets: { top: 47, bottom: 34 } };
  const crop = (width: number, height: number, view = phone) => {
    const guide = guideRect('receipt', view);
    const rect = guideCropRect({ width, height }, view, guide);
    return { guide, rect, out: receiptOutputSize(rect.width, rect.height) };
  };

  it('maps the guide rectangle through cover scaling (height-bound frame)', () => {
    // 1080 x 1920 on 390 x 844: scale = 844 / 1920, the sides are cut off.
    const { guide, rect } = crop(1080, 1920);
    const scale = 844 / 1920;
    const visibleX = (1080 - 390 / scale) / 2;
    expect(rect.x).toBeCloseTo(visibleX + guide.x / scale, -1);
    expect(rect.y).toBeCloseTo(guide.y / scale, -1);
    expect(rect.width).toBeCloseTo(guide.width / scale, -1);
    expect(rect.height).toBeCloseTo(guide.height / scale, -1);
  });

  it('keeps the on-screen guide aspect', () => {
    const { guide, rect } = crop(1080, 1920);
    expect(rect.width / rect.height).toBeCloseTo(guide.width / guide.height, 1);
  });

  it('follows the guide centred in the clear area, not the middle of the frame', () => {
    // 1920 x 1080 on 390 x 844: scale = 844 / 1080, the sides are cut off.
    const { guide, rect } = crop(1920, 1080);
    const scale = 844 / 1080;
    expect(rect.x + rect.width / 2).toBeCloseTo(1920 / 2, -1);
    expect(rect.y + rect.height / 2).toBeCloseTo(
      (guide.y + guide.height / 2) / scale,
      -1,
    );
    expect(rect.y + rect.height / 2).not.toBeCloseTo(1080 / 2, -1);
  });

  it('maps the guide of a tall frame on a wider view by the other axis', () => {
    // 1080 x 2400 on 390 x 700: scale = 390 / 1080, top and bottom are cut off.
    const view = { width: 390, height: 700, insets: { top: 0, bottom: 0 } };
    const { guide, rect } = crop(1080, 2400, view);
    const scale = 390 / 1080;
    const visibleY = (2400 - 700 / scale) / 2;
    expect(rect.y).toBeCloseTo(visibleY + guide.y / scale, -1);
    expect(rect.height).toBeCloseTo(guide.height / scale, -1);
    expect(rect.y + rect.height / 2).toBeCloseTo(
      visibleY + (guide.y + guide.height / 2) / scale,
      -1,
    );
  });

  it('follows the tablet guide, which keeps the portrait phone shape', () => {
    const tablet = {
      width: 1024,
      height: 768,
      insets: { top: 0, bottom: 0 },
      deviceClass: 'tablet' as const,
    };
    const { guide, rect } = crop(1920, 1080, tablet);
    const scale = Math.max(1024 / 1920, 768 / 1080);
    expect(guide.height).toBeGreaterThan(guide.width);
    expect(rect.width).toBeCloseTo(guide.width / scale, -1);
    expect(rect.height).toBeCloseTo(guide.height / scale, -1);
    expect(rect.x + rect.width / 2).toBeCloseTo(
      (1920 - 1024 / scale) / 2 + (guide.x + guide.width / 2) / scale,
      -1,
    );
    expect(rect.y + rect.height / 2).toBeCloseTo(
      (guide.y + guide.height / 2) / scale + (1080 - 768 / scale) / 2,
      -1,
    );
  });

  it('is sent at the crop aspect rather than a forced 1:3, one tile wide, never upscaled', () => {
    expect(receiptOutputSize(800, 1980)).toEqual({
      width: 512,
      height: Math.round((512 * 1980) / 800),
    });
    expect(receiptOutputSize(300, 742)).toEqual({ width: 300, height: 742 });
  });
});

describe('rotatedBounds', () => {
  it('is the image itself at 0 and 180 degrees, and swaps sides at 90', () => {
    expect(rotatedBounds(400, 300, 0)).toEqual({ width: 400, height: 300 });
    const quarter = rotatedBounds(400, 300, 90);
    expect(quarter.width).toBeCloseTo(300);
    expect(quarter.height).toBeCloseTo(400);
    const half = rotatedBounds(400, 300, 180);
    expect(half.width).toBeCloseTo(400);
    expect(half.height).toBeCloseTo(300);
  });

  it('grows to hold a slightly tilted image', () => {
    const tilted = rotatedBounds(400, 300, 10);
    expect(tilted.width).toBeGreaterThan(400);
    expect(tilted.height).toBeGreaterThan(300);
  });
});

describe('rotatedCropTransform', () => {
  const image = { width: 400, height: 300 };
  const corners = [
    [-200, -150],
    [200, -150],
    [200, 150],
    [-200, 150],
  ];
  /** Where the source image corners land on the output canvas. */
  const landed = (
    crop: { x: number; y: number; width: number; height: number },
    degrees: number,
    scale = 1,
  ) => {
    const [a, b, c, d, e, f] = rotatedCropTransform(
      image,
      crop,
      degrees,
      scale,
    );
    return corners.map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
  };
  const xs = (points: number[][]) => points.map(([x]) => x);
  const ys = (points: number[][]) => points.map(([, y]) => y);

  it.each([0, 90, 180, 270, 10])(
    'puts the rotated image exactly on its bounding box when the crop is that box (%i degrees)',
    (degrees) => {
      const bounds = rotatedBounds(image.width, image.height, degrees);
      const points = landed(
        { x: 0, y: 0, width: bounds.width, height: bounds.height },
        degrees,
      );
      expect(Math.min(...xs(points))).toBeCloseTo(0);
      expect(Math.max(...xs(points))).toBeCloseTo(bounds.width);
      expect(Math.min(...ys(points))).toBeCloseTo(0);
      expect(Math.max(...ys(points))).toBeCloseTo(bounds.height);
    },
  );

  it('sends each corner to the expected corner at the right angles', () => {
    // 90 degrees clockwise: top-left goes to top-right, in a 300 x 400 box.
    const [topLeft, topRight, bottomRight, bottomLeft] = landed(
      { x: 0, y: 0, width: 300, height: 400 },
      90,
    );
    expect(topLeft).toEqual([expect.closeTo(300), expect.closeTo(0)]);
    expect(topRight).toEqual([expect.closeTo(300), expect.closeTo(400)]);
    expect(bottomRight).toEqual([expect.closeTo(0), expect.closeTo(400)]);
    expect(bottomLeft).toEqual([expect.closeTo(0), expect.closeTo(0)]);
    // 180 degrees: top-left goes to bottom-right of the unchanged 400 x 300 box.
    const [flipped] = landed({ x: 0, y: 0, width: 400, height: 300 }, 180);
    expect(flipped).toEqual([expect.closeTo(400), expect.closeTo(300)]);
    // 270 degrees: top-left goes to bottom-left.
    const [turned] = landed({ x: 0, y: 0, width: 300, height: 400 }, 270);
    expect(turned).toEqual([expect.closeTo(0), expect.closeTo(400)]);
  });

  it('moves the output origin to the crop corner', () => {
    const crop = { x: 100, y: 50, width: 100, height: 300 };
    const whole = rotatedBounds(image.width, image.height, 10);
    const full = landed(
      { x: 0, y: 0, width: whole.width, height: whole.height },
      10,
    );
    const cropped = landed(crop, 10);
    cropped.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(full[i][0] - crop.x);
      expect(y).toBeCloseTo(full[i][1] - crop.y);
    });
  });

  it('scales the whole output', () => {
    const crop = { x: 100, y: 50, width: 100, height: 300 };
    const one = landed(crop, 10);
    const half = landed(crop, 10, 0.5);
    half.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(one[i][0] / 2);
      expect(y).toBeCloseTo(one[i][1] / 2);
    });
  });
});
