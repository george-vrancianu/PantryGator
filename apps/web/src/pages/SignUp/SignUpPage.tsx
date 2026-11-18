import {
  Alert,
  Box,
  Button,
  Link,
  SegmentedControl,
  Stack,
  TextField,
  Typography,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { INTRO_PATHS } from '@/lib/intro';
import { AuthShell } from '@/components/auth/AuthShell/AuthShell';
import { useSignUpForm } from './hooks/useSignUpForm';

export function SignUpPage() {
  const { t } = useTranslation('signUp');
  const {
    submit,
    pending,
    error,
    promoCodeError,
    inviteCodeError,
    promoCodeRequired,
    mode,
    setMode,
  } = useSignUpForm();
  // Joining needs no Promo Code, so the field is gone while one would be required.
  const showPromo =
    promoCodeRequired !== null && (mode === 'create' || !promoCodeRequired);

  return (
    <AuthShell
      title={t('title')}
      subtitle={t('subtitle')}
      back={t('back')}
      backHref={INTRO_PATHS.languages}
      languageSwitcher={false}
    >
      <Box component="form" onSubmit={submit} sx={{ display: 'contents' }}>
        <Stack spacing={2}>
          {error ? <Alert>{error}</Alert> : null}
          <SegmentedControl
            label={t('mode.label')}
            fullWidth
            value={mode}
            onChange={setMode}
            options={[
              { value: 'create', label: t('mode.create') },
              { value: 'join', label: t('mode.join') },
            ]}
          />
          <TextField
            name="name"
            label={t('name')}
            autoComplete="name"
            required
          />
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
            helperText={t('passwordHint')}
            autoComplete="new-password"
            slotProps={{ htmlInput: { minLength: 8 } }}
            required
          />
          {mode === 'join' ? (
            <TextField
              name="joinInviteCode"
              label={t('inviteCode.label')}
              helperText={inviteCodeError ?? t('inviteCode.hint')}
              error={inviteCodeError !== null}
              autoComplete="off"
              autoCapitalize="characters"
              required
            />
          ) : null}
          {showPromo ? (
            <TextField
              name="promoCode"
              label={
                promoCodeRequired
                  ? t('promoCode.label')
                  : t('promoCode.optionalLabel')
              }
              helperText={
                promoCodeError ??
                (promoCodeRequired
                  ? t('promoCode.requiredHint')
                  : t('promoCode.optionalHint'))
              }
              error={promoCodeError !== null}
              autoComplete="off"
              autoCapitalize="characters"
              required={promoCodeRequired && mode === 'create'}
            />
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? t('submitting') : t('submit')}
          </Button>
        </Stack>
      </Box>
      <Typography variant="meta" color="text.secondary">
        {t('haveAccount')} <Link href="/sign-in">{t('signIn')}</Link>
      </Typography>
    </AuthShell>
  );
}
