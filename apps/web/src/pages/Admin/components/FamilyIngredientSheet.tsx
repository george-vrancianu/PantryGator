import { Box, Stack, Typography, radius, tokens } from '@pocket-pantry/ui';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogSearch } from '../../../components/catalogSearch/CatalogSearch';
import { BrowseByAisle } from '../../../components/catalogSearch/emptyState/BrowseByAisle';
import {
  useMergeFamilyIngredient,
  usePromoteFamilyIngredient,
  type FamilyIngredientGroup,
  type PromoteResult,
} from '../../../lib/familyIngredientsQueue';
import { ReviewSheet } from './ReviewSheet';

type Props = {
  group: FamilyIngredientGroup;
  open: boolean;
  onClose: () => void;
  onExited: () => void;
  onPromoted: (result: PromoteResult) => void;
  /** Called with the name of the shared Ingredient the group went into. */
  onMerged: (target: string) => void;
};

type Step = 'info' | 'promote' | 'merge';

/**
 * A Family Ingredient group in a sheet: how many families added it, then Promote to Catalog (pick which
 * family's copy becomes the shared Ingredient; the others merge into it) or Merge into… (a shared
 * Ingredient found with the Catalog search; every family keeps the name as its own synonym).
 */
export function FamilyIngredientSheet({
  group,
  open,
  onClose,
  onExited,
  onPromoted,
  onMerged,
}: Props) {
  const { t } = useTranslation('admin');
  const promote = usePromoteFamilyIngredient();
  const merge = useMergeFamilyIngredient();
  const radioName = useId();
  const [step, setStep] = useState<Step>('info');
  const [chosen, setChosen] = useState(group.copies[0]?.id ?? '');
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(
    null,
  );
  const subtitle = `${group.leafCategory.name} · ${t(`locales.${group.locale}`)}`;

  if (step === 'promote') {
    return (
      <ReviewSheet
        open={open}
        onClose={onClose}
        onExited={onExited}
        onBack={() => setStep('info')}
        title={t('familyIngredients.promoteName', { name: group.name })}
        subtitle={
          group.copies.length > 1
            ? t('familyIngredients.promoteHint')
            : undefined
        }
        error={promote.error}
        form={{
          onSubmit: () => {
            if (!chosen || promote.isPending) return;
            promote.mutate(chosen, { onSuccess: onPromoted });
          },
          canSubmit: chosen !== '',
          saving: promote.isPending,
          submitLabel: t('familyIngredients.promote'),
          savingLabel: t('familyIngredients.promoting'),
        }}
      >
        <Box
          component="fieldset"
          sx={{ border: 0, m: 0, p: 0, display: 'grid', gap: 0.5 }}
        >
          <Typography component="legend" variant="body2" sx={{ pb: 1 }}>
            {t('familyIngredients.pickCopy')}
          </Typography>
          {group.copies.map((copy) => (
            <Box
              key={copy.id}
              component="label"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                minHeight: 44,
              }}
            >
              <input
                type="radio"
                name={radioName}
                checked={chosen === copy.id}
                onChange={() => setChosen(copy.id)}
                style={{ width: 20, height: 20 }}
              />
              {t('familyIngredients.copy', {
                name: copy.name,
                leaf: copy.leafCategory.name,
                locale: t(`locales.${copy.locale}`),
              })}
            </Box>
          ))}
        </Box>
      </ReviewSheet>
    );
  }

  if (step === 'merge') {
    return (
      <ReviewSheet
        open={open}
        onClose={onClose}
        onExited={onExited}
        onBack={() => setStep('info')}
        title={t('familyIngredients.mergeName', { name: group.name })}
        subtitle={t('familyIngredients.mergeHint')}
        error={merge.error}
        form={{
          onSubmit: () => {
            const ingredientId = group.copies[0]?.id;
            if (!picked || !ingredientId || merge.isPending) return;
            merge.mutate(
              { ingredientId, targetIngredientId: picked.id },
              { onSuccess: () => onMerged(picked.name) },
            );
          },
          canSubmit: picked !== null,
          saving: merge.isPending,
          submitLabel: t('familyIngredients.merge'),
          savingLabel: t('familyIngredients.merging'),
        }}
      >
        <Stack spacing={1}>
          <CatalogSearch
            emptyState={<BrowseByAisle />}
            showUnit={false}
            scope="shared"
            onSelect={(ingredient) =>
              setPicked({ id: ingredient.id, name: ingredient.name })
            }
            onQueryChange={() => setPicked(null)}
          />
          {picked ? (
            <Typography variant="body2">
              {t('unmatched.picked', { name: picked.name })}
            </Typography>
          ) : null}
        </Stack>
      </ReviewSheet>
    );
  }

  return (
    <ReviewSheet
      open={open}
      onClose={onClose}
      onExited={onExited}
      size="content"
      title={group.name}
      subtitle={subtitle}
      actions={{
        primary: {
          label: t('review.promoteAction'),
          onClick: () => setStep('promote'),
        },
        secondary: {
          label: t('review.mergeAction'),
          onClick: () => setStep('merge'),
        },
      }}
    >
      <Box
        sx={{
          p: 1.5,
          borderRadius: radius.control,
          bgcolor: tokens.color.subtle,
        }}
      >
        <Typography variant="meta">
          {t('familyIngredients.families', { count: group.familyCount })}
        </Typography>
      </Box>
    </ReviewSheet>
  );
}
