import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@pocket-pantry/ui';
import { apiRequest } from './api';
import { recipeChangeQueryKeys } from './queryKeys';
import { useUndoToast } from './useUndoToast';

/** What a Catalog Recipe's add button needs to know: add it, or open the Family's copy. */
export type AddState =
  | { status: 'none' }
  | { status: 'adding' }
  | { status: 'added'; copyId: string };

/** The part of a Catalog Recipe the add flow reads. */
export type AddableRecipe = {
  id: string;
  title: string;
  familyCopyId: string | null;
};

/** `POST /recipes/:id/copy`: the Family's live copy of a Catalog Recipe, made if it had none. */
export const copyToFamily = (id: string) =>
  apiRequest<{ id: string; created: boolean }>(`/recipes/${id}/copy`, {
    method: 'POST',
  });

/** Refetches every list and detail a copy or its Undo changes (all under `recipes`). */
export const refreshAfterCopy = (queryClient: QueryClient) =>
  Promise.all(
    recipeChangeQueryKeys.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );

/**
 * Add to Family from any Catalog Recipe row (ADR 0029): copies it with
 * `POST /recipes/:id/copy`, optimistically. The add shows at once, a toast
 * offers Undo (which archives the copy), and a failed add rolls back with an
 * error toast. After an add or an Undo the Explore list, the Family list,
 * Cook Tonight and the source's detail are refetched (all under `recipes`).
 *
 * One hook per screen: `stateOf` merges the server's `familyCopyId` with the
 * taps made here until the refetch lands.
 */
export function useAddToFamily({
  onNet,
  toastBottom,
}: {
  /** +1 when a tap made a copy, -1 when Undo archived it (the Back badge counts net adds). */
  onNet?: (delta: 1 | -1) => void;
  /** Distance of the toasts from the bottom, px, when a bar sits where the Dock would. */
  toastBottom?: number | string;
} = {}) {
  const { t } = useTranslation(['recipes', 'common', 'errors']);
  const toastApi = useToast();
  const { showUndo } = useUndoToast();
  const toast = useMemo(
    () => ({
      show: (
        message: string,
        options: Parameters<typeof toastApi.show>[1] = {},
      ) =>
        toastApi.show(
          message,
          toastBottom === undefined
            ? options
            : { ...options, bottom: toastBottom },
        ),
    }),
    [toastApi, toastBottom],
  );
  const queryClient = useQueryClient();
  const [overrides, setOverrides] = useState<Record<string, AddState>>({});
  // The copy request of each source in flight, so Undo can wait for the copy id.
  const pending = useRef(
    new Map<string, Promise<{ id: string; created: boolean }>>(),
  );
  const onNetRef = useRef(onNet);
  useEffect(() => {
    onNetRef.current = onNet;
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const set = useCallback((id: string, value: AddState | null) => {
    if (!mounted.current) return;
    setOverrides((prev) => {
      const next = { ...prev };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });
  }, []);

  // Once the refetch has landed the server's answer is the truth again.
  const settle = useCallback(
    async (id: string) => {
      await refreshAfterCopy(queryClient);
      set(id, null);
    },
    [queryClient, set],
  );

  const undo = useCallback(
    async (recipe: AddableRecipe, copyId: string) => {
      set(recipe.id, { status: 'none' });
      try {
        await apiRequest(`/recipes/${copyId}/archive`, { method: 'POST' });
        onNetRef.current?.(-1);
      } catch {
        set(recipe.id, { status: 'added', copyId });
        toast.show(t('recipes:explore.undoFailed', { title: recipe.title }));
      }
      await settle(recipe.id);
    },
    [set, settle, t, toast],
  );

  const add = useCallback(
    async (recipe: AddableRecipe) => {
      if (pending.current.has(recipe.id)) return;
      set(recipe.id, { status: 'adding' });
      const request = copyToFamily(recipe.id);
      pending.current.set(recipe.id, request);
      // Optimistic: the toast is up before the copy is, and Undo waits for the copy's id.
      // Undo only archives a copy this tap made: if the Family already had one, the toast is replaced.
      showUndo(
        t('recipes:explore.added', { title: recipe.title }),
        () =>
          void request.then(
            (body) => (body.created ? undo(recipe, body.id) : undefined),
            () => undefined,
          ),
        toastBottom === undefined ? undefined : { bottom: toastBottom },
      );
      try {
        const body = await request;
        set(recipe.id, { status: 'added', copyId: body.id });
        if (body.created) onNetRef.current?.(1);
        else {
          toast.show(
            t('recipes:explore.alreadyAdded', { title: recipe.title }),
            {
              polite: true,
            },
          );
        }
      } catch {
        set(recipe.id, { status: 'none' });
        toast.show(t('recipes:explore.addFailed', { title: recipe.title }));
      } finally {
        pending.current.delete(recipe.id);
      }
      await settle(recipe.id);
    },
    [set, settle, t, toast, undo, showUndo, toastBottom],
  );

  const stateOf = (recipe: AddableRecipe): AddState => {
    const override = overrides[recipe.id];
    if (override) return override;
    return recipe.familyCopyId
      ? { status: 'added', copyId: recipe.familyCopyId }
      : { status: 'none' };
  };

  return { add, stateOf };
}
