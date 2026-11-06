import { Capacitor } from '@capacitor/core';
import { vi } from 'vitest';

type Angle = 0 | 90 | 180 | 270;
type Size = { width: number; height: number };

/**
 * Fake the screen for camera tests: its size, the viewport (window) size, the
 * angle it reports (with the events a browser fires) and whether the app runs
 * in the native shell. Undo with `vi.unstubAllGlobals()` and
 * `vi.restoreAllMocks()`.
 *
 * - `width`/`height`: the screen. `viewport` defaults to the same size.
 * - `swapsOnRotate` (default true) models Android Chrome, where the screen
 *   size swaps on rotation; false models iOS and iPadOS, where the screen
 *   size stays portrait and only the viewport swaps.
 * - Every `requestAnimationFrame` callback in the test is queued, not run on its own (other code's
 *   too): they run when a screen event or `inOneFrame` flushes the queue. `setAngle`, `resizeViewport` and `rotate`
 *   run them straight after firing their events, so a test sees the settled state. Wrap several
 *   in `inOneFrame` to fire their events before the one frame that follows (as a device does
 *   when `change` arrives before the window has its new size).
 * - `legacyOrientation` models iOS before 16.4: no `screen.orientation`, the
 *   angle is `window.orientation` (0, 90, -90, 180) with `orientationchange`.
 */
export function stubScreen(options: {
  width: number;
  height: number;
  viewport?: Size;
  angle?: Angle;
  native?: boolean;
  swapsOnRotate?: boolean;
  legacyOrientation?: boolean;
}) {
  const swapsOnRotate = options.swapsOnRotate ?? true;
  const legacy = options.legacyOrientation ?? false;
  const orientation = new EventTarget() as EventTarget & { angle: number };
  orientation.angle = options.angle ?? 0;
  const screen: Size & { orientation?: typeof orientation } = {
    width: options.width,
    height: options.height,
    ...(legacy ? {} : { orientation }),
  };
  const viewport = options.viewport ?? {
    width: options.width,
    height: options.height,
  };
  vi.stubGlobal('screen', screen);
  let nextFrame = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
  const runFrames = () => {
    const due = [...frames.values()];
    frames.clear();
    for (const callback of due) callback(0);
  };
  let batching = 0;
  const settle = () => {
    if (batching === 0) runFrames();
  };
  const publishViewport = () => {
    vi.stubGlobal('innerWidth', viewport.width);
    vi.stubGlobal('innerHeight', viewport.height);
  };
  publishViewport();
  const legacyAngle = (angle: Angle) => (angle === 270 ? -90 : angle);
  if (legacy) vi.stubGlobal('orientation', legacyAngle(options.angle ?? 0));
  const isNative = vi
    .spyOn(Capacitor, 'isNativePlatform')
    .mockReturnValue(options.native ?? false);

  const report = (angle: Angle) => {
    if (legacy) {
      vi.stubGlobal('orientation', legacyAngle(angle));
      window.dispatchEvent(new Event('orientationchange'));
    } else {
      orientation.angle = angle;
      orientation.dispatchEvent(new Event('change'));
    }
    settle();
  };
  return {
    /** Report this angle and tell the listeners. No size changes. */
    setAngle: report,
    /** Resize the window (the viewport) and fire `resize`. */
    resizeViewport(size: Size) {
      viewport.width = size.width;
      viewport.height = size.height;
      publishViewport();
      window.dispatchEvent(new Event('resize'));
      settle();
    },
    /** Run what `fn` does (its angle and size changes) within one frame: the frame runs after it. */
    inOneFrame(fn: () => void) {
      batching += 1;
      try {
        fn();
      } finally {
        batching -= 1;
      }
      settle();
    },
    /**
     * Turn the device a quarter: the viewport swaps and the angle follows; the
     * screen size swaps too unless `swapsOnRotate` is false (iOS).
     */
    rotate(angle: Angle) {
      if (swapsOnRotate)
        [screen.width, screen.height] = [screen.height, screen.width];
      [viewport.width, viewport.height] = [viewport.height, viewport.width];
      publishViewport();
      report(angle);
      window.dispatchEvent(new Event('resize'));
      settle();
    },
    /** Switch between the native shell (true) and the web (false). */
    setNative(native: boolean) {
      isNative.mockReturnValue(native);
    },
  };
}
