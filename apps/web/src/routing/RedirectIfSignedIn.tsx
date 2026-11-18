import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '@/lib/auth';
import { FullPageSpinner } from '@/components/layout/FullPageSpinner/FullPageSpinner';

/**
 * Route guard for Log in and sign-up: Members who are already signed in go home, or back to the page a
 * signed-out visit first asked for (Log in carries it along).
 */
export function RedirectIfSignedIn() {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <FullPageSpinner />;
  if (session.data) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? '/'} replace />;
  }
  return <Outlet />;
}
