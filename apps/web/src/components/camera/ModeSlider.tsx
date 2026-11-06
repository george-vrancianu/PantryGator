import { Box, tokens, visuallyHidden } from '@pocket-pantry/ui';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { CameraMode } from '../../lib/cameraMode';
import { CreditPrice } from '../CreditPrice';
import { useCreditPrice } from '../../lib/credits';
import { MODE_SLIDER_HEIGHT } from '../../lib/scanGuides';
import {
  dragOffset,
  releaseTarget,
  startsHorizontalDrag,
  uniformCentres,
} from '../../lib/sliderGesture';
import { useCameraFrame } from './CameraFrame';
import { glassFocusRing } from './glass';

/**
 * Whether a sideways swipe on the viewfinder also drives the slider (handoff 12). The one switch to
 * limit the swipe to the slider itself if device testing shows accidental mode changes.
 */
export const VIEWFINDER_SWIPE = true;

const HAPTIC_MS = 6;

/** The arrow keys that step to the next and the previous mode. */
export type ModeKeys = { next: readonly string[]; previous: readonly string[] };
export const HORIZONTAL_KEYS: ModeKeys = {
  next: ['ArrowRight'],
  previous: ['ArrowLeft'],
};
/** The vertical list answers the up and down arrows too. */
export const VERTICAL_KEYS: ModeKeys = {
  next: ['ArrowRight', 'ArrowDown'],
  previous: ['ArrowLeft', 'ArrowUp'],
};

/**
 * Arrow keys step through the modes anywhere on the screen, unless a sheet or a read owns them, a
 * slider or text field has focus, or a modifier is held. Shared by the strip and the rail's list.
 */
export function useModeKeys<Mode extends CameraMode>(options: {
  modes: readonly Mode[];
  mode: Mode;
  keysDisabled: boolean;
  onChange: (mode: Mode) => void;
  keys: ModeKeys;
}) {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { modes, mode, keysDisabled, onChange, keys } = latest.current;
      const step = keys.next.includes(event.key)
        ? 1
        : keys.previous.includes(event.key)
          ? -1
          : 0;
      const next = modes[modes.indexOf(mode) + step];
      if (!step || !next || keysDisabled) return;
      if (event.defaultPrevented || event.isComposing) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          'input, select, textarea, [contenteditable], [role=slider]',
        )
      ) {
        return;
      }
      onChange(next);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}

/** A change of mode buzzes, and keeps keyboard focus on the radio that is now checked. */
export function useFocusFollowsMode(
  group: RefObject<HTMLElement | null>,
  mode: CameraMode,
) {
  const previous = useRef(mode);
  useEffect(() => {
    if (previous.current === mode) return;
    previous.current = mode;
    navigator.vibrate?.(HAPTIC_MS);
    if (group.current?.contains(document.activeElement)) {
      group.current
        .querySelector<HTMLElement>('[aria-checked="true"]')
        ?.focus();
    }
  }, [group, mode]);
}

/** A mode's name, and its credit price while it is the chosen Scan mode. */
export function ModeLabel({
  mode,
  active,
}: {
  mode: CameraMode;
  active: boolean;
}) {
  const { t } = useTranslation('scan');
  const price = useCreditPrice('scan');
  return (
    <>
      {t(`mode.${mode}`)}
      {active && mode !== 'barcode' && price ? (
        <Box
          component="span"
          sx={{ fontWeight: 600, textTransform: 'none', ml: 0.75 }}
        >
          {'· '}
          <CreditPrice kind="scan" />
        </Box>
      ) : null}
    </>
  );
}

const CLICK_GUARD_MS = 50;
const LABEL_GAP = 26;
const reducedMotion = '@media (prefers-reduced-motion: reduce)';

/** Centre of each label along the strip, or null where nothing can be measured (no layout yet, jsdom). */
function measureCentres(labels: Array<HTMLElement | null>): number[] | null {
  const centres: number[] = [];
  for (const label of labels) {
    if (!label || label.offsetWidth === 0) return null;
    centres.push(label.offsetLeft + label.offsetWidth / 2);
  }
  return centres;
}

