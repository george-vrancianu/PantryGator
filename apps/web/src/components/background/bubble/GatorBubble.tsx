import {
  Box,
  CheckIcon,
  Gator,
  gutterLeft,
  gutterRight,
  SAFE_BOTTOM,
  DOCK_BOTTOM_CSS,
  DOCK_HEIGHT,
  SAFE_TOP,
  useAnySheetOpen,
  useToastFloor,
  usePrefersReducedMotion,
} from '@pocket-pantry/ui';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { VOICE_LAYER } from '../../../lib/voicePlacement';
import type { BackgroundItem } from '../backgroundItem';
import { bubbleSentence } from './bubbleCopy';
import {
  BUBBLE_SIZE,
  loadPlacement,
  moveToEdge,
  savePlacement,
  snapPlacement,
  type Placement,
  type Side,
} from './bubblePlacement';
import {
  ringArcs,
  ringShares,
  summarizeBubble,
  type BubbleState,
  type BubbleSummary,
} from './bubbleState';
import { useBubbleAnnouncement } from './useBubbleAnnouncement';

/**
 * The CSS custom property that sets the bubble's upper bound: the distance from the top of the
 * screen to the bottom of the header, as a CSS length. Whoever lays out the header sets it on an
 * ancestor (or `:root`); until then the bubble keeps clear of the top safe area plus 12 px.
 */
export const BUBBLE_TOP_VAR = '--gator-bubble-top';
const TOP_BOUND = `var(${BUBBLE_TOP_VAR}, calc(${SAFE_TOP} + 12px))`;

/** The bubble's lowest spot: 16 above the Dock, or above the bottom safe area where there is none. */
const restBottom = (dock: boolean) =>
  dock
    ? {
        xs: `calc(${DOCK_BOTTOM_CSS} + ${DOCK_HEIGHT.xs + 16}px)`,
        md: `calc(${DOCK_BOTTOM_CSS} + ${DOCK_HEIGHT.md + 16}px)`,
      }
    : { xs: `calc(${SAFE_BOTTOM} + 16px)`, md: `calc(${SAFE_BOTTOM} + 16px)` };

/** A finger or pointer must travel this far before a press becomes a drag, px. */
const DRAG_SLOP = 6;
const DRAG_SCALE = 1.12;
/** A bubble resting this far above its lowest spot or less is in the toasts' way, px. */
const TOAST_BAND = 56;

const INK = '#101511';
const BADGE = {
  grey: { bg: '#F4F7F1', fg: '#141A16' },
  gold: { bg: '#E8CB7C', fg: '#2A2105' },
  green: { bg: '#1C6A43', fg: '#FFFFFF' },
  red: { bg: '#B93A14', fg: '#FFFFFF' },
} as const;
const RING_COLOUR = {
  gold: '#E8CB7C',
  cream: '#F4F7F1',
  red: '#F0693A',
  green: '#1C6A43',
} as const;

const MOOD: Record<BubbleState, 'thinking' | 'happy' | 'worried'> = {
  reading: 'thinking',
  someReady: 'thinking',
  allDone: 'happy',
  couldNotRead: 'worried',
};

function Badge({
  tone,
  corner,
  children,
  testId,
}: {
  tone: keyof typeof BADGE;
  corner: 'top-right' | 'top-left' | 'bottom-right';
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <Box
      data-testid={testId}
      aria-hidden
      sx={{
        position: 'absolute',
        top: corner.startsWith('top') ? -6 : undefined,
        bottom: corner.startsWith('bottom') ? -6 : undefined,
        right: corner.endsWith('right') ? -6 : undefined,
        left: corner.endsWith('left') ? -6 : undefined,
        minWidth: 20,
        height: 20,
        px: '4px',
        boxSizing: 'border-box',
        display: 'grid',
        placeItems: 'center',
        borderRadius: 10,
        border: `2px solid ${INK}`,
        backgroundColor: BADGE[tone].bg,
        color: BADGE[tone].fg,
        fontSize: 11.5,
        fontWeight: 800,
        lineHeight: 1,
      }}
    >
      {children}
    </Box>
  );
}

