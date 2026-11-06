import { useEffect, useMemo, useState } from 'react';
import type { FocusPoint } from '../../../lib/camera';
import type { CameraMode } from '../../../lib/cameraMode';
import { frameSize, type Size } from '../../../lib/cameraFrame';
import {
  readCameraOrientation,
  type CameraOrientation,
  type ScreenAngle,
} from '../../../lib/cameraOrientation';
import { readSafeAreaInsets } from '../../../lib/safeArea';
import {
  guideRect,
  RAIL_WIDTH,
  type GuideView,
  type Rect,
} from '../../../lib/scanGuides';
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
 * nothing here reads the window. In the rail layout the rail is taken off the feed only where
 * it lies over it: a feed as wide as the window runs under the rail, one that stops short of it
 * (by the rail's width or more) has none of it over it. That reads the feed as starting at x = 0
 * in unrotated window coordinates (the rail is tablet-only and tablets are never rotated back).
 */
export function measureView(
  feed: Size,
  orientation: CameraOrientation,
  windowWidth: number,
): GuideView {
  const { deviceClass, layout, rotateBack } = orientation;
  return {
    ...frameSize(feed, rotateBack),
    insets: readSafeAreaInsets(rotateBack),
    deviceClass,
    layout,
    railOverlap:
      layout === 'rail'
        ? Math.min(
            RAIL_WIDTH,
            Math.max(0, RAIL_WIDTH - (windowWidth - feed.width)),
          )
        : undefined,
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
    view: measureView(feedSize(feed), orientation, window.innerWidth),
    turn: orientation.photoTurn,
  };
}

/**
 * The guide for `mode` on this screen, kept up to date when the screen is resized or rotated.
 * Measured from `feed` (the viewfinder) where it is mounted, else from the window; the feed
 * resizing on its own measures again where the browser has a `ResizeObserver`.
 */
export function useGuideRect(
  mode: CameraMode,
  feed?: HTMLElement | null,
): Rect {
  // The orientation reading holds the window's size, so this measures again only when the angle,
  // the layout or the size changes, not on every render.
  const orientation = useCameraOrientation();
  const [, setFeedResizes] = useState(0);
  useEffect(() => {
    if (!feed || typeof ResizeObserver === 'undefined') return;
    // Only a cue to render again: the size itself is always read live below.
    const observer = new ResizeObserver(() => setFeedResizes((n) => n + 1));
    observer.observe(feed);
    return () => observer.disconnect();
  }, [feed]);
  const { width, height } = feedSize(feed);
  const view = useMemo(
    () =>
      measureView({ width, height }, orientation, orientation.viewportWidth),
    [width, height, orientation],
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
): FocusPoint {
  const { width, height } = measureView(
    feedSize(feed),
    readCameraOrientation(),
    window.innerWidth,
  );
  return {
    x: (guide.x + guide.width / 2) / width,
    y: (guide.y + guide.height / 2) / height,
  };
}
