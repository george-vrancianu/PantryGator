import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { translateApiError } from '@/i18n/translateApiError';
import { useSignIn } from '@/lib/auth';

export function useSignInForm() {
  const { t } = useTranslation();
  const signIn = useSignIn();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    signIn.mutate(
      {
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
      },
      { onSuccess: () => navigate(from, { replace: true }) },
    );
  };

  return {
    submit,
    from,
    pending: signIn.isPending,
    error: signIn.error ? translateApiError(t, signIn.error) : null,
  };
}
