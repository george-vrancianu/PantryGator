import { Typography } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import type { AutosaveStatus } from '@/lib/recipeDraftAutosave';

/**
 * The form header's inline note on the Recipe Draft: "Saving…", then "Draft
 * saved"; or, while a save keeps failing, "Couldn't save Recipe Draft,
 * retrying" (non-blocking). Not a toast. A version conflict is the banner's.
 */
export function RecipeDraftStatus({ status }: { status: AutosaveStatus }) {
  const { t } = useTranslation('recipes');
  const failed = status === 'failed';
  return (
    <Typography
      component="span"
      variant="meta"
      color={failed ? 'error' : 'text.secondary'}
      role="status"
    >
      {status === 'saving'
        ? t('recipeDraft.saving')
        : status === 'saved'
          ? t('recipeDraft.saved')
          : failed
            ? t('recipeDraft.saveFailed')
            : null}
    </Typography>
  );
}
