import { useToast } from '@pocket-pantry/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import { withOnShoppingList, type HealthTodoKey } from '@/lib/health';
import { useUndoToast } from '@/lib/useUndoToast';
import { useHealthScoreMessage } from '@/lib/useHealthScoreMessage';
import {
  shoppingListQueryKey,
  useShoppingMutations,
  type NewShoppingItem,
} from '@/lib/shopping';
import type { PantryHealthState } from '@/lib/usePantryHealth';

export type ShoppingFix = {
  isPending: boolean;
  /** Puts the Ingredients (by id) of a missingStaples or runningLow Health To-do on the Shopping List. */
  add: (key: HealthTodoKey, ingredientIds: string[]) => Promise<void>;
};

/**
 * The Add fixes of the Health To-dos: one bulk-add, then a toast with the count and the new score
 * whose Undo deletes exactly the Shopping Items the add newly inserted (not lines it merged into).
 */
export function useAddToShoppingList(state: PantryHealthState): ShoppingFix {
  const { t } = useTranslation('dashboard');
  const { messageWithScore } = useHealthScoreMessage();
  const { undoOptions } = useUndoToast();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { addMany, remove } = useShoppingMutations();

  const itemsFor = (
    key: HealthTodoKey,
    ingredientIds: string[],
  ): NewShoppingItem[] =>
    ingredientIds.map((ingredientId) => {
      // A Staple brings its preferred amount; Running low carries none.
      const staple =
        key === 'missingStaples'
          ? state.staples.find((s) => s.ingredientId === ingredientId)
          : undefined;
      return staple?.quantity != null && staple.unit !== null
        ? { ingredientId, quantity: staple.quantity, unit: staple.unit }
        : { ingredientId };
    });

  const undo = async (insertedIds: string[]) => {
    try {
      // One at a time: each delete answers with the whole list, and parallel answers could cache a stale one.
      for (const id of new Set(insertedIds)) await remove.mutateAsync(id);
    } catch (error) {
      toast.show(translateApiError(t, error));
    } finally {
      await queryClient.invalidateQueries({ queryKey: shoppingListQueryKey });
    }
  };

  // mutateAsync, not mutate: per-call callbacks are dropped if the sheet closes before the answer.
  const add = async (key: HealthTodoKey, ingredientIds: string[]) => {
    let insertedIds: string[];
    try {
      ({ insertedIds } = await addMany.mutateAsync(
        itemsFor(key, ingredientIds),
      ));
    } catch (error) {
      toast.show(translateApiError(t, error));
      return;
    }
    // The count is Ingredients added; two of them may have merged into one line.
    const message = t('health.toast.added', { count: ingredientIds.length });
    const text = messageWithScore(
      withOnShoppingList(state.input, ingredientIds),
      message,
    );
    // Everything merged into lines already on the list: nothing was inserted, so nothing to undo.
    if (insertedIds.length === 0) toast.show(text, { polite: true });
    else
      toast.show(
        text,
        undoOptions(() => void undo(insertedIds)),
      );
  };

  return { isPending: addMany.isPending, add };
}
