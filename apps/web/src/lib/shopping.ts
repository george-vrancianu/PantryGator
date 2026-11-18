import { shoppingListChangeQueryKeys } from './queryKeys';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { apiRequest } from './api';
import type { Unit } from './catalog';
import { normalizeName } from './normalizeName';

export type ShoppingItem = {
  id: string;
  /** The Catalog Ingredient; null for an Unmatched item. */
  ingredientId: string | null;
  name: string;
  quantity: number | null;
  unit: Unit | null;
  checked: boolean;
  /** The typed name never matched a Catalog Ingredient. */
  unmatched: boolean;
};

export type ShoppingGroup = {
  /** Null for the trailing group of Unmatched Shopping Items. */
  aisle: { id: string; name: string; sortOrder: number } | null;
  items: ShoppingItem[];
};

export type ShoppingList = {
  id: string;
  groups: ShoppingGroup[];
  summary: { remaining: number; checked: number };
};

/**
 * What a bulk add answers: the whole list, the ids of the Shopping Items created or merged into (request order),
 * and `insertedIds`, only the ones newly inserted: what Undo may delete.
 */
export type AddedShoppingItems = ShoppingList & {
  createdIds: string[];
  insertedIds: string[];
};

export type NewShoppingItem = {
  ingredientId?: string;
  name?: string;
  quantity?: number;
  unit?: Unit;
};

/** How long Shopping toasts stay up. */
export const SHOPPING_TOAST_MS = 3000;

/** How many items are on the list, ticked ones included. */
export const itemCount = (summary: ShoppingList['summary']): number =>
  summary.remaining + summary.checked;

/** The items still to buy: every group's unchecked items, flattened. */
export const uncheckedItems = (
  list: ShoppingList | undefined,
): ShoppingItem[] =>
  (list?.groups ?? []).flatMap((group) =>
    group.items.filter((item) => !item.checked),
  );

/** The list without the items in `ids`: empty groups drop out and the summary follows. */
export const withoutItems = (
  list: ShoppingList | undefined,
  ids: ReadonlySet<string>,
): ShoppingList | undefined => {
  if (!list || ids.size === 0) return list;
  const groups = list.groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !ids.has(item.id)),
    }))
    .filter((group) => group.items.length > 0);
  const items = groups.flatMap((group) => group.items);
  const checked = items.filter((item) => item.checked).length;
  return {
    ...list,
    groups,
    summary: { remaining: items.length - checked, checked },
  };
};

/**
 * Whether `item` is the thing `target` names: the same Ingredient, or for an
 * Unmatched target the same normalised typed name, as the server merges them.
 */
export const isOnList = (
  item: ShoppingItem,
  target: { ingredientId: string | null; name: string },
): boolean =>
  target.ingredientId
    ? item.ingredientId === target.ingredientId
    : item.ingredientId === null &&
      normalizeName(item.name) === normalizeName(target.name);

/**
 * The cached Shopping List's line for an Ingredient, in the shape a Voice Action's `rows.shoppingItem` has;
 * null when the list is not cached or has no such line.
 */
export const cachedShoppingRow = (
  queryClient: QueryClient,
  ingredientId: string,
) => {
  const list = queryClient.getQueryData<ShoppingList>(shoppingListQueryKey);
  const item = list?.groups
    .flatMap((group) => group.items)
    .find((entry) => entry.ingredientId === ingredientId);
  return item
    ? {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        checked: item.checked,
      }
    : null;
};

/** How often the list refetches, so other Members' changes show up without a reload. */
export const SHOPPING_POLL_INTERVAL_MS = 10_000;

/** The Family's Shopping List. */
export const shoppingListQueryKey = ['shopping-list'] as const;

const path = (suffix = '') => `/shopping-list${suffix}`;

/** The Family's Shopping List, refreshed on an interval and whenever the window regains focus. */
export function useShoppingList() {
  return useQuery({
    queryKey: shoppingListQueryKey,
    queryFn: () => apiRequest<ShoppingList>(path()),
    refetchInterval: SHOPPING_POLL_INTERVAL_MS,
    refetchOnWindowFocus: 'always',
  });
}

/** Mutations answer with the whole updated list, which replaces the cached one. */
export function useShoppingMutations() {
  const queryClient = useQueryClient();
  const onSuccess = (list: ShoppingList) => {
    queryClient.setQueryData(shoppingListQueryKey, list);
    // Items on the list are hidden from Suggestions and flagged on Recipe lines.
    return Promise.all(
      shoppingListChangeQueryKeys.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };

  const add = useMutation({
    mutationFn: (item: NewShoppingItem) =>
      apiRequest<ShoppingList>(path('/items'), {
        method: 'POST',
        body: item,
      }),
    onSuccess,
  });
  const addMany = useMutation({
    mutationFn: (items: NewShoppingItem[]) =>
      apiRequest<AddedShoppingItems>(path('/items/bulk'), {
        method: 'POST',
        body: { items },
      }),
    onSuccess: ({ createdIds: _created, insertedIds: _inserted, ...list }) =>
      onSuccess(list),
  });
  const setChecked = useMutation({
    mutationFn: ({ id, checked }: { id: string; checked: boolean }) =>
      apiRequest<ShoppingList>(path(`/items/${id}`), {
        method: 'PATCH',
        body: { checked },
      }),
    onSuccess,
  });
  const setAmount = useMutation({
    mutationFn: ({
      id,
      quantity,
      unit,
    }: {
      id: string;
    } & Pick<ShoppingItem, 'quantity' | 'unit'>) =>
      apiRequest<ShoppingList>(path(`/items/${id}/amount`), {
        method: 'PUT',
        // Left out means none.
        body: {
          ...(quantity !== null ? { quantity } : {}),
          ...(unit !== null ? { unit } : {}),
        },
      }),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      apiRequest<ShoppingList>(path(`/items/${id}`), {
        method: 'DELETE',
      }),
    onSuccess,
  });
  return { add, addMany, setChecked, setAmount, remove };
}
