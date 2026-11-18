import {
  Box,
  Sheet,
  TagField,
  palette,
  visuallyHidden,
} from '@pocket-pantry/ui';
import { Trans, useTranslation } from 'react-i18next';
import { countWithTags } from '@/lib/tagFilter';
import type { RecipeListItem } from '@/lib/recipes';
import type { RecipeTag } from '@/lib/tags';

const bold = {
  b: <Box component="b" sx={{ color: palette('text-primary') }} />,
};

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
      title={t('tags.sheetTitle')}
      primary={{
        label:
          resultCount === 0
            ? t('tags.showNone')
            : t('tags.show', { count: resultCount }),
        onClick: onClose,
      }}
      secondary={{
        label: t('tags.clear'),
        // Nothing to clear until a Tag is picked.
        disabled: picked.length === 0,
        onClick: () => onChange([]),
      }}
    >
      <TagStatus picked={picked} resultCount={resultCount} />
      <Box sx={{ px: 2.5, py: 1 }}>
        <Box sx={{ fontSize: 13.5, color: palette('text-secondary'), pb: 1 }}>
          <Trans t={t} i18nKey="tags.sheetHint" components={bold} />
        </Box>
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
