import { Alert, Box, Button, Stack } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';
import { translateApiError } from '@/i18n/translateApiError';
import { useSession } from '@/lib/auth';
import { LaunchPage } from '@/pages/Intro/LaunchPage';
import { FullPageSpinner } from '@/components/layout/FullPageSpinner/FullPageSpinner';

/** Route guard: a signed-out visitor sees Launch on whatever route they opened, and comes back to it after Log in. */
export function RequireAuth() {
  const { t } = useTranslation('common');
  const session = useSession();

  if (session.isPending) return <FullPageSpinner />;

  if (session.isError) {
    return (
      <Box sx={{ p: '20px', maxWidth: 420, mx: 'auto' }}>
        <Stack spacing={2}>
          <Alert>{translateApiError(t, session.error)}</Alert>
          <Button onClick={() => void session.refetch()}>{t('retry')}</Button>
        </Stack>
      </Box>
    );
  }

  if (!session.data) return <LaunchPage />;
  return <Outlet />;
}
