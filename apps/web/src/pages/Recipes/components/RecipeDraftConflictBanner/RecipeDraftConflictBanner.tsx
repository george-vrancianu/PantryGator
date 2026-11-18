import { Alert, Button, Stack, Typography } from '@pocket-pantry/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '@/lib/api';
import type { RecipeDraftView } from '@/lib/recipeDrafts';
import { draftWritesSettled } from '@/lib/recipeDraftWrites';

/**
 * Shown when an update lost to a newer version of the Recipe Draft (another
 * device or tab saved meanwhile, `recipe_drafts.version_conflict`) and
 * autosave has stopped. "Load latest" fetches the Recipe Draft and hands it to
 * `onLoaded`, which reloads the form on it (ADR 0028); a failed fetch leaves
 * the form as it is, with a note to try again.
 */
export function RecipeDraftConflictBanner({
  draftId,
  onLoaded,
}: {
  draftId: string;
  onLoaded: (latest: RecipeDraftView) => void;
}) {
  const { t } = useTranslation('recipes');
  const load = useMutation({
    mutationFn: async () => {
      await draftWritesSettled();
      return apiRequest<RecipeDraftView>(`/recipe-drafts/${draftId}`);
    },
    onSuccess: onLoaded,
  });
  return (
    <Alert severity="warning">
      <Stack spacing={1}>
        <Typography variant="body2">
          {t('recipeDraft.conflictTitle')}
        </Typography>
        <Typography variant="meta">{t('recipeDraft.conflictHint')}</Typography>
        {load.isError ? (
          <Typography variant="meta" role="alert">
            {t('recipeDraft.loadLatestFailed')}
          </Typography>
        ) : null}
        <div>
          <Button
            variant="secondary"
            disabled={load.isPending}
            onClick={() => load.mutate()}
          >
            {t('recipeDraft.loadLatest')}
          </Button>
        </div>
      </Stack>
    </Alert>
  );
}
