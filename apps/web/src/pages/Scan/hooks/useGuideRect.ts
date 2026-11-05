import { useEffect, useState } from 'react';
import type { CameraMode } from '../../../lib/cameraMode';
import { readCameraOrientation } from '../../../lib/cameraOrientation';
import { readSafeAreaInsets } from '../../../lib/safeArea';
import { guideRect, type GuideView, type Rect } from '../../../lib/scanGuides';

/** The camera screen's size, safe-area insets and device class right now. */
export function measureView(feed?: HTMLElement | null): GuideView {
  return {
    width: feed?.clientWidth || window.innerWidth,
    height: feed?.clientHeight || window.innerHeight,
    insets: readSafeAreaInsets(),
    deviceClass: readCameraOrientation().deviceClass,
  };
}

/** The guide for `mode` on this screen, kept up to date when the screen is resized or rotated. */
export function useGuideRect(mode: CameraMode): Rect {
  const [view, setView] = useState(() => measureView());
  useEffect(() => {
    const update = () => setView(measureView());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return guideRect(mode, view);
}
