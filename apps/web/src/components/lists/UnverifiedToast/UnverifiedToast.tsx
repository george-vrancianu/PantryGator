import { Alert, Snackbar } from '@pocket-pantry/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { unverifiedCount, withoutUnverified } from '@/lib/unverifiedState';

/**
 * "N items still unverified": shown once on the page a Review Save lands on,
 * for about 6 seconds. The count arrives in router state and is removed from it
 * (other state is left alone), so going back or refreshing does not show it again.
 */
export function UnverifiedToast() {
  const { t } = useTranslation('common');
  const location = useLocation();
  const navigate = useNavigate();
  const [count] = useState(() => unverifiedCount(location.state));
  const [open, setOpen] = useState(count > 0);

  useEffect(() => {
    if (unverifiedCount(location.state) === 0) return;
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: withoutUnverified(location.state),
    });
  }, [location, navigate]);

  if (count === 0) return null;
  return (
    <Snackbar open={open} onClose={() => setOpen(false)} bottom="aboveDock">
      <Alert severity="warning" role="status">
        {t('unverified', { count })}
      </Alert>
    </Snackbar>
  );
}
