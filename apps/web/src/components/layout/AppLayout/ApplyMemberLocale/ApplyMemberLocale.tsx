import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLocale } from '@/i18n/index';
import { isLocale } from '@/i18n/resources';
import { useMemberPreferences, useSaveInitialLocale } from '@/lib/settings';

/**
 * Applies the UI Language saved on the Member (a Member Preference) once it loads, so a sign-in on any
 * device shows the Member's language. With none stored yet it saves the one being shown, once, so the API
 * (which no longer hears the device language) names things in it too. A failed save is silent: the next
 * sign-in tries again. Renders nothing.
 */
export function ApplyMemberLocale() {
  const { i18n } = useTranslation();
  const preferences = useMemberPreferences().data;
  const saved = preferences?.locale ?? null;
  useEffect(() => {
    if (saved && saved !== i18n.language) void changeLocale(i18n, saved);
    // Only react to the saved value changing, not to the Member switching language later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const { mutate } = useSaveInitialLocale();
  const nothingStored = preferences !== undefined && saved === null;
  const tried = useRef(false);
  useEffect(() => {
    if (!nothingStored || tried.current) return;
    tried.current = true;
    const shown = i18n.resolvedLanguage ?? i18n.language;
    if (isLocale(shown)) mutate(shown);
    // Once per sign-in, whatever the language does afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nothingStored]);
  return null;
}
