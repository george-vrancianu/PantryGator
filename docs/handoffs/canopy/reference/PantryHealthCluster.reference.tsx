// Pantry health in the Home header — reference component for handoff.md §6.
// Not production code: it shows the geometry and the token wiring. Every number is copied from
// prototype.html (#C-Home, #C-Health-States, #C-Sheet-Health). Keyframes are in canopy.reference.css.
import type { CSSProperties, ReactNode } from 'react';
import { dialAngle, lightCountLabel, type HealthLight, type HealthLightId } from './healthLights';

// ---------------------------------------------------------------- dial

type Rgba = [number, number, number, number];

interface DialPalette {
  bad: string; // the red tip (first 15 % of the band)
  mid: Rgba; // band colour after the tip
  good: Rgba; // band colour at the full end
  tick: string; // the five scale dots
  needle: string;
  hub: string;
  hubRing: string; // 2 px ring that separates the hub from the needle
}

/** `canopy` sits on the green header and is the same in Light and Dark. `sheet` is for the Health sheet. */
export const DIAL_PALETTES: Record<'canopy' | 'sheetLight' | 'sheetDark', DialPalette> = {
  canopy: { bad: '#E8744D', mid: [244, 247, 241, 0.4], good: [232, 203, 124, 1], tick: 'rgba(244,247,241,.42)', needle: '#F4F7F1', hub: '#E8CB7C', hubRing: 'rgba(3,14,8,.55)' },
  // = --urgent-fg, --line-strong, --accent, --ink, --accent of the light theme
  sheetLight: { bad: '#A53A12', mid: [20, 30, 22, 0.2], good: [28, 106, 67, 1], tick: 'rgba(20,30,22,.4)', needle: '#141A16', hub: '#1C6A43', hubRing: '#F3F2EC' },
  // Not drawn. Derived from the dark theme's --urgent-fg, --line-strong, --accent, --ink.
  sheetDark: { bad: '#FFAB8E', mid: [255, 255, 255, 0.16], good: [127, 211, 160, 1], tick: 'rgba(255,255,255,.4)', needle: '#EEF2ED', hub: '#7FD3A0', hubRing: '#181E1A' },
};

const W = 92;
const H = 58;
const CX = 46;
const CY = 52;
const R = 48; // outer radius of the band
const SEGMENTS = 36;
const SWEEP = 120; // degrees, from −60 to +60

