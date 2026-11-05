import { useEffect, useState } from 'react';
import {
  readCameraOrientation,
  watchCameraOrientation,
  type CameraOrientation,
} from './cameraOrientation';

export type CameraOrientationState = CameraOrientation & {
  /** The window's size, which the rotated-back frame is laid out from. */
  viewportWidth: number;
  viewportHeight: number;
};

function read(): CameraOrientationState {
  return {
    ...readCameraOrientation(),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };
}

function same(a: CameraOrientationState, b: CameraOrientationState): boolean {
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
 * The camera's orientation now, following rotation and resizing while the screen is mounted.
 * One rotation can fire `change`, `orientationchange` and `resize`: an unchanged reading keeps
 * the same state, so it does not render again.
 */
export function useCameraOrientation(): CameraOrientationState {
  const [state, setState] = useState(read);
  useEffect(() => {
    // The reading can have moved between the first render and now.
    const update = () => setState((old) => (same(old, read()) ? old : read()));
    update();
    return watchCameraOrientation(update);
  }, []);
  return state;
}