type Props<Mode extends CameraMode> = {
  /** The modes the camera was opened with, left to right. Hidden when there is only one. */
  modes: readonly Mode[];
  mode: Mode;
  disabled: boolean;
  /** Also true while a sheet or a read owns the arrow keys. */
  keysDisabled: boolean;
  onChange: (mode: Mode) => void;
  /** The viewfinder: a swipe on it drives the slider too (when `VIEWFINDER_SWIPE` is on). It should set `touch-action: pan-y`. */
  swipeSurface?: HTMLElement | null;
  /** True while a finger is dragging the strip. */
  onDragChange?: (dragging: boolean) => void;
};

/**
 * The mode slider (handoff 4): the camera modes as words, the selected one centred and in the
 * accent colour. Tap a word, press the left and right arrow keys, or drag the strip (or the
 * viewfinder) and let go. A radio group, so it is announced as one. It knows nothing of the
 * screen around it: the Scan page and the add-Batch camera both mount it.
 */
export function ModeSlider<Mode extends CameraMode>({
  modes,
  mode,
  disabled,
  keysDisabled,
  onChange,
  swipeSurface,
  onDragChange,
}: Props<Mode>) {
  const { t, i18n } = useTranslation('scan');
  // Every mode but Barcode (a free lookup) is a Scan; the chosen one names its price.
  const price = useCreditPrice('scan');
  const index = modes.indexOf(mode);
  const root = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const labels = useRef<Array<HTMLElement | null>>([]);

  // Label centres are measured, because the words differ in width and in each language.
  const [measured, setMeasured] = useState<number[] | null>(null);
  const centres =
    measured?.length === modes.length ? measured : uniformCentres(modes.length);
  useLayoutEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (!cancelled) setMeasured(measureCentres(labels.current));
    };
    measure();
    // The first measure may use the fallback font: measure again once the fonts are in.
    void document.fonts?.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', measure);
    };
  }, [modes, i18n.language, mode, price]);

  // Strip offset in px while a finger is dragging it, else null.
  const [dragging, setDragging] = useState<number | null>(null);
  const justDragged = useRef(false);
  const clickGuard = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(clickGuard.current), []);

  // A swipe is read in the frame's own directions: along the strip, whichever way the screen is turned.
  const { toFrameDelta } = useCameraFrame();
  const latest = useRef({
    toFrameDelta,
    modes,
    index,
    centres,
    disabled,
    keysDisabled,
    onChange,
    onDragChange,
  });
  useLayoutEffect(() => {
    latest.current = {
      toFrameDelta,
      modes,
      index,
      centres,
      disabled,
      keysDisabled,
      onChange,
      onDragChange,
    };
  });

  const surface = VIEWFINDER_SWIPE ? swipeSurface : null;
  // The strip's element only exists with two or more modes.
  const hasStrip = modes.length > 1;
  useEffect(() => {
    const targets = [root.current, surface].filter(
      (target): target is HTMLElement => target != null,
    );
    let drag: {
      pointerId: number;
      x: number;
      y: number;
      t: number;
      startIndex: number;
      moved: boolean;
    } | null = null;
    const offsetNow = (event: PointerEvent, start: NonNullable<typeof drag>) =>
      dragOffset(
        start.startIndex,
        latest.current.toFrameDelta(
          event.clientX - start.x,
          event.clientY - start.y,
        ).x,
        latest.current.centres,
      );
    const onDown = (event: PointerEvent) => {
      if (latest.current.disabled || !event.isPrimary || event.button !== 0) {
        return;
      }
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        t: performance.now(),
        startIndex: latest.current.index,
        moved: false,
      };
    };
    const onMove = (event: PointerEvent) => {
      const start = drag;
      if (!start || start.pointerId !== event.pointerId) return;
      const delta = latest.current.toFrameDelta(
        event.clientX - start.x,
        event.clientY - start.y,
      );
      if (!start.moved && !startsHorizontalDrag(delta.x, delta.y)) return;
      if (!start.moved) {
        start.moved = true;
        latest.current.onDragChange?.(true);
        try {
          (event.currentTarget as HTMLElement).setPointerCapture?.(
            event.pointerId,
          );
        } catch {
          // The pointer is already gone; the drag still ends on pointerup/cancel.
        }
      }
      setDragging(offsetNow(event, start));
    };
    const onEnd = (event: PointerEvent) => {
      const start = drag;
      if (!start || start.pointerId !== event.pointerId) return;
      drag = null;
      if (!start.moved) return;
      setDragging(null);
      latest.current.onDragChange?.(false);
      justDragged.current = true;
      clearTimeout(clickGuard.current);
      clickGuard.current = setTimeout(
        () => (justDragged.current = false),
        CLICK_GUARD_MS,
      );
      if (event.type === 'pointercancel' || latest.current.disabled) return;
      const { modes, centres, index, onChange } = latest.current;
      const target = releaseTarget({
        offset: offsetNow(event, start),
        dx: latest.current.toFrameDelta(
          event.clientX - start.x,
          event.clientY - start.y,
        ).x,
        dt: Math.max(1, performance.now() - start.t),
        index: start.startIndex,
        centres,
      });
      if (target !== index) onChange(modes[target]);
    };
    for (const target of targets) {
      target.addEventListener('pointerdown', onDown);
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onEnd);
      target.addEventListener('pointercancel', onEnd);
    }
    return () => {
      for (const target of targets) {
        target.removeEventListener('pointerdown', onDown);
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onEnd);
        target.removeEventListener('pointercancel', onEnd);
      }
      if (drag?.moved) latest.current.onDragChange?.(false);
    };
  }, [surface, hasStrip]);

  useModeKeys({
    modes,
    mode,
    keysDisabled,
    onChange,
    keys: HORIZONTAL_KEYS,
  });

  useFocusFollowsMode(group, mode);

  if (modes.length < 2) return null;

  const isDragging = dragging !== null;
  return (
    <Box
      ref={root}
      data-testid="mode-slider"
      sx={{
        position: 'relative',
        height: MODE_SLIDER_HEIGHT,
        overflow: 'hidden',
        touchAction: 'pan-y',
        cursor: isDragging ? 'grabbing' : 'grab',
        maskImage: `linear-gradient(90deg, transparent, black 22%, black 78%, transparent)`,
        WebkitMaskImage: `linear-gradient(90deg, transparent, black 22%, black 78%, transparent)`,
      }}
    >
      <Box role="status" sx={visuallyHidden}>
        {t('slider.announce', { mode: t(`mode.${mode}`) })}
      </Box>
      <Box
        ref={group}
        role="radiogroup"
        aria-label={t('modes')}
        sx={{
          position: 'absolute',
          left: '50%',
          top: 0,
          height: MODE_SLIDER_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          gap: `${LABEL_GAP}px`,
          transform: `translateX(${-(dragging ?? centres[index])}px)`,
          transition: isDragging
            ? 'none'
            : 'transform 300ms cubic-bezier(.25,.8,.25,1)',
          [reducedMotion]: { transition: 'none' },
        }}
      >
        {modes.map((item, position) => {
          const active = item === mode;
          return (
            <Box
              key={item}
              ref={(element: HTMLElement | null) => {
                labels.current[position] = element;
              }}
              component="button"
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              disabled={disabled}
              onClick={() => {
                if (!justDragged.current) onChange(item);
              }}
              sx={{
                flex: 'none',
                height: MODE_SLIDER_HEIGHT,
                p: '8px 0',
                border: 0,
                background: 'transparent',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                userSelect: 'none',
                color: active ? tokens.color.accent : tokens.color.muted,
                transition: 'color 200ms',
                '&:disabled': { cursor: 'default' },
                '&:focus-visible': glassFocusRing,
                [reducedMotion]: { transition: 'none' },
              }}
            >
              <ModeLabel mode={item} active={active} />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
