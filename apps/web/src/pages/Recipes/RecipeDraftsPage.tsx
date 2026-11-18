import {
  Alert,
  Box,
  Button,
  Card,
  Spinner,
  tokens,
  displayType,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/layout/Screen/Screen';
import { translateApiError } from '@/i18n/translateApiError';
import { useRecipeDrafts } from '@/lib/recipeDrafts';
import { RecipeDraftRow } from './components/RecipeDraftRow/RecipeDraftRow';
import { useRecipeDraftDiscard } from './hooks/useRecipeDraftDiscard';

/** The Member's Recipe Drafts (ADR 0028), newest edit first: open one to carry on, or discard it with an Undo. */
export function RecipeDraftsPage() {
  const { t } = useTranslation(['recipes', 'common']);
  const drafts = useRecipeDrafts();
  const { hiddenIds, discard, discardMany } = useRecipeDraftDiscard();
  const visible = drafts.data?.filter((draft) => !hiddenIds.has(draft.id));
  return (
    <>
      <Screen
        title={t('recipes:drafts.title')}
        back={{ label: t('recipes:drafts.back'), href: '/recipes' }}
      />
      {drafts.error ? (
        <Alert>{translateApiError(t, drafts.error)}</Alert>
      ) : null}
      {drafts.isPending ? <Spinner label={t('common:loading')} /> : null}
      {visible?.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: '32px' }}>
          <Box sx={{ ...displayType, fontSize: 18 }}>
            {t('recipes:drafts.empty')}
          </Box>
          <Box sx={{ fontSize: 14, color: tokens.color.muted, mt: '4px' }}>
            {t('recipes:drafts.emptyHint')}
          </Box>
        </Box>
      ) : null}
      {visible && visible.length > 0 ? (
        <Card
          component="ul"
          variant="list"
          aria-label={t('recipes:drafts.listLabel')}
          sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }}
        >
          {visible.map((draft) => (
            <RecipeDraftRow
              key={draft.id}
              draft={draft}
              onDiscard={() => discard(draft.id)}
            />
          ))}
        </Card>
      ) : null}
      {visible && visible.length > 1 ? (
        <Box sx={{ textAlign: 'center', mt: '12px' }}>
          <Button
            variant="danger"
            onClick={() => discardMany(visible.map((draft) => draft.id))}
          >
            {t('recipes:drafts.discardAll')}
          </Button>
        </Box>
      ) : null}
    </>
  );
}
