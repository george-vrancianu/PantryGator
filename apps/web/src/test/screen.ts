import { Capacitor } from '@capacitor/core';
import { vi } from 'vitest';

type Angle = 0 | 90 | 180 | 270;

/**
 * Fake the screen for camera tests: its size, the angle it reports (with
 * `change` events, as a browser fires them) and whether the app runs in the
 * native shell. Undo with `vi.unstubAllGlobals()` and `vi.restoreAllMocks()`.
 * Sizes are what the screen reports, so a phone turned to landscape swaps
 * width and height: use `rotate`.
 */
export function stubScreen(options: {
  width: number;
  height: number;
  angle?: Angle;
  native?: boolean;
}) {
  const orientation = new EventTarget() as EventTarget & { angle: number };
  orientation.angle = options.angle ?? 0;
  const screen = {
    width: options.width,
    height: options.height,
    orientation,
  };
  vi.stubGlobal('screen', screen);
  const isNative = vi
    .spyOn(Capacitor, 'isNativePlatform')
    .mockReturnValue(options.native ?? false);
  return {
    /** Report this angle and tell the listeners. The size stays. */
    setAngle(angle: Angle) {
      orientation.angle = angle;
      orientation.dispatchEvent(new Event('change'));
    },
    /** Turn the device a quarter: width and height swap, the angle follows. */
    rotate(angle: Angle) {
      [screen.width, screen.height] = [screen.height, screen.width];
      orientation.angle = angle;
      orientation.dispatchEvent(new Event('change'));
    },
    /** Switch between the native shell (true) and the web (false). */
    setNative(native: boolean) {
      isNative.mockReturnValue(native);
    },
  };
}
