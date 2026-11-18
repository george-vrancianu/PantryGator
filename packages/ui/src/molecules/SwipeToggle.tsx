import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Box } from '../atoms/Layout';
import { BatteryLowIcon } from '../atoms/icons';
import { color, palette } from '../theme/themeVars';
import { usePrefersReducedMotion } from '../theme/usePrefersReducedMotion';
import { REVEAL_PT, useRowGestures, vibrate } from './useRowGestures';

/** The release in the zone that flips the flag. */
const HAPTIC_TOGGLE = 14;
const SPRING_MS = 300;
/** Width of the Running low rail on the row's right edge. */
const RAIL_PX = 4;
/** The glow's butter strength at the right edge, and how far across the row it fades out. */
const GLOW_STRENGTH_PCT = 38;
const GLOW_REACH_PCT = 27;
/** The on sweep and the off wipe: how long each plays. */
const SWEEP_ON_MS = 450;
const SWEEP_OFF_MS = 500;
/** The soft leading edge of the off wipe, transparent to card colour. */
const WIPE_EDGE_PX = 48;
/** A sweep request older than this never animates a change. */
const SWEEP_FRESH_MS = 3000;

/** A request to animate a change of `on`: the flag as it will be, and an id fresh for each request. */
export type SwipeSweep = { on: boolean; id: number };

type SweepPhase = 'idle' | 'in' | 'out';

export type SwipeToggleProps = {
  /** What the release will do, on the tab, e.g. "Running low" or "Not low". */
  label: string;
  /** A swipe was released inside the zone. Every release springs back; the caller flips its flag. */
  onToggle: () => void;
  /** The flag is set: a butter rail and glow stay on the row's right edge. Changes snap unless `sweep` asks otherwise. */
  on: boolean;
  /**
   * The change the caller asked to animate: `on` is the flag as it will be, `id` is fresh for each request
   * (a `Date.now()` stamp). It is used up by the first change of `on` after it arrives, and animates only if
   * it matches that change and is under 3 s old; any other change snaps. Reduced motion always snaps.
   */
  sweep?: SwipeSweep | null;
  /** No swipe: the content stays put and taps go through as usual. */
  disabled?: boolean;
  /** The row's content, in practice its header button. Gets an opaque card background to cover the band. */
  children: ReactNode;
};

/**
 * A row you swipe left to toggle a flag (Pantry batches handoff, section 6). A butter band shows behind
 * the row with a tab at its trailing edge; the row has one zone at 92 pt, and a release inside it calls
 * `onToggle`. Every release springs back. While `on` is set, a lasting butter tint (a 4 px rail on the
 * right edge plus a short glow fading into the row) sits in the moving content layer, behind the row's
 * content; it is decorative and never takes taps. It is a wrapper, not a list item: the caller owns the element
 * that takes focus and its keyboard equivalent.
 */
