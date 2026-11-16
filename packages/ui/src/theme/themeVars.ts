import type { Theme } from '@mui/material/styles';

/**
 * The active Theme's tokens (docs/handoffs/themes/handoff.md section 3) as CSS
 * variable references, for `sx` and other string contexts. They resolve per
 * `data-theme`, so a forced subtree follows its own Theme. This is the typed
 * home for every non-colour token; colours come from MUI (`theme.vars`, sx
 * palette paths like `'pp.accent'`) or from `color` / `palette()` below.
 */
const pp = (name: string) => `var(--pp-${name})`;

/** A Theme colour from the active MUI colour scheme, e.g. `palette('pp-accent')`. */
export const palette = (path: string) => `var(--mui-palette-${path})`;

export const radius = {
  /** Cards, lists, sheets' inner panels. */
  card: pp('r-card'),
  /** Buttons, fields, segmented controls, small tiles. */
  control: pp('r-ctl'),
  /** Filter and suggestion chips. */
  chip: pp('r-chip'),
  /** The round Add button. */
  fab: pp('r-fab'),
  /** Checkboxes and tick boxes. */
  box: pp('r-box'),
  /** The floating dock. */
  dock: pp('r-dock'),
  /** Sheets and dialogs: one step rounder than the Theme's cards. */
  sheet: `calc(${pp('r-card')} + 8px)`,
  /** Header buttons and the gold key. */
  btn: pp('r-btn'),
  /** The Dock's mic / camera rocker. */
  cap: pp('r-cap'),
  /** Small labelled pills: the gain pill and the done pills. */
  tag: pp('r-tag'),
  /** Tags and pill buttons: round in every Theme. */
  pill: '999px',
} as const;

/** A radius for an element nested `gap` px inside one with `outer`, so the curves stay concentric. */
export const nestedRadius = (outer: string, gap: number) =>
  `max(2px, calc(${outer} - ${gap}px))`;

export const shadow = {
  card: pp('shadow-card'),
  /** Primary buttons and other accent-filled lifts. */
  button: pp('shadow-btn'),
  /** Sheets, popovers, toasts, the dock. */
  float: pp('shadow-float'),
  segment: pp('shadow-seg'),
} as const;

/** The Canopy (the green header band) and the working sheet it sits behind (Canopy handoff section 3). */
export const canopy = {
  /** The header's gradient; paint it with `background`. */
  bg: pp('canopy-bg'),
  /** The solid behind the header (overscroll, safe areas). */
  base: pp('canopy-base'),
  ink: pp('canopy-ink'),
  muted: pp('canopy-muted'),
  /** The working sheet's gradient; paint it with `background`. */
  sheetBg: pp('sheet-bg'),
  /** Upward shadow onto the Canopy plus a 1px inner highlight. */
  sheetShadow: pp('shadow-sheet'),
  /** The 170px gradient under the Dock, so lists dissolve. */
  sheetFade: pp('sheet-fade'),
  /** The working sheet's top corners. */
  sheetRadius: pp('r-sheet'),
  /** The header buttons' fill (labelled secondary actions and Back) and its 1px line. */
  chip: pp('canopy-chip'),
  chipLine: pp('canopy-chip-line'),
  /** The gold key: the page's primary action (the "+" and Save). Paint `keyBg` with `background`. */
  keyBg: pp('key-bg'),
  keyLine: pp('key-line'),
  keyShadow: pp('shadow-key'),
  goldInk: pp('gold-ink'),
  gold: pp('gold'),
  /** The glint copy of the texture. */
  texGlint: pp('tex-glint'),
  /** The 1px inner highlight on a header chip. */
  chipHighlight: 'inset 0 1px 0 rgba(255,255,255,.08)',
} as const;

/** Pantry Health on the Canopy: the dial's band ends and the lamps' windows and lit colours (always on the dark header). */
export const healthDial = {
  bad: pp('dial-bad'),
  good: pp('dial-good'),
} as const;

export const healthLamp = {
  expired: pp('lamp-expired'),
  soon: pp('lamp-soon'),
  low: pp('lamp-low'),
  fresh: pp('lamp-fresh'),
  stale: pp('lamp-stale'),
  window: pp('lamp-window'),
  windowOff: pp('lamp-window-off'),
} as const;

/** Bar and meter tracks. */
export const segOff = pp('seg-off');

/** The Dock (Canopy handoff section 3.5): the bar, its tabs, the gold mark and the mic / camera rocker. */
export const dock = {
  /** The bar's gradient; paint it with `background`. */
  bg: pp('dock-bg'),
  line: pp('dock-line'),
  shadow: pp('shadow-dock'),
  /** Active tab icon and label. */
  on: pp('dock-on'),
  /** Inactive tab icon and label. */
  off: pp('dock-off'),
  /** The active tab's mark. */
  mark: pp('gold'),
  /** The rocker's gold gradient; paint it with `background`. */
  capBg: pp('cap-bg'),
  capLine: pp('cap-line'),
  capShadow: pp('shadow-cap'),
  capInk: pp('cap-ink'),
  capDivider: pp('cap-div'),
} as const;

export const border = {
  width: pp('bw'),
  field: pp('bw-field'),
} as const;

/** The Theme's body face. */
export const bodyFont = pp('body');

/** The Theme's display face with its own weight and tracking, spread into `sx`. */
export const displayType = {
  fontFamily: pp('display'),
  fontWeight: pp('display-w'),
  letterSpacing: pp('display-ls'),
} as const;

/** Theme colours often needed as plain strings (borders, gradients, `style`). */
export const color = {
  primary: palette('primary-main'),
  primaryInk: palette('primary-contrastText'),
  /** Text and icons on an `accent` fill. */
  accentInk: palette('pp-accentInk'),
  /** Text and icons on an `accentTint` fill. */
  accentOnTint: palette('pp-accentOnTint'),
  lineStrong: palette('pp-lineStrong'),
  /** The recording colour (Voice Notes): the urgent foreground. */
  rec: palette('error-main'),
  box: palette('pp-box'),
  cardBg: palette('pp-cardBg'),
  cardLine: palette('pp-cardLine'),
  fieldBg: palette('pp-fieldBg'),
} as const;

/** A theme's palette as CSS variable references where MUI provides them (`theme.vars`), else as values. */
export const themePalette = (theme: Theme) => (theme.vars ?? theme).palette;
