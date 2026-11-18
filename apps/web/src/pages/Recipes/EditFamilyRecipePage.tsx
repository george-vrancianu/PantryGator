import { Alert, Link, Spinner, Stack, Typography } from '@pocket-pantry/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Screen } from '@/components/layout/Screen/Screen';
import { RemovableSourceLink } from './components/SourceLink/SourceLink';
import { ApiError } from '@/lib/api';
import { translateApiError } from '@/i18n/translateApiError';
import {
  useFamilyRecipeEdit,
  useFamilyTipWrites,
  useSetFamilyGuidance,
  useUpdateFamilyRecipe,
} from '@/lib/familyRecipes';
import { useLeaveGuard } from '@/lib/useLeaveGuard';
import { useDeferredRemoval } from '@/lib/useDeferredRemoval';
import { RecipeTipsCard } from './components/RecipeTipsCard/RecipeTipsCard';
import {
  toGuidanceDraft,
  toGuidanceInput,
  type GuidanceDraft,
} from '@/lib/guidanceDraft';
import { recipesQueryKey } from '@/lib/recipes';
import { useMomentOptions } from './components/FamilyGuidance/FamilyGuidance';
import { documentOf, draftOfEdit, type FamilyDraft } from './hooks/familyDraft';
import { FamilyRecipeForm } from './components/FamilyRecipeForm/FamilyRecipeForm';

type FormState = { draft: FamilyDraft; guidance: GuidanceDraft | null };

/** The route element: a page per Recipe id, so moving between Recipes keeps nothing of the one left. */
export function EditFamilyRecipeRoute() {
  const { id = '' } = useParams();
  return <EditFamilyRecipePage key={id} />;
}

