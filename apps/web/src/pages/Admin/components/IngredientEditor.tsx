import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  localName,
  useDeleteIngredient,
  useSaveIngredient,
  type AdminCatalog,
  type AdminIngredient,
  type IngredientInput,
} from '../../../lib/admin';
import { EditorForm } from '../../../components/EditorForm';
import { IngredientAllergens } from './IngredientAllergens';
import { IngredientFields } from './IngredientFields';
import { TranslationsEditor } from './TranslationsEditor';

type Props = {
  /** Omit to create a new Ingredient. */
  ingredient?: AdminIngredient;
  catalog: AdminCatalog;
  onDone: () => void;
};

/** Create or edit one Ingredient: name, Leaf Category, default unit, Pantry Basic flag, translations and Synonyms. */
export function IngredientEditor({ ingredient, catalog, onDone }: Props) {
  const { t, i18n } = useTranslation(['admin', 'errors']);
  const save = useSaveIngredient(ingredient?.id);
  const remove = useDeleteIngredient();
  const [fields, setFields] = useState<IngredientInput>({
    name: ingredient?.name ?? '',
    leafCategoryId:
      ingredient?.leafCategoryId ?? catalog.leafCategories[0]?.id ?? '',
    defaultUnit: ingredient?.defaultUnit ?? 'g',
    pantryBasic: ingredient?.pantryBasic ?? false,
  });

  return (
    <EditorForm
      after={
        <>
          {ingredient ? (
            <IngredientAllergens
              ingredient={ingredient}
              allergens={catalog.allergens}
            />
          ) : null}
          {ingredient ? (
            <TranslationsEditor
              entityType="ingredient"
              entityId={ingredient.id}
              name={ingredient.name}
              translations={ingredient.translations}
              part="synonyms"
            />
          ) : null}
        </>
      }
      heading={
        ingredient
          ? t('admin:ingredient.edit', {
              name: localName(ingredient, i18n.language),
            })
          : t('admin:ingredient.new')
      }
      error={save.error ?? remove.error}
      canSave={fields.name.trim() !== ''}
      saving={save.isPending}
      onSubmit={() =>
        save.mutate(
          { ...fields, name: fields.name.trim() },
          { onSuccess: onDone },
        )
      }
      onCancel={onDone}
      onDelete={
        ingredient
          ? () => remove.mutate(ingredient.id, { onSuccess: onDone })
          : undefined
      }
      deleting={remove.isPending}
    >
      <IngredientFields
        catalog={catalog}
        value={fields}
        onChange={setFields}
        controls="chips"
        afterName={
          ingredient ? (
            <TranslationsEditor
              entityType="ingredient"
              entityId={ingredient.id}
              name={ingredient.name}
              translations={ingredient.translations}
              part="names"
            />
          ) : null
        }
      />
    </EditorForm>
  );
}
