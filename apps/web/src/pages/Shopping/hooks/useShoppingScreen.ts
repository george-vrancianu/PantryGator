import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import {
  useShoppingList,
  shoppingListQueryKey,
  useShoppingMutations,
  withoutItems,
  type NewShoppingItem,
} from '@/lib/shopping';
import type { Amount } from '@/lib/amount';
import { localIso } from '@/lib/pantry';
import { noSuggestions, useSuggestions } from '@/lib/suggestions';
import { useDeferredRemoval } from '@/lib/useDeferredRemoval';

export function useShoppingScreen() {
  const { t } = useTranslation();
  const list = useShoppingList();
  const { add, setChecked, setAmount, remove } = useShoppingMutations();
  const removal = useDeferredRemoval(shoppingListQueryKey, remove.mutateAsync);
  // A removed item stays out of the list, refetches included, until its delete has settled.
  const visible = useMemo(
    () => withoutItems(list.data, removal.hiddenIds),
    [list.data, removal.hiddenIds],
  );
  // A failed Suggestions request just hides the section; the list still works.
  // oxlint-disable-next-line react/purity -- "today" must follow the clock across midnight; freezing it would leave a Member on a stale day
  const suggestions = useSuggestions(localIso(new Date()));

  // A failed add is shown by the Add sheet, next to what was typed.
  const error = list.error ?? setChecked.error;

  return {
    list: visible,
    suggestions: { ...noSuggestions, ...suggestions.data },
    isLoading: list.isPending,
    error: error ? translateApiError(t, error) : null,
    adding: add.isPending,
    addError: add.error ? translateApiError(t, add.error) : null,
    /** Forget a failed add, e.g. when the sheet opens. */
    resetAddError: () => add.reset(),
    /** Resolves true when added; on false, `addError` says why. */
    add: (item: NewShoppingItem) =>
      add.mutateAsync(item).then(
        () => true,
        () => false,
      ),
    toggle: (id: string, checked: boolean) =>
      setChecked.mutate({ id, checked }),
    /** Rejects with the API error, which the amount sheet shows. */
    setAmount: (id: string, amount: Amount) =>
      setAmount.mutateAsync({ id, ...amount }),
    remove: removal.remove,
    retry: () => void list.refetch(),
  };
}
