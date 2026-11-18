import { Box, TagChip, palette } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { rowTagNames, splitRowTags, type RecipeTag } from '@/lib/tags';

type Props = {
  tags: RecipeTag[];
  /** Tags the active filter matched; they come first (the Tag filter passes them in). */
  matchedIds?: readonly string[];
  /** Quiet text after the chips, e.g. the Level: shown as "· Easy". */
  meta?: string[];
};

/**
 * The Tags line of a Recipe row: up to two Tag chips, "+N" for the rest, then "· {meta}".
 * One labelled element names every Tag ("Tags: Dinner, Vegan, High-protein"); the chips and "+N"
 * are hidden from screen readers so the overflow is announced by name, not as a bare number.
 */
export function RowTags({ tags, matchedIds = [], meta = [] }: Props) {
  const { t } = useTranslation('recipes');
  const { shown, more } = splitRowTags(tags, matchedIds);
  // A line with nothing to say is no group at all, not an empty "Tags:" one.
  if (tags.length === 0 && meta.length === 0) return null;
  return (
    <Box
      role="group"
      aria-label={t('tags.rowLabel', { names: rowTagNames(tags, matchedIds) })}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        mt: '5px',
        minWidth: 0,
      }}
    >
      {shown.map((tag) => (
        <TagChip
          key={tag.id}
          aria-hidden
          kind={tag.kind}
          matched={matchedIds.includes(tag.id)}
        >
          {tag.name}
        </TagChip>
      ))}
      {more > 0 ? (
        <Box
          component="span"
          aria-hidden
          sx={{
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 700,
            color: palette('text-secondary'),
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          +{more}
        </Box>
      ) : null}
      {meta.length > 0 ? (
        <Box
          component="span"
          sx={{
            flexShrink: 0,
            fontSize: 13,
            fontWeight: 500,
            color: palette('text-secondary'),
            whiteSpace: 'nowrap',
          }}
        >
          · {meta.join(' · ')}
        </Box>
      ) : null}
    </Box>
  );
}
