import { Alert, Box, Typography, radius, tokens } from '@pocket-pantry/ui';
import {
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogSearch } from '@/components/catalogSearch/CatalogSearch/CatalogSearch';
import { AmountField } from '@/components/catalog/AmountField/AmountField';
import { type CatalogSearchResult, type Unit } from '@/lib/catalog';
import { parseAmountText } from '@/lib/pantry';
import {
  isOnList,
  uncheckedItems,
  useShoppingList,
  type NewShoppingItem,
  type ShoppingItem,
} from '@/lib/shopping';
import type { Suggestion, Suggestions } from '@/lib/suggestions';
import { EmptySearch } from '../EmptySearch/EmptySearch';
import { useSheetToast } from '../useSheetToast';

/** What was picked in the search: a Catalog match, or the typed text as an Unmatched item. */
type Chosen =
  | { kind: 'catalog'; result: CatalogSearchResult }
  | { kind: 'typed'; name: string };

/** The pick being filled in with an amount. */
export type OpenPick = {
  pick: Chosen;
  quantity: string;
  unit: Unit | '';
  /** An add was tried, so an invalid amount now shows its error. */
  attempted?: boolean;
};

/** What the search remembers; the Add sheet owns it. */
export type IngredientsState = {
  /** The text in the search field. */
  query: string;
  open: OpenPick | null;
  /** Bumped after an add to give the search a fresh, focused field. */
  searchKey: number;
};

export const emptyIngredients: IngredientsState = {
  query: '',
  open: null,
  searchKey: 0,
};

export type IngredientsSearchProps = {
  state: IngredientsState;
  onStateChange: Dispatch<SetStateAction<IngredientsState>>;
  /** The search input, so the sheet can focus it once it has slid in. */
  searchRef: RefObject<HTMLInputElement | null>;
  adding: boolean;
  /** Resolves true when added; on false the sheet shows `error`. */
  onAdd: (item: NewShoppingItem) => Promise<boolean>;
  /** Why the last add failed, shown above the search. */
  error: string | null;
  suggestions: Suggestions;
};