/** The progress ring: stroke 3, inset 2. A lone Reading Job is one 26 % gold arc going round. */
function Ring({ summary, spin }: { summary: BubbleSummary; spin: boolean }) {
  const r = BUBBLE_SIZE / 2 - 2 - 1.5;
  const { state } = summary;
  const arcs =
    state === 'reading'
      ? [{ from: 0, to: 0.26, colour: RING_COLOUR.gold }]
      : state === 'allDone'
        ? [{ from: 0, to: 1, colour: RING_COLOUR.green }]
        : ringArcs(ringShares(summary)).map((arc) => ({
            from: arc.from,
            to: arc.to,
            colour:
              arc.kind === 'ready'
                ? RING_COLOUR.gold
                : arc.kind === 'failed'
                  ? RING_COLOUR.red
                  : RING_COLOUR.cream,
          }));
  return (
    <Box
      component="svg"
      aria-hidden
      data-testid="bubble-ring"
      viewBox={`0 0 ${BUBBLE_SIZE} ${BUBBLE_SIZE}`}
      sx={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        transform: 'rotate(-90deg)',
      }}
    >
      <circle
        cx={BUBBLE_SIZE / 2}
        cy={BUBBLE_SIZE / 2}
        r={r}
        fill="none"
        stroke="rgba(244,247,241,.14)"
        strokeWidth={3}
      />
      <Box
        component="g"
        sx={
          state === 'reading' && spin
            ? {
                transformOrigin: '50% 50%',
                animation: 'pp-bubble-spin 1.6s linear infinite',
                '@keyframes pp-bubble-spin': {
                  to: { transform: 'rotate(360deg)' },
                },
              }
            : undefined
        }
      >
        {arcs.map((arc, i) => (
          <circle
            key={i}
            data-testid="bubble-arc"
            data-colour={arc.colour}
            cx={BUBBLE_SIZE / 2}
            cy={BUBBLE_SIZE / 2}
            r={r}
            fill="none"
            stroke={arc.colour}
            strokeWidth={3}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={`${arc.to - arc.from} ${1 - (arc.to - arc.from)}`}
            strokeDashoffset={-arc.from}
          />
        ))}
      </Box>
    </Box>
  );
}

/**
 * The Gator bubble (Canopy handoff section 9): where the background strip was. A 56 pt disc with a
 * progress ring and Gator's face, showing what the Member's own Jobs on this device are doing.
 * Hidden when there are none, while a Sheet is up, and (by the host) in the camera. Tap opens
 * Review. Drag it to a side edge anywhere between the header (`--gator-bubble-top`) and the Dock;
 * Left and Right move it to an edge from the keyboard. Its place is kept per device. Each state
 * change slides a label out for 3 s and is announced once, through the toast live region.
 */
