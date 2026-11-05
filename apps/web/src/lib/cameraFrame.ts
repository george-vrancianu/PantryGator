import type { ScreenAngle } from './cameraOrientation';

/**
 * Geometry of the rotated-back camera frame (ADR 0037). On a phone on the web the camera chrome
 * lives in a portrait box turned by `rotate(-angle deg)`; the video is not. Everything here is
 * pure so the direction of the turn can be proved with known points.
 *
 * Reading the angle: at 90 the screen draws content with the phone's physical top at the
 * content's left. The frame's top is therefore at the screen's left, and a camera frame (upright
 * for the world, landscape) turned CLOCKWISE by the angle has the phone's top at the image's top.
 */

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

/** The edges of a box, in CSS pixels. */
export type FourInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/** The portrait frame's size for a window of `viewport`: width and height swap at 90 and 270. */
export function frameSize(viewport: Size, angle: ScreenAngle): Size {
  return angle === 90 || angle === 270
    ? { width: viewport.height, height: viewport.width }
    : { ...viewport };
}

function turnClockwise(x: number, y: number, angle: ScreenAngle): Point {
  switch (angle) {
    case 90:
      return { x: -y, y: x };
    case 180:
      return { x: -x, y: -y };
    case 270:
      return { x: y, y: -x };
    default:
      return { x, y };
  }
}

/**
 * A movement on the screen (a pointer delta) as the rotated-back frame sees it. The frame is
 * turned by -angle, so the movement is turned by +angle (clockwise) to read it in the frame.
 */
export function toFrameDelta(
  dx: number,
  dy: number,
  angle: ScreenAngle,
): Point {
  return turnClockwise(dx, dy, angle);
}

/** A point on the screen (client coordinates) as a point in the frame, whose box fills the window `frame` is the size of. */
export function toFramePoint(
  point: Point,
  angle: ScreenAngle,
  frame: Size,
): Point {
  const screen = frameSize(frame, angle);
  const turned = toFrameDelta(
    point.x - screen.width / 2,
    point.y - screen.height / 2,
    angle,
  );
  return { x: frame.width / 2 + turned.x, y: frame.height / 2 + turned.y };
}

/**
 * The safe-area insets of the window's edges, as the frame's top and bottom: the frame's top is
 * the window's left at 90, its right at 270 and its bottom at 180.
 */
export function frameInsets(
  insets: FourInsets,
  angle: ScreenAngle,
): { top: number; bottom: number } {
  switch (angle) {
    case 90:
      return { top: insets.left, bottom: insets.right };
    case 180:
      return { top: insets.bottom, bottom: insets.top };
    case 270:
      return { top: insets.right, bottom: insets.left };
    default:
      return { top: insets.top, bottom: insets.bottom };
  }
}

/** The CSS `env()` for each frame edge: what the frame's top and bottom insets are called on the window. */
export function frameInsetVariables(angle: ScreenAngle): {
  top: string;
  bottom: string;
} {
  const edge = {
    0: ['top', 'bottom'],
    90: ['left', 'right'],
    180: ['bottom', 'top'],
    270: ['right', 'left'],
  }[angle];
  return {
    top: `env(safe-area-inset-${edge[0]}, 0px)`,
    bottom: `env(safe-area-inset-${edge[1]}, 0px)`,
  };
}

/**
 * Where a point of the turned photo (0..1 across and down) sits in the camera's own frame, which
 * is not turned: the photo is the frame turned clockwise by `turn`, so this turns it back.
 */
export function videoPoint(photo: Point, turn: ScreenAngle): Point {
  switch (turn) {
    case 90:
      return { x: photo.y, y: 1 - photo.x };
    case 180:
      return { x: 1 - photo.x, y: 1 - photo.y };
    case 270:
      return { x: 1 - photo.y, y: photo.x };
    default:
      return { ...photo };
  }
}

/** The size of a `frame` once turned clockwise by `turn`. */
export function turnedSize(frame: Size, turn: ScreenAngle): Size {
  return frameSize(frame, turn);
}
