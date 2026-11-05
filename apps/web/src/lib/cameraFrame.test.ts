import { describe, expect, it } from 'vitest';
import {
  frameInsets,
  frameInsetVariables,
  frameSize,
  toFrameDelta,
  toFramePoint,
  turnedSize,
  videoPoint,
} from './cameraFrame';
import { rotatedBounds, rotatedCropTransform } from './image';

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

/** The chrome is drawn with CSS `rotate(-angle)`: where a frame point lands on the screen, about the shared centre. */
function cssRotateBack(
  p: { x: number; y: number },
  angle: number,
  frame: { width: number; height: number },
  centre: { x: number; y: number },
) {
  const r = (-angle * Math.PI) / 180;
  const x = p.x - frame.width / 2;
  const y = p.y - frame.height / 2;
  return {
    x: centre.x + x * Math.cos(r) - y * Math.sin(r),
    y: centre.y + x * Math.sin(r) + y * Math.cos(r),
  };
}

describe('the rotated-back frame', () => {
  it('swaps width and height at 90 and 270 only', () => {
    const window = { width: 844, height: 390 };
    expect(frameSize(window, 0)).toEqual(window);
    expect(frameSize(window, 180)).toEqual(window);
    expect(frameSize(window, 90)).toEqual({ width: 390, height: 844 });
    expect(frameSize(window, 270)).toEqual({ width: 390, height: 844 });
  });

  it('puts the frame top at the screen left at 90, as CSS rotate(-90deg) does', () => {
    // Window 844 x 390, frame 390 x 844 about the same centre.
    const centre = { x: 422, y: 195 };
    const frame = { width: 390, height: 844 };
    const topCentre = cssRotateBack({ x: 195, y: 0 }, 90, frame, centre);
    near(topCentre.x, 0);
    near(topCentre.y, 195);
    const at270 = cssRotateBack({ x: 195, y: 0 }, 270, frame, centre);
    near(at270.x, 844);
  });

  it.each([90, 180, 270] as const)(
    'toFramePoint undoes the CSS rotate-back at %i',
    (angle) => {
      const screenSize = { width: 844, height: 390 };
      const frame = frameSize(screenSize, angle);
      const centre = { x: screenSize.width / 2, y: screenSize.height / 2 };
      for (const p of [
        { x: 10, y: 20 },
        { x: frame.width, y: 0 },
        { x: 100, y: frame.height - 5 },
      ]) {
        const onScreen = cssRotateBack(p, angle, frame, centre);
        const back = toFramePoint(onScreen, angle, frame);
        near(back.x, p.x);
        near(back.y, p.y);
      }
    },
  );

  it('reads a screen drag in the frame (up the screen is right in the frame at 90)', () => {
    const up = toFrameDelta(0, -10, 90);
    near(up.x, 10);
    near(up.y, 0);
    expect(toFrameDelta(7, 3, 0)).toEqual({ x: 7, y: 3 });
    expect(toFrameDelta(7, 3, 180)).toEqual({ x: -7, y: -3 });
  });

  it('maps the safe-area edges to the frame edges', () => {
    const insets = { top: 1, right: 2, bottom: 3, left: 4 };
    expect(frameInsets(insets, 0)).toEqual({ top: 1, bottom: 3 });
    expect(frameInsets(insets, 90)).toEqual({ top: 4, bottom: 2 });
    expect(frameInsets(insets, 180)).toEqual({ top: 3, bottom: 1 });
    expect(frameInsets(insets, 270)).toEqual({ top: 2, bottom: 4 });
    expect(frameInsetVariables(90)).toEqual({
      top: 'env(safe-area-inset-left, 0px)',
      bottom: 'env(safe-area-inset-right, 0px)',
    });
  });
});

describe('the photo turn', () => {
  // A landscape frame, upright for the world; at 90 the phone's top is at the frame's left.
  const frame = { width: 1920, height: 1080 };

  function through(
    turn: number,
    point: { x: number; y: number },
    size = frame,
  ) {
    const bounds = rotatedBounds(size.width, size.height, turn);
    const [a, b, c, d, e, f] = rotatedCropTransform(
      size,
      { x: 0, y: 0, width: bounds.width, height: bounds.height },
      turn,
      1,
    );
    const x = point.x - size.width / 2;
    const y = point.y - size.height / 2;
    return { x: a * x + c * y + e, y: b * x + d * y + f };
  }

  it('turns a 90 frame clockwise so the phone top (frame left) becomes the image top', () => {
    const top = through(90, { x: 0, y: 540 });
    near(top.x, 540);
    near(top.y, 0);
  });

  it('turns a 270 frame so the phone top (frame right) becomes the image top', () => {
    const top = through(270, { x: 1920, y: 540 });
    near(top.x, 540);
    near(top.y, 0);
  });

  it('turns a 180 frame upside down', () => {
    const corner = through(180, { x: 0, y: 0 });
    near(corner.x, 1920);
    near(corner.y, 1080);
  });

  it('gives a portrait photo from a landscape frame at 90 and 270', () => {
    expect(turnedSize(frame, 90)).toEqual({ width: 1080, height: 1920 });
    expect(turnedSize(frame, 270)).toEqual({ width: 1080, height: 1920 });
    expect(turnedSize(frame, 180)).toEqual(frame);
    expect(turnedSize(frame, 0)).toEqual(frame);
  });

  it.each([0, 90, 180, 270] as const)(
    'videoPoint at %i is the inverse of the clockwise turn',
    (turn) => {
      const size = { width: 1920, height: 1080 };
      const photoSize = turnedSize(size, turn);
      const p = { x: 0.5, y: 0.44 };
      const v = videoPoint(p, turn);
      // Take that point of the video through the turn and land on p.
      const landed = through(turn, {
        x: v.x * size.width,
        y: v.y * size.height,
      });
      near(landed.x / photoSize.width, p.x);
      near(landed.y / photoSize.height, p.y);
    },
  );
});
