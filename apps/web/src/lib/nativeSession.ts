import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/**
 * The session in the mobile apps (ADR 0036). The app runs on its own origin
 * (`capacitor://localhost`, `https://localhost`), where WKWebView drops the
 * API's session cookie, so the API hands the session over in a
 * `set-auth-token` header and the app sends it back as `Authorization: Bearer`.
 * The token is kept in the app's private storage, which survives restarts.
 * In a browser none of this runs: the cookie carries the session.
 */
const STORAGE_KEY = 'session-token';
const TOKEN_HEADER = 'set-auth-token';

let stored: Promise<string | null> | null = null;

function storedToken(): Promise<string | null> {
  stored ??= Preferences.get({ key: STORAGE_KEY }).then(({ value }) => value);
  return stored;
}

export const nativeSession = {
  /** True inside the iOS and Android apps. */
  isActive: (): boolean => Capacitor.isNativePlatform(),

  /** True inside the Android app only (not the web, not the iOS app). */
  isAndroidApp: (): boolean =>
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android',

  /** The `Authorization` header to send, if the app holds a session. */
  async authorization(): Promise<string | undefined> {
    if (!nativeSession.isActive()) return undefined;
    const token = await storedToken();
    return token ? `Bearer ${token}` : undefined;
  },

  /** Keeps the session token a sign-in or sign-up response hands over. */
  async remember(response: Response): Promise<void> {
    if (!nativeSession.isActive()) return;
    const token = response.headers.get(TOKEN_HEADER);
    if (!token) return;
    stored = Promise.resolve(token);
    await Preferences.set({ key: STORAGE_KEY, value: token });
  },

  /** Drops the session token, after signing out. */
  async forget(): Promise<void> {
    if (!nativeSession.isActive()) return;
    stored = Promise.resolve(null);
    await Preferences.remove({ key: STORAGE_KEY });
  },
};
