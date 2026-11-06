/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin. Defaults to the page's own origin. */
  readonly VITE_API_URL?: string;
  /**
   * The build the app was made from, e.g. "20261106.1758 · 9dabce4" (build number and commit).
   * Set by apps/mobile/scripts/build-ios.sh; Settings shows it under Sign out. Hidden while unset.
   */
  readonly VITE_BUILD?: string;
  /**
   * iCloud link to the "Pantry add" Shortcut (see docs/siri-shortcut.md). The Settings Siri section
   * links to it; the link is hidden while this is unset or empty.
   */
  readonly VITE_SIRI_SHORTCUT_URL?: string;
  /**
   * iCloud link to the "Gator, do we have" Shortcut (see docs/siri-shortcut.md). Hidden while
   * this is unset or empty. The old "Pantry check" variable is retired and no longer read.
   */
  readonly VITE_SIRI_HAVE_SHORTCUT_URL?: string;
  /** iCloud link to the "Gator needs" Shortcut. Hidden while unset or empty. */
  readonly VITE_SIRI_NEEDS_SHORTCUT_URL?: string;
  /** iCloud link to the "Gator got" Shortcut. Hidden while unset or empty. */
  readonly VITE_SIRI_GOT_SHORTCUT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
