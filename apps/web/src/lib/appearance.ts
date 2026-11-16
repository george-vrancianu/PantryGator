import {
  SYSTEM_DARK_QUERY,
  migrateTheme,
  readAppearance,
  subscribeAppearance,
  writeAppearance,
  type Appearance,
  type ThemeId,
} from '@pocket-pantry/ui';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { apiRequest } from './api';
import { sessionQueryKey, type Session } from './session';
import { preferencesQueryKey, type MemberPreferences } from './settings';

/** The device's appearance, kept current when it changes here or in another tab. */
export function useAppearance(): Appearance {
  const [appearance, setAppearance] = useState(readAppearance);
  useEffect(() => {
    // Catch a change made between the first render and subscribing.
    // oxlint-disable-next-line react/set-state-in-effect -- catch-up read of the external appearance store before subscribing
    setAppearance(readAppearance());
    return subscribeAppearance(setAppearance);
  }, []);
  return appearance;
}

/** Match system is device-only: it is stored locally and never saved on the Member. */
export function setMatchSystem(matchSystem: boolean) {
  writeAppearance({ ...readAppearance(), matchSystem });
}

/**
 * The Theme chosen on this device and not yet saved on the Member, with the
 * Member who chose it. Kept under its own key, outside `pp.appearance`, which
 * MUI's storage adapter reads.
 */
const PENDING_THEME_KEY = 'pp.appearance.unsynced';

const sessionMemberId = (queryClient: QueryClient): string | null =>
  queryClient.getQueryData<Session>(sessionQueryKey)?.user.id ?? null;

/** The unsynced Theme, only when the current Member is the one who chose it. */
export function readPendingTheme(queryClient: QueryClient): ThemeId | null {
  try {
    const raw = window.localStorage.getItem(PENDING_THEME_KEY);
    if (!raw) return null;
    const pending: unknown = JSON.parse(raw);
    if (typeof pending !== 'object' || pending === null) return null;
    const { memberId, theme } = pending as Record<string, unknown>;
    // A Theme saved before Canopy (`warm`, `minimal`) reads as `light`.
    return memberId === sessionMemberId(queryClient)
      ? migrateTheme(theme)
      : null;
  } catch {
    return null;
  }
}

function writePendingTheme(queryClient: QueryClient, theme: ThemeId | null) {
  try {
    if (theme) {
      window.localStorage.setItem(
        PENDING_THEME_KEY,
        JSON.stringify({ memberId: sessionMemberId(queryClient), theme }),
      );
    } else {
      window.localStorage.removeItem(PENDING_THEME_KEY);
    }
  } catch {
    // Blocked storage: the choice still saves while this page is open.
  }
}

/** Forgets the unsynced Theme, so the next Member to sign in on this device never inherits it. */
export function clearPendingTheme() {
  try {
    window.localStorage.removeItem(PENDING_THEME_KEY);
  } catch {
    // Blocked storage: nothing was stored.
  }
}

const saveFailedListeners = new Set<() => void>();

/** Calls `listener` when a Theme save on the Member fails: the choice stays on this phone and syncs later. */
export function onThemeSaveFailed(listener: () => void): () => void {
  saveFailedListeners.add(listener);
  return () => {
    saveFailedListeners.delete(listener);
  };
}

/** Per query client, so each app (and each test) has its own save in flight. */
const savesInFlight = new WeakSet<QueryClient>();

/**
 * Saves the device's unsynced Theme on the Member, one request at a time:
 * choices made while a save is in flight only update the unsynced Theme,
 * and the latest is sent once that save settles. A failed save stays
 * unsynced until the next try (preferences loading, the device coming back
 * online, or another choice). An answer that lands after the Member signed
 * out is dropped.
 */
export function syncPendingTheme(queryClient: QueryClient) {
  const theme = readPendingTheme(queryClient);
  if (!theme || savesInFlight.has(queryClient)) return;
  const memberId = sessionMemberId(queryClient);
  savesInFlight.add(queryClient);
  apiRequest<MemberPreferences>('/settings/preferences', {
    method: 'PUT',
    body: { theme },
  }).then(
    (saved) => {
      savesInFlight.delete(queryClient);
      if (sessionMemberId(queryClient) !== memberId) {
        // The Member changed during this save; the new Member's choice may be waiting.
        syncPendingTheme(queryClient);
        return;
      }
      if (readPendingTheme(queryClient) === theme) {
        writePendingTheme(queryClient, null);
        // Only the Theme this request saved; a locale save may have landed meanwhile.
        queryClient.setQueryData<MemberPreferences>(
          preferencesQueryKey,
          (old) => (old ? { ...old, theme: saved.theme } : saved),
        );
      } else {
        syncPendingTheme(queryClient);
      }
    },
    () => {
      savesInFlight.delete(queryClient);
      if (sessionMemberId(queryClient) !== memberId) {
        syncPendingTheme(queryClient);
        return;
      }
      for (const listener of saveFailedListeners) listener();
      // The read may have been cancelled for the choice; load it again.
      if (!queryClient.getQueryData(preferencesQueryKey)) {
        void queryClient.invalidateQueries({ queryKey: preferencesQueryKey });
      }
      // A newer choice made during this save has not been sent yet.
      const newer = readPendingTheme(queryClient);
      if (newer && newer !== theme) syncPendingTheme(queryClient);
    },
  );
}

/**
 * Chooses a Theme: applies and stores it on the device at once, then saves it
 * on the Member (a Member Preference). Until that save succeeds the device's
 * choice wins over the Member's saved Theme.
 */
export function useChooseTheme() {
  const queryClient = useQueryClient();
  return (theme: ThemeId) => {
    writeAppearance({ ...readAppearance(), theme });
    writePendingTheme(queryClient, theme);
    // A read already on its way holds the old Theme; the save's answer replaces it.
    void queryClient.cancelQueries({ queryKey: preferencesQueryKey });
    queryClient.setQueryData<MemberPreferences>(preferencesQueryKey, (old) =>
      old ? { ...old, theme } : old,
    );
    syncPendingTheme(queryClient);
  };
}

/** Whether the phone's system is in dark mode right now. */
export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(SYSTEM_DARK_QUERY).matches;
  } catch {
    return false;
  }
}

/** Whether the phone's system is in dark mode, kept current while the app is open. */
export function useSystemDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      try {
        const query = window.matchMedia(SYSTEM_DARK_QUERY);
        query.addEventListener('change', onChange);
        return () => query.removeEventListener('change', onChange);
      } catch {
        return () => undefined;
      }
    },
    systemPrefersDark,
    () => false,
  );
}
