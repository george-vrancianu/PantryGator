import { THEME_IDS, THEMES, migrateTheme, type ThemeId } from './themes';

/** The device's appearance preference: the chosen Theme and whether to follow the system's dark mode. */
export type Appearance = { theme: ThemeId; matchSystem: boolean };

/** The single `localStorage` key holding the device's {@link Appearance}. */
export const APPEARANCE_STORAGE_KEY = 'pp.appearance';

/** Used when nothing valid is stored, for new installs and upgrades alike: follow the system. */
export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'light',
  matchSystem: true,
};

export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

export function isThemeId(value: unknown): value is ThemeId {
  return (THEME_IDS as readonly unknown[]).includes(value);
}

/** Parses a stored value; anything missing or malformed is the default. */
export function parseAppearance(raw: string | null | undefined): Appearance {
  if (!raw) return DEFAULT_APPEARANCE;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      'theme' in value &&
      'matchSystem' in value &&
      typeof value.matchSystem === 'boolean'
    ) {
      // A stored `warm` or `minimal` reads as `light`.
      const theme = migrateTheme(value.theme);
      if (theme) return { theme, matchSystem: value.matchSystem };
    }
  } catch {
    // Malformed JSON falls through to the default.
  }
  return DEFAULT_APPEARANCE;
}

/** With Match system on, Dark when the device is in dark mode and Light otherwise; off, the chosen Theme. */
export function resolveTheme(
  appearance: Appearance,
  systemDark: boolean,
): ThemeId {
  if (!appearance.matchSystem) return appearance.theme;
  return systemDark ? 'dark' : 'light';
}

/** The device's stored appearance; blocked storage reads as the default. */
export function readAppearance(): Appearance {
  try {
    return parseAppearance(window.localStorage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

const listeners = new Set<(appearance: Appearance) => void>();

/** Stores the device's appearance and applies it at once to the mounted app. */
export function writeAppearance(appearance: Appearance) {
  try {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify(appearance),
    );
  } catch {
    // Storage can be blocked; the change still applies for this session.
  }
  for (const listener of listeners) listener(appearance);
}

/** Calls `listener` when the appearance changes in this tab or in another one. */
export function subscribeAppearance(
  listener: (appearance: Appearance) => void,
): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === APPEARANCE_STORAGE_KEY || event.key === null) {
      listener(parseAppearance(event.newValue));
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

type PrePaintConfig = {
  key: string;
  query: string;
  fallback: Appearance;
  bg: Record<ThemeId, string>;
  /** Pre-Canopy ids that read as a current one. */
  legacy: Record<string, ThemeId>;
};

/**
 * Runs inline in the HTML entry before React mounts, so it must be
 * self-contained: no imports, no helpers, only its arguments. It repeats the
 * parse and resolution rules above with no nested functions, which a
 * bundler could wrap in helpers the page doesn't have; the pre-paint
 * tests pin both.
 */
function applyAppearanceBeforePaint(
  doc: Document,
  win: Window,
  config: PrePaintConfig,
) {
  let pref = config.fallback;
  try {
    const stored = JSON.parse(win.localStorage.getItem(config.key) || 'null');
    if (stored && typeof stored.matchSystem === 'boolean') {
      const has = Object.prototype.hasOwnProperty;
      const id = has.call(config.bg, stored.theme)
        ? stored.theme
        : has.call(config.legacy, stored.theme)
          ? config.legacy[stored.theme]
          : null;
      if (id) pref = { theme: id, matchSystem: stored.matchSystem };
    }
  } catch {
    // Missing, malformed or blocked storage keeps the fallback.
  }
  let theme = pref.theme;
  if (pref.matchSystem) {
    let systemDark = false;
    try {
      systemDark = win.matchMedia(config.query).matches;
    } catch {
      // No matchMedia: treat the system as light.
    }
    theme = systemDark ? 'dark' : 'light';
  }
  doc.documentElement.setAttribute('data-theme', theme);
  const metas = doc.querySelectorAll('meta[name="theme-color"]');
  for (let i = 0; i < metas.length; i++) {
    metas[i].setAttribute('content', config.bg[theme]);
  }
}

/** The source of the inline pre-paint script for the HTML entry. It reads `document` and `window` as globals. */
export function prePaintScript(): string {
  const config: PrePaintConfig = {
    key: APPEARANCE_STORAGE_KEY,
    query: SYSTEM_DARK_QUERY,
    fallback: DEFAULT_APPEARANCE,
    bg: { light: THEMES.light.bg, dark: THEMES.dark.bg },
    legacy: { warm: 'light', minimal: 'light' },
  };
  return `(${applyAppearanceBeforePaint.toString()})(document, window, ${JSON.stringify(config)});`;
}
