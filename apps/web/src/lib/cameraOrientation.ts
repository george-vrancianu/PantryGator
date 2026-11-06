import { Capacitor } from '@capacitor/core';

/** A screen whose shortest side is under this many CSS pixels is a phone. */
export const PHONE_SHORTEST_SIDE = 600;

/** The rail needs a window this tall (CSS px): in a shorter one its mode list is cramped, so the footer layout stays. */
export const MIN_RAIL_HEIGHT = 500;

export type DeviceClass = 'phone' | 'tablet';
/** Where the camera chrome sits: the bottom footer, or the right rail. */
export type CameraLayout = 'footer' | 'rail';
export type ScreenAngle = 0 | 90 | 180 | 270;

export type CameraOrientationInput = {
  /** The screen's size in CSS pixels. Only its shortest side is used (the device class). On iOS it never swaps on rotation. */
  screenWidth: number;
  screenHeight: number;
  /** The window's size: the layout follows it, so a narrow desktop window gets no rail and an iPad turned to landscape does. */
  viewportWidth: number;
  viewportHeight: number;
  /** The angle the screen reports. Negative and over-360 values are normalised. */
  angle: number;
  /** True inside the native shell, which locks portrait itself. */
  native: boolean;
};

export type CameraOrientation = {
  /** Fixed by the screen's shortest side, so it never changes on rotation. */
  deviceClass: DeviceClass;
  layout: CameraLayout;
  /**
   * The reported angle, in degrees. The chrome is turned back by the opposite
   * angle: apply `rotate(-rotateBack deg)` (ADR 0037).
   */
  rotateBack: ScreenAngle;
  /** Degrees to turn a captured photo. One switch with `rotateBack`: they never differ (ADR 0037). */
  photoTurn: ScreenAngle;
  /** True on a phone in the native app: the camera locks the screen to portrait while open (ADR 0037). */
  locksPortrait: boolean;
};

function asAngle(angle: number): ScreenAngle {
  const turn = ((angle % 360) + 360) % 360;
  return turn === 90 || turn === 180 || turn === 270 ? turn : 0;
}

/** Decide how the camera handles orientation. Pure. */
export function cameraOrientation(
  input: CameraOrientationInput,
): CameraOrientation {
  const deviceClass: DeviceClass =
    Math.min(input.screenWidth, input.screenHeight) < PHONE_SHORTEST_SIDE
      ? 'phone'
      : 'tablet';
  const layout: CameraLayout =
    deviceClass === 'tablet' &&
    input.viewportWidth > input.viewportHeight &&
    input.viewportHeight >= MIN_RAIL_HEIGHT
      ? 'rail'
      : 'footer';
  const turn =
    deviceClass === 'phone' && !input.native ? asAngle(input.angle) : 0;
  return {
    deviceClass,
    layout,
    rotateBack: turn,
    photoTurn: turn,
    locksPortrait: deviceClass === 'phone' && input.native,
  };
}

/** The angle the screen reports: `screen.orientation`, else iOS's older `window.orientation`, else 0. */
function reportedAngle(): number {
  return screen.orientation?.angle ?? window.orientation ?? 0;
}

/** `cameraOrientation` for the screen and window as they are now. */
export function readCameraOrientation(): CameraOrientation {
  return cameraOrientation({
    screenWidth: screen.width,
    screenHeight: screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    angle: reportedAngle(),
    native: Capacitor.isNativePlatform(),
  });
}

/** The orientation and the window's size it was read at: the size the rotated-back frame is laid out from. */
export type CameraReading = CameraOrientation & {
  viewportWidth: number;
  viewportHeight: number;
};

/** `readCameraOrientation` with the window's size it was read at. */
export function readCameraReading(): CameraReading {
  return {
    ...readCameraOrientation(),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };
}

/** Whether two readings say the same: the one definition of "nothing changed". */
export function sameCameraReading(a: CameraReading, b: CameraReading): boolean {
  return (
    a.deviceClass === b.deviceClass &&
    a.layout === b.layout &&
    a.rotateBack === b.rotateBack &&
    a.photoTurn === b.photoTurn &&
    a.locksPortrait === b.locksPortrait &&
    a.viewportWidth === b.viewportWidth &&
    a.viewportHeight === b.viewportHeight
  );
}

/**
 * Call `onChange` when the reported angle or the window size changes; returns the stop function,
 * which removes every listener added. One rotation fires `change`, `orientationchange` and
 * `resize`, and on a device the angle can arrive before the window has its new size: so the
 * events only schedule one animation frame, and the reading is taken in that frame. An unchanged
 * reading tells no one.
 */
export function watchCameraOrientation(
  onChange: (orientation: CameraReading) => void,
): () => void {
  let last = readCameraReading();
  let frame: number | null = null;
  const flush = () => {
    frame = null;
    const reading = readCameraReading();
    if (sameCameraReading(last, reading)) return;
    last = reading;
    onChange(reading);
  };
  const listener = () => {
    if (frame === null) frame = requestAnimationFrame(flush);
  };
  const orientation = screen.orientation;
  orientation?.addEventListener('change', listener);
  window.addEventListener('orientationchange', listener);
  window.addEventListener('resize', listener);
  return () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    orientation?.removeEventListener('change', listener);
    window.removeEventListener('orientationchange', listener);
    window.removeEventListener('resize', listener);
  };
}

/** Whether the camera locks the screen to portrait now: a phone in the native app. */
export function locksPortraitNatively(): boolean {
  return readCameraOrientation().locksPortrait;
}
