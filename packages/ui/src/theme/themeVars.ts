import type { Theme } from '@mui/material/styles';

/**
 * The active Theme's tokens (`themes.ts`) as CSS
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
  /** The raised segment inside a Canopy track. */
  seg: '5px',
  /** The Canopy's count badge (Tags). */
  badge: '4px',
  /** A segment of the 4 px stock bar. */
  bar: '1px',
  /** The Dock's mic / camera rocker. */
  cap: pp('r-cap'),
  /** Small labelled pills: the gain pill and the done pills. */
  tag: pp('r-tag'),
  /** Tags and pill buttons: round in every Theme. */
  pill: '999px',
  /** A layer that takes its parent's corners (the Health lamp's glow layers). */
  inherit: 'inherit',
  /** The Health lamp's case. */
  lamp: '7px',
  /** The Gator bubble's count badge. */
  bubbleBadge: '10px',
  /** The Gator bubble's speech label. */
  bubbleLabel: '8px',
  /** The sheet's grab handle. */
  handle: '2px',
  /** The Canopy sheet: rounded on top only. */
  sheetTop: `${pp('r-sheet')} ${pp('r-sheet')} 0 0`,
  /** The Intro's sheet over the Canopy: 22 in every Theme (Canopy handoff 2.2, 7.8). */
  introSheet: '22px 22px 0 0',
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
  /** A tile recessed into the sheet (the empty Meal plan's icon tile). */
  recess: pp('shadow-well'),
  /** The selected Location chip's lift. */
  chipOn: '0 6px 10px -6px rgba(10,16,12,.6)',
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
  /** The same gradient's top colour, flat: fill for bars that stick to the sheet's top. */
  sheetTop: pp('sheet-top'),
  /** Upward shadow onto the Canopy plus a 1px inner highlight. */
  sheetShadow: pp('shadow-sheet'),
  /** The dim behind a bottom sheet. */
  scrim: pp('scrim'),
  /** The 170px gradient under the Dock, so lists dissolve. */
  sheetFade: pp('sheet-fade'),
  /** The working sheet's top corners. */
  sheetRadius: pp('r-sheet'),
  /** The header buttons' fill (labelled secondary actions and Back) and its 1px line. */
  chip: pp('canopy-chip'),
  chipLine: pp('canopy-chip-line'),
  /** The 1px rules on the Canopy (between the Recipe facts). */
  line: pp('canopy-line'),
  /** The gold key: the page's primary action (the "+" and Save). Paint `keyBg` with `background`. */
  keyBg: pp('key-bg'),
  keyLine: pp('key-line'),
  keyShadow: pp('shadow-key'),
  goldInk: pp('gold-ink'),
  gold: pp('gold'),
  /** A gold-outlined tag on the Canopy (the "Your family's" tag on a Recipe): its fill and 1px line. */
  goldTint: 'rgba(232,203,124,.16)',
  goldLine: 'rgba(232,203,124,.4)',
  /** The glint copy of the texture. */
  texGlint: pp('tex-glint'),
  /** The 1px inner highlight on a header chip. */
  chipHighlight: 'inset 0 1px 0 rgba(255,255,255,.08)',
  /** The search field and tracks recessed into the header, with their line and inner shadow. */
  field: pp('canopy-field'),
  fieldLine: pp('canopy-field-line'),
  fieldShadow: pp('shadow-canopy-field'),
  /** The raised segment of a track on the header (Settings You / Family): fixed cream with dark text in both Themes, as the Canopy is always dark. */
  segOn: '#F8F7F2',
  segOnInk: '#141A16',
  /** The soft gold glow behind Gator on the Intro, and the blurred shadow under it. */
  glow: 'radial-gradient(circle, rgba(232,203,124,.20) 0%, rgba(232,203,124,0) 68%)',
  floorShadow: 'rgba(0,0,0,.5)',
  /** The dark green tile behind Gator's face in a sheet header (Voice Review), always dark. */
  gatorTile: 'radial-gradient(circle at 50% 28%, #3A6E50 0%, #173323 100%)',
  gatorTileShadow: '0 8px 14px -8px rgba(3,14,8,.7)',
  /** A progress bar's track on the header, with its inner shadow. */
  progressTrack: 'rgba(255,255,255,.16)',
  progressShadow: 'inset 0 1px 1px rgba(0,0,0,.3)',
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
  /** The recess shadow inside an unlit or lit window. */
  windowShadow: 'inset 0 1px 3px rgba(0,0,0,.5)',
} as const;

/** Alpha masks (black is the visible part, so these are not Theme colours): the Canopy texture's fade and its moving window, and the Location chips' right-edge fade. */
export const mask = {
  textureFade:
    'linear-gradient(205deg, #000 8%, rgba(0, 0, 0, 0.5) 55%, rgba(0, 0, 0, 0.2) 100%)',
  textureWindow:
    'linear-gradient(100deg, transparent 0%, #000 50%, transparent 100%)',
  chipsEdge: 'linear-gradient(90deg, #000 84%, transparent 100%)',
} as const;

/** The Dashboard's one dark "hero" card (the Shopping tile; gold with dark text in Dark): fill, edge, lift and its text colours. */
export const hero = {
  /** Paint it with `background`. */
  bg: pp('hero-bg'),
  line: pp('hero-line'),
  shadow: pp('shadow-hero'),
  ink: pp('hero-ink'),
  /** The big number. */
  num: pp('hero-num'),
  muted: pp('hero-muted'),
} as const;

/** The three segments of the Pantry tile's Location bar. */
export const stockBar = {
  second: pp('seg-mid'),
  third: '#C9A545',
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
  /** The second ink: captions and unselected text a step softer than the ink. */
  ink2: pp('ink-2'),
  /** The recording colour (Voice Notes): the urgent foreground. */
  rec: palette('error-main'),
  box: palette('pp-box'),
  cardBg: palette('pp-cardBg'),
  cardLine: palette('pp-cardLine'),
  fieldBg: palette('pp-fieldBg'),
} as const;

/** A theme's palette as CSS variable references where MUI provides them (`theme.vars`), else as values. */
export const themePalette = (theme: Theme) => (theme.vars ?? theme).palette;
