import {
  Box,
  Card,
  ChevronRightIcon,
  ListRow,
  ListRowItem,
  RecipesIcon,
  Tag,
  Typography,
} from '@pocket-pantry/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import { useAdminRecipes, type AdminRecipeListItem } from '@/lib/adminRecipes';
import {
  CatalogCard,
  CatalogSection,
  NewButton,
  RowEditButton,
  RowTile,
} from '../CatalogRowParts/CatalogRowParts';

type Props = {
  onCreate: () => void;
  onEdit: (id: string) => void;
};

/** The Catalog Recipes in a Card, each Base Recipe followed by its inset Variants; archived ones are marked. */
export function RecipeList({ onCreate, onEdit }: Props) {
  const { t } = useTranslation(['admin', 'errors']);
  const query = useAdminRecipes();
  const headingId = useId();
  const recipes = query.data ?? [];
  const bases = recipes.filter((recipe) => recipe.parentId === null);
  const variantsOf = (id: string) =>
    recipes.filter((recipe) => recipe.parentId === id);

  const row = (recipe: AdminRecipeListItem) => (
    <ListRow
      leading={
        <RowTile>
          <RecipesIcon size={19} />
        </RowTile>
      }
      title={
        <RowEditButton
          label={t('admin:recipe.edit', { title: recipe.title })}
          onClick={() => onEdit(recipe.id)}
        >
          {recipe.title}
        </RowEditButton>
      }
      tags={
        recipe.archived ? (
          <Tag tone="neutral">{t('admin:recipe.archivedBadge')}</Tag>
        ) : null
      }
      trailing={
        <Box sx={{ pr: 1.5, display: 'flex' }}>
          <ChevronRightIcon size={18} />
        </Box>
      }
    />
  );

  return (
    <CatalogSection
      id={headingId}
      title={t('admin:recipe.title')}
      count={query.data ? bases.length : undefined}
    >
      {query.error ? (
        <Typography role="alert">
          {translateApiError(t, query.error)}
        </Typography>
      ) : null}
      {query.data && bases.length === 0 ? (
        <Card sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {t('admin:recipe.empty')}
          </Typography>
        </Card>
      ) : null}
      {bases.length > 0 ? (
        <CatalogCard labelledBy={headingId}>
          {bases.map((base) => {
            const variants = variantsOf(base.id);
            return (
              <ListRowItem key={base.id}>
                {/* Contains the row's stretched edit button, so it does not cover the variants below. */}
                <Box sx={{ position: 'relative' }}>{row(base)}</Box>
                {variants.length > 0 ? (
                  <Box
                    component="ul"
                    aria-label={t('admin:recipe.variantsOf', {
                      title: base.title,
                    })}
                    sx={{
                      m: 0,
                      p: 0,
                      pl: 6,
                      listStyle: 'none',
                      borderTop: 1,
                      borderColor: 'divider',
                    }}
                  >
                    {variants.map((variant) => (
                      <ListRowItem key={variant.id}>{row(variant)}</ListRowItem>
                    ))}
                  </Box>
                ) : null}
              </ListRowItem>
            );
          })}
        </CatalogCard>
      ) : null}
      <Box sx={{ justifySelf: 'start' }}>
        <NewButton onClick={onCreate}>{t('admin:recipe.new')}</NewButton>
      </Box>
    </CatalogSection>
  );
}
