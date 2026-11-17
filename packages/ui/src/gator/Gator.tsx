import { useEffect, useMemo, useState } from 'react';
import { usePrefersReducedMotion } from '../theme/usePrefersReducedMotion';
import { type GatorMood, gatorLayout } from './gatorGeometry';

export type GatorLoop = 'idle' | 'signature';
/** Everything the image can show; `data-motion` carries it. */
export type GatorMotion = GatorLoop | 'entrance' | 'tap';

/** How long each one-shot plays before Gator returns to its loop (ms). */
export const ONE_SHOT_MS = { entrance: 1300, tap: 900 } as const;
type OneShot = keyof typeof ONE_SHOT_MS;

const VARIANT_FILE = /gator-(.+)-(idle|signature|entrance|tap)\.svg$/;

const FILES = import.meta.glob<string>(
  './art/gator-*-{idle,signature,entrance,tap}.svg',
  { query: '?url', import: 'default', eager: true },
);

const ART: Record<string, Partial<Record<GatorMotion, string>>> = {};
for (const [path, url] of Object.entries(FILES)) {
  const [, mood, variant] = VARIANT_FILE.exec(path)!;
  (ART[mood!] ??= {})[variant as GatorMotion] = url;
}
/**
 * Each mood's Tap art as text, fetched once a pressable Gator mounts. WebKit shares one SVG
 * document, and so one animation clock, between every image of a URL: a Tap shown from the
 * file's own URL has already played out after the first. Each Tap instead gets its own data
 * URL built from this text, so it starts from its first frame.
 */
const TAP_TEXT: Record<string, string | undefined> = {};
const tapFetches = new Set<string>();
function warmTap(mood: string, url: string) {
  if (tapFetches.has(mood)) return;
  tapFetches.add(mood);
  fetch(url)
    .then((res) => (res.ok ? res.text() : Promise.reject(new Error())))
    .then((text) => {
      TAP_TEXT[mood] = text;
    })
    // The file's own URL still plays a first Tap; let a later Gator retry.
    .catch(() => tapFetches.delete(mood));
}
/** Counts every Tap started by any Gator, so no two Taps of a mood ever share a data URL. */
let tapRuns = 0;
/** The source for one Tap run: its own data URL once the text is in, else the file. */
function tapRunSrc(mood: string, run: number) {
  const text = TAP_TEXT[mood];
  if (!text) return ART[mood]!.tap!;
  // A trailing comment makes the URL unique without touching the drawing.
  return `data:image/svg+xml,${encodeURIComponent(`${text}<!--${run}-->`)}`;
}

export type GatorProps = {
  mood: GatorMood;
  /** Pixel width of the drawing itself; its padding hangs outside. */
  size?: number;
  /** The resting loop: breathing and blinking, or the pose's own action. */
  loop?: GatorLoop;
  /** Play the Entrance on mount (default true). */
  entrance?: boolean;
  /** Makes Gator a button (named by its alt): a press plays the Tap and calls this at once. */
  onClick?: () => void;
  /**
   * For a Gator inside something already pressable: the parent bumps this number to start a Tap.
   * Gator renders no button of its own.
   */
  tapSignal?: number;
} & (
  | {
      /** The translated alt text describing the mood. */
      alt: string;
      decorative?: false;
    }
  | {
      /** Empty alt, hidden from assistive tech. */
      decorative: true;
      alt?: never;
      /** A button needs a name: onClick requires alt. */
      onClick?: never;
    }
);

/** A one-shot in progress. */
type Shot = { kind: OneShot };

/**
 * Gator in motion: an Entrance on mount, then the caller's loop. The motion
 * lives in the SVG files; this only picks the file. Animations in an `<img>`
 * don't fire `animationend`, so a timer ends each one-shot.
 */
export function Gator({
  mood,
  size = 96,
  loop = 'idle',
  entrance = true,
  onClick,
  tapSignal,
  alt,
  decorative,
}: GatorProps) {
  const reduceMotion = usePrefersReducedMotion();
  const [shot, setShot] = useState<Shot | null>(() =>
    entrance && !reduceMotion ? { kind: 'entrance' } : null,
  );
  const [shotMood, setShotMood] = useState(mood);
  if (shotMood !== mood) {
    // A one-shot belongs to the mood it started on: a new mood goes straight
    // to its loop, and the cut-short one-shot never comes back.
    setShotMood(mood);
    setShot(null);
  }

  // Each Tap gets a new run, which remounts the image so it plays from its first frame.
  const [taps, setTaps] = useState(0);
  // The run's tag comes from a module-wide counter: a remounted or second Gator
  // must not reuse a data URL an earlier Tap already played out in WebKit.
  const [tapRun, setTapRun] = useState(0);
  const startTap = () => {
    setTaps((n) => n + 1);
    setTapRun(++tapRuns);
    setShot({ kind: 'tap' });
  };
  const [seenSignal, setSeenSignal] = useState(tapSignal);
  if (seenSignal !== tapSignal) {
    setSeenSignal(tapSignal);
    startTap();
  }

  useEffect(() => {
    if (!shot) return;
    const id = setTimeout(() => setShot(null), ONE_SHOT_MS[shot.kind]);
    return () => clearTimeout(id);
  }, [shot]);

  // With reduced motion there are no one-shots at all.
  const active = !reduceMotion && shot ? shot.kind : null;
  const motion: GatorMotion = active ?? loop;
  const files = ART[mood]!;
  const layout = gatorLayout(mood, size);
  const loopSrc = files[loop]!;

  // Warm the cache with the loop while the one-shot plays, so the swap
  // doesn't show an empty box.
  useEffect(() => {
    new Image().src = loopSrc;
  }, [loopSrc]);

  // A pressable Gator will want its Tap at once, too.
  const tapSrc = onClick || tapSignal !== undefined ? files.tap : undefined;
  useEffect(() => {
    if (tapSrc) warmTap(mood, tapSrc);
  }, [mood, tapSrc]);
  // Re-resolves when the Tap text arrives (a re-render), but is not re-encoded on every render.
  const tapText = TAP_TEXT[mood];
  const tapDataSrc = useMemo(
    () => (motion === 'tap' ? tapRunSrc(mood, tapRun) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [motion === 'tap', mood, tapRun, tapText],
  );
  const src = tapDataSrc ?? files[motion];

  const Wrapper = onClick ? 'button' : 'span';
  return (
    <Wrapper
      {...(onClick
        ? {
            type: 'button' as const,
            onClick: () => {
              startTap();
              onClick();
            },
          }
        : {})}
      style={{
        ...(onClick
          ? {
              padding: 0,
              border: 0,
              background: 'none',
              font: 'inherit',
              color: 'inherit',
              cursor: 'pointer',
              verticalAlign: 'top',
            }
          : {}),
        // flow-root: the img's negative margin-top must not collapse out of
        // the span, or the art and the content after it shift up.
        display: 'flow-root',
        width: layout.box.width,
        height: layout.box.height,
      }}
    >
      <img
        key={taps}
        src={src}
        data-mood={mood}
        data-motion={motion}
        alt={decorative ? '' : alt}
        aria-hidden={decorative ? true : undefined}
        width={Math.round(layout.width)}
        style={{
          display: 'block',
          maxWidth: 'none',
          overflow: 'visible',
          width: layout.width,
          height: layout.height,
          marginTop: layout.marginTop,
          marginLeft: layout.marginLeft,
          marginRight: layout.marginRight,
          marginBottom: layout.marginBottom,
        }}
        draggable={false}
      />
    </Wrapper>
  );
}
