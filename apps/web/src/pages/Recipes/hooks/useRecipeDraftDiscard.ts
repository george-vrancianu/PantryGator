import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { recipeDraftsListKey, useDeleteRecipeDraft } from '@/lib/recipeDrafts';
import { useDeferredRemoval } from '@/lib/useDeferredRemoval';

/** What the form hands to the Recipes page (router state) when its "Discard draft" is tapped. */
export type DiscardedDraftState = { discardRecipeDraft: { id: string } };

function discardedOf(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null;
  const handed = (state as Partial<DiscardedDraftState>).discardRecipeDraft;
  return typeof handed?.id === 'string' ? handed.id : null;
}

/**
 * Discarding a Recipe Draft with Undo (ADR 0009, ADR 0028): `discard` hides it
 * at once and shows the Undo toast; the DELETE goes out only when the toast is
 * gone, and Undo sends nothing. Filter `hiddenIds` out of the list you show.
 *
 * With `takeFromForm`, also discards the Recipe Draft the form just handed over
 * through router state: the form is gone by then, so the page it left to owns
 * the Undo.
 */
export function useRecipeDraftDiscard({
  takeFromForm = false,
}: { takeFromForm?: boolean } = {}) {
  const { t } = useTranslation('recipes');
  const remove = useDeleteRecipeDraft();
  // One DELETE per Recipe Draft. One already gone (discarded on another device) answers 404: that is done, not a failure of the rest.
  const removeAll = async (ids: string[]) => {
    const results = await Promise.allSettled(
      ids.map((id) => remove.mutateAsync(id)),
    );
    const failed = results.find(
      (result): result is PromiseRejectedResult =>
        result.status === 'rejected' &&
        !(result.reason instanceof ApiError && result.reason.status === 404),
    );
    if (failed) throw failed.reason;
  };
  const removal = useDeferredRemoval<string>(
    recipeDraftsListKey,
    remove.mutateAsync,
    removeAll,
  );
  // The Undo toast is a polite status (CODING_STANDARDS).
  const discard = (id: string) =>
    removal.remove(id, '', t('drafts.discarded'), { polite: true });
  /** Every given Recipe Draft as one discard: one Undo toast, which brings them all back. */
  const discardMany = (ids: string[]) =>
    removal.removeMany(ids, t('drafts.discardedMany', { count: ids.length }), {
      polite: true,
    });
  const location = useLocation();
  const navigate = useNavigate();
  const taken = useRef<string | null>(null);
  const handedId = takeFromForm ? discardedOf(location.state) : null;
  useEffect(() => {
    if (handedId === null || taken.current === location.key) return;
    // Deferred, so StrictMode's trial unmount (which sends a waiting removal at once) cancels it before it starts.
    const timer = setTimeout(() => {
      taken.current = location.key;
      discard(handedId);
      // A reload or Back must not discard it again.
      navigate(
        { pathname: location.pathname, search: location.search },
        { replace: true, state: null },
      );
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handedId, location.key]);
  return { hiddenIds: removal.hiddenIds, discard, discardMany };
}
