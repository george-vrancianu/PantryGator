import { Box, tokens } from '@pocket-pantry/ui';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { FocusPass } from '../../../lib/camera';
import { BARCODE_GLYPH } from '../../../components/camera/barcodeGlyph';
import { glassFocusRing, shade } from '../../../components/camera/glass';

const HAPTIC_MS = 6;
/** How long the pointer rests on the shutter before it counts as a hold. */
export const HOLD_MS = 300;
/** Pointer travel that still counts as resting (a hold) or as a tap. */
export const HOLD_SLOP = 10;

const reducedMotion = '@media (prefers-reduced-motion: reduce)';

type Props = {
  /** Barcode reads on its own: the shutter is then a ring with the barcode glyph that takes no input. */
  ring: boolean;
  /**
   * True when a Scan cannot start (a photo is being prepared, the camera is not ready, the 20-card
   * limit, the Scan Cap). The button stays focusable (`aria-disabled`) so pressing it can say why.
   */
  disabled: boolean;
  /** Takes a Scan: called for a tap, a key press, or the release of a hold once focus has finished. */
  onShoot: () => void;
  /** The shutter was pressed while `disabled`. */
  onBlocked?: () => void;
  /** Starts a best-effort focus pass for a hold; without it a hold scans on release. */
  focusForScan?: () => FocusPass;
};

/**
 * The round shutter (handoff 5.3). A tap takes a Scan at once. Holding it for 300 ms runs the
 * best-effort focus pass (ADR 0015) and letting go takes the Scan; sliding off cancels. Enter and
 * Space click it like any button. It knows nothing of the screen around it, so the Scan page and
 * the add-Batch camera both mount it.
 */
