import {
  Alert,
  Box,
  Button,
  Link,
  Stack,
  TextField,
  Typography,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { AuthShell } from '@/components/auth/AuthShell/AuthShell';
import { useSignInForm } from './hooks/useSignInForm';

export function SignInPage() {
  const { t } = useTranslation('signIn');
  const { submit, pending, error, from } = useSignInForm();

  return (
    <AuthShell
      title={t('title')}
      subtitle={t('subtitle')}
      back={t('back')}
      backHref={from}
    >
      <Box component="form" onSubmit={submit} sx={{ display: 'contents' }}>
        <Stack spacing={2}>
          {error ? <Alert>{error}</Alert> : null}
          <TextField
            name="email"
            type="email"
            label={t('email')}
            autoComplete="email"
            required
          />
          <TextField
            name="password"
            type="password"
            label={t('password')}
            autoComplete="current-password"
            required
          />
          <Button type="submit" disabled={pending}>
            {pending ? t('submitting') : t('submit')}
          </Button>
        </Stack>
      </Box>
      <Typography variant="meta" color="text.secondary">
        {t('noAccount')} <Link href="/intro/languages">{t('getStarted')}</Link>
      </Typography>
    </AuthShell>
  );
}
