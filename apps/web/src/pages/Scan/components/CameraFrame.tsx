import { Box } from '@pocket-pantry/ui';
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
  type CSSProperties,
} from 'react';
import {
  frameInsetVariables,
  frameSize,
  toFrameDelta,
  toFramePoint,
  type Point,
  type Size,
} from '../../../lib/cameraFrame';
import type { ScreenAngle } from '../../../lib/cameraOrientation';
import { useCameraOrientation } from '../../../lib/useCameraOrientation';

/** The CSS custom properties the camera bars read for their safe-area insets (ADR 0037). */
export const INSET_TOP = '--camera-inset-top';
export const INSET_BOTTOM = '--camera-inset-bottom';

/** The frame's top and bottom safe-area insets, falling back to the window's own when no frame is around. */
export const insetTop = `var(${INSET_TOP}, env(safe-area-inset-top))`;
export const insetBottom = `var(${INSET_BOTTOM}, env(safe-area-inset-bottom))`;

type FrameValue = {
  /** The rotate-back: the frame is turned by `-angle` degrees. */
  angle: ScreenAngle;
  /** The portrait frame's size. */
  size: Size;
  /** A pointer movement on the screen, read in the frame. */
  toFrameDelta: (dx: number, dy: number) => Point;
  /** A client point, read as a point in the frame. */
  toFramePoint: (point: Point) => Point;
};

const upright: FrameValue = {
  angle: 0,
  size: { width: 0, height: 0 },
  toFrameDelta: (dx, dy) => ({ x: dx, y: dy }),
  toFramePoint: (point) => point,
};

const FrameContext = createContext<FrameValue>(upright);

/** What the rotated-back frame around this chrome is doing: for the few pieces that read the screen's own coordinates. */
export function useCameraFrame(): FrameValue {
  return useContext(FrameContext);
}

/**
 * The one place the camera chrome is rotated back (ADR 0037). On a phone on the web, when the
 * screen reports 90, 180 or 270, the chrome is laid out in a portrait-sized box turned by the
 * opposite angle, so it stays on the phone's portrait edges. The video is NOT inside it, and
 * neither is the swipe surface. Wherever it is not needed (the app, tablets, angle 0) the box is
 * just the window.
 *
 * The box is a positioned, portrait-sized containing block: bars, the guide, sheets, `fixed`
 * toasts and flights all lay out in it. A later layout (the tablet rail) lays itself out inside
 * it the same way. The bars read their safe-area insets from `--camera-inset-top` and
 * `--camera-inset-bottom` (`insetTop`, `insetBottom`), which are the window's edges that sit at
 * the frame's top and bottom.
 */
export function CameraFrame({ children }: { children: ReactNode }) {
  const orientation = useCameraOrientation();
  const angle = orientation.rotateBack;
  const viewport = useMemo(
    () => ({
      width: orientation.viewportWidth,
      height: orientation.viewportHeight,
    }),
    [orientation.viewportWidth, orientation.viewportHeight],
  );
  const size = frameSize(viewport, angle);
  const value = useMemo<FrameValue>(
    () => ({
      angle,
      size,
      toFrameDelta: (dx, dy) => toFrameDelta(dx, dy, angle),
      toFramePoint: (point) => toFramePoint(point, angle, size),
    }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `size` follows the viewport and angle
    [angle, viewport],
  );
  const insets = frameInsetVariables(angle);
  const turned = angle !== 0;
  const style: CSSProperties = !turned
    ? {}
    : angle === 180
      ? { transform: 'rotate(-180deg)' }
      : {
          left: '50%',
          top: '50%',
          right: 'auto',
          bottom: 'auto',
          width: size.width,
          height: size.height,
          transform: `translate(-50%, -50%) rotate(${-angle}deg)`,
        };
  return (
    <FrameContext.Provider value={value}>
      <Box
        data-testid="camera-frame"
        data-rotate-back={angle}
        style={style}
        sx={{
          position: 'absolute',
          inset: 0,
          // The box itself lets touches through to the swipe surface under it; its children take them.
          pointerEvents: 'none',
          ':where(&) > *': { pointerEvents: 'auto' },
          [INSET_TOP]: insets.top,
          [INSET_BOTTOM]: insets.bottom,
        }}
      >
        {children}
      </Box>
    </FrameContext.Provider>
  );
}
