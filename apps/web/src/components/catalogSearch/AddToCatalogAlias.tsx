import {
  Box,
  Button,
  IconButton,
  CloseIcon,
  TextField,
  radius,
  tokens,
} from '@pocket-pantry/ui';
import {
  useEffect,
  useId,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/api';
import {
  useAliasSearch,
  useCreateFamilySynonym,
  type CatalogSearchResult,
} from '../../lib/catalog';
import { IngredientIconSlot } from '../IngredientIconSlot';
import { OptionRow } from './OptionRow';
import { resultMeta } from './SearchResultRow';
import {
  useReportedAction,
  type FormAction,
  type PickOutcome,
} from './addToCatalogShared';

export type AddToCatalogAliasProps = {
  /** The trimmed Name the Member is giving another name to. */
  name: string;
  searchRef: RefObject<HTMLInputElement | null>;
  onPicked: (result: CatalogSearchResult, outcome: PickOutcome) => void;
  onCancel: () => void;
  /** The host pins the primary action: no Cancel and no primary button here; it is reported instead. */
  onAction?: (action: FormAction | null) => void;
};

function existingOf(error: unknown): CatalogSearchResult | null {
  if (
    error instanceof ApiError &&
    error.code === 'catalog.family_synonym_exists'
  ) {
    return (error.params.existing as CatalogSearchResult | undefined) ?? null;
  }
  return null;
}

/**
 * "Another name for…": search the catalog for the Ingredient the Name means,
 * then Link & pick. A name that already means one turns the primary action
 * into "Pick {existing}".
 */
export function AddToCatalogAlias({
  name,
  searchRef,
  onPicked,
  onCancel,
  onAction,
}: AddToCatalogAliasProps) {
  const { color } = tokens;
  const { t } = useTranslation('catalog');
  const id = useId();
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<CatalogSearchResult | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const search = useAliasSearch(query);
  const link = useCreateFamilySynonym();
  const existing = link.error ? existingOf(link.error) : null;
  // Editing the Name makes an earlier answer stale.
  const reset = link.reset;
  useEffect(() => reset(), [name, reset]);
  const failed = link.isError && !existing;
  const rows = search.active ? (search.data ?? []).slice(0, 5) : [];
  const active = activeIndex < rows.length ? activeIndex : -1;

  const choose = (row: CatalogSearchResult) => {
    setTarget(row);
    setActiveIndex(-1);
    link.reset();
  };
  const submit = () => {
    if (!target || name === '' || link.isPending) return;
    link.mutate(
      { name, ingredientId: target.id },
      {
        onSuccess: (result) => onPicked(result, { kind: 'linked', name }),
      },
    );
  };
  useReportedAction(
    onAction,
    existing
      ? {
          label: t('catalogAdd.pick', { name: existing.name }),
          disabled: false,
          pending: false,
          onClick: () => onPicked(existing, { kind: 'existing' }),
        }
      : {
          label: target
            ? t('catalogAdd.link')
            : `${t('catalogAdd.link')} · ${t('catalogAdd.pickOne')}`,
          disabled: !target || name === '',
          pending: link.isPending,
          onClick: submit,
        },
    true,
  );
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && rows.length > 0) {
      event.preventDefault();
      setActiveIndex((active + 1) % rows.length);
    } else if (event.key === 'ArrowUp' && rows.length > 0) {
      event.preventDefault();
      setActiveIndex(active <= 0 ? rows.length - 1 : active - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[active >= 0 ? active : 0];
      if (row) choose(row);
    }
  };

  const listId = `${id}-aliases`;
  const hint = (text: string) => (
    <Box sx={{ fontSize: 12.5, color: color.muted, p: '8px 4px' }}>{text}</Box>
  );

  return (
    <>
      <Box sx={{ fontSize: 13, fontWeight: 600 }}>
        {t('catalogAdd.sameAs', { name })}
      </Box>
      {target ? (
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
          <IngredientIconSlot
            ingredientId={target.id}
            aisleId={target.parentCategory.aisle.id}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ fontSize: 14, fontWeight: 600 }}>{target.name}</Box>
            <Box sx={{ fontSize: 12, opacity: 0.8 }}>{resultMeta(target)}</Box>
          </Box>
          <IconButton
            label={t('catalogAdd.changeIngredient')}
            tone="plain"
            size={34}
            onClick={() => {
              setTarget(null);
              link.reset();
              setTimeout(() => searchRef.current?.focus(), 0);
            }}
          >
            <CloseIcon size={18} />
          </IconButton>
        </Box>
      ) : (
        <Box>
          <TextField
            label={t('catalogAdd.aliasSearch')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(-1);
            }}
            onKeyDown={keyDown}
            autoComplete="off"
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: {
                ref: searchRef,
                role: 'combobox',
                'aria-autocomplete': 'list',
                'aria-expanded': rows.length > 0,
                'aria-controls': listId,
                'aria-activedescendant':
                  active >= 0 ? `${id}-alias-${active}` : undefined,
                autoFocus: true,
              },
            }}
          />
          {query.trim() === '' ? hint(t('catalogAdd.aliasHint')) : null}
          <Box
            component="ul"
            id={listId}
            role="listbox"
            aria-label={t('catalogAdd.aliasSearch')}
            sx={{
              listStyle: 'none',
              m: 0,
              mt: 1,
              p: 0,
              overflow: 'hidden',
              borderRadius: radius.control,
              border: rows.length > 0 ? `1px solid ${color.line}` : 0,
            }}
          >
            {rows.map((row, index) => (
              <OptionRow
                key={row.id}
                id={`${id}-alias-${index}`}
                active={index === active}
                first={index === 0}
                onSelect={() => choose(row)}
              >
                <IngredientIconSlot
                  ingredientId={row.id}
                  aisleId={row.parentCategory.aisle.id}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ fontSize: 15, fontWeight: 600 }}>{row.name}</Box>
                  <Box sx={{ fontSize: 13, color: color.muted }}>
                    {resultMeta(row)}
                  </Box>
                </Box>
              </OptionRow>
            ))}
          </Box>
          {search.active &&
          search.data &&
          rows.length === 0 &&
          !search.isSearching
            ? hint(t('catalogAdd.aliasNoMatch'))
            : null}
        </Box>
      )}
      {failed ? (
        <Box role="alert" sx={{ fontSize: 13, color: color.urgentFg }}>
          {t('catalogAdd.failed')}
        </Box>
      ) : null}
      {existing ? (
        <Box role="alert" sx={{ fontSize: 13, color: color.muted }}>
          {t('catalogAdd.aliasExists', { name, ingredient: existing.name })}
        </Box>
      ) : null}
      {onAction ? null : (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            sx={{ height: 52 }}
          >
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
              disabled={!target || name === '' || link.isPending}
            >
              {t('catalogAdd.link')}
              {target ? null : (
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
      )}
    </>
  );
}
