import { Alert } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import { ApiError } from '@/lib/api';
import type { AutosaveStatus } from '@/lib/recipeDraftAutosave';

/**
 * Shown when a Member starts one Recipe Draft too many (the cap,
 * `recipe_drafts.limit_reached`): finish or discard one. Also when the server
 * refused a write for good (`status` is `rejected`, e.g. the Recipe Draft is
 * gone), with its translated reason. Transient failures are the header's
 * "retrying" note, not this.
 */
export function RecipeDraftWriteNotice({
  error,
  status,
}: {
  error: unknown;
  status?: AutosaveStatus;
}) {
  const { t } = useTranslation('errors');
  const capped =
    error instanceof ApiError && error.code === 'recipe_drafts.limit_reached';
  if (!capped && status !== 'rejected') return null;
  return <Alert>{translateApiError(t, error)}</Alert>;
}
