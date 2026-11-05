import { ScreenOrientation } from '@capacitor/screen-orientation';
import { useEffect } from 'react';
import { locksPortraitNatively } from './cameraOrientation';

/** A refused lock or unlock is not worth a crash: the camera works turned too. */
const ignore = () => {};

/**
 * Lock the screen to portrait while the component is mounted, on a phone in the native app only
 * (ADR 0037); the web and tablets are never touched. Unlocks on unmount, so every way out of a camera
 * (Close, Escape, a result, Scan several, leaving the route) lets the screen turn again.
 */
export function usePortraitLock(): void {
  useEffect(() => {
    if (!locksPortraitNatively()) return;
    ScreenOrientation.lock({ orientation: 'portrait' }).catch(ignore);
    return () => {
      ScreenOrientation.unlock().catch(ignore);
    };
  }, []);
}
