import {
  Box,
  Button,
  CloseIcon,
  PlusIcon,
  IconButton,
  SegmentedTabs,
  TextField,
  tokens,
  radius,
} from '@pocket-pantry/ui';
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/api';
import {
  UNITS,
  useCatalogCategories,
  useCreateFamilyIngredient,
  type CatalogCategory,
  type CatalogSearchResult,
  type Unit,
} from '../../lib/catalog';
import {
  AllergenContainsRow,
  containsToAllergenIds,
  selectionFromAllergenIds,
  type ContainsSelection,
} from '../AllergenContainsRow';
import { AddToCatalogAlias } from './AddToCatalogAlias';
import { AisleSwatch } from './AisleSwatch';

/** What a pick was: a new Family Ingredient, a Link & pick of `name`, or an Ingredient that was already there. */
export type PickOutcome =
  { kind: 'added' } | { kind: 'linked'; name: string } | { kind: 'existing' };

type Mode = 'new' | 'alias';

export type AddToCatalogFormProps = {
  /** The text typed in the search field. */
  typed: string;
  /** The Category field, for the host to focus once the form is on screen. */
  categoryRef: RefObject<HTMLInputElement | null>;
  /** The Ingredient to pick: the one just added or linked, or the one that was already there. */
  onPicked: (result: CatalogSearchResult, outcome: PickOutcome) => void;
  /** Close without picking (Cancel, ×). */
  onCancel: () => void;
  /**
   * What the "Contains" row starts with: left out = blank (Unchecked), an empty list = "None",
   * otherwise those Allergens ticked. A caller that knows more, such as a Barcode Lookup, passes it.
   */
  initialAllergenIds?: readonly string[];
  /**
   * Focus the Category field when the form appears. A host that is a Sheet leaves this off and
   * passes `categoryRef` to the Sheet's `initialFocus` (ADR 0039). A field revealed by a tap on
   * the mode tabs still takes focus. Default `false`; a caller that wants focus on mount passes it.
   */
  autoFocus?: boolean;
};

const categoryMeta = (category: CatalogCategory) =>
  `${category.parentCategory.name} · ${category.aisle.name}`;

function existingOf(error: unknown): CatalogSearchResult | null {
  if (
    error instanceof ApiError &&
    error.code === 'catalog.family_ingredient_exists'
  ) {
    return (error.params.existing as CatalogSearchResult | undefined) ?? null;
  }
  return null;
}

/**
 * The content of Add to your catalog, shared by the popover and the phone
 * Sheet: a Name, a Category chosen from the Leaf Categories, a Unit, and the
 * actions. A name that is taken turns the primary action into "Pick {existing}".
 */
