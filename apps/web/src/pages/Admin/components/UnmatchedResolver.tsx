import {
  Button,
  Checkbox,
  SegmentedControl,
  Stack,
  TextField,
  Typography,
} from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LOCALES, type Locale } from '../../../i18n/resources';
import { CatalogSearch } from '../../../components/catalogSearch/CatalogSearch';
import { BrowseByAisle } from '../../../components/catalogSearch/emptyState/BrowseByAisle';
import type { AdminCatalog, IngredientInput } from '../../../lib/admin';
import {
  useResolveUnmatched,
  type UnmatchedEntry,
} from '../../../lib/unmatched';
import { IngredientFields } from './IngredientFields';
import { ReviewSheet } from './ReviewSheet';
import { UnmatchedMeta } from './UnmatchedMeta';

type Props = {
  entry: UnmatchedEntry;
  catalog: AdminCatalog;
  open: boolean;
  onClose: () => void;
  onExited: () => void;
  /** On a dismissed name: put it back in the open list instead. */
  onRestore?: () => void;
  /** A restore request is in flight. */
  restoring?: boolean;
  /** The last restore error, shown in the sheet. */
  restoreError?: unknown;
  /** Called with the confirmation message once the name is resolved. */
  onDone: (message: string) => void;
};

type Mode = 'existing' | 'new';

/**
 * Resolve one Unmatched name: link it to an existing Ingredient (found with
 * the Catalog search) or create a new one, and choose the language of the
 * Synonym it adds. The server relinks every row carrying the name in one go.
 */
export function UnmatchedResolver({
  entry,
  catalog,
  open,
  onClose,
  onExited,
  onRestore,
  restoring = false,
  restoreError,
  onDone,
}: Props) {
  const { t } = useTranslation('admin');
  const resolve = useResolveUnmatched();
  const [mode, setMode] = useState<Mode>('existing');
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [newIngredient, setNewIngredient] = useState<IngredientInput>({
    name: entry.rawName,
    leafCategoryId:
      catalog.leafCategories.find((leaf) => !leaf.isOther)?.id ??
      catalog.leafCategories[0]?.id ??
      '',
    defaultUnit: 'g',
    pantryBasic: false,
  });
  const [locale, setLocale] = useState<Locale>(entry.locale);
  // Off unless chosen: a generic printed word would match every such line, skipping the confidence threshold.
  const [sourceSynonym, setSourceSynonym] = useState(false);
  const printedLanguage = entry.sourceLanguage
    ? t(`admin:locales.${entry.sourceLanguage}`)
    : '';

  const canSubmit =
    mode === 'existing'
      ? picked !== null
      : newIngredient.name.trim() !== '' && newIngredient.leafCategoryId !== '';

  const submit = () => {
    if (!canSubmit || resolve.isPending) return;
    const target =
      mode === 'existing'
        ? { ingredientId: picked?.id as string }
        : {
            newIngredient: {
              ...newIngredient,
              name: newIngredient.name.trim(),
            },
          };
    const ingredientName =
      mode === 'existing' ? picked?.name : newIngredient.name.trim();
    resolve.mutate(
      {
        normalizedName: entry.normalizedName,
        locale,
        ...(sourceSynonym ? { sourceSynonym } : {}),
        ...target,
      },
      {
        onSuccess: (result) => {
          const linked = t('admin:unmatched.resolved', {
            count:
              result.relinkedBatches +
              result.relinkedShoppingItems +
              result.relinkedTemplateLines,
            name: ingredientName,
          });
          const printed = result.sourceSynonymAdded
            ? t('admin:unmatched.sourceSynonymAdded', {
                text: entry.sourceText,
                language: printedLanguage,
              })
            : result.sourceSynonymSkipped
              ? t(
                  `admin:unmatched.sourceSynonymSkipped.${result.sourceSynonymSkipped}`,
                )
              : '';
          onDone(printed ? `${linked} ${printed}` : linked);
        },
      },
    );
  };

  return (
    <ReviewSheet
      open={open}
      onClose={onClose}
      onExited={onExited}
      title={t('admin:unmatched.resolveName', { name: entry.rawName })}
      subtitle={<UnmatchedMeta entry={entry} />}
      error={resolve.error ?? restoreError}
      form={{
        onSubmit: submit,
        canSubmit,
        saving: resolve.isPending,
        submitLabel: t('admin:review.link', { count: entry.count }),
        savingLabel: t('admin:unmatched.resolving'),
        extra: onRestore ? (
          <Button
            variant="ghost"
            sx={{ height: 52 }}
            onClick={onRestore}
            disabled={restoring}
          >
            {t('admin:unmatched.restore')}
          </Button>
        ) : undefined,
      }}
    >
      <SegmentedControl
        label={t('admin:unmatched.modeLabel')}
        value={mode}
        onChange={setMode}
        options={[
          { value: 'existing', label: t('admin:unmatched.mode.existing') },
          { value: 'new', label: t('admin:unmatched.mode.new') },
        ]}
      />
      {mode === 'existing' ? (
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
              {t('admin:unmatched.picked', { name: picked.name })}
            </Typography>
          ) : null}
        </Stack>
      ) : (
        <Stack spacing={2}>
          <IngredientFields
            catalog={catalog}
            value={newIngredient}
            onChange={setNewIngredient}
          />
        </Stack>
      )}
      <TextField
        select
        label={t('admin:unmatched.synonymLocale')}
        helperText={t('admin:unmatched.synonymHint', { name: entry.rawName })}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        slotProps={{ select: { native: true } }}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {t(`admin:locales.${code}`)}
          </option>
        ))}
      </TextField>
      {entry.sourceText ? (
        <Checkbox
          checked={sourceSynonym}
          onChange={(event) => setSourceSynonym(event.target.checked)}
          label={t('admin:unmatched.sourceSynonym', {
            language: printedLanguage,
          })}
          helperText={t('admin:unmatched.sourceSynonymHint', {
            text: entry.sourceText,
          })}
        />
      ) : null}
    </ReviewSheet>
  );
}
