import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import { useJoinFamily, useJoinPreview } from '@/lib/family';

export type JoinFlow = ReturnType<typeof useJoinFlow>;

export function useJoinFlow() {
  const { t } = useTranslation();
  const [code, setCodeState] = useState('');
  const previewRequest = useJoinPreview();
  const join = useJoinFamily();

  const error = previewRequest.error ?? join.error;
  const reset = () => {
    previewRequest.reset();
    join.reset();
  };

  return {
    code,
    setCode: (next: string) => {
      reset();
      setCodeState(next);
    },
    // Set once the code checked out: what joining will delete.
    preview: previewRequest.data,
    checking: previewRequest.isPending,
    joining: join.isPending,
    error: error ? translateApiError(t, error) : null,
    check: () => previewRequest.mutate(code.trim()),
    confirm: () =>
      join.mutate(code.trim(), { onSuccess: () => setCodeState('') }),
    cancel: reset,
  };
}
