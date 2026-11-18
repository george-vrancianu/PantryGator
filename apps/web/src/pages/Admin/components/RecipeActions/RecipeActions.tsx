import { Alert, Button, Stack, TextField, Typography } from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmAction } from '@/components/ConfirmAction';
import { translateApiError } from '@/i18n/translateApiError';
import {
  useArchiveRecipe,
  useMakeVariant,
  type AdminRecipe,
} from '@/lib/adminRecipes';

type Props = {
  recipe: AdminRecipe;
  /** Opens the new Variant's editor. */
  onOpen: (id: string) => void;
};

/**
 * Whole-Recipe actions: make a Variant (only from a live Base Recipe) and
 * archive (any live Recipe; archived Recipes are never deleted).
 */
export function RecipeActions({ recipe, onOpen }: Props) {
  const { t } = useTranslation(['admin', 'errors']);
  const makeVariant = useMakeVariant(recipe.id);
  const archive = useArchiveRecipe(recipe.id);
  const [title, setTitle] = useState('');
  const canVariant = recipe.parentId === null && !recipe.archived;
  const error = makeVariant.error ?? archive.error;

  return (
    <Stack spacing={2}>
      {error ? <Alert>{translateApiError(t, error)}</Alert> : null}
      {canVariant ? (
        <Stack
          component="form"
          spacing={1}
          aria-label={t('admin:recipe.variant.title')}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            makeVariant.mutate(
              { title: title.trim() },
              { onSuccess: (variant) => onOpen((variant as AdminRecipe).id) },
            );
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {t('admin:recipe.variant.hint')}
          </Typography>
          <TextField
            label={t('admin:recipe.variant.name')}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <div>
            <Button
              type="submit"
              variant="secondary"
              disabled={makeVariant.isPending || title.trim() === ''}
            >
              {makeVariant.isPending
                ? t('admin:recipe.variant.making')
                : t('admin:recipe.variant.make')}
            </Button>
          </div>
        </Stack>
      ) : null}
      {recipe.archived ? (
        <Alert severity="info">{t('admin:recipe.archive.note')}</Alert>
      ) : (
        <ConfirmAction
          variant="ghost"
          label={t('admin:recipe.archive.label')}
          message={t('admin:recipe.archive.confirm')}
          disabled={archive.isPending}
          onConfirm={() => archive.mutate()}
        />
      )}
    </Stack>
  );
}