/** Edit one of the Family's own Recipes, with its own Tips below. */
export function EditFamilyRecipePage() {
  const { t } = useTranslation(['recipes', 'common', 'errors']);
  const { id = '' } = useParams();
  const query = useFamilyRecipeEdit(id);
  const update = useUpdateFamilyRecipe(id);
  const setGuidance = useSetFamilyGuidance(id);
  const momentOptions = useMomentOptions();
  const tipWrites = useFamilyTipWrites(id);
  // Deleting a Tip waits for its Undo window to end (ADR 0009).
  const queryClient = useQueryClient();
  const editKey = [...recipesQueryKey, 'edit', id];
  const tipRemoval = useDeferredRemoval(editKey, async (tipId: string) => {
    try {
      await tipWrites.remove.mutateAsync(tipId);
    } catch (error) {
      // A Tip that is already gone is deleted: saving the Recipe without its Step took it, inside the Undo window.
      if (!(error instanceof ApiError && error.status === 404)) throw error;
      await queryClient.invalidateQueries({ queryKey: editKey });
    }
  });
  const recipe = query.data;
  /** Bumped when the Recipe is stored so the form reseeds with the new line and Step ids. */
  const [recipeSaves, setRecipeSaves] = useState(0);
  /** Bumped when the Guidance is stored so its card reseeds; a Recipe-only save keeps Guidance edits. */
  const [guidanceSaves, setGuidanceSaves] = useState(0);
  /** The Member dropped the Source Link; it is only sent (and gone) once they save. */
  const [linkRemoved, setLinkRemoved] = useState(false);
  /** The Guidance as the last save stored it; reseeds the Guidance card after a save. */
  const [savedGuidance, setSavedGuidance] = useState<GuidanceDraft | null>(
    null,
  );
  /** Both parts are saved (shows "Recipe saved."); cleared by the next Save. */
  const [saved, setSaved] = useState(false);
  /** The part the last Save could not store, and why. */
  const [failure, setFailure] = useState<{
    part: 'recipe' | 'guidance';
    error: unknown;
  } | null>(null);
  /** The Recipe document as last stored (what the form reseeded with): a Save with the same document does not resend it. */
  const [storedRecipe, setStoredRecipe] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** The form as it is now, reported on every change; read when the Member leaves. */
  const formNow = useRef<FormState | null>(null);
  /** Whether the form holds unsaved edits, so "Recipe saved." goes when new ones arrive. */
  const [dirty, setDirty] = useState(false);

  // Unsaved edits to the Recipe or its Guidance (Tips save at once and never count).
  const hasUnsaved = (now: typeof formNow.current) => {
    if (!now || !recipe) return false;
    const recipeBase =
      storedRecipe ?? JSON.stringify(documentOf(draftOfEdit(recipe)));
    if (linkRemoved || JSON.stringify(documentOf(now.draft)) !== recipeBase)
      return true;
    const guidanceBase = savedGuidance ?? toGuidanceDraft(recipe);
    return (
      now.guidance !== null &&
      JSON.stringify(toGuidanceInput(now.guidance)) !==
        JSON.stringify(toGuidanceInput(guidanceBase))
    );
  };
  /** Whether the form no longer holds what a Save sent: the Member kept editing while it was in flight. */
  const formChangedSince = (
    document: ReturnType<typeof documentOf> | undefined,
    guidance: ReturnType<typeof toGuidanceInput> | undefined,
  ) => {
    const now = formNow.current;
    if (!now) return false;
    if (
      document &&
      JSON.stringify(documentOf(now.draft)) !== JSON.stringify(document)
    )
      return true;
    return (
      guidance !== undefined &&
      now.guidance !== null &&
      JSON.stringify(toGuidanceInput(now.guidance)) !== JSON.stringify(guidance)
    );
  };
  useLeaveGuard(
    () => hasUnsaved(formNow.current),
    t('recipes:family.leaveConfirm'),
  );

  const back = { label: t('recipes:back'), href: `/recipes/${id}` };
  // A failed delete is reported by the deferred-removal toast, not here.
  const tipError =
    tipWrites.add.error ??
    tipWrites.update.error ??
    tipWrites.reorder.error ??
    tipWrites.hide.error;
  const tips = (recipe?.tips ?? []).filter(
    (tip) => !tipRemoval.hiddenIds.has(tip.id),
  );
  const tipActions = {
    add: (text: string, stepId: string | null) =>
      tipWrites.add.mutateAsync({ text, stepId }),
    update: (tipId: string, text: string) =>
      tipWrites.update.mutate({ tipId, text }),
    remove: (tipId: string) =>
      tipRemoval.remove(tipId, '', t('recipes:family.tips.deleted'), {
        polite: true,
      }),
    // The API takes every Tip of the Recipe: swap the Tip with its neighbour among the ones shown in its group.
    move: (tipId: string, offset: -1 | 1) => {
      const all = (recipe?.tips ?? []).map((tip) => tip.id);
      const own = tips.find((tip) => tip.id === tipId);
      const group = tips.filter((tip) => tip.stepId === own?.stepId);
      const neighbour =
        group[group.findIndex((tip) => tip.id === tipId) + offset];
      if (!own || !neighbour) return;
      const from = all.indexOf(tipId);
      const to = all.indexOf(neighbour.id);
      [all[from], all[to]] = [all[to], all[from]];
      tipWrites.reorder.mutate(all);
    },
  };
  if (!recipe || recipe.archived) {
    return (
      <>
        <Screen title={recipe?.title ?? t('recipes:title')} back={back} />
        <Stack spacing={3}>
          {query.error ? (
            <Alert>{translateApiError(t, query.error)}</Alert>
          ) : null}
          {query.isPending ? <Spinner label={t('common:loading')} /> : null}
          {recipe?.archived ? (
            <Typography>{t('recipes:family.unavailable')}</Typography>
          ) : null}
        </Stack>
      </>
    );
  }
  return (
    <FamilyRecipeForm
      // Tip writes refresh `recipe` but must not reset unsaved edits; a save reseeds.
      seedKey={`${recipe.id}-${recipeSaves}`}
      guidanceSeedKey={`${recipe.id}-${guidanceSaves}`}
      header={{
        title: t('recipes:family.editHeading'),
        titleRef: headingRef,
        back,
      }}
      openTab="steps"
      detailsTop={
        recipe.sourceLink ? (
          <RemovableSourceLink
            href={recipe.sourceLink}
            translatedFrom={recipe.sourceLanguage}
            removed={linkRemoved}
            onRemove={() => setLinkRemoved(true)}
            onUndo={() => setLinkRemoved(false)}
          />
        ) : null
      }
      notices={
        <>
          <Typography role="status" variant="body2">
            {saved && !saving && !dirty && !linkRemoved
              ? t('recipes:family.saved')
              : null}
          </Typography>
          {failure ? (
            <Alert>
              {t(`recipes:family.saveFailed.${failure.part}`, {
                reason: translateApiError(t, failure.error),
              })}
            </Alert>
          ) : null}
          {tipError ? <Alert>{translateApiError(t, tipError)}</Alert> : null}
        </>
      }
      stepsEnd={
        <>
          <Link href={`/recipes/${id}`}>{t('recipes:family.viewRecipe')}</Link>
          <RecipeTipsCard
            tips={tips.filter((tip) => tip.stepId === null)}
            parentTips={recipe.parentTips ?? undefined}
            actions={tipActions}
            busy={tipWrites.hide.isPending}
            onHide={(tipIds) => tipWrites.hide.mutate(tipIds)}
          />
        </>
      }
      initial={draftOfEdit(recipe)}
      guidance={{
        initial: savedGuidance ?? toGuidanceDraft(recipe),
        momentOptions,
        recipeId: recipe.id,
      }}
      onChange={(state) => {
        formNow.current = state;
        setDirty(hasUnsaved(state));
      }}
      saving={saving}
      error={null}
      stepTipCount={(stepId) =>
        tips.filter((tip) => tip.stepId === stepId).length
      }
      stepTips={{
        of: (stepId) => tips.filter((tip) => tip.stepId === stepId),
        actions: tipActions,
      }}
      onSave={async (document, guidance) => {
        // Edit always passes `guidance`; without it there is nothing to store.
        if (!guidance) return;
        // `null` clears the link (and its language); leaving it out keeps both.
        const body = linkRemoved ? { ...document, sourceLink: null } : document;
        const key = JSON.stringify(body);
        setSaving(true);
        setSaved(false);
        setFailure(null);
        try {
          if (storedRecipe !== key) {
            try {
              const stored = await update.mutateAsync(body);
              setStoredRecipe(JSON.stringify(documentOf(draftOfEdit(stored))));
              setLinkRemoved(false);
              // Edits made while the Save was in flight stay: a reseed would drop them.
              if (!formChangedSince(document, undefined))
                setRecipeSaves((count) => count + 1);
            } catch (error) {
              setFailure({ part: 'recipe', error });
              return;
            }
          }
          try {
            const stored = await setGuidance.mutateAsync(guidance);
            setSavedGuidance(toGuidanceDraft(stored));
          } catch (error) {
            setFailure({ part: 'guidance', error });
            return;
          }
          if (!formChangedSince(undefined, guidance))
            setGuidanceSaves((count) => count + 1);
          setSaved(true);
        } finally {
          setSaving(false);
        }
      }}
    />
  );
}
