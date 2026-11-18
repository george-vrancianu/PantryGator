import {
  Alert,
  AlertIcon,
  Box,
  Card,
  ListRow,
  Spinner,
  Stack,
  SwipeRow,
  Tag,
  Typography,
  radius,
  tokens,
  useToast,
  visuallyHidden,
  type SwipeRowHandle,
  type SwipeRowLabels,
} from '@pocket-pantry/ui';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IngredientIconSlot } from '@/components/IngredientIconSlot';
import { RowHintNote } from '@/components/RowHintNote';
import { translateApiError } from '@/i18n/translateApiError';
import {
  familyCatalogQueryKey,
  useDeleteFamilyIngredient,
  useDeleteFamilySynonym,
  useFamilyCatalog,
  type FamilyCatalog,
  type FamilyCatalogIngredient,
  type FamilyCatalogSynonym,
} from '@/lib/familyCatalog';
import { useDeferredRemoval } from '@/lib/useDeferredRemoval';
import { useRowHint, type RowHint } from '@/lib/useRowHint';
import {
  FamilyIngredientSheet,
  USAGE_KINDS,
} from '../FamilyIngredientSheet/FamilyIngredientSheet';
import { FamilySynonymSheet } from '../FamilySynonymSheet/FamilySynonymSheet';

