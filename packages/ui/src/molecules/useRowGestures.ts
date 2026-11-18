import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { MouseEvent, PointerEvent } from 'react';

/** Row gesture numbers from the handoff (docs/handoffs/row-gestures/handoff.md, section 3). */
export const REVEAL_PT = 92;
export const DELETE_FRACTION = 2 / 3;
/** The delete line is tested at 98.5 % of its distance. */
const DELETE_LINE_SLACK = 0.985;
export const MOVE_TOLERANCE_PT = 8;
const RIGHT_RUBBER_BAND = 0.25;
const PAST_LINE_RUBBER_BAND = 0.4;
/** Toggle mode: past this many reveals the row follows the finger at `PAST_TOGGLE_RUBBER_BAND`. */
const TOGGLE_FOLLOW_REVEALS = 1.4;
const PAST_TOGGLE_RUBBER_BAND = 0.35;
/** How long after a drag the click that follows it is still swallowed. */
const CLICK_GUARD_MS = 350;

/** Hold to edit (handoff section 5): pressing shows after 90 ms so a tap never flashes; armed at 500 ms. */
export const PRESS_MS = 90;
export const HOLD_MS = 500;
/** The editor opens this long after the row arms. */
export const HOLD_OPEN_MS = 160;

/** A press that starts on one of these is the control's, not a hold; a drag from it still swipes. */
const INTERACTIVE = 'button, a, input, select, textarea, [role="button"]';

const HAPTIC_REVEAL = 10;
const HAPTIC_ARMED = 18;
const HAPTIC_DELETE_LINE = [14, 40, 22];
const HAPTIC_FLY_OFF = [10, 30, 30];

/**
 * 0: the tab is sliding in, 1: the tab is fully in view, 2: past the delete line.
 * Toggle mode has no zone 2.
 */
export type SwipeZone = 0 | 1 | 2;

type SharedGestureOptions = {
  /** Ignore pointers, e.g. while the row is confirming or leaving. */
  disabled?: boolean;
  /** Width of the tab, the zone 1 distance. */
  reveal?: number;
  /** Movement before a drag starts. */
  moveTolerance?: number;
};

/** Swipe to remove: zone 1 asks, zone 2 deletes. */
export type RemoveGestureOptions = SharedGestureOptions & {
  mode?: 'remove';
  /** Release in zone 1: the row asks for confirmation. */
  onAsk: () => void;
  /** Release in zone 2: the row flies off and is removed. */
  onDelete: () => void;
  /**
   * A press held still for 500 ms arms the row, and this is called 160 ms later. Without it the row
   * has no hold: `pressing` and `armed` stay false.
   */
  onHold?: () => void;
  /** A swipe reached zone 1, or a hold armed: the Member has used a gesture. */
  onLearned?: () => void;
  /** Fraction of the row width that starts zone 2. */
  deleteFraction?: number;
};

/** Swipe to toggle a flag: one zone at `reveal`; every release springs back. */
export type ToggleGestureOptions = SharedGestureOptions & {
  mode: 'toggle';
  /** Released inside the zone. */
  onToggle: () => void;
};

export type RowGestureOptions = RemoveGestureOptions | ToggleGestureOptions;

type Tuning = {
  reveal: number;
  deleteFraction: number;
  moveTolerance: number;
};

const DEFAULTS: Tuning = {
  reveal: REVEAL_PT,
  deleteFraction: DELETE_FRACTION,
  moveTolerance: MOVE_TOLERANCE_PT,
};

const deleteLine = (width: number, fraction: number) =>
  width * fraction * DELETE_LINE_SLACK;

/** Where the row sits for a finger that moved `dx` (negative is left). */
export function swipeOffset(
  dx: number,
  width: number,
  { deleteFraction } = DEFAULTS,
): number {
  if (dx >= 0) return dx * RIGHT_RUBBER_BAND;
  const line = deleteLine(width, deleteFraction);
  const drag = -dx;
  if (drag <= line) return dx;
  return -(line + (drag - line) * PAST_LINE_RUBBER_BAND);
}