export function AddToCatalogForm({
  typed,
  categoryRef,
  onPicked,
  onCancel,
  initialAllergenIds,
  autoFocus = false,
}: AddToCatalogFormProps) {
  const { color } = tokens;
  const { t } = useTranslation('catalog');
  const id = useId();
  const [name, setName] = useState(typed);
  const [mode, setMode] = useState<Mode>('new');
  // Once the Member has used the tabs, a Category field that comes back may take focus.
  const [tabbed, setTabbed] = useState(false);
  const aliasRef = useRef<HTMLInputElement>(null);
  const [unit, setUnit] = useState<Unit>('pcs');
  const [contains, setContains] = useState<ContainsSelection>(() =>
    selectionFromAllergenIds(initialAllergenIds),
  );
  const [category, setCategory] = useState<CatalogCategory | null>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const categories = useCatalogCategories(query, !category);
  const create = useCreateFamilyIngredient();
  const existing = create.error ? existingOf(create.error) : null;
  const failed = create.isError && !existing;
  const rows = categories.data ?? [];
  const active = activeIndex < rows.length ? activeIndex : -1;
  const trimmed = name.trim();

  const choose = (row: CatalogCategory) => {
    setCategory(row);
    setActiveIndex(-1);
    create.reset();
  };

  const submit = () => {
    if (!category || trimmed === '' || create.isPending) return;
    const allergenIds = containsToAllergenIds(contains);
    create.mutate(
      {
        name: trimmed,
        leafCategoryId: category.id,
        defaultUnit: unit,
        ...(allergenIds ? { allergenIds } : {}),
      },
      { onSuccess: (result) => onPicked(result, { kind: 'added' }) },
    );
  };

  const categoryKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && rows.length > 0) {
      event.preventDefault();
      setActiveIndex((active + 1) % rows.length);
    } else if (event.key === 'ArrowUp' && rows.length > 0) {
      event.preventDefault();
      setActiveIndex(active <= 0 ? rows.length - 1 : active - 1);
    } else if (event.key === 'Enter') {
      // Enter picks the active row, else the first.
      event.preventDefault();
      const row = rows[active >= 0 ? active : 0];
      if (row) choose(row);
    }
  };

  const listId = `${id}-categories`;
  const hint = (text: string) => (
    <Box sx={{ fontSize: 12.5, color: color.muted, p: '8px 4px' }}>{text}</Box>
  );

  return (
    // Not a <form>: hosts are often inside one, and submit would bubble to theirs.
    <Box sx={{ display: 'grid', gap: 2, p: '14px' }}>
      <TextField
        label={t('catalogAdd.name')}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          create.reset();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (mode === 'new') submit();
          }
        }}
        slotProps={{ htmlInput: { maxLength: 100 } }}
      />
      <SegmentedTabs
        label={t('catalogAdd.modes')}
        id={`${id}-mode`}
        tabs={[
          { value: 'new', label: t('catalogAdd.modeNew') },
          { value: 'alias', label: t('catalogAdd.modeAlias') },
        ]}
        value={mode}
        onChange={(next) => {
          setTabbed(true);
          setMode(next);
        }}
      />
      {mode === 'alias' ? (
        <AddToCatalogAlias
          name={trimmed}
          searchRef={aliasRef}
          onPicked={onPicked}
          onCancel={onCancel}
        />
      ) : (
        <>
          {category ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: '8px 8px 8px 12px',
                borderRadius: radius.control,
                backgroundColor: color.accentTint,
                color: color.accentOnTint,
              }}
            >
              <AisleSwatch aisleId={category.aisle.id} size={12} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>
                  {t('catalogAdd.category')}
                </Box>
                <Box sx={{ fontSize: 14, fontWeight: 600 }}>
                  {category.name}
                </Box>
                <Box sx={{ fontSize: 12, opacity: 0.8 }}>
                  {categoryMeta(category)}
                </Box>
              </Box>
              <IconButton
                label={t('catalogAdd.change')}
                tone="plain"
                size={34}
                onClick={() => {
                  setCategory(null);
                  create.reset();
                  setTimeout(() => categoryRef.current?.focus(), 0);
                }}
              >
                <CloseIcon size={18} />
              </IconButton>
            </Box>
          ) : (
            <Box>
              <TextField
                label={t('catalogAdd.category')}
                placeholder={t('catalogAdd.placeholder')}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(-1);
                }}
                onKeyDown={categoryKeyDown}
                autoComplete="off"
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: {
                    ref: categoryRef,
                    role: 'combobox',
                    'aria-autocomplete': 'list',
                    'aria-expanded': rows.length > 0,
                    'aria-controls': listId,
                    'aria-activedescendant':
                      active >= 0 ? `${id}-category-${active}` : undefined,
                    autoFocus: autoFocus || tabbed,
                  },
                }}
              />
              {query.trim() === '' ? hint(t('catalogAdd.typeToSearch')) : null}
              <Box
                component="ul"
                id={listId}
                role="listbox"
                aria-label={t('catalogAdd.category')}
                sx={{
                  listStyle: 'none',
                  m: 0,
                  mt: 1,
                  p: 0,
                  maxHeight: 176,
                  overflowY: 'auto',
                  borderRadius: radius.control,
                  border: rows.length > 0 ? `1px solid ${color.line}` : 0,
                }}
              >
                {rows.map((row, index) => (
                  <Box
                    component="li"
                    key={row.id}
                    id={`${id}-category-${index}`}
                    role="option"
                    aria-selected={index === active}
                    // Keep focus in the input so the tap still lands.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(row)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      minHeight: 44,
                      p: '6px 12px',
                      cursor: 'pointer',
                      backgroundColor:
                        index === active ? color.subtle : 'transparent',
                      borderTop: index === 0 ? 0 : `1px solid ${color.divider}`,
                      '&:hover': { backgroundColor: color.subtle },
                    }}
                  >
                    <AisleSwatch aisleId={row.aisle.id} size={12} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ fontSize: 14, fontWeight: 600 }}>
                        {row.name}
                      </Box>
                      <Box sx={{ fontSize: 12, color: color.muted }}>
                        {categoryMeta(row)}
                      </Box>
                    </Box>
                    <Box
                      component="span"
                      sx={{
                        flexShrink: 0,
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: color.muted,
                        backgroundColor: color.chipNeutral,
                        borderRadius: radius.chip,
                        p: '5px 8px',
                      }}
                    >
                      {row.defaults.expiryDays === null
                        ? t('catalogAdd.noExpiry')
                        : t('catalogAdd.expiryDays', {
                            count: row.defaults.expiryDays,
                          })}
                    </Box>
                  </Box>
                ))}
              </Box>
              {query.trim() !== '' &&
              categories.data &&
              rows.length === 0 &&
              !categories.isSearching
                ? hint(t('catalogAdd.noMatch'))
                : null}
            </Box>
          )}
          <TextField
            select
            label={t('catalogAdd.unit')}
            value={unit}
            onChange={(event) => setUnit(event.target.value as Unit)}
            slotProps={{ select: { native: true } }}
          >
            {UNITS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </TextField>
          <AllergenContainsRow
            value={contains}
            onChange={(next) => {
              setContains(next);
              create.reset();
            }}
            disabled={create.isPending}
          />
          {failed ? (
            <Box role="alert" sx={{ fontSize: 13, color: color.urgentFg }}>
              {t('catalogAdd.failed')}
            </Box>
          ) : null}
          {existing ? (
            <Box role="status" sx={{ fontSize: 13, color: color.muted }}>
              {t('catalogAdd.exists', { name: existing.name })}
            </Box>
          ) : null}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
            <Button type="button" variant="secondary" onClick={onCancel}>
              {t('catalogAdd.cancel')}
            </Button>
            {existing ? (
              <Button
                type="button"
                onClick={() => onPicked(existing, { kind: 'existing' })}
              >
                {t('catalogAdd.pick', { name: existing.name })}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={submit}
                disabled={!category || trimmed === '' || create.isPending}
              >
                <PlusIcon size={16} />
                {t('catalogAdd.add')}
                {category ? null : (
                  <Box
                    component="span"
                    sx={{ ml: '6px', color: color.urgentFg, fontWeight: 600 }}
                  >
                    · {t('catalogAdd.pickOne')}
                  </Box>
                )}
              </Button>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
