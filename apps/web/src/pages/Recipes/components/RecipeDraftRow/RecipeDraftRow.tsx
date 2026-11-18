import {
  ActionMenu,
  Box,
  ChevronRightIcon,
  SwipeRow,
  tokens,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDate } from '@/lib/dateFormat';
import { localIso } from '@/lib/pantry';
import type { RecipeDraftSummary } from '@/lib/recipeDrafts';
import { DRAFT_PARAM } from '@/lib/recipeRoutes';

/** The form that resumes the Recipe Draft: New Variant of its base, or New Recipe (also when a Variant has no base left). */
export function recipeDraftPath(draft: RecipeDraftSummary): string {
  const search = `?${DRAFT_PARAM}=${draft.id}`;
  return draft.kind === 'variant' && draft.baseRecipeId
    ? `/recipes/${draft.baseRecipeId}/variant/new${search}`
    : `/recipes/new${search}`;
}

/** One Recipe Draft: what it is, where it came from, when it was edited and when it goes. Swipe or the menu discards it. */
export function RecipeDraftRow({
  draft,
  onDiscard,
}: {
  draft: RecipeDraftSummary;
  onDiscard: () => void;
}) {
  const { t } = useTranslation(['recipes', 'common']);
  const name = draft.title.trim() || t('recipes:drafts.untitled');
  const kind =
    draft.kind === 'variant'
      ? draft.baseRecipeName
        ? t('recipes:drafts.variantOf', { base: draft.baseRecipeName })
        : t('recipes:drafts.variant')
      : t('recipes:drafts.newRecipe');
  const origin =
    draft.origin?.type === 'link'
      ? t('recipes:drafts.from', { domain: draft.origin.domain })
      : draft.origin?.type === 'plate_scan'
        ? t('recipes:drafts.plateScan')
        : null;
  const dates = [
    t('recipes:drafts.edited', {
      date: formatDate(localIso(new Date(draft.updatedAt))),
    }),
    t('recipes:drafts.keptUntil', {
      date: formatDate(localIso(new Date(draft.expiresAt))),
    }),
  ].join(' · ');
  return (
    <SwipeRow
      name={name}
      labels={{
        question: t('recipes:drafts.removeQuestion', { name }),
        context: t('recipes:drafts.context'),
        keep: t('common:row.keep'),
        remove: t('common:row.remove'),
        releaseToDelete: t('common:row.releaseToDelete'),
        pressed: t('common:row.ticked'),
        removeAction: t('recipes:drafts.removeAction', { name }),
      }}
      onRemove={onDiscard}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Box
          component={Link}
          to={recipeDraftPath(draft)}
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 66,
            boxSizing: 'border-box',
            p: '12px 4px',
            color: tokens.color.ink,
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ fontSize: 15, fontWeight: 700 }}>{name}</Box>
            <Box
              sx={{ fontSize: 13, fontWeight: 600, color: tokens.color.accent }}
            >
              {kind}
            </Box>
            {origin ? (
              <Box sx={{ fontSize: 13, color: tokens.color.muted }}>
                {origin}
              </Box>
            ) : null}
            <Box sx={{ fontSize: 13, color: tokens.color.muted }}>{dates}</Box>
          </Box>
          <Box aria-hidden sx={{ display: 'flex', color: tokens.color.muted }}>
            <ChevronRightIcon size={16} />
          </Box>
        </Box>
        <ActionMenu
          label={t('recipes:drafts.menu', { name })}
          items={[
            {
              label: t('recipes:drafts.discard'),
              tone: 'urgent',
              onClick: onDiscard,
            },
          ]}
        />
      </Box>
    </SwipeRow>
  );
}
