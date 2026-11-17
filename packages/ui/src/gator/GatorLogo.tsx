import ButtonBase from '@mui/material/ButtonBase';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEventHandler,
} from 'react';
import { usePrefersReducedMotion } from '../theme/usePrefersReducedMotion';
import { ONE_SHOT_MS } from './Gator';
import { focusRingStyle } from '../theme/focusRing';
import { canopy, radius } from '../theme/themeVars';
import logoArt from './art/app-logo-static.svg?raw';
import { LOGO_DARK_RIM } from './art/logoArt';

export type GatorLogoProps = {
  /** Accessible name of the button, e.g. "Refresh". */
  label: string;
  onClick?: MouseEventHandler<HTMLElement>;
  /** Makes the mark a link to `href` (the header's way back to Home) instead of a button. */
  href?: string;
  /** The mark's size in px; the tile, and the art inside it, is 6 px larger: 38 in the app header, a 44 px tile as tall as the header buttons; 42 for a larger mark. */
  size?: 38 | 42;
  /** A counter that rises on each successful refresh; each rise plays the head-only re-entrance. */
  successCount?: number;
};

/**
 * The art's inner markup (defs and rig) without its outer `<svg>`, so the component owns the element and its ids.
 * The art's olive tile and its rim are dropped and its clip widened to the whole viewBox: the button is the
 * tile, in the Canopy's dark green with the header buttons' corners, and clips the head itself.
 */
const ART_INNER = logoArt
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(
    /<rect x="6" y="6" width="188" height="188" rx="44" fill="[^"]*"\/>/,
    '',
  )
  .replace(/<rect x="7\.5" y="7\.5"[^>]*\/>/, '')
  .replace(
    /(<clipPath id="clipTile[^"]*">)<rect[^>]*\/>/,
    '$1<rect width="200" height="200"/>',
  );

/** What the mark is doing; `data-motion` carries it. */
export type GatorLogoMotion = 'entrance' | 'reentrance' | 'idle' | 'tap';
type OneShot = Exclude<GatorLogoMotion, 'idle'>;

/** The Entrance plays for the first mark mounted in an app load only. */
let entrancePlayed = false;
/** Test-only: forget that the Entrance has played. */
export function resetGatorLogoEntrance() {
  entrancePlayed = false;
}

const ONE_SHOT_DURATION: Record<OneShot, number> = {
  ...ONE_SHOT_MS,
  // Same 1.3 s keyframes as the Entrance, head only.
  reentrance: ONE_SHOT_MS.entrance,
};

/** Keyframes ported from the app-icon art; the tile never moves in idle or Tap. */
const KEYFRAMES = {
  '@keyframes glBreathe': {
    '0%,100%': { transform: 'scale(1,1)' },
    '50%': { transform: 'scale(1.006,1.022)' },
  },
  '@keyframes glBlink': {
    '0%,90%,97%,100%': { transform: 'scaleY(1)' },
    '93.5%': { transform: 'scaleY(.08)' },
  },
  '@keyframes glHatSway': {
    '0%,100%': { transform: 'rotate(0)' },
    '50%': { transform: 'rotate(-4deg)' },
  },
  '@keyframes glTileIn': {
    '0%': { opacity: 0, transform: 'scale(.6)' },
    '18%': { opacity: 1 },
    '40%': { transform: 'scale(1.06)' },
    '60%,100%': { transform: 'none', opacity: 1 },
  },
  '@keyframes glRise': {
    '0%,30%': { transform: 'translateY(70%)' },
    '68%': { transform: 'translateY(-6%)' },
    '86%': { transform: 'translateY(2%)' },
    '100%': { transform: 'none' },
  },
  '@keyframes glHatLand': {
    '0%,45%': { transform: 'translateY(-40px) rotate(-14deg)', opacity: 0 },
    '75%': { transform: 'translateY(2px)', opacity: 1 },
    '100%': { transform: 'none', opacity: 1 },
  },
  '@keyframes glBoing': {
    '0%,100%': { transform: 'none' },
    '15%': { transform: 'scale(1.1,.88)' },
    '40%': { transform: 'translateY(-22px) scale(.94,1.1)' },
    '62%': { transform: 'translateY(0) scale(1.08,.9)' },
    '80%': { transform: 'scale(.98,1.02)' },
  },
  '@keyframes glHatHop': {
    '0%,20%,100%': { transform: 'none' },
    '44%': { transform: 'translateY(-10px) rotate(-14deg)' },
    '66%': { transform: 'translateY(-2px) rotate(5deg)' },
    '84%': { transform: 'none' },
  },
  '@keyframes glSquint': {
    '0%,80%,100%': { transform: 'scaleY(1)' },
    '12%,60%': { transform: 'scaleY(.15)' },
  },
} as const;

