import {
  DEFAULT_APPEARANCE,
  migrateTheme,
  readAppearance,
  writeAppearance,
} from '@pocket-pantry/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { readPendingTheme, syncPendingTheme } from '@/lib/appearance';
import { useMemberPreferences } from '@/lib/settings';

/**
 * Applies the Theme saved on the Member (a Member Preference) once it loads,
 * so a sign-in on any device shows the Member's Theme. A server value that
 * differs from the device's wins; `null` (never chosen) means the default.
 * A Theme chosen on this device and not yet saved wins instead, and is sent
 * again now and whenever the device comes back online. Match system stays
 * as the device has it. Renders nothing.
 */
export function ApplyMemberTheme() {
  const queryClient = useQueryClient();
  const preferences = useMemberPreferences().data;
  const saved = preferences
    ? // A Theme saved before Canopy (`warm`, `minimal`) reads as `light`.
      (migrateTheme(preferences.theme) ?? DEFAULT_APPEARANCE.theme)
    : undefined;
  useEffect(() => {
    if (saved === undefined) return;
    if (readPendingTheme(queryClient)) {
      syncPendingTheme(queryClient);
      return;
    }
    const device = readAppearance();
    if (device.theme !== saved) writeAppearance({ ...device, theme: saved });
  }, [saved, queryClient]);
  useEffect(() => {
    const retry = () => syncPendingTheme(queryClient);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [queryClient]);
  return null;
}