/** The Family catalog: what the Family added, which any Member can rename, move or delete (ADR 0011). */
export function FamilyCatalogSection() {
  const { t } = useTranslation(['settings', 'common']);
  const id = useId();
  const catalog = useFamilyCatalog();
  const deleteIngredient = useDeleteFamilyIngredient();
  const deleteSynonym = useDeleteFamilySynonym();
  const ingredientRemoval = useDeferredRemoval(
    familyCatalogQueryKey,
    deleteIngredient.mutateAsync,
  );
  const synonymRemoval = useDeferredRemoval(
    familyCatalogQueryKey,
    deleteSynonym.mutateAsync,
  );
  const headingRef = useRef<HTMLHeadingElement>(null);

  const data = catalog.data;
  // A deleted Ingredient stays out of the list, refetches included, until its delete has settled.
  const ingredients = useMemo(
    () =>
      data?.ingredients.filter((i) => !ingredientRemoval.hiddenIds.has(i.id)),
    [data, ingredientRemoval.hiddenIds],
  );
  const familyIds = useMemo(
    () => new Set(data?.ingredients.map((i) => i.id)),
    [data],
  );
  // Synonyms of a Family Ingredient show only as chips in its sheet.
  const otherNames = useMemo(
    () =>
      data?.synonyms.filter(
        (s) =>
          !familyIds.has(s.ingredient.id) &&
          !synonymRemoval.hiddenIds.has(s.id),
      ),
    [data, familyIds, synonymRemoval.hiddenIds],
  );

  const ingredientCount = ingredients?.length ?? 0;
  const otherCount = otherNames?.length ?? 0;
  // The last row of a list going takes focus with it: hand it to the heading.
  const hadRows = useRef(false);
  const rowCount = ingredientCount + otherCount;
  useEffect(() => {
    if (rowCount === 0 && hadRows.current) {
      const active = document.activeElement;
      if (!active || active === document.body) headingRef.current?.focus();
    }
    hadRows.current = rowCount > 0;
  }, [rowCount]);

  const hint = useRowHint('familyCatalog', ingredientCount + otherCount > 0);
  const error = [
    catalog.error,
    deleteIngredient.error,
    deleteSynonym.error,
  ].find(Boolean);
  const uncheckedCount =
    ingredients?.filter((i) => !i.allergensChecked).length ?? 0;
  // Entries waiting on their delete (the Undo window) no longer count.
  const empty =
    data &&
    ingredientCount === 0 &&
    data.synonyms.every(
      (s) =>
        synonymRemoval.hiddenIds.has(s.id) ||
        ingredientRemoval.hiddenIds.has(s.ingredient.id),
    );

  return (
    <Stack component="section" spacing={1} aria-labelledby={`${id}-heading`}>
      <Typography
        id={`${id}-heading`}
        ref={headingRef}
        tabIndex={-1}
        variant="sectionLabel"
        component="h2"
        color="text.secondary"
      >
        {t('settings:familyCatalog.title')}
      </Typography>
      <Typography variant="meta" color="text.secondary">
        {t('settings:familyCatalog.help')}
      </Typography>
      <RowHintNote hint={hint} text={t('settings:familyCatalog.hint')} />
      {uncheckedCount > 0 ? (
        <Box
          role="status"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 1.25,
            borderRadius: radius.control,
            bgcolor: tokens.color.soonBg,
            color: tokens.color.soonFg,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <AlertIcon size={18} />
          {t('settings:familyCatalog.checkLine', { count: uncheckedCount })}
        </Box>
      ) : null}
      {error ? <Alert>{translateApiError(t, error)}</Alert> : null}
      {catalog.isLoading ? <Spinner label={t('common:loading')} /> : null}
      {empty ? (
        <Card sx={{ textAlign: 'center', px: 2.25, py: 2.75 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
            {t('settings:familyCatalog.emptyTitle')}
          </Typography>
          <Typography variant="meta" color="text.secondary">
            {t('settings:familyCatalog.empty')}
          </Typography>
        </Card>
      ) : null}

      {data && ingredients && ingredients.length > 0 ? (
        <Box data-row-scope>
          <Card
            component="ul"
            variant="list"
            aria-label={t('settings:familyCatalog.title')}
            sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }}
          >
            {ingredients.map((ingredient, index) => {
              const peek = index === 0 && hint.peek;
              return (
                <IngredientRow
                  key={ingredient.id}
                  ingredient={ingredient}
                  catalog={data}
                  peek={peek}
                  onLearned={hint.onLearned}
                  disabled={deleteIngredient.isPending}
                  onRemove={() =>
                    ingredientRemoval.remove(
                      ingredient.id,
                      ingredient.name,
                      t('settings:familyCatalog.deleted', {
                        name: ingredient.name,
                      }),
                      { polite: true },
                    )
                  }
                />
              );
            })}
          </Card>
        </Box>
      ) : null}

      {otherNames && otherNames.length > 0 ? (
        <Stack spacing={0.5} sx={{ pt: 1 }}>
          <Typography variant="body1" component="h3" sx={{ fontWeight: 700 }}>
            {t('settings:familyCatalog.synonyms', { count: otherNames.length })}
          </Typography>
          <Typography variant="meta" color="text.secondary">
            {t('settings:familyCatalog.synonymsHint')}
          </Typography>
          <Box data-row-scope>
            <Card
              component="ul"
              variant="list"
              aria-label={t('settings:familyCatalog.synonyms', {
                count: otherNames.length,
              })}
              sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }}
            >
              {otherNames.map((synonym, index) => {
                const peek = ingredientCount === 0 && index === 0 && hint.peek;
                return (
                  <SynonymRow
                    key={synonym.id}
                    synonym={synonym}
                    peek={peek}
                    onLearned={hint.onLearned}
                    disabled={deleteSynonym.isPending}
                    onRemove={() =>
                      synonymRemoval.remove(
                        synonym.id,
                        synonym.name,
                        t('settings:familyCatalog.synonymRemoved', {
                          name: synonym.name,
                        }),
                        { polite: true },
                      )
                    }
                  />
                );
              })}
            </Card>
          </Box>
        </Stack>
      ) : null}
    </Stack>
  );
}

/** A sheet that mounts for each opening (so its draft restarts) and stays mounted until it has closed. */
function useSheet() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  return {
    mounted,
    open,
    show: () => {
      setMounted(true);
      setOpen(true);
    },
    close: () => setOpen(false),
    exited: () => setMounted(false),
  };
}

