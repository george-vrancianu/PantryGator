import { useEffect, useState } from 'react';
import {
  readCameraReading,
  sameCameraReading,
  watchCameraOrientation,
  type CameraReading,
} from './cameraOrientation';

export type CameraOrientationState = CameraReading;

/**
 * The camera's orientation now, following rotation and resizing while the screen is mounted. The
 * watcher tells it once per change (one rotation fires several events), so it renders once.
 */
export function useCameraOrientation(): CameraOrientationState {
  const [state, setState] = useState(readCameraReading);
  useEffect(() => {
    // The reading can have moved between the first render and now.
    const catchUp = () =>
      setState((old) => {
        const now = readCameraReading();
        return sameCameraReading(old, now) ? old : now;
      });
    catchUp();
    return watchCameraOrientation(setState);
  }, []);
  return state;
}
