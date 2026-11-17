/**
 * The two Themes, Light and Dark, from the Canopy handoff
 * (docs/handoffs/canopy/tokens.canopy.ts) so future handoffs can be diffed
 * against it. Every Theme defines the same keys. This flat record is the
 * single source of truth: the MUI colour schemes, the `--pp-*` variables and
 * the pre-paint script are all built from it. Deliberate differences from the
 * handoff file: `ThemeMeta` has no `fonts.google` query (the fonts are
 * self-hosted, fonts.css), the `pg-*` ingredient hues of the reading art stay
 * (the handoff dropped them), and `applyTheme` is not copied (the MUI provider
 * writes the variables). `resolveTheme` lives in appearance.ts.
 */

export const THEME_IDS = ['light', 'dark'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeTokens {
  bg: string;
  surface: string;
  subtle: string;
  ink: string;
  muted: string;
  line: string;
  'line-strong': string;
  divider: string;
  chip: string;
  accent: string;
  'accent-ink': string;
  'accent-tint': string;
  'accent-on-tint': string;
  primary: string;
  'primary-ink': string;
  butter: string;
  'butter-ink': string;
  /** Ingredient hues for the reading art. */
  'pg-tomato': string;
  'pg-carrot': string;
  'pg-leaf': string;
  'urgent-bg': string;
  'urgent-fg': string;
  'soon-bg': string;
  'soon-fg': string;
  'ok-bg': string;
  'ok-fg': string;
  box: string;
  star: string;
  'card-bg': string;
  'card-line': string;
  'field-bg': string;
  'seg-on': string;
  'seg-on-ink': string;
  'toast-bg': string;
  'toast-ink': string;
  'toast-action': string;
  'dock-bg': string;
  bezel: string;
  bw: string;
  'bw-field': string;
  'r-card': string;
  'r-ctl': string;
  'r-chip': string;
  'r-fab': string;
  'r-dock': string;
  'r-box': string;
  'shadow-card': string;
  'shadow-btn': string;
  'shadow-float': string;
  'shadow-seg': string;
  display: string;
  body: string;
  'display-w': string;
  'display-ls': string;
  // new with Canopy
  'ink-2': string;
  deco: string;
  'canopy-bg': string;
  'canopy-base': string;
  'canopy-ink': string;
  'canopy-muted': string;
  'canopy-line': string;
  'canopy-chip': string;
  'canopy-chip-line': string;
  'canopy-field': string;
  'canopy-field-line': string;
  'shadow-canopy-field': string;
  gold: string;
  'gold-ink': string;
  'tex-ink': string;
  'tex-glint': string;
  'sheet-bg': string;
  /** The sheet gradient's top stop, flat: for bars that stick to the sheet's top. */
  'sheet-top': string;
  'shadow-sheet': string;
  'sheet-fade': string;
  scrim: string;
  'well-bg': string;
  'shadow-well': string;
  'box-bg': string;
  'shadow-box': string;
  'btn-bg': string;
  'btn-line': string;
  'key-bg': string;
  'key-line': string;
  'shadow-key': string;
  'hero-bg': string;
  'hero-line': string;
  'shadow-hero': string;
  'hero-ink': string;
  'hero-num': string;
  'hero-muted': string;
  'seg-off': string;
  'seg-mid': string;
  'star-fill': string;
  'dock-line': string;
  'shadow-dock': string;
  'dock-on': string;
  'dock-off': string;
  'cap-bg': string;
  'cap-line': string;
  'shadow-cap': string;
  'cap-ink': string;
  'cap-div': string;
  'r-sheet': string;
  'r-btn': string;
  'r-cap': string;
  'r-tag': string;
  'lamp-expired': string;
  'lamp-soon': string;
  'lamp-low': string;
  'lamp-fresh': string;
  'lamp-stale': string;
  'lamp-window': string;
  'lamp-window-off': string;
  'dial-bad': string;
  'dial-good': string;
  // the Gator bubble: the same in both Themes
  'bubble-ink': string;
  'bubble-grey-bg': string;
  'bubble-grey-fg': string;
  'bubble-green-bg': string;
  'bubble-green-fg': string;
  'bubble-red-bg': string;
  'bubble-red-fg': string;
  'bubble-ring-red': string;
  'bubble-ring-track': string;
  'bubble-origin': string;
  'bubble-disc': string;
  'bubble-face': string;
  'bubble-face-done': string;
  'bubble-shadow-drag': string;
  'bubble-shadow-done': string;
  'bubble-shadow-label': string;
}

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  scheme: 'light' | 'dark';
}