export function ShutterButton({
  ring,
  disabled,
  onShoot,
  onBlocked,
  focusForScan,
}: Props) {
  const { t } = useTranslation('scan');
  const latest = useRef({ disabled, onShoot, onBlocked, focusForScan });
  useLayoutEffect(() => {
    latest.current = { disabled, onShoot, onBlocked, focusForScan };
  });
  const press = useRef<{
    pointerId: number;
    x: number;
    y: number;
    /** pending: waiting for 300 ms; holding: focus pass running; cancelled: slid off. */
    hold: 'pending' | 'holding' | 'cancelled' | null;
    pass: FocusPass | null;
  } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** True from a hold's release until its Scan is sent: new presses must not arm. */
  const scanPending = useRef(false);
  /** The click that follows a hold or a slide is not a tap. */
  const suppressClick = useRef(false);
  /** The focus pass of the latest hold, so unmounting can put the camera back. */
  const activePass = useRef<FocusPass | null>(null);
  const mounted = useRef(true);
  const [down, setDown] = useState(false);
  const [holding, setHolding] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(holdTimer.current);
      activePass.current?.cancel();
    };
  }, []);

  const cancelHold = () => {
    const current = press.current;
    clearTimeout(holdTimer.current);
    if (current?.hold === 'pending') current.hold = null;
    if (current?.hold !== 'holding') return;
    current.hold = 'cancelled';
    current.pass?.cancel();
    setHolding(false);
  };

  // The shutter turned into the ring, or became disabled, mid-press: nothing may start or finish from it.
  useEffect(() => {
    if (!ring && !disabled) return;
    cancelHold();
    if (press.current) suppressClick.current = true;
    press.current = null;
    // oxlint-disable-next-line react/set-state-in-effect -- the press ended without a pointer event
    setDown(false);
  }, [ring, disabled]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick.current = false;
    clearTimeout(holdTimer.current);
    if (latest.current.disabled || scanPending.current) {
      press.current = null;
      return;
    }
    setDown(true);
    const current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      hold: 'pending' as 'pending' | 'holding' | 'cancelled' | null,
      pass: null as FocusPass | null,
    };
    press.current = current;
    holdTimer.current = setTimeout(() => {
      if (press.current !== current || current.hold !== 'pending') return;
      // The Scan may have become impossible during the 300 ms.
      if (latest.current.disabled) {
        current.hold = null;
        return;
      }
      current.hold = 'holding';
      setHolding(true);
      navigator.vibrate?.(HAPTIC_MS);
      current.pass = activePass.current =
        latest.current.focusForScan?.() ?? null;
    }, HOLD_MS);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = press.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const travelled = Math.hypot(
      event.clientX - current.x,
      event.clientY - current.y,
    );
    if (travelled <= HOLD_SLOP) return;
    // Sliding off is not a tap, and before the hold starts it is not a hold either.
    suppressClick.current = true;
    cancelHold();
    setDown(false);
  };

  const release = (event: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const current = press.current;
    if (!current || current.pointerId !== event.pointerId) return;
    press.current = null;
    clearTimeout(holdTimer.current);
    setDown(false);
    if (current.hold === 'cancelled') {
      suppressClick.current = true;
      return;
    }
    if (current.hold !== 'holding') {
      // A cancelled pointer (the OS took the touch) must not end in a click.
      if (cancelled) suppressClick.current = true;
      return;
    }
    suppressClick.current = true;
    if (cancelled || latest.current.disabled) {
      current.pass?.cancel();
      setHolding(false);
      return;
    }
    // Letting go sends the Scan once focus has finished or timed out.
    scanPending.current = true;
    void (current.pass?.done ?? Promise.resolve()).then(() => {
      scanPending.current = false;
      if (!mounted.current) return;
      setHolding(false);
      // The Scan Cap or the card limit may have come up while focus was running.
      if (!latest.current.disabled) latest.current.onShoot();
    });
  };

  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (scanPending.current) return;
    if (latest.current.disabled) {
      latest.current.onBlocked?.();
      return;
    }
    latest.current.onShoot();
  };

  const pressed = down || holding;
  const glyph = (
    <Box
      sx={{
        width: 28,
        height: 28,
        '& svg': {
          width: '100%',
          height: '100%',
          stroke: 'currentColor',
          fill: 'none',
          strokeWidth: 2,
          strokeLinecap: 'round',
        },
      }}
    >
      {BARCODE_GLYPH}
    </Box>
  );

  const fadeIn = {
    animation: 'pp-shutter-fade 200ms ease-out',
    '@keyframes pp-shutter-fade': { from: { opacity: 0 }, to: { opacity: 1 } },
    [reducedMotion]: { animation: 'none' },
  };

  if (ring) {
    return (
      <Box
        data-testid="shutter-ring"
        aria-hidden="true"
        sx={{
          width: 78,
          height: 78,
          boxSizing: 'border-box',
          display: 'grid',
          placeItems: 'center',
          borderRadius: '50%',
          border: `4px solid ${tokens.color.ink}`,
          color: tokens.color.ink,
          pointerEvents: 'none',
          ...fadeIn,
        }}
      >
        {glyph}
      </Box>
    );
  }

  return (
    <Box
      component="button"
      type="button"
      aria-label={t('shutter.label')}
      aria-disabled={disabled || undefined}
      data-holding={holding ? 'true' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event: PointerEvent<HTMLElement>) => release(event, false)}
      onPointerCancel={(event: PointerEvent<HTMLElement>) =>
        release(event, true)
      }
      onPointerLeave={() => {
        cancelHold();
        setDown(false);
      }}
      onContextMenu={(event: MouseEvent) => {
        if (pressed) event.preventDefault();
      }}
      onClick={onClick}
      sx={{
        width: 78,
        height: 78,
        boxSizing: 'border-box',
        display: 'grid',
        placeItems: 'center',
        p: 0,
        borderRadius: '50%',
        border: `4px solid ${tokens.color.ink}`,
        backgroundColor: 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        touchAction: 'manipulation',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
        '&:focus-visible': glassFocusRing,
        ...fadeIn,
      }}
    >
      <Box
        component="span"
        aria-hidden="true"
        sx={{
          width: 62,
          height: 62,
          borderRadius: '50%',
          backgroundColor: pressed
            ? `color-mix(in srgb, ${tokens.color.ink} 92%, ${tokens.color.bg})`
            : tokens.color.ink,
          boxShadow: `0 1px 4px ${shade(35)}`,
          opacity: disabled ? 0.55 : 1,
          transform: pressed ? 'scale(.88)' : 'none',
          transition: 'transform 120ms, background-color 120ms',
          [reducedMotion]: { transition: 'none' },
        }}
      />
    </Box>
  );
}
