import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { introRedirect } from '@/lib/intro';
import { useMemberPreferences } from '@/lib/settings';
import { useIntro } from '@/lib/useIntro';
import { FullPageSpinner } from '@/components/layout/FullPageSpinner/FullPageSpinner';

/**
 * Sends a signed-in Member who is not done with the Intro to Set up or skip, whatever route they opened,
 * and keeps a done Member off the Intro screens. Shows the spinner until Preferences have loaded, so the
 * wrong screen never flashes. If Preferences cannot be read the app carries on as for a done Member.
 */
export function IntroGate() {
  const preferences = useMemberPreferences();
  const { setupStarted } = useIntro();
  const location = useLocation();

  // Only before the first answer: a refetch of a failed read goes back to pending, and must not unmount the app.
  if (preferences.isPending && !preferences.isFetched)
    return <FullPageSpinner />;
  const to = preferences.data
    ? introRedirect({
        pathname: location.pathname,
        introDone: preferences.data.introDone,
        setupStarted,
      })
    : null;
  if (to) return <Navigate to={to} replace />;
  return <Outlet />;
}
