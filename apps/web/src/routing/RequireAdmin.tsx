import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '@/lib/auth';
import { FullPageSpinner } from '@/components/FullPageSpinner';

/**
 * Route guard for the admin area, nested inside `RequireAuth`. Non-Admins are
 * sent home; the API enforces the role too, this only keeps the screens out of
 * sight.
 */
export function RequireAdmin() {
  const session = useSession();
  if (session.isPending) return <FullPageSpinner />;
  if (session.data?.user.role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}
