import type { CameraMode } from '../../lib/cameraMode';
import { useCameraFrame } from './CameraFrame';
import { ModeList } from './ModeList';
import { ModeSlider } from './ModeSlider';

/**
 * The mode picker for the layout the camera is in: the strip in the footer, the list in the rail.
 * Hosts mount this where they used to mount `ModeSlider`; the strip's swipe props only apply there.
 */
export function ModePicker<Mode extends CameraMode>(
  props: Parameters<typeof ModeSlider<Mode>>[0],
) {
  const { layout } = useCameraFrame();
  if (layout === 'rail') {
    const { modes, mode, disabled, keysDisabled, onChange } = props;
    return (
      <ModeList
        modes={modes}
        mode={mode}
        disabled={disabled}
        keysDisabled={keysDisabled}
        onChange={onChange}
      />
    );
  }
  return <ModeSlider {...props} />;
}
