import { palette } from './themeVars';

/** A mix of two Theme colours, for legacy shades the Themes don't define. */
const mix = (a: string, percent: number, b: string) =>
  `color-mix(in srgb, ${a} ${percent}%, ${b})`;

const bg = palette('background-default');
const surface = palette('background-paper');
const ink = palette('text-primary');
const muted = palette('text-secondary');
const accent = palette('pp-accent');
const urgentBg = palette('error-light');
const urgentFg = palette('error-main');
const soonBg = palette('warning-light');
const soonFg = palette('warning-main');

/**
 * The legacy colour tokens from pocket-pantry-handoff/HANDOFF.md section 4,
 * kept in their old shape as a shim so existing importers follow the active
 * Theme unchanged. Each is a reference to a Theme variable
 * (`themes.ts`); legacy keys with no Theme token are mapped to the
 * nearest one or mixed from two. New code doesn't import this: it reads
 * colours through MUI (`theme.vars.palette`, sx paths like `'pp.accent'`) or
 * `color` / `palette()`, and other tokens through the themeVars helpers.
 */
export const tokens = {
  color: {
    bg,
    surface,
    ink,
    muted,
    line: palette('pp-line'),
    divider: palette('divider'),
    subtle: palette('pp-subtle'),
    chipNeutral: palette('pp-chip'),
    /** Greyed text of a checked-off row. */
    checkedText: muted,
    /** Border of an unchecked tick box. */
    tickBorder: palette('pp-box'),
    accent,
    /** The star colour: a middling verdict. */
    star: palette('pp-star'),
    accentHover: mix(accent, 82, ink),
    accentTint: palette('pp-accentTint'),
    /** Text on `accentTint`; plain `accent` can fall short of 4.5:1 there. */
    accentOnTint: palette('pp-accentOnTint'),
    accentMid: mix(accent, 55, surface),
    butter: palette('secondary-main'),
    butterInk: palette('secondary-contrastText'),
    urgentBg,
    urgentHover: mix(urgentBg, 85, urgentFg),
    urgentFg,
    urgentRow: mix(urgentBg, 45, surface),
    urgentBorder: mix(urgentBg, 75, urgentFg),
    soonBg,
    soonFg,
    soonHover: mix(soonBg, 85, soonFg),
    soonRow: mix(soonBg, 45, surface),
    soonIcon: soonFg,
    soonBorder: mix(soonBg, 60, soonFg),
    okBg: palette('success-light'),
    okFg: palette('success-main'),
  },
} as const;
