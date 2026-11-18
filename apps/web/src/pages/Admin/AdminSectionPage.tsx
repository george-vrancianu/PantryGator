import { Alert, Spinner, Stack } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router-dom';
import { Screen } from '@/components/layout/Screen';
import { AdminEditor } from './components/AdminEditor/AdminEditor';
import { AisleList } from './components/AisleList/AisleList';
import { AllergenList } from './components/AllergenList/AllergenList';
import { CatalogTagList } from './components/CatalogTagList/CatalogTagList';
import { CategoryTree } from './components/CategoryTree/CategoryTree';
import { EatingMomentList } from './components/EatingMomentList/EatingMomentList';
import { IngredientList } from './components/IngredientList/IngredientList';
import { RecipeList } from './components/RecipeList/RecipeList';
import { TagGroupList } from './components/TagGroupList/TagGroupList';
import { asAdminSection, CATALOG_TAB_URL } from './adminSections';
import { useAdminScreen } from './hooks/useAdminScreen';

/** One Catalog section (`admin/:section`): today's list for it, or the editor opened from it. */
export function AdminSectionPage() {
  const { t } = useTranslation(['admin', 'common']);
  const section = asAdminSection(useParams().section);
  const screen = useAdminScreen();
  const { catalog, editing } = screen;

  if (!section) return <Navigate to={CATALOG_TAB_URL} replace />;

  let list = null;
  if (catalog) {
    switch (section) {
      case 'ingredients':
        list = (
          <IngredientList
            ingredients={screen.ingredients}
            catalog={catalog}
            filter={screen.filter}
            onFilterChange={screen.setFilter}
            onCreate={() => screen.edit({ type: 'ingredient', id: null })}
            onEdit={(id) => screen.edit({ type: 'ingredient', id })}
          />
        );
        break;
      case 'allergens':
        list = (
          <AllergenList
            allergens={catalog.allergens}
            onCreate={() => screen.edit({ type: 'allergen', id: null })}
            onEdit={(id) => screen.edit({ type: 'allergen', id })}
          />
        );
        break;
      case 'aisles':
        list = (
          <AisleList
            aisles={catalog.aisles}
            onCreate={() => screen.edit({ type: 'aisle', id: null })}
            onEdit={(id) => screen.edit({ type: 'aisle', id })}
          />
        );
        break;
      case 'categories':
        list = (
          <CategoryTree
            catalog={catalog}
            onCreate={(kind) =>
              screen.edit({ type: 'category', kind, id: null })
            }
            onEdit={(kind, id) => screen.edit({ type: 'category', kind, id })}
          />
        );
        break;
      case 'recipes':
        list = (
          <RecipeList
            onCreate={() => screen.edit({ type: 'recipe', id: null })}
            onEdit={(id) => screen.edit({ type: 'recipe', id })}
          />
        );
        break;
      case 'tags':
        list = (
          <Stack spacing={3}>
            <TagGroupList
              groups={catalog.tagGroups}
              onCreate={() => screen.edit({ type: 'tagGroup', id: null })}
              onEdit={(id) => screen.edit({ type: 'tagGroup', id })}
            />
            <CatalogTagList
              groups={catalog.tagGroups}
              tags={catalog.tags}
              onCreate={() => screen.edit({ type: 'tag', id: null })}
              onEdit={(id) => screen.edit({ type: 'tag', id })}
            />
          </Stack>
        );
        break;
      case 'eating-moments':
        list = (
          <EatingMomentList
            moments={catalog.eatingMoments}
            onCreate={() => screen.edit({ type: 'eatingMoment', id: null })}
            onEdit={(id) => screen.edit({ type: 'eatingMoment', id })}
          />
        );
        break;
    }
  }

  const titles = {
    ingredients: 'index.ingredients',
    allergens: 'index.allergens',
    aisles: 'index.aisles',
    categories: 'index.categories',
    recipes: 'index.recipes',
    tags: 'index.tags',
    'eating-moments': 'index.eatingMoments',
  } as const;

  return (
    <Screen
      title={t(`admin:${titles[section]}`)}
      back={{ label: t('admin:index.back'), href: CATALOG_TAB_URL }}
    >
      <Stack spacing={3}>
        {screen.error ? <Alert>{screen.error}</Alert> : null}
        {screen.isLoading ? <Spinner label={t('common:loading')} /> : null}
        {catalog && editing?.type === 'recipe' ? (
          <AdminEditor screen={screen} catalog={catalog} />
        ) : (
          <>
            {list}
            {catalog && editing ? (
              <AdminEditor screen={screen} catalog={catalog} />
            ) : null}
          </>
        )}
      </Stack>
    </Screen>
  );
}
