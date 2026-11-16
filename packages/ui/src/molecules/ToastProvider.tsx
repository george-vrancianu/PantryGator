import Box from '@mui/material/Box';
import MuiButton from '@mui/material/Button';
import MuiSnackbar from '@mui/material/Snackbar';
import MuiSnackbarContent from '@mui/material/SnackbarContent';
import Typography from '@mui/material/Typography';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { aboveDock, DOCK_HEIGHT } from '../theme/dock';
import { usePrefersReducedMotion } from '../theme/usePrefersReducedMotion';
import { bodyFont, radius, shadow, themePalette } from '../theme/themeVars';

/** How long a toast stays unless it says otherwise, ms. */
const TOAST_DURATION_MS = 2600;

export type ToastOptions = {
  /** One optional action; clicking it runs `onClick` and dismisses the toast. */
  action?: { label: string; onClick: () => void };
  /**
   * Distance from the bottom, to sit above e.g. a sheet's footer or a floating button: px, a CSS
   * length, or one per breakpoint (`xs` for phones, `md` from the `md` breakpoint up).
   * Defaults to just above the Dock.
   */
  bottom?: number | string | { xs: number | string; md: number | string };
  /** A second, smaller line under the message. */
  detail?: string;
  /** How long the toast stays, in ms. Defaults to 2600. */
  duration?: number;
  /** Announce without interrupting (a status) instead of as an alert. */
  polite?: boolean;
  /**
   * For a notice that must not push out what the Member is reading (an Undo, a confirmation): if a
   * toast is showing, wait for it to end and show this one next, rather than replacing it. The
   * latest waiting notice wins. Shows at once when no toast is up.
   */
  waitForCurrent?: boolean;
  /**
   * Something is waiting on this toast. Called once when the toast ends for
   * any reason (timeout, dismissed, replaced by another toast, or the provider
   * unmounting), except when the action was used.
   */
  onClose?: () => void;
};

export type ToastHandle = { close: () => void };

export type ToastApi = {
  /**
   * Show a toast. It replaces the one showing; there is no queue. The handle
   * closes this toast early (running its `onClose`); it does nothing once
   * another toast has replaced it.
   */
  show: (message: string, options?: ToastOptions) => ToastHandle;
  /** Close whichever toast is showing (running its `onClose`), e.g. when a sheet opens over it. */
  dismiss: () => void;
};

type Current = ToastOptions & { id: number; message: string };

const ToastContext = createContext<ToastApi | null>(null);

/**
 * How a modal registers itself as the toast's home while open. A modal
 * aria-hides the app root and traps focus, so a toast rendered at the root
 * would be neither heard nor reachable; it renders inside the modal instead.
 * Hosts stack: the innermost open modal hosts the toast, and when it closes
 * the toast goes back to the one beneath.
 */
const ToastHostContext = createContext<
  ((element: HTMLElement) => () => void) | null
>(null);

/** Called by a modal: while `element` is set, toasts render inside it, unless a modal opened later is still open. */
export function useToastHost(element: HTMLElement | null): void {
  const register = useContext(ToastHostContext);
  useEffect(() => {
    if (!register || !element) return;
    return register(element);
  }, [register, element]);
}

/** Air kept between a toast and the floor it sits above, px. */
const FLOOR_GAP = 8;

/**
 * How something fixed at the bottom of the screen (a strip, a bar) registers a floor: toasts then sit
 * above it. Each floor is a CSS `bottom` value; when several are registered the highest wins.
 */
const ToastFloorContext = createContext<
  ((bottom: string) => () => void) | null
>(null);

/**
 * Called by something that occupies the bottom of the screen: while `bottom` is set (px, or a CSS
 * length for its top edge, measured from the bottom of the screen), toasts sit `8px` above it. Pass
 * `null` while there is nothing to clear. A toast hosted inside a modal ignores floors.
 */
export function useToastFloor(bottom: number | string | null): void {
  const register = useContext(ToastFloorContext);
  const value = typeof bottom === 'number' ? `${bottom}px` : bottom;
  useEffect(() => {
    if (!register || value === null) return;
    return register(value);
  }, [register, value]);
}

