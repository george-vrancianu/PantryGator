import { outlinedInputClasses } from '@mui/material/OutlinedInput';
import {
  createTheme,
  type PaletteOptions,
  type Theme,
} from '@mui/material/styles';
import type { CSSProperties, ElementType } from 'react';
import {
  THEME_IDS,
  THEME_META,
  THEMES,
  type ThemeId,
  type ThemeTokens,
} from './themes';
import { aisleTintCssVariables } from './aisleTints';
import {
  bodyFont,
  border,
  displayType,
  palette,
  radius,
  themePalette,
} from './themeVars';

declare module '@mui/material/styles' {
  interface TypographyVariants {
    stat: CSSProperties;
    sectionLabel: CSSProperties;
    meta: CSSProperties;
  }
  interface TypographyVariantsOptions {
    stat?: CSSProperties;
    sectionLabel?: CSSProperties;
    meta?: CSSProperties;
  }
  /** Handoff colour tokens with no standard MUI palette key, emitted as `--mui-palette-pp-<key>`. */
  interface PpPalette {
    subtle: string;
    line: string;
    lineStrong: string;
    chip: string;
    accent: string;
    accentInk: string;
    accentTint: string;
    accentOnTint: string;
    box: string;
    star: string;
    cardBg: string;
    cardLine: string;
    fieldBg: string;
    segOn: string;
    segOnInk: string;
    toastBg: string;
    toastInk: string;
    toastAction: string;
    dockBg: string;
    bezel: string;
    tomato: string;
    carrot: string;
    leaf: string;
  }
  interface Palette {
    pp: PpPalette;
  }
  interface PaletteOptions {
    pp?: PpPalette;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    stat: true;
    sectionLabel: true;
    meta: true;
  }
}

/** The tokens `schemePalette` maps into the MUI palette; every other key is a `--pp-*` variable. */
const PALETTE_TOKENS: ReadonlySet<keyof ThemeTokens> = new Set([
  'primary',
  'accent-tint',
  'primary-ink',
  'butter',
  'butter-ink',
  'urgent-fg',
  'urgent-bg',
  'soon-fg',
  'soon-bg',
  'ok-fg',
  'ok-bg',
  'bg',
  'surface',
  'ink',
  'muted',
  'divider',
  'subtle',
  'line',
  'line-strong',
  'chip',
  'accent',
  'accent-ink',
  'accent-on-tint',
  'box',
  'star',
  'card-bg',
  'card-line',
  'field-bg',
  'seg-on',
  'seg-on-ink',
  'toast-bg',
  'toast-ink',
  'toast-action',
  'dock-bg',
  'bezel',
  'pg-tomato',
  'pg-carrot',
  'pg-leaf',
]);

/** One Theme's palette: the matching handoff tokens in MUI's standard keys, the rest under `pp`. */
function schemePalette(id: ThemeId): PaletteOptions {
  const t = THEMES[id];
  return {
    mode: THEME_META[id].scheme,
    primary: {
      main: t.primary,
      light: t['accent-tint'],
      contrastText: t['primary-ink'],
    },
    secondary: { main: t.butter, contrastText: t['butter-ink'] },
    error: { main: t['urgent-fg'], light: t['urgent-bg'] },
    warning: { main: t['soon-fg'], light: t['soon-bg'] },
    success: { main: t['ok-fg'], light: t['ok-bg'] },
    background: { default: t.bg, paper: t.surface },
    text: { primary: t.ink, secondary: t.muted },
    divider: t.divider,
    pp: {
      subtle: t.subtle,
      line: t.line,
      lineStrong: t['line-strong'],
      chip: t.chip,
      accent: t.accent,
      accentInk: t['accent-ink'],
      accentTint: t['accent-tint'],
      accentOnTint: t['accent-on-tint'],
      box: t.box,
      star: t.star,
      cardBg: t['card-bg'],
      cardLine: t['card-line'],
      fieldBg: t['field-bg'],
      segOn: t['seg-on'],
      segOnInk: t['seg-on-ink'],
      toastBg: t['toast-bg'],
      toastInk: t['toast-ink'],
      toastAction: t['toast-action'],
      dockBg: t['dock-bg'],
      bezel: t.bezel,
      tomato: t['pg-tomato'],
      carrot: t['pg-carrot'],
      leaf: t['pg-leaf'],
    },
  };
}

/**
 * The tokens that need no MUI palette slot, written per Theme as `--pp-<key>`
 * (MUI doesn't vary these per scheme): the non-colour tokens, and the Canopy
 * tokens that are gradients, shadows or translucent fills.
 */
const NON_COLOUR_TOKENS = (
  Object.keys(THEMES.light) as (keyof ThemeTokens)[]
).filter((key) => !PALETTE_TOKENS.has(key));

/** The attribute selector that puts the root, or any subtree, into a Theme. */
export function themeSelector(id: ThemeId | '%s') {
  return `[data-theme="${id}"]`;
}