export const THEMES: Record<ThemeId, ThemeTokens> = {
  light: {
    bg: '#EDECE5', // flat fallback under the sheet gradient (its lower stop)
    surface: '#FFFFFF',
    subtle: '#E8E7DF', // recessed fill; same as well-bg
    ink: '#141A16',
    muted: '#586159',
    line: 'rgba(20,30,22,.09)',
    'line-strong': 'rgba(20,30,22,.20)',
    divider: 'rgba(20,30,22,.09)',
    chip: '#E8E7DF', // icon tiles and neutral chips
    accent: '#1C6A43',
    'accent-ink': '#FFFFFF',
    'accent-tint': '#E2F0E7',
    'accent-on-tint': '#1C5B3B',
    primary: '#1C6A43', // flat fallback of btn-bg
    'primary-ink': '#FFFFFF',
    butter: '#E8CB7C', // gold badge fill
    'butter-ink': '#2A2105',
    'pg-tomato': '#D5684A',
    'pg-carrot': '#E09A3B',
    'pg-leaf': '#6F9B4C',
    'urgent-bg': '#FBE5DB',
    'urgent-fg': '#A53A12',
    'soon-bg': '#F6EBC9',
    'soon-fg': '#775600',
    'ok-bg': '#E2F0E7',
    'ok-fg': '#1C5B3B',
    box: '#9EA69D', // tick box border
    star: '#B8912F', // Staple star outline
    'card-bg': '#FFFFFF',
    'card-line': 'rgba(20,30,22,.10)',
    'field-bg': '#E8E7DF', // fields are recessed wells
    'seg-on': '#FFFFFF',
    'seg-on-ink': '#141A16',
    'toast-bg': '#141A16', // derived (inverse surface, as today)
    'toast-ink': '#F4F7F1', // derived
    'toast-action': '#E8CB7C', // derived
    'dock-bg': 'linear-gradient(180deg, #262F29 0%, #121814 100%)',
    bezel: '#0A0E0B', // derived (prototype frames only)
    bw: '1px',
    'bw-field': '0px', // fields have no border; the edge comes from shadow-well
    'r-card': '8px',
    'r-ctl': '6px',
    'r-chip': '5px', // segments and filter chips; tags use r-tag
    'r-fab': '8px', // the gold "+" key button
    'r-dock': '12px',
    'r-box': '4px',
    'shadow-card':
      '0 1px 1px rgba(20,30,22,.05), 0 10px 20px -12px rgba(20,30,22,.32)',
    'shadow-btn':
      'inset 0 1px 0 rgba(255,255,255,.28), 0 1px 2px rgba(20,30,22,.3), 0 12px 20px -10px rgba(20,90,55,.9)',
    'shadow-float':
      '0 2px 4px rgba(10,16,12,.35), 0 14px 24px -8px rgba(10,16,12,.65)', // bubble, popovers
    'shadow-seg':
      '0 1px 2px rgba(10,16,12,.25), 0 6px 10px -6px rgba(10,16,12,.45)',
    display: "'Schibsted Grotesk',ui-sans-serif,system-ui,sans-serif",
    body: "'Figtree',ui-sans-serif,system-ui,sans-serif",
    'display-w': '800',
    'display-ls': '-0.035em',
    // ---- new with Canopy ----
    'ink-2': '#2B332D', // second ink: icons in tiles, unselected chip text
    deco: '#A3AAA1', // decorative grey: empty star, strike-through line
    'canopy-bg':
      'radial-gradient(95% 85% at 100% 0%, #336649 0%, rgba(51,102,73,0) 64%), linear-gradient(165deg, #1F4631 0%, #133022 56%, #0D2217 100%)', // the green header
    'canopy-base': '#0D2217', // solid behind the header (overscroll, safe areas)
    'canopy-ink': '#F4F7F1',
    'canopy-muted': 'rgba(244,247,241,.76)',
    'canopy-line': 'rgba(255,255,255,.14)',
    'canopy-chip': 'rgba(255,255,255,.09)', // header buttons
    'canopy-chip-line': 'rgba(255,255,255,.14)',
    'canopy-field': 'rgba(3,14,8,.34)', // search field and tracks inside the header
    'canopy-field-line': 'rgba(255,255,255,.13)',
    'shadow-canopy-field': 'inset 0 1px 3px rgba(0,0,0,.4)',
    gold: '#E8CB7C',
    'gold-ink': '#2A2105',
    'tex-ink': '#F4F7F1', // page texture lines
    'tex-glint': '#F6E7B4', // the glint copy of the texture
    'sheet-bg': 'linear-gradient(180deg, #F8F7F2 0%, #EDECE5 100%)', // working sheet and bottom sheets
    'sheet-top': '#F8F7F2',
    'shadow-sheet': '0 -16px 32px -12px rgba(3,14,8,.6), inset 0 1px 0 #FFFFFF',
    'sheet-fade':
      'linear-gradient(180deg, rgba(237,236,229,0) 0%, rgba(237,236,229,.94) 58%, #EDECE5 100%)', // lists dissolve under the Dock
    scrim: 'rgba(5,14,9,.58)', // behind bottom sheets
    'well-bg': '#E8E7DF',
    'shadow-well':
      'inset 0 1px 2px rgba(20,30,22,.18), inset 0 0 0 1px rgba(20,30,22,.05)',
    'box-bg': '#F4F3EE', // empty tick box
    'shadow-box': 'inset 0 1px 2px rgba(20,30,22,.16)',
    'btn-bg': 'linear-gradient(180deg, #2A8257 0%, #1A6540 100%)', // primary button
    'btn-line': 'rgba(6,36,20,.6)',
    'key-bg': 'linear-gradient(180deg, #F5E0A2 0%, #D9B85C 100%)', // gold key button
    'key-line': 'rgba(70,52,0,.55)',
    'shadow-key':
      'inset 0 1px 0 rgba(255,255,255,.65), 0 2px 3px rgba(3,14,8,.4), 0 12px 20px -8px rgba(3,14,8,.7)',
    'hero-bg': 'linear-gradient(160deg, #222B25 0%, #0F1411 100%)', // the Shopping tile on Home
    'hero-line': '#0A0E0B',
    'shadow-hero':
      'inset 0 1px 0 rgba(255,255,255,.12), 0 1px 2px rgba(10,16,12,.3), 0 16px 24px -14px rgba(10,16,12,.85)',
    'hero-ink': '#F4F7F1',
    'hero-num': '#E8CB7C',
    'hero-muted': 'rgba(244,247,241,.8)',
    'seg-off': 'rgba(20,30,22,.12)', // bar and meter tracks
    'seg-mid': '#7DB596', // second segment of the Pantry stock bar
    'star-fill': '#D9B85C',
    'dock-line': 'rgba(255,255,255,.09)',
    'shadow-dock':
      'inset 0 1px 0 rgba(255,255,255,.12), 0 2px 4px rgba(10,16,12,.35), 0 16px 26px -10px rgba(10,16,12,.65), 0 36px 54px -18px rgba(10,16,12,.75)',
    'dock-on': '#FFFFFF',
    'dock-off': 'rgba(244,247,241,.68)',
    'cap-bg': 'linear-gradient(180deg, #F5E0A2 0%, #D6B458 100%)', // the mic / camera rocker
    'cap-line': 'rgba(70,52,0,.6)',
    'shadow-cap':
      'inset 0 1px 0 rgba(255,255,255,.7), 0 2px 3px rgba(10,16,12,.45), 0 12px 20px -8px rgba(10,16,12,.7)',
    'cap-ink': '#2A2105',
    'cap-div': 'rgba(42,33,5,.28)',
    'r-sheet': '18px',
    'r-btn': '8px', // primary buttons and header controls
    'r-cap': '10px',
    'r-tag': '3px',
    'lamp-expired': '#FF7A5C', // Pantry health lights (always on the dark header)
    'lamp-soon': '#F2C14E',
    'lamp-low': '#F2C14E',
    'lamp-fresh': '#86E0A6',
    'lamp-stale': '#B9CBD6',
    'lamp-window': '#0B1C13', // lit lamp window
    'lamp-window-off': '#0D2016', // unlit lamp window
    'dial-bad': '#E8744D', // health dial on the header: red tip
    'dial-good': '#E8CB7C', // health dial on the header: full end
    'bubble-ink': '#101511',
    'bubble-grey-bg': '#F4F7F1',
    'bubble-grey-fg': '#141A16',
    'bubble-green-bg': '#1C6A43',
    'bubble-green-fg': '#FFFFFF',
    'bubble-red-bg': '#B93A14',
    'bubble-red-fg': '#FFFFFF',
    'bubble-ring-red': '#F0693A',
    'bubble-ring-track': 'rgba(244,247,241,.14)',
    'bubble-origin': 'rgba(20,30,22,.42)',
    'bubble-disc': 'linear-gradient(180deg, #262F29, #121814)',
    'bubble-face': 'radial-gradient(circle at 50% 40%, #3A6E50, #173323)',
    'bubble-face-done': '#FBF3DA',
    'bubble-shadow-drag':
      '0 4px 8px rgba(10,16,12,.4), 0 22px 32px -8px rgba(10,16,12,.75)',
    'bubble-shadow-done':
      '0 0 0 6px rgba(232,203,124,.35), 0 2px 4px rgba(10,16,12,.35), 0 14px 24px -8px rgba(10,16,12,.65)',
    'bubble-shadow-label': '0 2px 4px rgba(10,16,12,.35)',
  },
  dark: {
    bg: '#101511', // flat fallback under the sheet gradient (its lower stop)
    surface: '#1E2621',
    subtle: '#0D120F', // recessed fill; same as well-bg
    ink: '#EEF2ED',
    muted: '#9DA89F',
    line: 'rgba(255,255,255,.07)',
    'line-strong': 'rgba(255,255,255,.16)',
    divider: 'rgba(255,255,255,.07)',
    chip: '#0D120F', // icon tiles and neutral chips
    accent: '#7FD3A0',
    'accent-ink': '#06140B',
    'accent-tint': '#1C3327',
    'accent-on-tint': '#A8E6C0',
    primary: '#1C6A43', // derived
    'primary-ink': '#FFFFFF',
    butter: '#E8CB7C', // gold badge fill
    'butter-ink': '#2A2105',
    'pg-tomato': '#E07A5C',
    'pg-carrot': '#EBAA4C',
    'pg-leaf': '#86B562',
    'urgent-bg': '#3A2118',
    'urgent-fg': '#FFAB8E',
    'soon-bg': '#352C13',
    'soon-fg': '#EDD084',
    'ok-bg': '#1C3327',
    'ok-fg': '#A8E6C0',
    box: '#5F6A62', // tick box border
    star: '#E8CB7C', // derived
    'card-bg': '#1E2621',
    'card-line': 'rgba(255,255,255,.07)',
    'field-bg': '#0D120F', // fields are recessed wells
    'seg-on': '#1E2621', // derived
    'seg-on-ink': '#EEF2ED',
    'toast-bg': '#EEF2ED', // derived (inverse surface, as today)
    'toast-ink': '#101511', // derived
    'toast-action': '#1C6A43', // derived
    'dock-bg': 'linear-gradient(180deg, #2E3832 0%, #1C231F 100%)',
    bezel: '#050807', // derived (prototype frames only)
    bw: '1px',
    'bw-field': '0px', // fields have no border; the edge comes from shadow-well
    'r-card': '8px',
    'r-ctl': '6px',
    'r-chip': '5px', // segments and filter chips; tags use r-tag
    'r-fab': '8px', // the gold "+" key button
    'r-dock': '12px',
    'r-box': '4px',
    'shadow-card':
      'inset 0 1px 0 rgba(255,255,255,.05), 0 12px 22px -12px rgba(0,0,0,.85)',
    'shadow-btn':
      'inset 0 1px 0 rgba(255,255,255,.28), 0 1px 2px rgba(20,30,22,.3), 0 12px 20px -10px rgba(20,90,55,.9)',
    'shadow-float':
      '0 2px 4px rgba(0,0,0,.5), 0 14px 24px -8px rgba(0,0,0,.85)', // derived
    'shadow-seg': '0 1px 2px rgba(0,0,0,.5), 0 6px 10px -6px rgba(0,0,0,.7)', // derived
    display: "'Schibsted Grotesk',ui-sans-serif,system-ui,sans-serif",
    body: "'Figtree',ui-sans-serif,system-ui,sans-serif",
    'display-w': '800',
    'display-ls': '-0.035em',
    // ---- new with Canopy ----
    'ink-2': '#D0D8D1', // second ink: icons in tiles, unselected chip text
    deco: '#5F6A62', // decorative grey: empty star, strike-through line
    'canopy-bg':
      'radial-gradient(95% 85% at 100% 0%, #234A35 0%, rgba(35,74,53,0) 64%), linear-gradient(165deg, #132B1E 0%, #0B1A12 56%, #060F0A 100%)', // the green header
    'canopy-base': '#060F0A', // derived
    'canopy-ink': '#F4F7F1',
    'canopy-muted': 'rgba(244,247,241,.76)',
    'canopy-line': 'rgba(255,255,255,.14)',
    'canopy-chip': 'rgba(255,255,255,.09)', // header buttons
    'canopy-chip-line': 'rgba(255,255,255,.14)',
    'canopy-field': 'rgba(3,14,8,.34)', // search field and tracks inside the header
    'canopy-field-line': 'rgba(255,255,255,.13)',
    'shadow-canopy-field': 'inset 0 1px 3px rgba(0,0,0,.4)',
    gold: '#E8CB7C',
    'gold-ink': '#2A2105',
    'tex-ink': '#F4F7F1', // page texture lines
    'tex-glint': '#F6E7B4', // the glint copy of the texture
    'sheet-bg': 'linear-gradient(180deg, #181E1A 0%, #101511 100%)', // working sheet and bottom sheets
    'sheet-top': '#181E1A',
    'shadow-sheet':
      '0 -16px 32px -12px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.08)',
    'sheet-fade':
      'linear-gradient(180deg, rgba(16,21,17,0) 0%, rgba(16,21,17,.94) 58%, #101511 100%)', // lists dissolve under the Dock
    scrim: 'rgba(5,14,9,.58)', // behind bottom sheets
    'well-bg': '#0D120F',
    'shadow-well':
      'inset 0 1px 2px rgba(0,0,0,.7), inset 0 0 0 1px rgba(255,255,255,.05)',
    'box-bg': '#0D120F', // empty tick box
    'shadow-box': 'inset 0 1px 2px rgba(0,0,0,.6)',
    'btn-bg': 'linear-gradient(180deg, #2A8257 0%, #1A6540 100%)', // primary button
    'btn-line': 'rgba(6,36,20,.6)',
    'key-bg': 'linear-gradient(180deg, #F5E0A2 0%, #D9B85C 100%)', // gold key button
    'key-line': 'rgba(70,52,0,.55)',
    'shadow-key':
      'inset 0 1px 0 rgba(255,255,255,.65), 0 2px 3px rgba(3,14,8,.4), 0 12px 20px -8px rgba(3,14,8,.7)',
    'hero-bg': 'linear-gradient(160deg, #F1DA98 0%, #CDAA50 100%)', // the Shopping tile on Home
    'hero-line': 'rgba(0,0,0,.5)',
    'shadow-hero':
      'inset 0 1px 0 rgba(255,255,255,.55), 0 16px 24px -14px rgba(0,0,0,.9)',
    'hero-ink': '#221A03',
    'hero-num': '#221A03',
    'hero-muted': 'rgba(34,26,3,.84)',
    'seg-off': 'rgba(255,255,255,.12)', // bar and meter tracks
    'seg-mid': '#4E9A6B', // second segment of the Pantry stock bar
    'star-fill': '#E8CB7C', // derived
    'dock-line': 'rgba(255,255,255,.11)',
    'shadow-dock':
      'inset 0 1px 0 rgba(255,255,255,.12), 0 2px 4px rgba(0,0,0,.5), 0 16px 26px -10px rgba(0,0,0,.85), 0 36px 54px -18px rgba(0,0,0,.95)',
    'dock-on': '#FFFFFF',
    'dock-off': 'rgba(244,247,241,.68)',
    'cap-bg': 'linear-gradient(180deg, #F5E0A2 0%, #D6B458 100%)', // the mic / camera rocker
    'cap-line': 'rgba(70,52,0,.6)',
    'shadow-cap':
      'inset 0 1px 0 rgba(255,255,255,.7), 0 2px 3px rgba(10,16,12,.45), 0 12px 20px -8px rgba(10,16,12,.7)',
    'cap-ink': '#2A2105',
    'cap-div': 'rgba(42,33,5,.28)',
    'r-sheet': '18px',
    'r-btn': '8px', // primary buttons and header controls
    'r-cap': '10px',
    'r-tag': '3px',
    'lamp-expired': '#FF7A5C', // Pantry health lights (always on the dark header)
    'lamp-soon': '#F2C14E',
    'lamp-low': '#F2C14E',
    'lamp-fresh': '#86E0A6',
    'lamp-stale': '#B9CBD6',
    'lamp-window': '#0B1C13', // lit lamp window
    'lamp-window-off': '#0D2016', // unlit lamp window
    'dial-bad': '#E8744D', // health dial on the header: red tip
    'dial-good': '#E8CB7C', // health dial on the header: full end
    'bubble-ink': '#101511',
    'bubble-grey-bg': '#F4F7F1',
    'bubble-grey-fg': '#141A16',
    'bubble-green-bg': '#1C6A43',
    'bubble-green-fg': '#FFFFFF',
    'bubble-red-bg': '#B93A14',
    'bubble-red-fg': '#FFFFFF',
    'bubble-ring-red': '#F0693A',
    'bubble-ring-track': 'rgba(244,247,241,.14)',
    'bubble-origin': 'rgba(20,30,22,.42)',
    'bubble-disc': 'linear-gradient(180deg, #262F29, #121814)',
    'bubble-face': 'radial-gradient(circle at 50% 40%, #3A6E50, #173323)',
    'bubble-face-done': '#FBF3DA',
    'bubble-shadow-drag':
      '0 4px 8px rgba(10,16,12,.4), 0 22px 32px -8px rgba(10,16,12,.75)',
    'bubble-shadow-done':
      '0 0 0 6px rgba(232,203,124,.35), 0 2px 4px rgba(10,16,12,.35), 0 14px 24px -8px rgba(10,16,12,.65)',
    'bubble-shadow-label': '0 2px 4px rgba(10,16,12,.35)',
  },
};

export const THEME_META: Record<ThemeId, ThemeMeta> = {
  light: { id: 'light', name: 'Light', scheme: 'light' },
  dark: { id: 'dark', name: 'Dark', scheme: 'dark' },
};

/**
 * Maps any stored or sent Theme id to a Canopy one: `warm` and `minimal`
 * (the pre-Canopy Themes) become `light`, `dark` stays `dark`. There is no
 * cut-off; an unknown value is `null`.
 */
export function migrateTheme(stored: unknown): ThemeId | null {
  if (stored === 'dark') return 'dark';
  if (stored === 'light' || stored === 'warm' || stored === 'minimal') {
    return 'light';
  }
  return null;
}