/** The release zone for a finger that moved `dx`. */
export function swipeZone(
  dx: number,
  width: number,
  { reveal, deleteFraction } = DEFAULTS,
): SwipeZone {
  const drag = -dx;
  if (drag >= deleteLine(width, deleteFraction)) return 2;
  return drag >= reveal ? 1 : 0;
}

/** Toggle mode: where the row sits for a finger that moved `dx` (negative is left). */
export function toggleOffset(dx: number, reveal = REVEAL_PT): number {
  if (dx >= 0) return dx * RIGHT_RUBBER_BAND;
  const follow = reveal * TOGGLE_FOLLOW_REVEALS;
  if (-dx <= follow) return dx;
  return -(follow + (-dx - follow) * PAST_TOGGLE_RUBBER_BAND);
}

/** Toggle mode: 1 once the row has moved a full `reveal` left, else 0. */
export function toggleZone(dx: number, reveal = REVEAL_PT): SwipeZone {
  return -dx >= reveal ? 1 : 0;
}

/** Buzz where the browser can; a nicety, never an error. */
export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Haptics are a nicety.
  }
}

type Press = {
  id: number;
  x: number;
  y: number;
  width: number;
  dragging: boolean;
  zone: SwipeZone;
  dx: number;
  armed: boolean;
  /** `onLearned` already fired for this press. */
  learned: boolean;
};

export type RowGestureBind = {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  onClickCapture: (event: MouseEvent<HTMLElement>) => void;
  onContextMenu: (event: MouseEvent<HTMLElement>) => void;
};

export type RowGestures = {
  /** Spread onto the moving layer. */
  bind: RowGestureBind;
  /** Horizontal offset of the row in pt; follows the finger while `dragging`. */
  x: number;
  zone: SwipeZone;
  dragging: boolean;
  /** The press has been still for 90 ms: show the hold circle (or dim the row under reduce-motion). */
  pressing: boolean;
  /** The hold completed; the editor opens shortly. */
  armed: boolean;
  /** Where the press began, in pt from the row's top-left: the hold circle grows from here. */
  origin: { x: number; y: number } | null;
};

/**
 * The pointer logic of a swipeable row: a drag starts after 8 pt of mostly horizontal movement,
 * and the release zone decides between springing back, asking, and deleting.
 * Pointer capture is taken only once the drag starts, so taps reach the row's children.
 */
