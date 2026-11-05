import { Capacitor } from '@capacitor/core';

/** A screen whose shortest side is under this many CSS pixels is a phone. */
export const PHONE_SHORTEST_SIDE = 600;

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
    deviceClass === 'tablet' && input.viewportWidth > input.viewportHeight
      ? 'rail'
      : 'footer';
  const turn =
    deviceClass === 'phone' && !input.native ? asAngle(input.angle) : 0;
  return { deviceClass, layout, rotateBack: turn, photoTurn: turn };
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

/** Call `onChange` when the reported angle or the window size changes; returns the stop function, which removes every listener added. */
export function watchCameraOrientation(
  onChange: (orientation: CameraOrientation) => void,
): () => void {
  const listener = () => onChange(readCameraOrientation());
  const orientation = screen.orientation;
  orientation?.addEventListener('change', listener);
  window.addEventListener('orientationchange', listener);
  window.addEventListener('resize', listener);
  return () => {
    orientation?.removeEventListener('change', listener);
    window.removeEventListener('orientationchange', listener);
    window.removeEventListener('resize', listener);
  };
}

/** True on a phone in the native app: the only place the camera locks the screen to portrait (ADR 0037). */
export function locksPortraitNatively(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    readCameraOrientation().deviceClass === 'phone'
  );
}
