import { familyRecipeHref } from '@/lib/recipeHref';
import { Button } from '@pocket-pantry/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { RecipeDraftConflictBanner } from '../components/RecipeDraftConflictBanner/RecipeDraftConflictBanner';
import {
  useCreateFamilyRecipe,
  type FamilyRecipeDocument,
} from '@/lib/familyRecipes';
import type { GuidanceInput } from '@/lib/adminRecipes';
import type { Autosave } from '@/lib/recipeDraftAutosave';
import type { RecipeDraftView } from '@/lib/recipeDrafts';
import { useLeaveGuard } from '@/lib/useLeaveGuard';
import { RecipeDraftWriteNotice } from '../components/RecipeDraftWriteNotice/RecipeDraftWriteNotice';
import type { DiscardedDraftState } from './useRecipeDraftDiscard';

/** What a form page gets from `useRecipeDraftRoute`, passed down together to the form. */
export type RecipeDraftRouteProps = {
  /** The Recipe Draft the form was opened on, if resuming one. */
  resumed?: RecipeDraftView;
  onDraftId: (id: string) => void;
  /** Drops the supplied fill from the history entry (see `useRecipeDraftRoute`). */
  clearState: () => void;
  /** Reload the form on the latest Recipe Draft (a version conflict's "Load latest"). */
  onLoadLatest: (latest: RecipeDraftView) => void;
};

type SaveInput = {
  parentId: string | null;
  document: FamilyRecipeDocument;
  guidance?: GuidanceInput;
  /** More fields for the create (a Source Link and its language). */
  extra?: Partial<FamilyRecipeDocument>;
};

/**
 * The wiring a Recipe form shares with its Recipe Draft (ADR 0028): the leave
 * guard, the id in the URL, the write notice and conflict banner, Save (which
 * ends the Recipe Draft with the create) and "Discard draft".
 *
 * While the autosave is in conflict the stored Recipe Draft is a newer one this
 * form never saw: Save leaves it alone (no `recipeDraftId`) and Discard is not
 * offered, until "Load latest" reloads the form on it.
 */
export function useRecipeDraftFormSession({
  autosave,
  route,
  finishing,
  setFinishing,
}: {
  autosave: Autosave;
  route: RecipeDraftRouteProps;
  /** True from the tap on Save until the create answers; owned by the form, which also needs it earlier. */
  finishing: boolean;
  setFinishing: (finishing: boolean) => void;
}) {
  const { t } = useTranslation(['recipes']);
  const navigate = useNavigate();
  const create = useCreateFamilyRecipe();
  const [discarding, setDiscarding] = useState(false);
  const { draftId, flush } = autosave;
  const { onDraftId, onLoadLatest } = route;

  // A save that failed (or lost to another device) is not on the server: ask before leaving.
  useLeaveGuard(autosave.hasUnsaved, t('recipes:recipeDraft.leaveConfirm'));
  useEffect(() => {
    // Only a new id goes to the URL, and not while the Recipe is being saved: the page is about to leave.
    if (draftId && !finishing) onDraftId(draftId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, finishing]);

  const save = ({ parentId, document, guidance, extra }: SaveInput) => {
    void (async () => {
      if (finishing) return;
      setFinishing(true);
      // The Recipe Draft ends with the create, so it must be known first.
      const id = await autosave.flush();
      // In conflict, the stored one is newer than this form: not ours to end.
      const recipeDraftId = autosave.conflicted() ? null : id;
      // It is being consumed: no update may go out meanwhile.
      autosave.pause();
      create.mutate(
        {
          parentId,
          document: {
            ...document,
            guidance,
            ...(recipeDraftId ? { recipeDraftId } : {}),
            ...extra,
          },
        },
        {
          onSuccess: (saved) => {
            autosave.stop();
            navigate(familyRecipeHref(saved.id));
          },
          onError: () => {
            setFinishing(false);
            autosave.resume();
          },
        },
      );
    })();
  };

  const notices: ReactNode = (
    <>
      <RecipeDraftWriteNotice
        error={autosave.error}
        status={autosave.status}
        onKeepAsNew={autosave.keepAsNew}
      />
      {autosave.status === 'conflict' && draftId ? (
        <RecipeDraftConflictBanner draftId={draftId} onLoaded={onLoadLatest} />
      ) : null}
    </>
  );

  const discardButton: ReactNode =
    draftId && autosave.status !== 'conflict' ? (
      <Button
        variant="ghost"
        disabled={discarding || finishing}
        onClick={async () => {
          setDiscarding(true);
          // Let a write in flight land (it may be the create that gives the id), then keep autosave from writing again.
          const id = await flush();
          // It lost to a newer one meanwhile: that is not this form's to discard.
          if (autosave.conflicted()) {
            setDiscarding(false);
            return;
          }
          autosave.stop();
          // The Recipes page owns the Undo: this form is about to be gone.
          const state: DiscardedDraftState | null = id
            ? { discardRecipeDraft: { id } }
            : null;
          navigate('/recipes', { replace: true, state });
        }}
      >
        {t('recipes:drafts.discard')}
      </Button>
    ) : null;

  return {
    create,
    saving: create.isPending || finishing || discarding,
    save,
    notices,
    discardButton,
  };
}