export function useRowGestures(options: RowGestureOptions): RowGestures {
  const tuning: Tuning = {
    reveal: options.reveal ?? DEFAULTS.reveal,
    deleteFraction:
      (options.mode === 'toggle' ? undefined : options.deleteFraction) ??
      DEFAULTS.deleteFraction,
    moveTolerance: options.moveTolerance ?? DEFAULTS.moveTolerance,
  };
  const latest = useRef({ options, tuning });
  useLayoutEffect(() => {
    latest.current = { options, tuning };
  });

  const [view, setView] = useState({
    x: 0,
    zone: 0 as SwipeZone,
    dragging: false,
  });
  const [hold, setHold] = useState({
    pressing: false,
    armed: false,
    origin: null as { x: number; y: number } | null,
  });
  const press = useRef<Press | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const armTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const swallowClick = useRef(false);
  const guardTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(
    () => () => {
      clearTimeout(guardTimer.current);
      clearTimeout(pressTimer.current);
      clearTimeout(armTimer.current);
      clearTimeout(openTimer.current);
    },
    [],
  );

  /** Stop a hold that has not armed yet; an armed one still opens its editor. */
  const cancelHold = useCallback(() => {
    clearTimeout(pressTimer.current);
    clearTimeout(armTimer.current);
    setHold((h) =>
      h.pressing || h.armed ? { ...h, pressing: false, armed: false } : h,
    );
  }, []);

  const rest = useCallback(() => {
    press.current = null;
    cancelHold();
    setView({ x: 0, zone: 0, dragging: false });
  }, [cancelHold]);

  const swallowNextClick = () => {
    swallowClick.current = true;
    clearTimeout(guardTimer.current);
    guardTimer.current = setTimeout(() => {
      swallowClick.current = false;
    }, CLICK_GUARD_MS);
  };

  const bind: RowGestureBind = {
    onPointerDown: (event) => {
      const { options: o } = latest.current;
      if (o.disabled) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      swallowClick.current = false;
      clearTimeout(pressTimer.current);
      clearTimeout(armTimer.current);
      const rect = event.currentTarget.getBoundingClientRect();
      const current: Press = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        width: rect.width,
        dragging: false,
        zone: 0,
        dx: 0,
        armed: false,
        learned: false,
      };
      press.current = current;
      if (o.mode === 'toggle' || !o.onHold) return;
      const target = event.target as Element | null;
      if (target?.closest?.(INTERACTIVE)) return;
      const origin = {
        x: event.clientX - (rect.left || 0),
        y: event.clientY - (rect.top || 0),
      };
      pressTimer.current = setTimeout(() => {
        if (press.current !== current) return;
        setHold({ pressing: true, armed: false, origin });
      }, PRESS_MS);
      armTimer.current = setTimeout(() => {
        if (press.current !== current) return;
        current.armed = true;
        vibrate(HAPTIC_ARMED);
        const { options: armedOptions } = latest.current;
        if (armedOptions.mode !== 'toggle') armedOptions.onLearned?.();
        setHold({ pressing: true, armed: true, origin });
        clearTimeout(openTimer.current);
        openTimer.current = setTimeout(() => {
          const { options: latestOptions } = latest.current;
          if (latestOptions.mode !== 'toggle' && !latestOptions.disabled) {
            latestOptions.onHold?.();
          }
        }, HOLD_OPEN_MS);
      }, HOLD_MS);
    },
    onPointerMove: (event) => {
      const current = press.current;
      if (!current || event.pointerId !== current.id) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      const { tuning: t, options: o } = latest.current;
      const toggle = o.mode === 'toggle';
      // An armed row is committed to editing: no swipe from here.
      if (current.armed) return;
      if (Math.hypot(dx, dy) > t.moveTolerance) cancelHold();
      if (!current.dragging) {
        if (Math.abs(dy) > t.moveTolerance && Math.abs(dy) >= Math.abs(dx)) {
          // Vertical: the scroll view's.
          press.current = null;
          return;
        }
        if (Math.abs(dx) <= t.moveTolerance || Math.abs(dx) <= Math.abs(dy)) {
          return;
        }
        current.dragging = true;
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
          // The pointer may already be gone.
        }
      }
      const zone = toggle
        ? toggleZone(dx, t.reveal)
        : swipeZone(dx, current.width, t);
      if (zone !== current.zone) {
        if (zone === 1 && current.zone === 0) vibrate(HAPTIC_REVEAL);
        if (zone === 2) vibrate(HAPTIC_DELETE_LINE);
        current.zone = zone;
        if (zone > 0 && !toggle && !current.learned) {
          current.learned = true;
          o.onLearned?.();
        }
      }
      current.dx = dx;
      const x = toggle
        ? toggleOffset(dx, t.reveal)
        : swipeOffset(dx, current.width, t);
      setView({ x, zone, dragging: true });
    },
    onPointerUp: (event) => {
      const current = press.current;
      if (!current || event.pointerId !== current.id) return;
      press.current = null;
      cancelHold();
      // The pointer-up that ends a hold is not a tap.
      if (current.armed) swallowNextClick();
      if (!current.dragging) return;
      swallowNextClick();
      const { options: o } = latest.current;
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch {
        // Already released.
      }
      if (o.mode === 'toggle') {
        setView({ x: 0, zone: 0, dragging: false });
        if (current.zone === 1) o.onToggle();
        return;
      }
      if (current.zone === 2) {
        setView((v) => ({ ...v, dragging: false }));
        vibrate(HAPTIC_FLY_OFF);
        o.onDelete();
        return;
      }
      setView({ x: 0, zone: 0, dragging: false });
      if (current.zone === 1) o.onAsk();
    },
    onPointerCancel: (event) => {
      const current = press.current;
      if (!current || event.pointerId !== current.id) return;
      if (current.dragging) swallowNextClick();
      rest();
    },
    onClickCapture: (event) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onContextMenu: (event) => event.preventDefault(),
  };

  return { bind, ...view, ...hold };
}