/** Mount once, near the root. Read it with `useToast()`. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Current | null>(null);
  const [open, setOpen] = useState(false);
  // The open modals, innermost last: when a modal opened over another closes, the toast goes back to the first.
  const [hosts, setHosts] = useState<HTMLElement[]>([]);
  const host = hosts.at(-1) ?? null;
  const registerHost = useCallback((element: HTMLElement) => {
    setHosts((prev) => [...prev, element]);
    return () => setHosts((prev) => prev.filter((h) => h !== element));
  }, []);
  // The registered floors, as CSS `bottom` values; the highest wins.
  const [floors, setFloors] = useState<string[]>([]);
  const registerFloor = useCallback((bottom: string) => {
    setFloors((prev) => [...prev, bottom]);
    return () =>
      setFloors((prev) => {
        const at = prev.indexOf(bottom);
        return at < 0 ? prev : prev.toSpliced(at, 1);
      });
  }, []);
  const floor = host ? null : highestFloor(floors);
  const reduceMotion = usePrefersReducedMotion();
  // The showing toast's `onClose`, until it has been called or its action used.
  const pendingClose = useRef<(() => void) | undefined>(undefined);
  const settle = useCallback(() => {
    const close = pendingClose.current;
    pendingClose.current = undefined;
    close?.();
  }, []);
  useEffect(() => settle, [settle]);

  const lastId = useRef(0);
  // Whether a toast is up, and the notice waiting for it to end (`waitForCurrent`).
  const showing = useRef(false);
  const waiting = useRef<{ message: string; options: ToastOptions } | null>(
    null,
  );
  const showRef = useRef<
    (message: string, options?: ToastOptions) => ToastHandle
  >(() => ({ close: () => undefined }));
  /** The showing toast has ended: show the notice that was waiting for it, if any. */
  const ended = useCallback(() => {
    showing.current = false;
    const next = waiting.current;
    waiting.current = null;
    if (next) showRef.current(next.message, next.options);
  }, []);
  const show = useCallback(
    (message: string, options: ToastOptions = {}): ToastHandle => {
      if (options.waitForCurrent && showing.current) {
        const entry = {
          message,
          options: { ...options, waitForCurrent: false },
        };
        waiting.current = entry;
        return {
          close: () => {
            if (waiting.current === entry) waiting.current = null;
          },
        };
      }
      settle();
      pendingClose.current = options.onClose;
      showing.current = true;
      const id = ++lastId.current;
      setCurrent({ ...options, message, id });
      setOpen(true);
      return {
        close: () => {
          if (lastId.current !== id) return;
          setOpen(false);
          settle();
          ended();
        },
      };
    },
    [settle, ended],
  );
  useEffect(() => {
    showRef.current = show;
  }, [show]);
  const dismiss = useCallback(() => {
    setOpen(false);
    settle();
    waiting.current = null;
    showing.current = false;
  }, [settle]);
  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      <ToastHostContext.Provider value={registerHost}>
        <ToastFloorContext.Provider value={registerFloor}>
          {children}
        </ToastFloorContext.Provider>
      </ToastHostContext.Provider>
      {current ? (
        <ToastPortal host={host}>
          <MuiSnackbar
            // A new key remounts, so the old toast is replaced rather than animated out.
            key={current.id}
            open={open}
            autoHideDuration={current.duration ?? TOAST_DURATION_MS}
            onClose={(_event, reason) => {
              if (reason === 'clickaway') return;
              setOpen(false);
              settle();
              ended();
            }}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            transitionDuration={reduceMotion ? 0 : undefined}
            sx={{
              bottom: composeToastBottom(current.bottom, floor),
              // Follow a floor that comes or goes while the toast is up.
              transition: reduceMotion ? 'none' : 'bottom 200ms ease',
              // 20 px side insets on phones (handoff section 7).
              left: { xs: 20 },
              right: { xs: 20 },
            }}
          >
            <MuiSnackbarContent
              role={current.polite ? 'status' : 'alert'}
              message={
                current.detail ? (
                  <>
                    <Box component="span" sx={{ display: 'block' }}>
                      {current.message}
                    </Box>
                    <Typography
                      component="span"
                      sx={{
                        display: 'block',
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    >
                      {current.detail}
                    </Typography>
                  </>
                ) : (
                  current.message
                )
              }
              action={
                current.action ? (
                  <MuiButton
                    onClick={() => {
                      // The toast may still be fading out after it closed.
                      if (!open) return;
                      pendingClose.current = undefined;
                      current.action?.onClick();
                      setOpen(false);
                      ended();
                    }}
                    sx={(theme) => ({
                      color: themePalette(theme).pp.toastAction,
                      fontSize: 14,
                      fontWeight: 700,
                      textTransform: 'none',
                      minWidth: 0,
                    })}
                  >
                    {current.action.label}
                  </MuiButton>
                ) : undefined
              }
              // Handoff section 4 Snackbar: light on the dark Theme, dark on the light ones.
              sx={(theme) => ({
                bgcolor: themePalette(theme).pp.toastBg,
                color: themePalette(theme).pp.toastInk,
                fontFamily: bodyFont,
                fontSize: 14,
                fontWeight: 600,
                px: '16px',
                py: '6px',
                borderRadius: radius.control,
                boxShadow: shadow.float,
              })}
            />
          </MuiSnackbar>
        </ToastPortal>
      ) : null}
    </ToastContext.Provider>
  );
}

/** The highest of the registered floors, as one CSS length; `null` when there are none. */
export function highestFloor(floors: string[]): string | null {
  if (floors.length === 0) return null;
  return floors.length === 1 ? floors[0]! : `max(${floors.join(', ')})`;
}

type Bottom = NonNullable<ToastOptions['bottom']>;

/** `bottom`, or the floor plus the gap when that is higher. */
const atLeast = (bottom: number | string, floor: string | null) =>
  floor === null
    ? bottom
    : `max(${typeof bottom === 'number' ? `${bottom}px` : bottom}, calc(${floor} + ${FLOOR_GAP}px))`;

/** The toast's `bottom` per breakpoint: its own (or just above the Dock), raised to clear the floor (a CSS length) and the gap above it. */
export function composeToastBottom(
  bottom: Bottom | undefined,
  floor: string | null,
) {
  // MUI's own sm+ `bottom: 24` would win above sm, so set every breakpoint.
  if (bottom === undefined) {
    return {
      xs: atLeast(aboveDock(DOCK_HEIGHT.xs), floor),
      sm: atLeast(aboveDock(DOCK_HEIGHT.xs), floor),
      md: atLeast(aboveDock(DOCK_HEIGHT.md), floor),
    };
  }
  if (typeof bottom === 'object') {
    return {
      xs: atLeast(bottom.xs, floor),
      sm: atLeast(bottom.xs, floor),
      md: atLeast(bottom.md, floor),
    };
  }
  return { xs: atLeast(bottom, floor), sm: atLeast(bottom, floor) };
}

/** Note: a change of `host` remounts the toast, replaying it and announcing it again. */
function ToastPortal({
  host,
  children,
}: {
  host: HTMLElement | null;
  children: ReactNode;
}) {
  return host ? createPortal(children, host) : children;
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside a ToastProvider');
  return api;
}
