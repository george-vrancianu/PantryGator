import { Alert, Button, Stack } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import { ApiError } from '@/lib/api';
import type { AutosaveStatus } from '@/lib/recipeDraftAutosave';

/**
 * Shown when a Member starts one Recipe Draft too many (the cap,
 * `recipe_drafts.limit_reached`): finish or discard one, with a link to the
 * Drafts list to do it. Also when the server refused a write for good
 * (`status` is `rejected`), with its translated reason; when the Recipe Draft
 * is gone (404), `onKeepAsNew` offers to create a new one from the form.
 * Transient failures are the header's "retrying" note, not this.
 */
export function RecipeDraftWriteNotice({
  error,
  status,
  onKeepAsNew,
}: {
  error: unknown;
  status?: AutosaveStatus;
  onKeepAsNew?: () => void;
}) {
  const { t } = useTranslation(['errors', 'recipes']);
  const capped =
    error instanceof ApiError && error.code === 'recipe_drafts.limit_reached';
  if (!capped && status !== 'rejected') return null;
  const gone =
    error instanceof ApiError && error.code === 'recipe_drafts.not_found';
  return (
    <Alert>
      <Stack spacing={1}>
        <span>{translateApiError(t, error)}</span>
        {capped ? (
          <div>
            <Button variant="secondary" href="/recipes/drafts">
              {t('recipes:recipeDraft.seeDrafts')}
            </Button>
          </div>
        ) : null}
        {gone && onKeepAsNew ? (
          <div>
            <Button variant="secondary" onClick={onKeepAsNew}>
              {t('recipes:recipeDraft.keepAsNew')}
            </Button>
          </div>
        ) : null}
      </Stack>
    </Alert>
  );
}
