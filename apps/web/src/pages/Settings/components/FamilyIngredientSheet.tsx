import {
  Alert,
  Box,
  Button,
  CloseIcon,
  IconButton,
  PlusIcon,
  Sheet,
  Stack,
  TextField,
  Typography,
  radius,
  tokens,
} from '@pocket-pantry/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  AllergenContainsRow,
  containsToAllergenIds,
  selectionFromAllergenIds,
  type ContainsSelection,
} from '../../../components/AllergenContainsRow';
import { IngredientIconSlot } from '../../../components/IngredientIconSlot';
import { RemoveLink } from '../../../components/RemoveLink';
import { translateApiError } from '../../../i18n/translateApiError';
import { ApiError } from '../../../lib/api';
import {
  aisleByParentCategoryId,
  useCatalogAisles,
  useCreateFamilySynonym,
} from '../../../lib/catalog';
import {
  familyCatalogQueryKey,
  useDeleteFamilySynonym,
  useSetFamilyIngredientAllergens,
  useUpdateFamilyIngredient,
  type FamilyCatalog,
  type FamilyCatalogIngredient,
  type FamilyCatalogSynonym,
  type FamilyIngredientUsage,
} from '../../../lib/familyCatalog';
import { normalizeName } from '../../../lib/normalizeName';
import { useCategoryOptions } from '../../../lib/settings';
import { CategoryPicker } from './CategoryPicker';
import { InfoNote } from './InfoNote';
import { SheetHeader } from '../../../components/SheetHeader';

export const USAGE_KINDS: Array<keyof FamilyIngredientUsage> = [
  'batches',
  'shoppingItems',
  'templateLines',
  'recipeLines',
  'staples',
];

export type FamilyIngredientSheetProps = {
  open: boolean;
  ingredient: FamilyCatalogIngredient;
  /** The whole Family catalog, to refuse a name the Family already uses. */
  catalog: FamilyCatalog;
  onClose: () => void;
  /** After the Save succeeded: the caller closes the sheet and shows the toast. */
  onSaved: (savedName: string) => void;
  /** The close transition has finished. */
  onExited: () => void;
  /** "Delete from family catalog": the sheet closes itself, then the caller asks to delete. */
  onDelete: () => void;
};

type What =
  'name' | 'category' | 'nameAndCategory' | 'allergens' | 'otherNames';

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/**
 * The edit sheet of a Family Ingredient. The whole sheet is a draft: nothing is sent until Save, which
 * sends the PATCH, the allergens, the removed names and the added names in that order and stops at the
 * first failure. Mount it for each opening so the draft starts from the saved Ingredient.
 */