const MOTION_CSS = {
  ...KEYFRAMES,
  '& svg g[class]:not([transform])': { transformBox: 'fill-box' },
  '& .rig': { transformOrigin: '50% 50%' },
  '& .head': { transformOrigin: '45% 95%' },
  '& .hat': { transformOrigin: '50% 100%' },
  '& .eye': { transformOrigin: '50% 55%' },
  '&[data-motion="idle"] .head': {
    animation: 'glBreathe 3.2s ease-in-out infinite',
  },
  '&[data-motion="idle"] .eye': { animation: 'glBlink 4.4s infinite' },
  '&[data-motion="idle"] .eye-far': { animationDelay: '.04s' },
  '&[data-motion="idle"] .hat': {
    animation: 'glHatSway 3.2s ease-in-out infinite',
  },
  '&[data-motion="entrance"] .rig': {
    animation: 'glTileIn 1.3s linear 1 both',
  },
  '&[data-motion="entrance"] .head': {
    animation: 'glRise 1.3s linear 1 both',
  },
  '&[data-motion="entrance"] .hat': {
    animation: 'glHatLand 1.3s linear 1 both',
  },
  '&[data-motion="reentrance"] .head': {
    animation: 'glRise 1.3s linear 1 both',
  },
  '&[data-motion="reentrance"] .hat': {
    animation: 'glHatLand 1.3s linear 1 both',
  },
  '&[data-motion="tap"] .head': { animation: 'glBoing .9s linear 1 both' },
  '&[data-motion="tap"] .hat': { animation: 'glHatHop .9s linear 1 both' },
  '&[data-motion="tap"] .eye': { animation: 'glSquint .9s linear 1 both' },
  '@media (prefers-reduced-motion: reduce)': {
    '& svg *': { animation: 'none !important' },
  },
};

/**
 * The app mark as a button (or a link, with `href`): the Gator head clipped inside a header tile, drawn inline so the Dark
 * theme can give the head a light rim and drop its shadow (CSS can't reach inside an `<img>`).
 * The tile is Gator's dark green Canopy tile in every theme, with the header buttons' corners and line.
 */
export function GatorLogo({
  label,
  onClick,
  href,
  size = 38,
  successCount = 0,
}: GatorLogoProps) {
  const reduceMotion = usePrefersReducedMotion();
  const [shot, setShot] = useState<OneShot | null>(() =>
    !entrancePlayed && !reduceMotion ? 'entrance' : null,
  );
  // Each Tap restarts the animation by remounting the svg.
  const [taps, setTaps] = useState(0);
  const seenSuccess = useRef(successCount);
  const pendingReentrance = useRef(false);
  useEffect(() => {
    if (successCount > seenSuccess.current && !reduceMotion) {
      // The Tap that started the refresh plays out first; the timer below hands over.
      if (shot === 'tap') pendingReentrance.current = true;
      else setShot('reentrance');
    }
    seenSuccess.current = successCount;
    // Only the count changing matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successCount]);
  useEffect(() => {
    entrancePlayed = true;
  }, []);
  useEffect(() => {
    if (!shot) return;
    const id = setTimeout(() => {
      const next = pendingReentrance.current;
      pendingReentrance.current = false;
      setShot(next ? 'reentrance' : null);
    }, ONE_SHOT_DURATION[shot]);
    return () => clearTimeout(id);
  }, [shot, taps]);
  // With reduced motion there are no one-shots at all.
  const motion: GatorLogoMotion = !reduceMotion && shot ? shot : 'idle';
  const suffix = useId().replace(/:/g, '');
  const markup = ART_INNER.replaceAll('-app-icon', `-logo${suffix}`);
  const box = size + 6;
  return (
    <ButtonBase
      disableRipple
      {...(href ? { href } : { type: 'button' })}
      aria-label={label}
      data-motion={motion}
      onClick={(e) => {
        setTaps((n) => n + 1);
        pendingReentrance.current = false;
        setShot('tap');
        onClick?.(e);
      }}
      sx={{
        ...MOTION_CSS,
        flexShrink: 0,
        width: box,
        height: box,
        p: 0,
        m: 0,
        boxSizing: 'border-box',
        border: `1px solid ${canopy.chipLine}`,
        borderRadius: radius.btn,
        overflow: 'hidden',
        background: canopy.gatorTile,
        boxShadow: canopy.chipHighlight,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        WebkitTapHighlightColor: 'transparent',
        '&:focus-visible': focusRingStyle,
        '[data-theme="dark"] & .head': { filter: 'none' },
        '[data-theme="dark"] & .hd': {
          stroke: LOGO_DARK_RIM,
          strokeWidth: 2.5,
          strokeOpacity: 0.35,
        },
      }}
    >
      <svg
        key={taps}
        viewBox="0 0 200 200"
        width={box}
        height={box}
        aria-hidden="true"
        focusable="false"
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    </ButtonBase>
  );
}
