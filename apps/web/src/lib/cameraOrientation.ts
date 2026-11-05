import { Capacitor } from '@capacitor/core';

/** A screen whose shortest side is under this many CSS pixels is a phone. */
export const PHONE_SHORTEST_SIDE = 600;

export type DeviceClass = 'phone' | 'tablet';
/** Where the camera chrome sits: the bottom footer, or the right rail. */
export type CameraLayout = 'footer' | 'rail';
export type ScreenAngle = 0 | 90 | 180 | 270;

export type CameraOrientationInput = {
  /** The screen's size in CSS pixels, as it reports it now. */
  width: number;
  height: number;
  /** The angle the screen reports (`screen.orientation.angle`). */
  angle: number;
  /** True inside the native shell, which locks portrait itself. */
  native: boolean;
};

export type CameraOrientation = {
  /** Fixed by the screen's shortest side, so it never changes on rotation. */
  deviceClass: DeviceClass;
  layout: CameraLayout;
  /** Degrees to turn the camera chrome back so it reads upright. */
  rotateBack: ScreenAngle;
  /** Degrees to turn a captured photo. One switch with `rotateBack`: they never differ (ADR 0037). */
  photoTurn: ScreenAngle;
};

function asAngle(angle: number): ScreenAngle {
  return angle === 90 || angle === 180 || angle === 270 ? angle : 0;
}

/** Decide how the camera handles orientation. Pure. */
export function cameraOrientation(
  input: CameraOrientationInput,
): CameraOrientation {
  const deviceClass: DeviceClass =
    Math.min(input.width, input.height) < PHONE_SHORTEST_SIDE
      ? 'phone'
      : 'tablet';
  const layout: CameraLayout =
    deviceClass === 'tablet' && input.width > input.height ? 'rail' : 'footer';
  const turn =
    deviceClass === 'phone' && !input.native ? asAngle(input.angle) : 0;
  return { deviceClass, layout, rotateBack: turn, photoTurn: turn };
}

/** `cameraOrientation` for the screen as it is now. */
export function readCameraOrientation(): CameraOrientation {
  return cameraOrientation({
    width: screen.width,
    height: screen.height,
    angle: screen.orientation?.angle ?? 0,
    native: Capacitor.isNativePlatform(),
  });
}

/** Call `onChange` whenever the screen reports a new angle; returns the stop function. */
export function watchCameraOrientation(
  onChange: (orientation: CameraOrientation) => void,
): () => void {
  const target = screen.orientation;
  if (!target) return () => undefined;
  const listener = () => onChange(readCameraOrientation());
  target.addEventListener('change', listener);
  return () => target.removeEventListener('change', listener);
}
