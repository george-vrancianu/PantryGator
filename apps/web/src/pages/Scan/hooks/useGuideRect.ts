import { useMemo } from 'react';
import type { CameraMode } from '../../../lib/cameraMode';
import { frameSize } from '../../../lib/cameraFrame';
import {
  readCameraOrientation,
  type ScreenAngle,
} from '../../../lib/cameraOrientation';
import { readSafeAreaInsets } from '../../../lib/safeArea';
import { guideRect, type GuideView, type Rect } from '../../../lib/scanGuides';
import { useCameraOrientation } from '../../../lib/useCameraOrientation';

/**
 * The camera chrome's frame right now: the phone's portrait box (the window turned back by the
 * rotate-back, so its width and height swap at 90 and 270), its safe-area insets mapped to the
 * frame's edges, and the device class.
 */
export function measureView(feed?: HTMLElement | null): GuideView {
  const { deviceClass, layout, rotateBack } = readCameraOrientation();
  const size = frameSize(
    {
      width: feed?.clientWidth || window.innerWidth,
      height: feed?.clientHeight || window.innerHeight,
    },
    rotateBack,
  );
  return {
    ...size,
    insets: readSafeAreaInsets(rotateBack),
    deviceClass,
    layout,
  };
}

/**
 * What a shutter press captures: the frame the guide is in and the photo turn at this moment.
 * Taken before the frame is awaited, so turning the phone afterwards changes nothing.
 */
export function measureShot(feed?: HTMLElement | null): {
  view: GuideView;
  turn: ScreenAngle;
} {
  return { view: measureView(feed), turn: readCameraOrientation().photoTurn };
}

/** The guide for `mode` on this screen, kept up to date when the screen is resized or rotated. */
export function useGuideRect(mode: CameraMode): Rect {
  // Measured again only when the angle or the window's size changes, not on every render.
  const { rotateBack, viewportWidth, viewportHeight } = useCameraOrientation();
  const view = useMemo(
    () => measureView(),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the reading is the cue to measure again
    [rotateBack, viewportWidth, viewportHeight],
  );
  return useMemo(() => guideRect(mode, view), [mode, view]);
}
