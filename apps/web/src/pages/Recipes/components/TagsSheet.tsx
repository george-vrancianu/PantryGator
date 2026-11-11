import {
  Box,
  Button,
  CloseIcon,
  displayType,
  gutterLeft,
  gutterRight,
  IconButton,
  plusBottomInset,
  Sheet,
  TagField,
  tokens,
  visuallyHidden,
} from '@pocket-pantry/ui';
import { Trans, useTranslation } from 'react-i18next';
import { countWithTags } from '../../../lib/tagFilter';
import type { RecipeListItem } from '../../../lib/recipes';
import type { RecipeTag } from '../../../lib/tags';

const bold = { b: <Box component="b" sx={{ color: tokens.color.ink }} /> };

/**
 * A visually hidden polite status line, "Dinner, Vegan selected. 2 Recipes match.", that updates on
 * every pick and search change. The region stays mounted (empty while nothing is picked) so a
 * screen reader hears the first pick and the last removal as changes. The sheet carries its own, since the page is hidden behind it.
 */
export function TagStatus({
  picked,
  resultCount,
}: {
  picked: RecipeTag[];
  resultCount: number | undefined;
}) {
  const { t } = useTranslation('recipes');
  return (
    <Box role="status" aria-live="polite" sx={visuallyHidden}>
      {picked.length === 0 || resultCount === undefined
        ? ''
        : t('tags.status', {
            names: picked.map((tag) => tag.name).join(', '),
            count: resultCount,
          })}
    </Box>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  onExited?: () => void;
  /** Every Tag on offer in this scope. */
  options: RecipeTag[];
  /** The picked Tags, in the order they were picked. */
  picked: RecipeTag[];
  onChange: (tagIds: string[]) => void;
  /**
   * The Recipes in this scope narrowed by the text search only (Variants listed). With it, each
   * unpicked Tag shows how many Recipes it would leave and one at 0 is dimmed; without it (still
   * loading) there are no counts and nothing is dimmed.
   */
  scopeRecipes: readonly RecipeListItem[] | undefined;
  /** How many Recipes the page lists right now. */
  resultCount: number;
  /** Explore offers no Your Tags: its empty-search line says so. */
  scope: 'family' | 'catalog';
};

/**
 * The Tags sheet (docs/handoffs/tags-filter section 3). Picks apply live to the list behind it;
 * closing never undoes them. The Tag field's list is always open, in place.
 */
export function TagsSheet({
  open,
  onClose,
  onExited,
  options,
  picked,
  onChange,
  scopeRecipes,
  resultCount,
  scope,
}: Props) {
  const { t } = useTranslation('recipes');
  const pickedIds = picked.map((tag) => tag.id);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      onExited={onExited}
      label={t('tags.sheetTitle')}
      header={
        <Box sx={{ px: 2.5, pt: 1 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Box component="h2" sx={{ ...displayType, fontSize: 23, m: 0 }}>
              {t('tags.sheetTitle')}
            </Box>
            <IconButton label={t('tags.close')} tone="plain" onClick={onClose}>
              <CloseIcon size={20} />
            </IconButton>
          </Box>
          <Box
            sx={{
              fontSize: 13.5,
              color: tokens.color.muted,
              pb: 1,
            }}
          >
            <Trans t={t} i18nKey="tags.sheetHint" components={bold} />
          </Box>
        </Box>
      }
      footer={
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 2fr',
            gap: '10px',
            pl: gutterLeft(20),
            pr: gutterRight(20),
            pt: 1.5,
            pb: plusBottomInset(26),
          }}
        >
          <Button
            variant="secondary"
            disabled={picked.length === 0}
            onClick={() => onChange([])}
          >
            {t('tags.clear')}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {resultCount === 0
              ? t('tags.showNone')
              : t('tags.show', { count: resultCount })}
          </Button>
        </Box>
      }
    >
      <TagStatus picked={picked} resultCount={resultCount} />
      <Box sx={{ px: 2.5, py: 1 }}>
        <TagField
          list="inline"
          options={options}
          value={picked}
          onChange={(next) => onChange(next.map((tag) => tag.id))}
          countOf={
            scopeRecipes
              ? (tag) => countWithTags(scopeRecipes, [...pickedIds, tag.id])
              : undefined
          }
          onEscape={onClose}
          labels={{
            field: t('tags.fieldLabel'),
            placeholder: t('tags.fieldPlaceholder'),
            yourTags: t('tags.yourTags'),
            yourTagsNote: t('tags.yourTagsNote'),
            noOptions: t(
              scope === 'catalog' ? 'tags.noOptionsExplore' : 'tags.noOptions',
            ),
            clear: t('tags.clearAll'),
            remove: (name) => t('tags.remove', { name }),
            more: (count) => t('tags.more', { count }),
            optionCount: (count) => t('tags.optionCount', { count }),
          }}
        />
      </Box>
    </Sheet>
  );
}