/** The Add sheet search: the shared search, then an amount for the pick, then add. */
export function IngredientsSearch({
  state,
  onStateChange,
  searchRef,
  adding,
  onAdd,
  error,
  suggestions,
}: IngredientsSearchProps) {
  const { t, i18n } = useTranslation('shopping');
  const toast = useSheetToast();
  const { query, open } = state;
  // What adding will do, following the server: it merges only on the same Ingredient (or typed name) and unit.
  const mergeHint = (lines: ShoppingItem[], unit: Unit | '') => {
    if (lines.length === 0) return null;
    if (lines.some((line) => (line.unit ?? '') === unit)) {
      return t('search.onListHint');
    }
    const named = [
      ...new Set(
        lines.flatMap((line) =>
          line.unit ? [t(`common:units.${line.unit}`)] : [],
        ),
      ),
    ];
    if (named.length === 0) return t('search.onListNoUnit');
    if (lines.some((line) => !line.unit)) {
      return t('search.onListOtherUnits');
    }
    return t('search.onListOtherUnit', {
      unit: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(
        named,
      ),
    });
  };
  const setOpen = (next: OpenPick | null) =>
    onStateChange((s) => ({ ...s, open: next }));
  // Patches the open pick against the latest state, so two changes in one event (a unit change
  // that also converts the number) both land.
  const patchOpen = (patch: Partial<OpenPick>) =>
    onStateChange((s) =>
      s.open ? { ...s, open: { ...s.open, ...patch } } : s,
    );

  // The loaded list (shared with the screen behind), for the "On list" hint.
  const list = useShoppingList();
  const unchecked = uncheckedItems(list.data);
  const pick = open?.pick;
  const pickName = pick
    ? pick.kind === 'catalog'
      ? pick.result.name
      : pick.name
    : '';
  // Unmatched lines merge on the normalised typed name, as the server does.
  const onListLines = pick
    ? unchecked.filter((line) =>
        isOnList(
          line,
          pick.kind === 'catalog'
            ? { ingredientId: pick.result.id, name: pick.result.name }
            : { ingredientId: null, name: pick.name },
        ),
      )
    : [];
  const hint = open ? mergeHint(onListLines, open.unit) : null;
  const amount = parseAmountText(open?.quantity ?? '');

  const choose = (next: Chosen, query: string) => {
    const amount = tileAmount.current;
    tileAmount.current = null;
    const staple =
      next.kind === 'catalog' && amount?.id === next.result.id ? amount : null;
    onStateChange((s) => ({
      ...s,
      query,
      open: {
        pick: next,
        quantity: staple?.quantity ?? '',
        unit:
          staple?.unit ??
          (next.kind === 'catalog' ? next.result.defaultUnit : ''),
      },
    }));
  };

  // A Staple tile carries the Staple's amount; the search's select, right after, opens the pick with it.
  const tileAmount = useRef<{
    id: string;
    quantity: string;
    unit: Unit;
  } | null>(null);
  const pickGone = (suggestion: Suggestion) => {
    tileAmount.current =
      suggestion.quantity !== null && suggestion.unit !== null
        ? {
            id: suggestion.ingredientId,
            quantity: String(suggestion.quantity),
            unit: suggestion.unit,
          }
        : null;
  };

  const submit = async () => {
    if (!open || !pick) return;
    if (!amount.valid) {
      setOpen({ ...open, attempted: true });
      return;
    }
    const added = await onAdd({
      ...(pick.kind === 'catalog'
        ? { ingredientId: pick.result.id }
        : { name: pick.name }),
      ...(amount.value !== null ? { quantity: amount.value } : {}),
      ...(open.unit ? { unit: open.unit } : {}),
    });
    // On failure everything typed stays, and the sheet shows the error.
    if (!added) return;
    toast.show(t('added', { name: pickName }));
    onStateChange((s) => ({
      ...emptyIngredients,
      searchKey: s.searchKey + 1,
    }));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.25 }}>
      {error ? <Alert>{error}</Alert> : null}
      <CatalogSearch
        key={state.searchKey}
        // A fresh field after an add takes focus; the first one waits for the sheet to slide in.
        autoFocus={state.searchKey > 0}
        inputRef={searchRef}
        defaultQuery={query}
        // The empty state shows from the first paint before the field is focused.
        defaultOpen={!pick}
        rowTag={(row) =>
          unchecked.some((line) => isOnList(line, row))
            ? t('search.onList')
            : null
        }
        selected={pick?.kind === 'catalog' ? pick.result : null}
        onSelect={(result) => choose({ kind: 'catalog', result }, result.name)}
        onUseTyped={(name) => choose({ kind: 'typed', name }, name)}
        onQueryChange={(value) =>
          onStateChange((s) => ({ ...s, query: value, open: null }))
        }
        emptyState={
          <EmptySearch suggestions={suggestions} onPickGone={pickGone} />
        }
      />
      {open ? (
        <Box
          sx={{
            backgroundColor: tokens.color.subtle,
            borderRadius: radius.card,
            p: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}
        >
          <AmountField
            name={pickName}
            amountScale={
              pick?.kind === 'catalog' ? pick.result.amountScale : null
            }
            quantity={open.quantity}
            unit={open.unit}
            onQuantityChange={(quantity, unit) =>
              patchOpen({
                quantity,
                ...(unit !== undefined ? { unit } : {}),
              })
            }
            onUnitChange={(unit) => patchOpen({ unit })}
            error={
              open.attempted && !amount.valid
                ? t('finish.quantityInvalid')
                : null
            }
            onSubmit={() => void submit()}
            submit={{
              label: t('amount.add', { name: pickName }),
              disabled: adding,
            }}
          />
          {hint ? (
            <Typography sx={{ fontSize: 12.5, color: tokens.color.muted }}>
              {hint}
            </Typography>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
