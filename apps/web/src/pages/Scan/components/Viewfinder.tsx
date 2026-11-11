import { Box, tokens, usePrefersReducedMotion } from '@pocket-pantry/ui';
import { shade, translucent } from '../../../components/camera/glass';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Rect } from '../../../lib/scanGuides';

const PULSE_MS = 360;
const FLASH_MS = 420;
const HAPTIC_MS = 12;
const noMotion = {
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
};
const CORNERS = [
  ['Top', 'Left'],
  ['Top', 'Right'],
  ['Bottom', 'Left'],
  ['Bottom', 'Right'],
] as const;

/**
 * The capture feedback a Scan gives: bumps a counter the Viewfinder turns into its screen flash,
 * guide fill, bracket thickening and pulse, and vibrates. Both camera hosts call `fire` when the
 * shutter takes a Scan.
 */
export function useShotFeedback() {
  const [shot, setShot] = useState(0);
  const fire = useCallback(() => {
    navigator.vibrate?.(HAPTIC_MS);
    setShot((n) => n + 1);
  }, []);
  return { shot, fire };
}

const READ_HIDE_MS = 1200;

/**
 * The scan line of the Barcode guide: 2 pt, 7 % side insets, sweeping from 16 % to 84 % of the guide
 * height and back every 1.4 s; static at the middle under reduced motion.
 */
function ScanLine({ animated }: { animated: boolean }) {
  return (
    <Box
      data-testid="scan-line"
      data-static={animated ? undefined : 'true'}
      aria-hidden="true"
      sx={{
        position: 'absolute',
        left: '7%',
        right: '7%',
        top: '50%',
        height: 2,
        borderRadius: '999px',
        backgroundColor: tokens.color.accent,
        boxShadow: `0 0 12px 2px ${translucent(tokens.color.accent, 70)}`,
        ...(animated && {
          animation: 'pp-scan-line 1.4s ease-in-out infinite alternate',
          '@keyframes pp-scan-line': {
            from: { top: '16%' },
            to: { top: '84%' },
          },
        }),
      }}
    />
  );
}

type Props = {
  /** The guide, in screen pt (see `guideRect`). */
  rect: Rect;
  /** Show the scan line inside the guide (the Barcode guide); the host hides it once a code is read. */
  scanLine?: boolean;
  /** Codes read so far in a Scan Session: the line is hidden briefly after each new one. */
  readCount?: number;
  /** Counts Scans taken (`useShotFeedback`): each one restarts the flash, fill and pulse. */
  shot: number;
  /** True while the mode slider is being dragged: the guide shrinks slightly. */
  sliding?: boolean;
};

/**
 * The guide brackets for the camera mode, over the full-screen feed. The guide takes no input: it
 * is not a button, not focusable, and ignores the pointer. A Scan flashes the screen and the guide.
 */
export function Viewfinder({
  rect,
  shot,
  sliding = false,
  scanLine = false,
  readCount = 0,
}: Props) {
  const [justRead, setJustRead] = useState(false);
  const seenReads = useRef(readCount);
  useEffect(() => {
    if (readCount === seenReads.current) return;
    seenReads.current = readCount;
    setJustRead(true);
    const timer = window.setTimeout(() => setJustRead(false), READ_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [readCount]);
  const [pulse, setPulse] = useState(false);
  const [flash, setFlash] = useState(false);
  // Under reduced motion the screen flash, the guide's fill and the pulse are not rendered at all;
  // the thicker brackets (which follow `flash`) and the haptic stay.
  const reduced = usePrefersReducedMotion();
  const animated = !reduced;
  useEffect(() => {
    if (!shot) return;
    // oxlint-disable-next-line react/set-state-in-effect -- starts the pulse and flash animations when a Scan is taken; both end on timers
    setPulse(true);
    setFlash(true);
    const pending = [
      window.setTimeout(() => setPulse(false), PULSE_MS),
      window.setTimeout(() => setFlash(false), FLASH_MS),
    ];
    return () => pending.forEach(window.clearTimeout);
  }, [shot]);
  return (
    <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {flash && animated ? (
        <Box
          data-testid="scan-flash"
          aria-hidden="true"
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundColor: tokens.color.ink,
            opacity: 0,
            animation: 'pp-scan-flash 280ms ease-out',
            '@keyframes pp-scan-flash': {
              from: { opacity: 0.55 },
              to: { opacity: 0 },
            },
          }}
        />
      ) : null}
      <Box
        data-testid="scan-guide"
        data-pulse={pulse && animated ? 'true' : undefined}
        // The brackets are thicker while a Scan flashes, with or without motion.
        data-thick={flash ? 'true' : undefined}
        aria-hidden="true"
        sx={{
          position: 'absolute',
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          pointerEvents: 'none',
          userSelect: 'none',
          transform: sliding ? 'scale(.985)' : 'none',
          transition: `left 400ms cubic-bezier(.3,.7,.2,1), top 400ms cubic-bezier(.3,.7,.2,1), width 400ms cubic-bezier(.3,.7,.2,1), height 400ms cubic-bezier(.3,.7,.2,1), transform 200ms`,
          ...noMotion,
          ...(pulse &&
            animated && {
              animation: `pp-scan-pulse ${PULSE_MS}ms ease-out`,
              '@keyframes pp-scan-pulse': {
                '0%, 100%': { transform: 'scale(1)' },
                '40%': { transform: 'scale(0.965)' },
              },
            }),
        }}
      >
        {flash && animated ? (
          <Box
            data-testid="scan-guide-fill"
            aria-hidden="true"
            sx={{
              position: 'absolute',
              inset: 0,
              backgroundColor: tokens.color.ink,
              opacity: 0,
              animation: `pp-scan-fill ${FLASH_MS}ms ease-out`,
              '@keyframes pp-scan-fill': {
                from: { opacity: 0.85 },
                to: { opacity: 0 },
              },
            }}
          />
        ) : null}
        {scanLine && !justRead && !flash ? (
          <ScanLine animated={animated} />
        ) : null}
        {CORNERS.map(([v, h]) => (
          <Box
            key={v + h}
            data-testid="scan-guide-corner"
            aria-hidden="true"
            sx={{
              position: 'absolute',
              width: 30,
              height: 30,
              boxSizing: 'border-box',
              [v.toLowerCase()]: -2,
              [h.toLowerCase()]: -2,
              [`border${v}`]: `${flash ? 6 : 3.5}px solid`,
              [`border${h}`]: `${flash ? 6 : 3.5}px solid`,
              [`border${v}${h}Radius`]: '10px',
              [`border${v}Color`]: tokens.color.ink,
              [`border${h}Color`]: tokens.color.ink,
              filter: `drop-shadow(0 1px 4px ${shade(50)})`,
              ...noMotion,
            }}
          />
        ))}
      </Box>
    </Box>
  );
}
