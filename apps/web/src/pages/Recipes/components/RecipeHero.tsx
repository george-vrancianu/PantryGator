import { Stack, Typography } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { TagChips } from '@/components/recipe/TagChips/TagChips';
import type { RecipeDetail } from '../../../lib/recipes';

/** What stays in the sheet of the Recipe's hero once the Canopy header holds the title and facts: its Tags and the archived notice. */
export function RecipeHero({ recipe }: { recipe: RecipeDetail }) {
  const { t } = useTranslation('recipes');
  if (recipe.tags.length === 0 && !recipe.archived) return null;
  return (
    <Stack spacing={1.5}>
      <TagChips tags={recipe.tags} />
      {recipe.archived ? (
        <Typography color="text.secondary">{t('archived')}</Typography>
      ) : null}
    </Stack>
  );
}