function IngredientRow({
  ingredient,
  catalog,
  peek,
  onLearned,
  disabled,
  onRemove,
}: {
  ingredient: FamilyCatalogIngredient;
  catalog: FamilyCatalog;
  peek: boolean;
  onLearned: RowHint['onLearned'];
  disabled: boolean;
  onRemove: () => void;
}) {
  const { t, i18n } = useTranslation(['settings', 'common']);
  const toast = useToast();
  const sheet = useSheet();
  const row = useRef<SwipeRowHandle>(null);
  const total = USAGE_KINDS.reduce(
    (sum, kind) => sum + ingredient.usage[kind],
    0,
  );
  const labels: SwipeRowLabels = {
    question: t('settings:familyCatalog.deleteQuestion', {
      name: ingredient.name,
    }),
    context:
      total === 0
        ? t('settings:familyCatalog.unused')
        : t('settings:familyCatalog.usageTotal', { count: total }),
    keep: t('common:row.keep'),
    remove: t('settings:familyCatalog.deleteAction'),
    releaseToDelete: t('common:row.releaseToDelete'),
    hint: t('common:row.a11yHint'),
    editAction: t('common:row.actions.edit', { name: ingredient.name }),
    removeAction: t('common:row.actions.remove', { name: ingredient.name }),
  };
  const names = ingredient.allergens.map((a) => a.name);

  return (
    <>
      <SwipeRow
        ref={row}
        name={ingredient.name}
        labels={labels}
        disabled={disabled}
        peek={peek}
        onLearned={onLearned}
        onTap={sheet.show}
        onEdit={sheet.show}
        onRemove={onRemove}
      >
        <ListRow
          leading={
            <IngredientIconSlot
              ingredientId={ingredient.id}
              aisleId={ingredient.parentCategory.aisle.id}
            />
          }
          title={ingredient.name}
          meta={t('settings:familyCatalog.rowMeta', {
            category: ingredient.leafCategory.name,
            aisle: ingredient.parentCategory.aisle.name,
            unit: ingredient.defaultUnit,
          })}
          tags={
            !ingredient.allergensChecked ? (
              <Tag tone="soon" icon={<AlertIcon size={12} />}>
                {t('settings:familyCatalog.checkTag')}
              </Tag>
            ) : names.length > 0 ? (
              <Tag tone="neutral" sx={{ color: tokens.color.ink }}>
                <Box component="span" sx={visuallyHidden}>
                  {t('settings:familyCatalog.containsA11y', {
                    names: new Intl.ListFormat(i18n.language, {
                      style: 'long',
                      type: 'conjunction',
                    }).format(names),
                  })}
                </Box>
                <span aria-hidden="true">
                  {names.length > 1
                    ? t('settings:familyCatalog.containsTag', {
                        first: names[0],
                        count: names.length - 1,
                      })
                    : names[0]}
                </span>
              </Tag>
            ) : null
          }
        />
      </SwipeRow>
      {sheet.mounted ? (
        <FamilyIngredientSheet
          open={sheet.open}
          ingredient={ingredient}
          catalog={catalog}
          onClose={sheet.close}
          onSaved={(savedName) => {
            sheet.close();
            toast.show(t('common:row.updated', { name: savedName }), {
              polite: true,
            });
          }}
          onExited={sheet.exited}
          onDelete={() => row.current?.askToRemove()}
        />
      ) : null}
    </>
  );
}

function SynonymRow({
  synonym,
  peek,
  onLearned,
  disabled,
  onRemove,
}: {
  synonym: FamilyCatalogSynonym;
  peek: boolean;
  onLearned: RowHint['onLearned'];
  disabled: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const sheet = useSheet();
  const row = useRef<SwipeRowHandle>(null);
  const labels: SwipeRowLabels = {
    question: t('settings:familyCatalog.synonymQuestion', {
      name: synonym.name,
    }),
    context: t('settings:familyCatalog.synonymContext', {
      ingredient: synonym.ingredient.name,
    }),
    keep: t('common:row.keep'),
    remove: t('common:row.remove'),
    releaseToDelete: t('common:row.releaseToDelete'),
    hint: t('common:row.a11yHint'),
    editAction: t('common:row.actions.edit', { name: synonym.name }),
    removeAction: t('common:row.actions.remove', { name: synonym.name }),
  };
  return (
    <>
      <SwipeRow
        ref={row}
        name={synonym.name}
        labels={labels}
        disabled={disabled}
        peek={peek}
        onLearned={onLearned}
        onTap={sheet.show}
        onEdit={sheet.show}
        onRemove={onRemove}
      >
        <ListRow
          leading={<IngredientIconSlot ingredientId={synonym.ingredient.id} />}
          title={synonym.name}
          meta={t('settings:familyCatalog.synonymMeta', {
            ingredient: synonym.ingredient.name,
          })}
        />
      </SwipeRow>
      {sheet.mounted ? (
        <FamilySynonymSheet
          open={sheet.open}
          synonym={synonym}
          onClose={sheet.close}
          onExited={sheet.exited}
          onRemove={() => row.current?.askToRemove()}
        />
      ) : null}
    </>
  );
}