export function SwipeToggle({
  label,
  onToggle,
  on,
  sweep = null,
  disabled = false,
  children,
}: SwipeToggleProps) {
  const reduceMotion = usePrefersReducedMotion();
  const gestures = useRowGestures({
    mode: 'toggle',
    disabled,
    onToggle: () => {
      vibrate(HAPTIC_TOGGLE);
      onToggle();
    },
  });
  const { x, zone, dragging } = gestures;
  const inZone = zone === 1;
  const progress = Math.min(1, Math.max(0, -x / REVEAL_PT));
  const motion = (value: string) => (reduceMotion ? 'none' : value);

  // The band is only there while the row moves: during a drag and its spring back.
  const [settling, setSettling] = useState(false);
  const wasDragging = useRef(false);
  useEffect(() => {
    const ended = wasDragging.current && !dragging;
    wasDragging.current = dragging;
    if (!ended || reduceMotion) return;
    setSettling(true);
    const timer = setTimeout(() => setSettling(false), SPRING_MS);
    return () => clearTimeout(timer);
  }, [dragging, reduceMotion]);
  const moving = dragging || settling;

  // Animate or snap on every change of `on`. A layout effect so a snap never paints a frame of sweep.
  const [phase, setPhase] = useState<SweepPhase>('idle');
  const sweepRef = useRef(sweep);
  useLayoutEffect(() => {
    sweepRef.current = sweep;
  });
  const previousOn = useRef(on);
  const usedSweepId = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (previousOn.current === on) return;
    previousOn.current = on;
    const request = sweepRef.current;
    const fresh =
      request !== null &&
      request.on === on &&
      usedSweepId.current !== request.id &&
      Date.now() - request.id < SWEEP_FRESH_MS;
    if (request) usedSweepId.current = request.id;
    if (!fresh || reduceMotion) {
      setPhase('idle');
      return;
    }
    setPhase(on ? 'in' : 'out');
  }, [on, reduceMotion]);
  // Reduced motion turned on mid-sweep ends it for good, so it cannot reappear when it turns off.
  if (reduceMotion && phase !== 'idle') setPhase('idle');
  // A sweep ends on its own; a new phase or unmount cancels the wait.
  useEffect(() => {
    if (phase === 'idle') return;
    const timer = setTimeout(
      () => setPhase('idle'),
      phase === 'in' ? SWEEP_ON_MS : SWEEP_OFF_MS,
    );
    return () => clearTimeout(timer);
  }, [phase]);
  const playing = phase;

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        touchAction: 'pan-y',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    >
      {moving ? (
        <Box
          aria-hidden="true"
          data-swipe-toggle-band=""
          style={{ opacity: inZone ? 1 : 0.35 + 0.65 * progress }}
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'stretch',
            bgcolor: palette('secondary-main'),
            pointerEvents: 'none',
            transition: motion('opacity 120ms'),
          }}
        >
          <Box
            data-swipe-toggle-tab=""
            style={{
              opacity: 0.3 + 0.7 * progress,
              transform: `scale(${0.86 + 0.14 * progress})`,
            }}
            sx={{
              width: REVEAL_PT,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              color: palette('secondary-contrastText'),
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.01em',
              whiteSpace: 'nowrap',
            }}
          >
            <Box
              component="span"
              sx={{
                display: 'flex',
                transform: inZone ? 'scale(1.15)' : 'none',
                transition: motion('transform 300ms cubic-bezier(.2,.7,.3,1)'),
              }}
            >
              <BatteryLowIcon size={22} strokeWidth={2.2} />
            </Box>
            {label}
          </Box>
        </Box>
      ) : null}
      <Box
        {...gestures.bind}
        data-swipe-toggle-content=""
        style={{ transform: `translateX(${x}px)` }}
        sx={{
          position: 'relative',
          bgcolor: color.cardBg,
          transition: dragging
            ? 'none'
            : motion(`transform ${SPRING_MS}ms cubic-bezier(.25,1.35,.45,1)`),
        }}
      >
        {on || playing === 'out' ? (
          <Box
            aria-hidden="true"
            data-swipe-toggle-tint=""
            data-sweep={
              playing === 'in' ? 'on' : playing === 'out' ? 'off' : undefined
            }
            sx={{
              position: 'absolute',
              inset: 0,
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
          >
            <Box
              data-swipe-toggle-glow=""
              sx={{
                position: 'absolute',
                inset: 0,
                ...(playing === 'in'
                  ? {
                      animation: `pp-low-glow-in ${SWEEP_ON_MS}ms cubic-bezier(.2,.8,.2,1)`,
                      '@keyframes pp-low-glow-in': {
                        from: { opacity: 0 },
                        to: { opacity: 1 },
                      },
                    }
                  : {}),
                background: `linear-gradient(to left, color-mix(in srgb, ${palette('secondary-main')} ${GLOW_STRENGTH_PCT}%, transparent), transparent ${GLOW_REACH_PCT}%)`,
              }}
            />
            <Box
              data-swipe-toggle-rail=""
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: 0,
                width: RAIL_PX,
                bgcolor: palette('secondary-main'),
                ...(playing === 'in'
                  ? {
                      transformOrigin: 'center',
                      animation: `pp-low-rail-in ${SWEEP_ON_MS}ms cubic-bezier(.2,.8,.2,1)`,
                      '@keyframes pp-low-rail-in': {
                        from: { transform: 'scaleY(0)' },
                        to: { transform: 'scaleY(1)' },
                      },
                    }
                  : {}),
              }}
            />
            {playing === 'out' ? (
              <Box
                data-swipe-toggle-wipe=""
                sx={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: `calc(100% + ${WIPE_EDGE_PX}px)`,
                  background: `linear-gradient(to right, transparent, ${color.cardBg} ${WIPE_EDGE_PX}px)`,
                  animation: `pp-low-wipe-out ${SWEEP_OFF_MS}ms cubic-bezier(.4,0,.2,1) forwards`,
                  '@keyframes pp-low-wipe-out': {
                    from: { transform: 'translateX(100%)' },
                    to: { transform: `translateX(-${WIPE_EDGE_PX}px)` },
                  },
                }}
              />
            ) : null}
          </Box>
        ) : null}
        <Box
          data-swipe-toggle-dim=""
          style={{ opacity: inZone ? 0.7 : 1 }}
          sx={{ position: 'relative', transition: motion('opacity 150ms') }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
