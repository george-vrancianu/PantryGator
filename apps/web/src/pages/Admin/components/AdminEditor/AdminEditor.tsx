import { useMemo } from 'react';
import type { AdminCatalog } from '@/lib/admin';
import { EditorSheetContext } from '@/components/editorSheetContext';
import type { useAdminScreen } from '../../hooks/useAdminScreen';
import { AisleEditor } from '../AisleEditor/AisleEditor';
import { AllergenEditor } from '../AllergenEditor/AllergenEditor';
import { CatalogTagEditor } from '../CatalogTagEditor/CatalogTagEditor';
import { CategoryEditor } from '../CategoryEditor/CategoryEditor';
import { EatingMomentEditor } from '../EatingMomentEditor/EatingMomentEditor';
import { IngredientEditor } from '../IngredientEditor/IngredientEditor';
import { RecipeEditor } from '../RecipeEditor/RecipeEditor';
import { TagGroupEditor } from '../TagGroupEditor/TagGroupEditor';

/**
 * The editor for whatever `useAdminScreen().editing` names. Recipes replace the section's list
 * (the full-page editor); every other editor opens as a sheet over the list: the editor (an
 * `EditorForm`) draws the sheet itself, and closing it (the X, scrim or Escape) leaves the list
 * as it was, with focus back on the row that opened it.
 */
export function AdminEditor({
  screen,
  catalog,
}: {
  screen: ReturnType<typeof useAdminScreen>;
  catalog: AdminCatalog;
}) {
  const { editing } = screen;
  const host = useMemo(() => ({ onClose: screen.close }), [screen.close]);
  if (!editing) return null;
  if (editing.type === 'recipe') {
    return <PageEditor screen={screen} catalog={catalog} />;
  }
  return (
    <EditorSheetContext.Provider value={host}>
      <PageEditor screen={screen} catalog={catalog} />
    </EditorSheetContext.Provider>
  );
}

function PageEditor({
  screen,
  catalog,
}: {
  screen: ReturnType<typeof useAdminScreen>;
  catalog: AdminCatalog;
}) {
  const { editing } = screen;
  if (!editing) return null;
  if (editing.type === 'ingredient') {
    return (
      <IngredientEditor
        key={editing.id ?? 'new'}
        ingredient={screen.editedIngredient}
        catalog={catalog}
        onDone={screen.close}
      />
    );
  }
  if (editing.type === 'aisle') {
    return (
      <AisleEditor
        key={editing.id ?? 'new'}
        aisle={screen.editedAisle}
        onDone={screen.close}
      />
    );
  }
  if (editing.type === 'recipe') {
    return (
      <RecipeEditor
        key={editing.id ?? 'new'}
        recipeId={editing.id}
        catalog={catalog}
        onOpen={(id) => screen.edit({ type: 'recipe', id })}
        onClose={screen.close}
      />
    );
  }
  if (editing.type === 'eatingMoment') {
    return (
      <EatingMomentEditor
        key={editing.id ?? 'new'}
        moment={screen.editedEatingMoment}
        onDone={screen.close}
      />
    );
  }
  if (editing.type === 'allergen') {
    return (
      <AllergenEditor
        key={editing.id ?? 'new'}
        allergen={screen.editedAllergen}
        onDone={screen.close}
      />
    );
  }
  if (editing.type === 'tagGroup') {
    return (
      <TagGroupEditor
        key={editing.id ?? 'new'}
        group={screen.editedTagGroup}
        onDone={screen.close}
      />
    );
  }
  if (editing.type === 'tag') {
    return (
      <CatalogTagEditor
        key={editing.id ?? 'new'}
        tag={screen.editedTag}
        groups={catalog.tagGroups}
        onDone={screen.close}
      />
    );
  }
  if (editing.type === 'category') {
    return (
      <CategoryEditor
        key={`${editing.kind}-${editing.id ?? 'new'}`}
        kind={editing.kind}
        category={screen.editedCategory}
        catalog={catalog}
        onDone={screen.close}
      />
    );
  }
  return null;
}
