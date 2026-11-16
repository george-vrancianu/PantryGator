import {
  ActionMenu,
  Alert,
  BranchIcon,
  DeleteIcon,
  ManualEntryIcon,
  Stack,
} from '@pocket-pantry/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Screen } from '../../../components/layout/Screen';
import { ConfirmPrompt } from '../../../components/ConfirmAction';
import { translateApiError } from '../../../i18n/translateApiError';
import { useArchiveFamilyRecipe } from '../../../lib/familyRecipes';
import { familyRecipeHref } from '../../../lib/recipeHref';
import type { RecipeDetail } from '../../../lib/recipes';

/**
 * The Recipe screen's header: Back to the list, and what a Member can do with
 * the Recipe. The Family's own live Recipe keeps Make a Variant, Edit and
 * Delete (archive) in a menu.
 */
export function RecipeHeader({ recipe }: { recipe: RecipeDetail | undefined }) {
  const { t } = useTranslation(['recipes', 'errors']);
  const navigate = useNavigate();
  const archive = useArchiveFamilyRecipe(recipe?.id ?? '');
  const [asking, setAsking] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const back = { label: t('recipes:back'), href: '/recipes' };
  // No Recipe yet (loading, not found): keep a title so the screen has an H1.
  if (!recipe) return <Screen back={back} title={t('recipes:title')} />;

  const own = recipe.owner === 'family' && !recipe.archived;
  // A Variant's parent is a Catalog Base Recipe. A Family Base gets one only
  // when it is a copy (the draft branches from the Base it was Copied From);
  // the Recipe and that Catalog Base must also be live.
  const canMakeVariant =
    !recipe.archived &&
    !recipe.base?.archived &&
    !(
      recipe.owner === 'family' &&
      recipe.parentId === null &&
      (!recipe.copiedFrom || recipe.copiedFrom.archived)
    );
  const makeVariant = {
    label: t('recipes:family.makeVariant'),
    href: `/recipes/${recipe.id}/variant/new`,
  };

  const remove = () =>
    archive.mutate(undefined, {
      // A Variant's base is the Catalog Base, which has no page of its own for the Family:
      // go to the Family's copy of it, if any.
      onSuccess: () =>
        navigate(
          recipe.base?.familyCopyId
            ? familyRecipeHref(recipe.base.familyCopyId)
            : '/recipes',
        ),
    });

  return (
    <>
      <Screen
        back={back}
        secondary={
          own ? (
            <ActionMenu
              buttonRef={menuButton}
              label={t('recipes:family.moreActions')}
              items={[
                ...(canMakeVariant
                  ? [{ ...makeVariant, icon: <BranchIcon /> }]
                  : []),
                {
                  label: t('recipes:family.edit'),
                  href: `/recipes/${recipe.id}/edit`,
                  icon: <ManualEntryIcon />,
                },
                {
                  label: t('recipes:family.delete'),
                  icon: <DeleteIcon />,
                  tone: 'urgent' as const,
                  onClick: () => setAsking(true),
                },
              ]}
            />
          ) : undefined
        }
      />
      {archive.error || asking ? (
        <Stack spacing={1} sx={{ mb: 2 }}>
          {archive.error ? (
            <Alert>{translateApiError(t, archive.error)}</Alert>
          ) : null}
          {asking ? (
            <ConfirmPrompt
              message={t('recipes:family.deleteConfirm')}
              disabled={archive.isPending}
              onConfirm={() => {
                setAsking(false);
                remove();
              }}
              onCancel={() => {
                setAsking(false);
                menuButton.current?.focus();
              }}
            />
          ) : null}
        </Stack>
      ) : null}
    </>
  );
}
