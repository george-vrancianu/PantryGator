import { useToast, type ToastHandle } from '@pocket-pantry/ui';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '../i18n/translateApiError';
import { UNDO_WINDOW_MS, useUndoToast } from './useUndoToast';

export { UNDO_WINDOW_MS };

/** The delete calls: one for a single record, one for several, and at least one of the two. */
type SendArgs<Id> =
  | [
      mutateAsync: (id: Id) => Promise<unknown>,
      mutateManyAsync?: (ids: Id[]) => Promise<unknown>,
    ]
  | [mutateAsync: undefined, mutateManyAsync: (ids: Id[]) => Promise<unknown>];

/**
 * Remove a record with Undo (ADR 0009). `remove` hides the record at once and
 * shows an Undo toast; `send` (the real delete) only runs when that toast
 * ends: it times out, is dismissed or replaced by another toast, or the Member
 * leaves the page. Undo just shows the record again and makes no request.
 *
 * Filter `hiddenIds` out of the list you render, so a refetch cannot bring a
 * removed record back. A record stays hidden until `send` has settled; if it
 * rejects the record comes back with an error toast. Only the latest removal
 * can be undone.
 *
 * `send` must resolve only once the cache no longer holds the record (put the
 * response in the cache with `setQueryData` in the mutation's `onSuccess`, or
 * return the `invalidateQueries` promise), otherwise the row flashes back.
 * Pass `mutateAsync`, not `mutate`: per-call callbacks are dropped when a
 * newer `mutate` runs. The hook cancels in-flight refetches of `queryKey`
 * (the list's query key) before it calls `mutateAsync`, so a poll cannot
 * resurrect the row.
 *
 * `discard` drops a waiting removal without sending it, for when the record is
 * written again before its Undo window ends.
 *
 * `removeMany` removes several records as one removal: one Undo window, one toast, and one call to
 * `mutateManyAsync` with all the ids when the window ends. Undo brings all of them back. It is still
 * the latest removal, of one record or many, that can be undone.
 *
 * The error toast replaces a newer Undo toast and so sends that delete early;
 * that is intended (ADR 0009: a new toast sends any pending delete).
 */
export function useDeferredRemoval<Id extends string | number>(
  queryKey: QueryKey,
  ...sends: SendArgs<Id>
) {
  const [mutateAsync, mutateManyAsync] = sends;
  const { t } = useTranslation('common');
  const toast = useToast();
  const { showUndo } = useUndoToast();
  const queryClient = useQueryClient();
  // Held by key value, so a new array each render does not change `send`.
  const keyRef = useRef(queryKey);
  useLayoutEffect(() => {
    keyRef.current = queryKey;
  });
  const send = useCallback(
    async (ids: Id[], many: boolean) => {
      await queryClient.cancelQueries({ queryKey: keyRef.current });
      // Without a bulk call, every record of the removal gets its own delete.
      if (many && mutateManyAsync) return mutateManyAsync(ids);
      if (!mutateAsync) throw new Error('useDeferredRemoval: no delete call');
      return many
        ? Promise.all(ids.map((id) => mutateAsync(id)))
        : mutateAsync(ids[0]);
    },
    [queryClient, mutateAsync, mutateManyAsync],
  );
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<Id>>(new Set());
  // The one removal still waiting on its Undo, and its toast. One removal may hold several records.
  const waiting = useRef<{
    token: symbol;
    ids: Id[];
    many: boolean;
    toast: ToastHandle;
  } | null>(null);

  const unhide = useCallback((ids: Id[]) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const flush = useCallback(
    (token: symbol) => {
      const pending = waiting.current;
      if (pending?.token !== token) return;
      waiting.current = null;
      const { ids } = pending;
      send(ids, pending.many).then(
        () => unhide(ids),
        (error: unknown) => {
          unhide(ids);
          toast.show(translateApiError(t, error));
        },
      );
    },
    [send, unhide, toast, t],
  );

  // Leaving the page, by route change or closing the tab, sends it too, and
  // takes down the Undo toast, which would otherwise outlive the delete.
  const flushWaiting = useRef(() => {});
  useLayoutEffect(() => {
    flushWaiting.current = () => {
      const pending = waiting.current;
      if (!pending) return;
      flush(pending.token);
      pending.toast.close();
    };
  });
  useEffect(() => {
    const onPageHide = () => flushWaiting.current();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      flushWaiting.current();
    };
  }, []);

  const start = (ids: Id[], many: boolean, message: string) => {
    // Each removal has its own token, so passing the same array twice is still two removals.
    const token = Symbol('removal');
    setHiddenIds((prev) => new Set([...prev, ...ids]));
    // Showing a toast sends the previous removal; this one takes its place.
    const handle = showUndo(
      message,
      () => {
        // Too late once the delete has been sent.
        if (waiting.current?.token !== token) return;
        waiting.current = null;
        unhide(ids);
      },
      { onClose: () => flush(token) },
    );
    waiting.current = { token, ids, many, toast: handle };
  };

  /** `message` replaces the default "Removed {name}" toast text, already translated. */
  const remove = (id: Id, name: string, message?: string) =>
    start([id], false, message ?? t('row.removed', { name }));

  /** Several records as one removal; `message` is the toast text, already translated. Sends one `mutateManyAsync` call, or one `mutateAsync` per record without it. */
  const removeMany = (ids: Id[], message: string) => start(ids, true, message);

  /**
   * Drop the removal that holds `id` and is still waiting on its Undo, without sending it: its toast closes and
   * all of its records show again. Call it before writing the record back, so the delete cannot follow.
   */
  const discard = (id: Id) => {
    const pending = waiting.current;
    if (!pending?.ids.includes(id)) return;
    waiting.current = null;
    unhide(pending.ids);
    pending.toast.close();
  };

  return { hiddenIds, remove, removeMany, discard };
}
