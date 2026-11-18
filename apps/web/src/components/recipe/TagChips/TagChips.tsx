import { Box, TagChip } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import type { RecipeTag } from '@/lib/tags';

/**
 * Every Tag on a Recipe as a chip, for the Recipe page and Quick View. Family Tags first, then
 * Catalog Tags by Tag Group, as the API sends them. Nothing when the Recipe has no Tags.
 */
export function TagChips({ tags }: { tags: RecipeTag[] }) {
  const { t } = useTranslation('recipes');
  if (tags.length === 0) return null;
  return (
    <Box
      component="ul"
      aria-label={t('tags.groupLabel')}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        listStyle: 'none',
        m: 0,
        p: 0,
      }}
    >
      {tags.map((tag) => (
        <li key={tag.id}>
          <TagChip kind={tag.kind} size="medium">
            {tag.name}
          </TagChip>
        </li>
      ))}
    </Box>
  );
}