function point(t: number, r: number): [number, number] {
  const a = ((-60 + SWEEP * t) * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
}

/** Band thickness along the arc: 1.4 at the low end, 6.8 at the high end. */
function thickness(t: number): number {
  return 1.4 + 5.4 * Math.pow(Math.min(t, 1), 1.3);
}

function bandColour(t: number, p: DialPalette): string {
  if (t < 0.15) return p.bad;
  const k = Math.min(1, Math.max(0, (t - 0.42) / 0.5));
  const c = p.mid.map((m, i) => m + (p.good[i] - m) * k);
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${c[3].toFixed(2)})`;
}

export function HealthDial({ score, palette, animate = true }: { score: number; palette: DialPalette; animate?: boolean }) {
  const segments: ReactNode[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const t0 = i / SEGMENTS;
    const t1 = Math.min((i + 1) / SEGMENTS + 0.006, 1); // tiny overlap hides seams
    const [a, b, c, d] = [point(t0, R), point(t1, R), point(t1, R - thickness(t1)), point(t0, R - thickness(t0))];
    segments.push(
      <path key={i} d={`M${a[0].toFixed(2)} ${a[1].toFixed(2)} L${b[0].toFixed(2)} ${b[1].toFixed(2)} L${c[0].toFixed(2)} ${c[1].toFixed(2)} L${d[0].toFixed(2)} ${d[1].toFixed(2)} Z`} fill={bandColour((t0 + t1) / 2, palette)} />,
    );
  }
  const start = point(0, R - thickness(0) / 2);
  const end = point(1, R - thickness(1) / 2);
  const [gr, gg, gb] = palette.good;

  return (
    <div aria-hidden="true" style={{ position: 'relative', width: W, height: H, flex: 'none', overflow: 'hidden' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none" style={{ display: 'block' }}>
        {segments}
        {/* round ends */}
        <circle cx={start[0]} cy={start[1]} r={thickness(0) / 2} fill={palette.bad} />
        <circle cx={end[0]} cy={end[1]} r={thickness(1) / 2} fill={`rgb(${gr},${gg},${gb})`} />
        {/* five seed dots, the only scale */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const [x, y] = point(t, R - 13);
          return <circle key={t} cx={x} cy={y} r={1.1} fill={palette.tick} />;
        })}
      </svg>
      {/* The outer span holds the angle; the inner one plays the settle so the resting state needs no animation. */}
      <span style={{ position: 'absolute', left: 44, top: 12, width: 4, height: 40, display: 'block', transformOrigin: '50% 100%', transform: `rotate(${dialAngle(score).toFixed(1)}deg)`, transition: 'transform 700ms cubic-bezier(.2,.8,.2,1)' }}>
        <span className={animate ? 'pgC-needle' : undefined} style={{ display: 'block', width: '100%', height: '100%', transformOrigin: '50% 100%', background: palette.needle, clipPath: 'polygon(38% 0, 62% 0, 100% 100%, 0 100%)' }} />
      </span>
      <span style={{ position: 'absolute', left: 40.5, top: 46.5, width: 11, height: 11, display: 'block', borderRadius: '50%', background: palette.hub, boxShadow: `0 0 0 2px ${palette.hubRing}, inset 0 1px 0 rgba(255,255,255,.5)` }} />
    </div>
  );
}

// ---------------------------------------------------------------- lamps

/** Lit colour and the same colour as "r,g,b" for the glow. Tokens: --lamp-expired … --lamp-stale. */
const LAMP: Record<HealthLightId, { colour: string; rgb: string }> = {
  expired: { colour: '#FF7A5C', rgb: '255,122,92' },
  soon: { colour: '#F2C14E', rgb: '242,193,78' },
  low: { colour: '#F2C14E', rgb: '242,193,78' },
  fresh: { colour: '#86E0A6', rgb: '134,224,166' },
  stale: { colour: '#B9CBD6', rgb: '185,203,214' },
};

/** `icon` is the 22 px pictogram for this light (icons-additions.ts), stroke 1.7, drawn in currentColor. */
export function HealthLamp({ light, icon, size = 40 }: { light: HealthLight; icon: ReactNode; size?: number }) {
  const { colour, rgb } = LAMP[light.id];
  const count = lightCountLabel(light);
  const windowStyle: CSSProperties = light.on
    ? { background: `radial-gradient(circle at 50% 45%, rgba(${rgb},.24) 0%, rgba(${rgb},0) 78%), var(--lamp-window)`, border: `1px solid rgba(${rgb},.42)` }
    : { background: 'var(--lamp-window-off)', border: '1px solid rgba(255,255,255,.09)' };
  return (
    <span aria-hidden="true" style={{ position: 'relative', width: size, height: size, flex: 'none', boxSizing: 'border-box', display: 'grid', placeItems: 'center', borderRadius: 7, boxShadow: 'inset 0 1px 3px rgba(0,0,0,.5)', ...windowStyle }}>
      {light.on ? (
        <span style={{ display: 'block', color: colour, filter: `drop-shadow(0 0 5px rgba(${rgb},.75))` }}>{icon}</span>
      ) : (
        // An unlit lamp keeps its pictogram at 20 % and flashes once when the header appears (the lamp check).
        <span className="pgC-bulb" style={{ display: 'block', color: 'var(--canopy-ink)', opacity: 0.2 }}>{icon}</span>
      )}
      {count && <span style={{ position: 'absolute', right: 4, bottom: 3, font: '800 11px/1 var(--display)', color: colour }}>{count}</span>}
    </span>
  );
}

// ---------------------------------------------------------------- cluster

export interface PantryHealthClusterProps {
  score: number;
  /** dashboard:health.verdict.* */
  verdict: string;
  /** "3 to do · Toss 3 expired", or dashboard:health.nothingToDo */
  summary: string;
  lights: HealthLight[];
  iconFor: (id: HealthLightId) => ReactNode;
  /** The full sentence a screen reader hears; see handoff.md §6.6. */
  accessibleName: string;
  onOpen: () => void;
}

/** One button: the dial with its caption on the left, verdict, summary and the row of lights on the right. */
export function PantryHealthCluster({ score, verdict, summary, lights, iconFor, accessibleName, onOpen }: PantryHealthClusterProps) {
  return (
    <button type="button" aria-haspopup="dialog" aria-label={accessibleName} onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', padding: 0, border: 0, background: 'none', textAlign: 'left', color: 'var(--canopy-ink)', cursor: 'pointer' }}>
      <span style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
        <HealthDial score={score} palette={DIAL_PALETTES.canopy} />
        <span style={{ font: '700 11px/1 var(--body)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)' }}>Pantry health</span>
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ font: '800 20px/1.05 var(--display)', letterSpacing: '-0.03em', whiteSpace: 'nowrap' }}>{verdict}</span>
          <span style={{ font: '500 12.5px/1.2 var(--body)', color: 'var(--canopy-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</span>
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          {lights.map((light) => (
            <HealthLamp key={light.id} light={light} icon={iconFor(light.id)} />
          ))}
        </span>
      </span>
    </button>
  );
}