export function FamilyIngredientSheet({
  open,
  ingredient,
  catalog,
  onClose,
  onSaved,
  onExited,
  onDelete,
}: FamilyIngredientSheetProps) {
  const { t, i18n } = useTranslation(['settings', 'catalog', 'common']);
  const id = useId();
  const queryClient = useQueryClient();
  const update = useUpdateFamilyIngredient();
  const setAllergens = useSetFamilyIngredientAllergens();
  const deleteSynonym = useDeleteFamilySynonym();
  const createSynonym = useCreateFamilySynonym();
  const categories = useCategoryOptions();
  const aisles = useCatalogAisles();
  const aisleByParentId = useMemo(
    () => aisleByParentCategoryId(aisles.data),
    [aisles.data],
  );

  // The names this Ingredient has now; they refresh after a partly failed Save.
  const savedSynonyms: FamilyCatalogSynonym[] = catalog.synonyms.filter(
    (s) => s.ingredient.id === ingredient.id,
  );

  const [view, setView] = useState<'form' | 'pick'>('form');
  const [query, setQuery] = useState('');
  const [name, setName] = useState(ingredient.name);
  const [leafId, setLeafId] = useState(ingredient.leafCategory.id);
  const [contains, setContains] = useState<ContainsSelection>(() =>
    selectionFromAllergenIds(
      ingredient.allergensChecked ? ingredient.allergenIds : undefined,
    ),
  );
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNameError, setNewNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [chipErrors, setChipErrors] = useState<Record<string, string>>({});
  const sending = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const deleteRequested = useRef(false);

  // Focus follows the step the Member moves to (not the first render: the sheet focuses itself).
  const shownView = useRef(view);
  useEffect(() => {
    if (shownView.current === view) return;
    shownView.current = view;
    if (view === 'pick') searchRef.current?.focus();
    else titleRef.current?.focus();
  }, [view]);
  // A refused name hands focus back to the Name field once it can take it again.
  const [nameFocus, setNameFocus] = useState(0);
  useEffect(() => {
    if (nameFocus > 0) nameRef.current?.focus();
  }, [nameFocus]);

  const trimmed = name.trim();

  // The draft against the latest saved data.
  const nameChanged = trimmed !== ingredient.name;
  const leafChanged = leafId !== ingredient.leafCategory.id;
  const draftAllergens = containsToAllergenIds(contains);
  const allergensChanged =
    draftAllergens !== undefined &&
    (!ingredient.allergensChecked ||
      !sameSet(draftAllergens, ingredient.allergenIds));
  const removals = savedSynonyms.filter((s) => removedIds.includes(s.id));
  // A name removed and added back is a DELETE then a POST; only a kept saved name is already there.
  const additions = added.filter(
    (n) =>
      !savedSynonyms.some(
        (s) =>
          !removedIds.includes(s.id) &&
          normalizeName(s.name) === normalizeName(n),
      ),
  );
  const changed =
    nameChanged ||
    leafChanged ||
    allergensChanged ||
    removals.length > 0 ||
    additions.length > 0;
  const canSave = changed && trimmed !== '' && !saving;

  const chips = [
    ...savedSynonyms
      .filter((s) => !removedIds.includes(s.id))
      .map((s) => s.name),
    ...additions,
  ];

  /** Names the Family already uses (this Ingredient's included): matching key to the Ingredient it names. */
  const familyKeys = () => {
    const keys = new Map<string, string>();
    keys.set(normalizeName(trimmed), ingredient.name);
    keys.set(normalizeName(ingredient.name), ingredient.name);
    for (const other of catalog.ingredients) {
      if (other.id !== ingredient.id) {
        keys.set(normalizeName(other.name), other.name);
      }
    }
    for (const synonym of catalog.synonyms) {
      if (!removedIds.includes(synonym.id)) {
        keys.set(normalizeName(synonym.name), synonym.ingredient.name);
      }
    }
    for (const chip of added) keys.set(normalizeName(chip), ingredient.name);
    return keys;
  };

  const commitName = () => {
    const value = newName.trim();
    if (!value) return;
    const owner = familyKeys().get(normalizeName(value));
    if (owner !== undefined) {
      setNewNameError(
        t('catalog:catalogAdd.aliasExists', { name: value, ingredient: owner }),
      );
      return;
    }
    setAdded((prev) => [...prev, value]);
    setNewName('');
    setNewNameError(null);
    addRef.current?.focus();
  };

  const closeAddField = () => {
    setAdding(false);
    setNewName('');
    setNewNameError(null);
    requestAnimationFrame(() => addButtonRef.current?.focus());
  };

  // After a removal focus goes to the next chip's ×, else the previous, else "+ Add a name".
  // The effect waits until the removed chip is really gone: an earlier render's effect can still
  // be queued when the × is pressed, and it would spend the hand-off on the old list.
  const focusAfterRemoval = useRef<{ chip: string; index: number } | null>(
    null,
  );
  const chipListRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const handOff = focusAfterRemoval.current;
    if (handOff === null || chips.includes(handOff.chip)) return;
    focusAfterRemoval.current = null;
    const { index } = handOff;
    const buttons = chipListRef.current?.querySelectorAll<HTMLButtonElement>(
      'li[data-chip] button',
    );
    // With the add field open there is no "+ Add a name" button: focus the field.
    (buttons?.[index] ?? addButtonRef.current ?? addRef.current)?.focus();
  });

  const removeChip = (chip: string) => {
    const position = chips.indexOf(chip);
    focusAfterRemoval.current = {
      chip,
      index: position < chips.length - 1 ? position : position - 1,
    };
    // A name added to the draft goes first: it may share its name with a removed saved one.
    if (added.includes(chip)) {
      setAdded((prev) => prev.filter((n) => n !== chip));
    } else {
      const saved = savedSynonyms.find((s) => s.name === chip);
      if (saved) setRemovedIds((prev) => [...prev, saved.id]);
    }
    setChipErrors(({ [chip]: _dropped, ...rest }) => rest);
  };

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSave || sending.current) return;
    sending.current = true;
    setSaving(true);
    setFailure(null);
    setNameError(null);
    setChipErrors({});
    let what: What = 'name';
    try {
      if (nameChanged || leafChanged) {
        what = nameChanged
          ? leafChanged
            ? 'nameAndCategory'
            : 'name'
          : 'category';
        await update.mutateAsync({
          id: ingredient.id,
          ...(nameChanged ? { name: trimmed } : {}),
          ...(leafChanged ? { leafCategoryId: leafId } : {}),
        });
      }
      if (allergensChanged && draftAllergens) {
        what = 'allergens';
        await setAllergens.mutateAsync({
          id: ingredient.id,
          allergenIds: draftAllergens,
        });
      }
      what = 'otherNames';
      for (const synonym of removals) {
        await deleteSynonym.mutateAsync(synonym.id);
      }
      for (const synonymName of additions) {
        try {
          await createSynonym.mutateAsync({
            name: synonymName,
            ingredientId: ingredient.id,
          });
        } catch (error) {
          if (
            error instanceof ApiError &&
            error.code === 'catalog.family_synonym_exists'
          ) {
            setChipErrors({
              [synonymName]: t('catalog:catalogAdd.aliasExists', {
                name: synonymName,
                ingredient:
                  (error.params.existing as { name?: string } | undefined)
                    ?.name ?? ingredient.name,
              }),
            });
          }
          throw error;
        }
      }
      onSaved(trimmed);
    } catch (error) {
      sending.current = false;
      setSaving(false);
      if (
        error instanceof ApiError &&
        error.code === 'catalog.family_ingredient_exists'
      ) {
        const existing = (
          error.params.existing as { name?: string } | undefined
        )?.name;
        setNameError(
          t('settings:familyCatalog.nameTaken', { name: existing ?? trimmed }),
        );
        setNameFocus((n) => n + 1);
      } else if (!(
        error instanceof ApiError &&
        error.code === 'catalog.family_synonym_exists'
      )) {
        setFailure(
          `${t(`settings:familyCatalog.saveFailed.${what}`)} ${translateApiError(t, error)}`,
        );
      } else {
        setFailure(t('settings:familyCatalog.saveFailed.otherNames'));
      }
      // The next Save sends only what still differs.
      void queryClient.invalidateQueries({ queryKey: familyCatalogQueryKey });
    }
  };

  const usage = USAGE_KINDS.filter((kind) => ingredient.usage[kind] > 0);
  const usageText = new Intl.ListFormat(i18n.language, {
    style: 'long',
    type: 'conjunction',
  }).format(
    usage.map((kind) =>
      t(`settings:familyCatalog.usage.${kind}`, {
        count: ingredient.usage[kind],
      }),
    ),
  );

  // The category shown on the field: the draft leaf, before or after the options load.
  const parent = categories.data?.parents.find((p) =>
    p.leaves.some((leaf) => leaf.id === leafId),
  );
  const leaf = parent?.leaves.find((l) => l.id === leafId);
  const categoryName = leaf?.name ?? ingredient.leafCategory.name;
  const draftAisle = leafChanged
    ? aisleByParentId.get(parent?.id ?? '')
    : ingredient.parentCategory.aisle;
  const aisleName = draftAisle?.name ?? '';
  const aisleId = draftAisle?.id;
  const headerTitle =
    view === 'pick' ? t('settings:familyCatalog.pickTitle') : ingredient.name;
  const headerContext =
    view === 'pick'
      ? t('settings:familyCatalog.pickHint', {
          name: trimmed || ingredient.name,
        })
      : t('settings:familyCatalog.sheetContext');

  return (
    <Sheet
      open={open}
      // Escape on the picker step goes back to the form.
      onClose={() => {
        if (view === 'pick') setView('form');
        else onClose();
      }}
      onExited={() => {
        onExited();
        if (deleteRequested.current) {
          deleteRequested.current = false;
          onDelete();
        }
      }}
      label={t('common:edit.title', { name: ingredient.name })}
      size={view === 'pick' ? 'tall' : 'content'}
      header={
        <SheetHeader
          size="roomy"
          title={headerTitle}
          subtitle={headerContext}
          titleRef={titleRef}
          backLabel={t('settings:familyCatalog.back')}
          closeLabel={t('settings:familyCatalog.close')}
          onBack={
            view === 'pick'
              ? () => {
                  setQuery('');
                  setView('form');
                }
              : undefined
          }
          onClose={onClose}
        />
      }
      footer={
        view === 'form' ? (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              px: 3,
              py: 2,
              borderTop: `1px solid ${tokens.color.divider}`,
            }}
          >
            <Button type="submit" form={`${id}-form`} disabled={!canSave}>
              {saving
                ? t('common:edit.saving')
                : t('settings:familyCatalog.save')}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common:cancel')}
            </Button>
          </Stack>
        ) : undefined
      }
    >
      {view === 'pick' ? (
        <CategoryPicker
          query={query}
          onQuery={setQuery}
          searchRef={searchRef}
          options={categories.data}
          optionsPending={categories.isPending}
          optionsError={categories.error}
          leavesOnly
          showIcons
          aisleByParentId={aisleByParentId}
          currentId={leafId}
          onChoose={(chosen) => {
            setLeafId(chosen);
            setQuery('');
            setView('form');
          }}
        />
      ) : (
        <Stack
          component="form"
          id={`${id}-form`}
          spacing={2}
          onSubmit={save}
          aria-label={t('common:edit.title', { name: ingredient.name })}
          sx={{ px: 3, pt: 1, pb: 3 }}
        >
          {failure ? <Alert>{failure}</Alert> : null}

          <Stack spacing={0.5}>
            <TextField
              id={`${id}-name`}
              label={t('settings:familyCatalog.name')}
              value={name}
              inputRef={nameRef}
              error={nameError !== null || trimmed === ''}
              disabled={saving}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(null);
              }}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
            {nameError || trimmed === '' ? (
              <FieldError>
                {nameError ?? t('settings:familyCatalog.nameRequired')}
              </FieldError>
            ) : null}
          </Stack>

          <Stack spacing={0.5}>
            <Typography
              id={`${id}-category`}
              variant="meta"
              sx={{ fontWeight: 700, color: tokens.color.ink }}
            >
              {t('settings:familyCatalog.category')}
            </Typography>
            <Box
              component="button"
              type="button"
              aria-labelledby={`${id}-category ${id}-category-button`}
              id={`${id}-category-button`}
              disabled={saving}
              onClick={() => setView('pick')}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                minHeight: 52,
                px: 1.5,
                width: '100%',
                textAlign: 'start',
                font: 'inherit',
                color: tokens.color.ink,
                bgcolor: tokens.color.surface,
                border: `1px solid ${tokens.color.line}`,
                borderRadius: radius.control,
                cursor: 'pointer',
              }}
            >
              <IngredientIconSlot aisleId={aisleId} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
                  {categoryName}
                </Typography>
                <Typography variant="meta" color="text.secondary">
                  {[aisleName, ingredient.defaultUnit]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
              </Box>
              <Typography
                component="span"
                sx={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: tokens.color.accent,
                }}
              >
                {t('settings:familyCatalog.categoryChange')} ›
              </Typography>
            </Box>
          </Stack>

          <AllergenContainsRow
            value={contains}
            onChange={(next) => {
              // A checked Ingredient cannot go back to Unchecked: unticking the last tag leaves "None".
              setContains(
                ingredient.allergensChecked &&
                  containsToAllergenIds(next) === undefined
                  ? { none: true, allergenIds: [] }
                  : next,
              );
            }}
            disabled={saving}
            known={ingredient.allergens}
            hint={
              ingredient.allergensChecked
                ? t('settings:familyCatalog.allergensHintChecked')
                : t('settings:familyCatalog.allergensHintUnchecked')
            }
          />

          <Stack spacing={0.5}>
            <Typography
              id={`${id}-names`}
              variant="meta"
              sx={{ fontWeight: 700, color: tokens.color.ink }}
            >
              {t('settings:familyCatalog.otherNames')}
            </Typography>
            <Typography variant="meta" color="text.secondary">
              {t('settings:familyCatalog.otherNamesHint')}
            </Typography>
            <Stack
              component="ul"
              ref={chipListRef}
              direction="row"
              aria-labelledby={`${id}-names`}
              sx={{ flexWrap: 'wrap', gap: 1, listStyle: 'none', p: 0, m: 0 }}
            >
              {chips.map((chip) => (
                <Box component="li" key={chip} data-chip="">
                  <NameChip
                    label={chip}
                    removeLabel={t('settings:familyCatalog.removeName', {
                      name: chip,
                    })}
                    disabled={saving}
                    onRemove={() => removeChip(chip)}
                  />
                  {chipErrors[chip] ? (
                    <FieldError>{chipErrors[chip]}</FieldError>
                  ) : null}
                </Box>
              ))}
              {adding ? null : (
                <Box component="li">
                  <Box
                    component="button"
                    type="button"
                    ref={addButtonRef}
                    disabled={saving}
                    onClick={() => {
                      setAdding(true);
                      requestAnimationFrame(() => addRef.current?.focus());
                    }}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      minHeight: 34,
                      px: 1.5,
                      font: 'inherit',
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: tokens.color.accent,
                      bgcolor: 'transparent',
                      border: `1px dashed ${tokens.color.line}`,
                      borderRadius: radius.chip,
                      cursor: 'pointer',
                    }}
                  >
                    <PlusIcon size={14} />
                    {t('settings:familyCatalog.addName')}
                  </Box>
                </Box>
              )}
            </Stack>
            {adding ? (
              <Stack spacing={0.5}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center' }}
                >
                  <TextField
                    fullWidth
                    size="small"
                    value={newName}
                    disabled={saving}
                    inputRef={addRef}
                    placeholder={t('settings:familyCatalog.addNamePlaceholder')}
                    onChange={(event) => {
                      setNewName(event.target.value);
                      setNewNameError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitName();
                      } else if (event.key === 'Escape') {
                        // Escape closes the small field before it closes the sheet.
                        event.stopPropagation();
                        closeAddField();
                      }
                    }}
                    slotProps={{
                      htmlInput: {
                        maxLength: 100,
                        'aria-label': t('settings:familyCatalog.addName'),
                      },
                    }}
                  />
                  <Button type="button" disabled={saving} onClick={commitName}>
                    {t('settings:familyCatalog.add')}
                  </Button>
                </Stack>
                {newNameError ? <FieldError>{newNameError}</FieldError> : null}
              </Stack>
            ) : null}
          </Stack>

          <InfoNote>
            {usage.length === 0 ? (
              <b>{t('settings:familyCatalog.usageNoteUnused')}</b>
            ) : (
              <>
                <b>
                  {t('settings:familyCatalog.usageNote', {
                    usage: usageText,
                  })}
                </b>{' '}
                {t('settings:familyCatalog.usageNoteDelete')}
              </>
            )}
          </InfoNote>

          <RemoveLink
            onClick={() => {
              deleteRequested.current = true;
              onClose();
            }}
          >
            {t('settings:familyCatalog.deleteLink')}
          </RemoveLink>
        </Stack>
      )}
    </Sheet>
  );
}

function NameChip({
  label,
  removeLabel,
  disabled,
  onRemove,
}: {
  label: string;
  removeLabel: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        minHeight: 34,
        pl: 1.5,
        pr: 0.5,
        borderRadius: radius.chip,
        bgcolor: tokens.color.chipNeutral,
        color: tokens.color.ink,
        fontSize: 13.5,
        fontWeight: 600,
      }}
    >
      <span>{label}</span>
      <IconButton
        label={removeLabel}
        size={34}
        disabled={disabled}
        onClick={onRemove}
      >
        <CloseIcon size={12} />
      </IconButton>
    </Box>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <Typography
      role="alert"
      sx={{
        fontSize: 12.5,
        fontWeight: 600,
        color: tokens.color.urgentFg,
      }}
    >
      {children}
    </Typography>
  );
}
