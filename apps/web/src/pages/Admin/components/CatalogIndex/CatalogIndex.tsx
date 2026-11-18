import {
  Box,
  Card,
  ChevronRightIcon,
  ClockIcon,
  CustomiseIcon,
  LayersIcon,
  ListRow,
  ListRowItem,
  PantryIcon,
  RecipesIcon,
  TagIcon,
  WarningIcon,
  insetFocusRingStyle,
  type IconProps,
} from '@pocket-pantry/ui';
import type { ComponentType } from 'react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { SectionHeading } from '@/components/SectionHeading';
import { RowTile } from '../CatalogRowParts/CatalogRowParts';
import type { AdminCatalog } from '@/lib/admin';
import { useAdminRecipes } from '@/lib/adminRecipes';
import type { AdminSection } from '../../adminSections';

type Row = {
  section: AdminSection;
  icon: ComponentType<IconProps>;
  title: string;
  meta: string | undefined;
};

/** The Catalog tab: a nav row per section with its live count, grouped as Ingredients and Recipes. */
export function CatalogIndex({ catalog }: { catalog: AdminCatalog }) {
  const { t } = useTranslation('admin');
  const recipes = useAdminRecipes().data;
  const ingredientsId = useId();
  const recipesId = useId();

  const unchecked = catalog.ingredients.filter(
    (item) => item.allergensReviewPending,
  ).length;
  const count = catalog.ingredients.length;

  const ingredientRows: Row[] = [
    {
      section: 'ingredients',
      icon: PantryIcon,
      title: t('index.ingredients'),
      meta: t('index.ingredientsMeta', { count, unchecked }),
    },
    {
      section: 'allergens',
      icon: WarningIcon,
      title: t('index.allergens'),
      meta: String(catalog.allergens.length),
    },
    {
      section: 'aisles',
      icon: LayersIcon,
      title: t('index.aisles'),
      meta: t('index.aislesMeta', { count: catalog.aisles.length }),
    },
    {
      section: 'categories',
      icon: CustomiseIcon,
      title: t('index.categories'),
      meta: t('index.categoriesMeta', {
        parents: t('index.categoriesParents', {
          count: catalog.parentCategories.length,
        }),
        leaves: t('index.categoriesLeaves', {
          count: catalog.leafCategories.length,
        }),
      }),
    },
  ];
  const recipeRows: Row[] = [
    {
      section: 'recipes',
      icon: RecipesIcon,
      title: t('index.recipes'),
      // Counts wait for the Recipes query rather than showing a wrong 0.
      meta: recipes
        ? t('index.recipesMeta', {
            count: recipes.length,
            archived: recipes.filter((recipe) => recipe.archived).length,
          })
        : undefined,
    },
    {
      section: 'tags',
      icon: TagIcon,
      title: t('index.tags'),
      meta: t('index.tagsMeta', {
        count: catalog.tags.length,
        groups: catalog.tagGroups.length,
      }),
    },
    {
      section: 'eating-moments',
      icon: ClockIcon,
      title: t('index.eatingMoments'),
      meta: String(catalog.eatingMoments.length),
    },
  ];

  return (
    <>
      <Group
        id={ingredientsId}
        title={t('index.ingredientsGroup')}
        rows={ingredientRows}
      />
      <Group id={recipesId} title={t('index.recipesGroup')} rows={recipeRows} />
    </>
  );
}

function Group({
  id,
  title,
  rows,
}: {
  id: string;
  title: string;
  rows: Row[];
}) {
  return (
    <Box
      component="section"
      aria-labelledby={id}
      sx={{ display: 'grid', gap: 1 }}
    >
      <SectionHeading id={id} title={title} />
      <Card
        component="ul"
        variant="list"
        aria-labelledby={id}
        sx={{ listStyle: 'none', m: 0, overflow: 'hidden' }}
      >
        {rows.map((row) => (
          <NavRow key={row.section} {...row} />
        ))}
      </Card>
    </Box>
  );
}

function NavRow({ section, icon: Icon, title, meta }: Row) {
  const navigate = useNavigate();
  return (
    <ListRowItem>
      <Box
        component="button"
        type="button"
        onClick={() => void navigate(`/admin/${section}`)}
        sx={{
          display: 'block',
          width: '100%',
          p: 0,
          border: 0,
          background: 'none',
          font: 'inherit',
          color: 'inherit',
          textAlign: 'start',
          cursor: 'pointer',
          '&:focus-visible': insetFocusRingStyle,
        }}
      >
        <ListRow
          leading={
            <RowTile>
              <Icon size={19} />
            </RowTile>
          }
          title={title}
          meta={meta}
          trailing={<ChevronRightIcon size={18} />}
        />
      </Box>
    </ListRowItem>
  );
}
