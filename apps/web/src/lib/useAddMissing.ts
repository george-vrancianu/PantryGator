import { useToast } from '@pocket-pantry/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '../i18n/translateApiError';
import { apiRequest } from './api';
import {
  flipOnList,
  mealWindowQueryKey,
  type AddedMissing,
  type AddMissingScope,
  type MealWindow,
} from './mealPlan';
import type { IsoDate } from './pantry';
import { shoppingListQueryKey, useShoppingMutations } from './shopping';
import { shoppingListChangeQueryKeys } from './queryKeys';
import { useUndoToast } from './useUndoToast';

/**
 * Add missing from the Meal plan Widget: one call with only the scope, the "On list" flip straight away
 * (put back if the add fails), a toast "{n} added to the Shopping List" whose Undo deletes exactly the
 * Shopping Items the add created, and a refetch of the Shopping List and the Widget.
 */
export function useAddMissing(today: IsoDate) {
  const { t } = useTranslation('mealPlans');
  const { undoOptions } = useUndoToast();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { removeMany } = useShoppingMutations();
  const windowKey = [...mealWindowQueryKey, today];

  const refetch = () =>
    Promise.all(
      [shoppingListQueryKey, ...shoppingListChangeQueryKeys].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );

  const undo = async (createdIds: string[]) => {
    try {
      await removeMany.mutateAsync(createdIds);
    } catch (error) {
      toast.show(translateApiError(t, error));
    }
    await refetch();
  };

  const mutation = useMutation({
    mutationFn: (scope: AddMissingScope) =>
      apiRequest<AddedMissing>(
        `/meal-plans/add-missing?${new URLSearchParams({ today })}`,
        { method: 'POST', body: scope },
      ),
    onMutate: async (scope) => {
      await queryClient.cancelQueries({ queryKey: mealWindowQueryKey });
      const previous = queryClient.getQueryData<MealWindow>(windowKey);
      if (previous) {
        queryClient.setQueryData(windowKey, flipOnList(previous, scope));
      }
      return { previous };
    },
    onError: (error, _scope, context) => {
      if (context?.previous) {
        queryClient.setQueryData(windowKey, context.previous);
      }
      toast.show(translateApiError(t, error));
    },
    onSuccess: ({ createdIds, count }) => {
      if (count === 0) return;
      const message = t('forecast.toast.added', { count });
      // Everything merged into lines already on the list: nothing was created, so nothing to undo.
      if (createdIds.length === 0) toast.show(message, { polite: true });
      else
        toast.show(
          message,
          undoOptions(() => void undo(createdIds)),
        );
    },
    onSettled: refetch,
  });

  return {
    isPending: mutation.isPending,
    add: (scope: AddMissingScope) => mutation.mutate(scope),
  };
}