export function GatorBubble({
  items,
  dock,
  openSheet,
}: {
  items: BackgroundItem[];
  /** Whether the Dock is up: the bubble then rests 16 above it, else 16 above the bottom inset. */
  dock: boolean;
  openSheet: () => void;
}) {
  const { t } = useTranslation('background');
  const reduceMotion = usePrefersReducedMotion();
  const sheetOpen = useAnySheetOpen();
  const summary = summarizeBubble(items);
  const sentence = summary ? bubbleSentence(t, summary) : '';
  const label = useBubbleAnnouncement(summary, sentence);

  const [placement, setPlacement] = useState<Placement>(() =>
    loadPlacement(window.localStorage),
  );
  const place = (next: Placement) => {
    setPlacement(next);
    savePlacement(window.localStorage, next);
  };

  const probe = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const press = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
    dragged: boolean;
  } | null>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const swallowClick = useRef(false);

  // Toasts sit above the bubble while it is in their band (resting near the bottom); a bubble
  // dragged up out of the band leaves them where they are.
  const inToastBand = placement.lift <= TOAST_BAND;
  useToastFloor(
    summary !== null && !sheetOpen && inToastBand
      ? `calc(${restBottom(dock).xs} + ${placement.lift + BUBBLE_SIZE}px)`
      : null,
  );

  // A bubble that goes away mid-drag does not come back still held.
  const visible = summary !== null && !sheetOpen;
  if (!visible && drag) setDrag(null);

  if (!summary || sheetOpen) return null;

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    press.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
      dragged: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || p.id !== event.pointerId) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    if (!p.dragged && Math.hypot(dx, dy) < DRAG_SLOP) return;
    p.dragged = true;
    setDrag({ dx, dy });
  };
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || p.id !== event.pointerId) return;
    press.current = null;
    if (!p.dragged) return;
    swallowClick.current = true;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    const bounds = probe.current?.getBoundingClientRect();
    place(
      snapPlacement(
        { centreX: p.left + dx + BUBBLE_SIZE / 2, top: p.top + dy },
        { width: window.innerWidth },
        bounds
          ? { top: bounds.top, bottom: bounds.bottom }
          : { top: 0, bottom: window.innerHeight },
      ),
    );
    setDrag(null);
  };
  const onPointerCancel = () => {
    press.current = null;
    setDrag(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const side: Side | null =
      event.key === 'ArrowLeft'
        ? 'left'
        : event.key === 'ArrowRight'
          ? 'right'
          : null;
    if (!side) return;
    event.preventDefault();
    place(moveToEdge(placement, side));
  };

  const dragging = drag !== null;
  const rest = restBottom(dock);
  const lift = `${placement.lift}px`;
  const bottomFor = (base: string) =>
    // Never above the header, however tall the screen has become since it was placed.
    `min(calc(${base} + ${lift}), calc(100dvh - ${TOP_BOUND} - ${BUBBLE_SIZE}px))`;
  const { state } = summary;
  const allDone = state === 'allDone';
  const left = placement.side === 'left';

  return (
    <>
      {/* The free band between the header and the Dock, measured for the drop. */}
      <Box
        ref={probe}
        data-testid="gator-bubble-bounds"
        aria-hidden
        sx={{
          position: 'fixed',
          left: 0,
          width: 0,
          top: TOP_BOUND,
          bottom: rest,
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      />
      <Box
        data-testid="gator-bubble"
        data-side={placement.side}
        data-state={state}
        sx={{
          position: 'fixed',
          zIndex: VOICE_LAYER.card,
          width: BUBBLE_SIZE,
          height: BUBBLE_SIZE,
          left: left ? gutterLeft(16) : undefined,
          right: left ? undefined : gutterRight(16),
          bottom: { xs: bottomFor(rest.xs), md: bottomFor(rest.md) },
        }}
      >
        {dragging ? (
          <Box
            aria-hidden
            data-testid="gator-bubble-origin"
            sx={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '1.5px dashed rgba(20,30,22,.42)',
            }}
          />
        ) : null}
        {label ? (
          <Box
            aria-hidden
            data-testid="gator-bubble-label"
            sx={{
              position: 'absolute',
              top: 10,
              [left ? 'left' : 'right']: BUBBLE_SIZE + 10,
              height: 36,
              px: '13px',
              display: 'flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
              borderRadius: '8px',
              background: 'linear-gradient(180deg, #262F29, #121814)',
              color: '#FFFFFF',
              fontSize: 13.5,
              fontWeight: 700,
              boxShadow: '0 2px 4px rgba(10,16,12,.35)',
              animation: reduceMotion
                ? 'none'
                : `${left ? 'pp-bubble-label-l' : 'pp-bubble-label-r'} 220ms cubic-bezier(.2,.8,.2,1)`,
              '@keyframes pp-bubble-label-r': {
                from: { opacity: 0, transform: 'translateX(12px)' },
                to: { opacity: 1, transform: 'none' },
              },
              '@keyframes pp-bubble-label-l': {
                from: { opacity: 0, transform: 'translateX(-12px)' },
                to: { opacity: 1, transform: 'none' },
              },
            }}
          >
            {label}
          </Box>
        ) : null}
        <Box
          component="button"
          type="button"
          ref={button}
          aria-label={`${sentence}. ${t('bubble.open')}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onKeyDown={onKeyDown}
          onClick={() => {
            // The click that ends a drag is not a tap.
            if (swallowClick.current) {
              swallowClick.current = false;
              return;
            }
            openSheet();
          }}
          sx={{
            position: 'absolute',
            inset: 0,
            p: 0,
            m: 0,
            border: 'none',
            borderRadius: '50%',
            cursor: dragging ? 'grabbing' : 'pointer',
            background: allDone
              ? 'linear-gradient(180deg, #F5E0A2 0%, #D9B85C 100%)'
              : 'linear-gradient(180deg, #262F29, #121814)',
            boxShadow: dragging
              ? '0 4px 8px rgba(10,16,12,.4), 0 22px 32px -8px rgba(10,16,12,.75)'
              : allDone
                ? '0 0 0 6px rgba(232,203,124,.35), 0 2px 4px rgba(10,16,12,.35), 0 14px 24px -8px rgba(10,16,12,.65)'
                : '0 2px 4px rgba(10,16,12,.35), 0 14px 24px -8px rgba(10,16,12,.65)',
            transform: dragging
              ? `translate(${drag.dx}px, ${drag.dy}px) scale(${DRAG_SCALE})`
              : 'none',
            transition:
              dragging || reduceMotion ? 'none' : 'transform 180ms ease',
            touchAction: 'none',
            userSelect: 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Ring summary={summary} spin={!reduceMotion} />
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              inset: '7px',
              borderRadius: '50%',
              overflow: 'hidden',
              display: 'grid',
              placeItems: 'center',
              background: allDone
                ? '#FBF3DA'
                : 'radial-gradient(circle at 50% 40%, #3A6E50, #173323)',
            }}
          >
            <Gator
              mood={MOOD[state]}
              size={46}
              loop={
                state === 'reading' || state === 'someReady'
                  ? 'signature'
                  : 'idle'
              }
              entrance={false}
              decorative
            />
          </Box>
          {state === 'reading' ? (
            <Badge tone="grey" corner="top-right" testId="badge-reading">
              {summary.reading}
            </Badge>
          ) : null}
          {state === 'someReady' ? (
            <>
              <Badge tone="gold" corner="top-right" testId="badge-ready">
                {summary.ready}
              </Badge>
              <Badge tone="grey" corner="bottom-right" testId="badge-reading">
                {summary.reading}
              </Badge>
            </>
          ) : null}
          {allDone ? (
            <Badge tone="green" corner="top-right" testId="badge-done">
              <Box
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                }}
              >
                <CheckIcon size={10} />
                {summary.ready}
              </Box>
            </Badge>
          ) : null}
          {state === 'couldNotRead' ? (
            <>
              {summary.ready > 0 ? (
                <Badge tone="gold" corner="top-right" testId="badge-ready">
                  {summary.ready}
                </Badge>
              ) : null}
              <Badge tone="red" corner="top-left" testId="badge-failed">
                {summary.failed}
              </Badge>
              {summary.reading > 0 ? (
                <Badge tone="grey" corner="bottom-right" testId="badge-reading">
                  {summary.reading}
                </Badge>
              ) : null}
            </>
          ) : null}
        </Box>
      </Box>
    </>
  );
}
