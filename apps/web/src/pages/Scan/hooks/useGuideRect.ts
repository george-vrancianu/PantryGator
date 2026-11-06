import { useMemo } from 'react';
import type { CameraMode } from '../../../lib/cameraMode';
import { frameSize, type Size } from '../../../lib/cameraFrame';
import {
  readCameraOrientation,
  type CameraOrientation,
  type ScreenAngle,
} from '../../../lib/cameraOrientation';
import { readSafeAreaInsets } from '../../../lib/safeArea';
import { guideRect, type GuideView, type Rect } from '../../../lib/scanGuides';
import { useCameraOrientation } from '../../../lib/useCameraOrientation';

/** The size the camera feed takes on screen: the feed element's, else the window's. */
export function feedSize(feed?: HTMLElement | null): Size {
  return {
    width: feed?.clientWidth || window.innerWidth,
    height: feed?.clientHeight || window.innerHeight,
  };
}

/**
 * The camera chrome's frame right now: the phone's portrait box (the feed's size turned back by
 * the rotate-back, so its width and height swap at 90 and 270), its safe-area insets mapped to the
 * frame's edges, and the device class. The caller passes the feed's size and the orientation, so
 * nothing here reads the window.
 */
export function measureView(
  feed: Size,
  orientation: CameraOrientation,
): GuideView {
  const { deviceClass, layout, rotateBack } = orientation;
  return {
    ...frameSize(feed, rotateBack),
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
  const orientation = readCameraOrientation();
  return {
    view: measureView(feedSize(feed), orientation),
    turn: orientation.photoTurn,
  };
}

/**
 * The guide for `mode` on this screen, kept up to date when the screen is resized or rotated.
 * Measured from `feed` (the viewfinder) where it is mounted, else from the window.
 */
export function useGuideRect(
  mode: CameraMode,
  feed?: HTMLElement | null,
): Rect {
  // The orientation reading holds the window's size, so this measures again only when the angle,
  // the layout or the size changes, not on every render.
  const orientation = useCameraOrientation();
  const view = useMemo(
    () => measureView(feedSize(feed), orientation),
    [feed, orientation],
  );
  return useMemo(() => guideRect(mode, view), [mode, view]);
}

/**
 * Where a hold-to-focus pass aims: the guide's centre as a fraction across and down the camera
 * frame, measured now from `feed` and the orientation as they are.
 */
export function guideFocusPoint(
  guide: Rect,
  feed?: HTMLElement | null,
): { x: number; y: number } {
  const { width, height } = measureView(
    feedSize(feed),
    readCameraOrientation(),
  );
  return {
    x: (guide.x + guide.width / 2) / width,
    y: (guide.y + guide.height / 2) / height,
  };
}
