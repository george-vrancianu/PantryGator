import { Box, Button, Spinner, Stack, Typography } from '@pocket-pantry/ui';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/components/layout/Screen/Screen';
import { formatDate } from '@/lib/dateFormat';
import { localIso } from '@/lib/pantry';
import {
  useRecipeDrafts,
  type RecipeDraftKind,
  type RecipeDraftSummary,
} from '@/lib/recipeDrafts';
import { recipeDraftPath } from '../RecipeDraftRow/RecipeDraftRow';

/**
 * "Continue your draft?" (ADR 0028): before a blank New Recipe or New Variant form,
 * offers the Member's unfinished Recipe Drafts of the same kind (and, for a Variant,
 * the same base). Continue opens one; Start new shows the form, which creates
 * nothing until it holds real content.
 *
 * The form (`children`) is held back while the list loads, so it cannot autosave
 * behind the prompt. If the list fails, the form is shown. The answer is decided
 * once per visit: later list refreshes (the form's own autosave) never bring the
 * prompt back or take the form away. Give it `key` per visit to the page.
 */
export function RecipeDraftContinue({
  active,
  kind,
  baseRecipeId,
  title,
  children,
}: {
  /** False when the form opens on a supplied fill or on a Recipe Draft: no prompt. */
  active: boolean;
  kind: RecipeDraftKind;
  /** The base whose Variant drafts to offer; null for New Recipe. */
  baseRecipeId: string | null;
  /** The page heading, shown over the prompt. */
  title: string;
  children: ReactNode;
}) {
  const { t } = useTranslation(['recipes', 'common']);
  const navigate = useNavigate();
  const list = useRecipeDrafts(active, 'always');
  // Set once the list has answered: the drafts to offer, or none.
  const [offered, setOffered] = useState<RecipeDraftSummary[] | null>(null);
  const [startedNew, setStartedNew] = useState(false);
  // A cached list may be old (a Recipe Draft saved a moment ago is gone): every visit refetches, and the answer waits for it.
  const answered = !list.isFetching && (list.isSuccess || list.isError);
  if (active && offered === null && answered) {
    setOffered(
      (list.data ?? []).filter(
        (draft) =>
          draft.kind === kind &&
          (kind === 'new_recipe' || draft.baseRecipeId === baseRecipeId),
      ),
    );
  }

  if (!active || startedNew) return <>{children}</>;
  if (offered === null) {
    return (
      <>
        <Screen title={title} />
        <Spinner label={t('common:loading')} />
      </>
    );
  }
  if (offered.length === 0) return <>{children}</>;

  return (
    <>
      <Screen title={title} />
      <Stack spacing={2}>
        <Typography variant="h2" component="h2">
          {t('recipes:drafts.continueTitle')}
        </Typography>
        <Typography>
          {t('recipes:drafts.continueHint', { count: offered.length })}
        </Typography>
        <Stack
          component="ul"
          spacing={1.5}
          aria-label={t('recipes:drafts.listLabel')}
          sx={{ listStyle: 'none', m: 0, p: 0 }}
        >
          {offered.map((draft) => {
            const name = draft.title.trim() || t('recipes:drafts.untitled');
            return (
              <Box
                component="li"
                key={draft.id}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ fontWeight: 700 }}>{name}</Box>
                  <Typography variant="meta" color="text.secondary">
                    {t('recipes:drafts.edited', {
                      date: formatDate(localIso(new Date(draft.updatedAt))),
                    })}
                  </Typography>
                </Box>
                <Button
                  variant="secondary"
                  aria-label={t('recipes:drafts.continueNamed', { name })}
                  onClick={() => navigate(recipeDraftPath(draft))}
                >
                  {t('recipes:drafts.continue')}
                </Button>
              </Box>
            );
          })}
        </Stack>
        <Button onClick={() => setStartedNew(true)}>
          {t('recipes:drafts.startNew')}
        </Button>
      </Stack>
    </>
  );
}
