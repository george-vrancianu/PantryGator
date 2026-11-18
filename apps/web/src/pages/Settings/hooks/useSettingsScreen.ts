import { useLayoutEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useScroller } from '@/lib/scroller';

export type SettingsTab = 'you' | 'family';

/** `?tab=family` opens Family; anything else, including no tab, opens You. */
const tabFrom = (value: string | null): SettingsTab =>
  value === 'family' ? 'family' : 'you';

/**
 * The Settings screen state: the open tab, read from the `tab` query parameter, and each tab's
 * scroll offset, kept for as long as the page is mounted.
 */
export function useSettingsScreen() {
  const [params, setParams] = useSearchParams();
  const tab = tabFrom(params.get('tab'));
  const scroller = useScroller();

  const offsets = useRef<Partial<Record<SettingsTab, number>>>({});
  const shown = useRef(tab);
  useLayoutEffect(() => {
    if (shown.current === tab) return;
    shown.current = tab;
    scroller.scrollTo({ top: offsets.current[tab] ?? 0 });
  }, [tab, scroller]);

  const selectTab = (next: SettingsTab) => {
    if (next === tab) return;
    offsets.current[tab] = scroller.top();
    const updated = new URLSearchParams(params);
    updated.set('tab', next);
    // Replace, not push: Back still leaves Settings rather than stepping between tabs.
    setParams(updated, { replace: true });
  };

  return { tab, selectTab };
}
