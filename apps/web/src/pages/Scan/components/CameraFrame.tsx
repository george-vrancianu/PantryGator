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
export const INSET_LEFT = '--camera-inset-left';
export const INSET_RIGHT = '--camera-inset-right';

/** The frame's top and bottom safe-area insets, falling back to the window's own when no frame is around. */
export const insetTop = `var(${INSET_TOP}, env(safe-area-inset-top))`;
export const insetBottom = `var(${INSET_BOTTOM}, env(safe-area-inset-bottom))`;
/** The frame's left and right safe-area insets (the home indicator or gesture bar sits there in landscape). */
export const insetLeft = `var(${INSET_LEFT}, env(safe-area-inset-left))`;
export const insetRight = `var(${INSET_RIGHT}, env(safe-area-inset-right))`;

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

/** The swipe surface's `touch-action`: the surface is not turned, so the strip's sideways swipe is vertical on screen at 90 and 270. */
export function swipeTouchAction(angle: ScreenAngle): 'pan-x' | 'pan-y' {
  return angle === 90 || angle === 270 ? 'pan-x' : 'pan-y';
}

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
 * `--camera-inset-bottom` and the left and right pair (`insetTop` and so on), which are the
 * window's edges that sit at the frame's edges.
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
  const value = useMemo<FrameValue>(() => {
    const size = frameSize(viewport, angle);
    return {
      angle,
      size,
      toFrameDelta: (dx, dy) => toFrameDelta(dx, dy, angle),
      toFramePoint: (point) => toFramePoint(point, angle, size),
    };
  }, [angle, viewport]);
  const { size } = value;
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
          // MUI centres a Snackbar with left:50% from the `sm` breakpoint, which sees the landscape
          // window: in a turned frame that squeezes it to half the width. Fill the frame instead.
          ...(turned && {
            '& .MuiSnackbar-root': {
              left: 8,
              right: 8,
              transform: 'none',
            },
          }),
          [INSET_TOP]: insets.top,
          [INSET_BOTTOM]: insets.bottom,
          [INSET_LEFT]: insets.left,
          [INSET_RIGHT]: insets.right,
        }}
      >
        {children}
      </Box>
    </FrameContext.Provider>
  );
}
