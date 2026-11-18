import type { ComponentProps } from 'react';
import { CameraFooter } from '../CameraFooter/CameraFooter';
import { CameraRail } from '../CameraRail/CameraRail';
import { useCameraFrame } from '../CameraFrame/CameraFrame';

/**
 * The camera's controls in the layout it is in: the footer under the feed, or the rail down the
 * right edge. The hosts hand over the same pieces either way and never ask which one is showing.
 */
export function CameraControls(props: ComponentProps<typeof CameraFooter>) {
  const { layout } = useCameraFrame();
  return layout === 'rail' ? (
    <CameraRail {...props} />
  ) : (
    <CameraFooter {...props} />
  );
}