/** `--pp-*` variables (non-colour tokens and Aisle tints) per Theme selector; Light is also the `:root` default. */
export function ppCssVariables(): Record<string, Record<string, string>> {
  const styles: Record<string, Record<string, string>> = {};
  for (const id of THEME_IDS) {
    const vars: Record<string, string> = {};
    for (const key of NON_COLOUR_TOKENS) vars[`--pp-${key}`] = THEMES[id][key];
    Object.assign(vars, aisleTintCssVariables(id));
    const selector =
      id === 'light' ? `:root, ${themeSelector(id)}` : themeSelector(id);
    styles[selector] = vars;
  }
  return styles;
}

/** An Alert's background and text: the Theme's ok, soon or urgent pair. */
function statusPair(theme: Theme, key: 'success' | 'warning' | 'error') {
  const { light, main } = themePalette(theme)[key];
  return {
    backgroundColor: light,
    color: main,
    '& .MuiAlert-icon': { color: main },
  };
}

export type ThemeOptions = {
  /** Component used when a button or link has an `href`, e.g. a router link. */
  linkComponent?: ElementType;
};

/**
 * The two Themes as MUI colour schemes over CSS variables. The active one is
 * picked by `data-theme` on the root, or on any subtree to force it there.
 * Breakpoints follow handoff section 9: phone < 600, 600-899, >= 900.
 */
export function createPocketPantryTheme({ linkComponent }: ThemeOptions = {}) {
  return createTheme({
    cssVariables: {
      colorSchemeSelector: themeSelector('%s'),
      cssVarPrefix: 'mui',
    },
    colorSchemes: {
      light: { palette: schemePalette('light') },
      dark: { palette: schemePalette('dark') },
    },
    defaultColorScheme: 'light',
    breakpoints: { values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 } },
    shape: { borderRadius: radius.control },
    typography: {
      fontFamily: bodyFont,
      fontSize: 15,
      htmlFontSize: 16,
      h1: { ...displayType, fontSize: 30, lineHeight: 1.05 },
      h2: { ...displayType, fontSize: 28, lineHeight: 1.1 },
      h3: { ...displayType, fontSize: 22, lineHeight: 1.15 },
      h4: { ...displayType, fontSize: 20, lineHeight: 1.15 },
      body1: { fontSize: 15, fontWeight: 500, lineHeight: 1.4 },
      body2: { fontSize: 15, fontWeight: 600, lineHeight: 1.4 },
      stat: { ...displayType, fontSize: 40, lineHeight: 1 },
      meta: { fontSize: 13, fontWeight: 500, lineHeight: 1.4 },
      caption: { fontSize: 12, fontWeight: 500, lineHeight: 1.4 },
      // Themes handoff section 4: 12/700 caps, .07 em, `muted`.
      sectionLabel: {
        color: palette('text-secondary'),
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        lineHeight: 1.4,
      },
      button: { fontSize: 15, fontWeight: 700, textTransform: 'none' },
    },
    components: {
      ...(linkComponent
        ? {
            MuiButtonBase: { defaultProps: { LinkComponent: linkComponent } },
            MuiLink: { defaultProps: { component: linkComponent } },
          }
        : {}),
      MuiTypography: {
        defaultProps: {
          variantMapping: {
            stat: 'p',
            meta: 'p',
            sectionLabel: 'p',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            transition: 'background-color 200ms, color 200ms, box-shadow 200ms',
          },
        },
      },
      // Handoff section 4 Field: `field-bg`, `bw-field` `line` border, radius
      // `r-ctl`; focus is an `accent` border with a 3 px `accent-tint` ring.
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }) => {
            const { pp } = themePalette(theme);
            return {
              borderRadius: radius.control,
              backgroundColor: pp.fieldBg,
              minHeight: 50,
              fontWeight: 500,
              [`&:hover:not(.Mui-focused, .Mui-error) .${outlinedInputClasses.notchedOutline}`]:
                { borderColor: pp.lineStrong },
              '&.Mui-focused': {
                boxShadow: `0 0 0 3px ${pp.accentTint}`,
                [`& .${outlinedInputClasses.notchedOutline}`]: {
                  borderColor: pp.accent,
                  borderWidth: border.field,
                },
              },
            };
          },
          notchedOutline: ({ theme }) => ({
            borderColor: themePalette(theme).pp.line,
            borderWidth: border.field,
          }),
        },
      },
      MuiInputLabel: {
        styleOverrides: { root: { fontWeight: 600 } },
      },
      // Status pairs straight from the Theme, rather than MUI's mixes of `main`.
      MuiAlert: {
        styleOverrides: {
          root: ({ theme }) => {
            const { pp } = themePalette(theme);
            return {
              borderRadius: radius.control,
              fontWeight: 500,
              variants: [
                ...(['success', 'warning', 'error'] as const).map(
                  (severity) => ({
                    props: { variant: 'standard', severity },
                    style: statusPair(theme, severity),
                  }),
                ),
                {
                  props: { variant: 'standard', severity: 'info' },
                  style: {
                    backgroundColor: pp.accentTint,
                    color: pp.accentOnTint,
                    '& .MuiAlert-icon': { color: pp.accentOnTint },
                  },
                },
              ],
            };
          },
        },
      },
    },
  });
}
