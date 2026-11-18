import {
  Box,
  canopy,
  color,
  healthDial,
  palette,
  usePrefersReducedMotion,
} from '@pocket-pantry/ui';
import { dialAngle } from '@/lib/healthLights';

/** How long the needle takes to turn to a new score, ms. */
export const NEEDLE_TURN_MS = 700;
const NEEDLE_EASING = 'cubic-bezier(.2,.8,.2,1)';

type Palette = {
  /** The red tip (first 15 % of the band). */
  bad: string;
  /** Band colour after the tip, and the colour it blends to at the full end. */
  mid: string;
  good: string;
  tick: string;
  needle: string;
  hub: string;
  /** The ring that separates the hub from the needle. */
  hubRing: string;
};

const mix = (a: string, percent: number, b: string) =>
  `color-mix(in srgb, ${a} ${percent}%, ${b})`;

/** `canopy` sits on the green header and is the same in Light and Dark; `sheet` is the Health Sheet's, in Theme colours. */
const PALETTES: Record<'canopy' | 'sheet', Palette> = {
  canopy: {
    bad: healthDial.bad,
    mid: mix(canopy.ink, 40, 'transparent'),
    good: healthDial.good,
    tick: mix(canopy.ink, 42, 'transparent'),
    needle: canopy.ink,
    hub: canopy.gold,
    hubRing: canopy.base,
  },
  sheet: {
    bad: palette('error-main'),
    mid: color.lineStrong,
    good: palette('pp-accent'),
    tick: mix(palette('text-primary'), 40, 'transparent'),
    needle: palette('text-primary'),
    hub: palette('pp-accent'),
    hubRing: palette('background-paper'),
  },
};

const W = 92;
const H = 58;
const CX = 46;
const CY = 52;
const R = 48; // outer radius of the band
const SEGMENTS = 36;
const SWEEP = 120; // degrees, from -60 to +60

function point(t: number, r: number): [number, number] {
  const a = ((-60 + SWEEP * t) * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
}

/** Band thickness along the arc: 1.4 at the low end, 6.8 at the high end. */
const thickness = (t: number) => 1.4 + 5.4 * Math.min(t, 1) ** 1.3;

function bandColour(t: number, palette: Palette): string {
  if (t < 0.15) return palette.bad;
  const k = Math.min(1, Math.max(0, (t - 0.42) / 0.5));
  return mix(palette.good, Math.round(k * 100), palette.mid);
}

const f = (n: number) => n.toFixed(2);

/** The settle played when the dial appears: drop back, swing up, overshoot by 5 degrees and settle. */
const settleSx = {
  animation: 'pp-needle-settle 2s cubic-bezier(.3,.9,.3,1) 1',
  '@keyframes pp-needle-settle': {
    '0%': { transform: 'rotate(0deg)' },
    '14%': { transform: 'rotate(-46deg)' },
    '62%': { transform: 'rotate(5deg)' },
    '82%': { transform: 'rotate(-1.5deg)' },
    '100%': { transform: 'rotate(0deg)' },
  },
} as const;

type Props = {
  /** 0 to 100; null parks the needle at the low end, greyed (not enough Batches to judge). */
  score: number | null;
  tone: 'canopy' | 'sheet';
  /** Play the settle once when the dial appears (not under reduced motion). */
  settle?: boolean;
};

/**
 * The Pantry Health dial: a 120-degree band, five scale dots and a needle. Decorative; the text around it says
 * the same. The needle turns over 700 ms to a new score, and instantly under reduced motion.
 */
export function HealthDial({ score, tone, settle = false }: Props) {
  const reduceMotion = usePrefersReducedMotion();
  const palette = PALETTES[tone];
  const parked = score === null;
  const segments = Array.from({ length: SEGMENTS }, (_, i) => {
    const t0 = i / SEGMENTS;
    const t1 = Math.min((i + 1) / SEGMENTS + 0.006, 1); // a tiny overlap hides seams
    const [a, b, c, d] = [
      point(t0, R),
      point(t1, R),
      point(t1, R - thickness(t1)),
      point(t0, R - thickness(t0)),
    ];
    return (
      <path
        key={i}
        d={`M${f(a[0])} ${f(a[1])} L${f(b[0])} ${f(b[1])} L${f(c[0])} ${f(c[1])} L${f(d[0])} ${f(d[1])} Z`}
        fill={bandColour((t0 + t1) / 2, palette)}
      />
    );
  });
  const start = point(0, R - thickness(0) / 2);
  const end = point(1, R - thickness(1) / 2);
  const angle = dialAngle(parked ? 0 : score);

  return (
    <Box
      aria-hidden="true"
      data-testid="health-dial"
      data-angle={angle.toFixed(1)}
      data-parked={parked ? 'true' : undefined}
      sx={{
        position: 'relative',
        width: W,
        height: H,
        flex: 'none',
        overflow: 'hidden',
      }}
    >
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        fill="none"
        style={{ display: 'block' }}
      >
        {segments}
        <circle
          cx={start[0]}
          cy={start[1]}
          r={thickness(0) / 2}
          fill={palette.bad}
        />
        <circle
          cx={end[0]}
          cy={end[1]}
          r={thickness(1) / 2}
          fill={palette.good}
        />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const [x, y] = point(t, R - 13);
          return <circle key={t} cx={x} cy={y} r={1.1} fill={palette.tick} />;
        })}
      </svg>
      {/* The outer span holds the angle; the inner one plays the settle, so resting needs no animation. */}
      <Box
        component="span"
        data-testid="health-needle"
        sx={{
          position: 'absolute',
          left: 44,
          top: 12,
          width: 4,
          height: 40,
          display: 'block',
          transformOrigin: '50% 100%',
          transform: `rotate(${angle.toFixed(1)}deg)`,
          transition: reduceMotion
            ? 'none'
            : `transform ${NEEDLE_TURN_MS}ms ${NEEDLE_EASING}, opacity ${NEEDLE_TURN_MS}ms`,
          opacity: parked ? 0.4 : 1,
        }}
      >
        <Box
          component="span"
          data-settle={settle && !reduceMotion ? 'true' : undefined}
          sx={{
            display: 'block',
            width: '100%',
            height: '100%',
            transformOrigin: '50% 100%',
            background: palette.needle,
            clipPath: 'polygon(38% 0, 62% 0, 100% 100%, 0 100%)',
            ...(settle && !reduceMotion ? settleSx : {}),
          }}
        />
      </Box>
      <Box
        component="span"
        sx={{
          position: 'absolute',
          left: 40.5,
          top: 46.5,
          width: 11,
          height: 11,
          display: 'block',
          borderRadius: '50%',
          background: palette.hub,
          boxShadow: `0 0 0 2px ${palette.hubRing}`,
          opacity: parked ? 0.5 : 1,
        }}
      />
    </Box>
  );
}
