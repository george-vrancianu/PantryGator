import { Alert, Spinner } from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { RecipeDraftStatus } from './components/RecipeDraftStatus/RecipeDraftStatus';
import {
  useRecipeDraftFormSession,
  type RecipeDraftRouteProps,
} from './hooks/useRecipeDraftFormSession';
import {
  contentOfForm,
  formOfContent,
  type RecipeDraftForm,
} from '@/lib/recipeDraftContent';
import { DRAFT_PARAM } from '@/lib/recipeRoutes';
import { useRecipeDraftRoute } from './hooks/useRecipeDraftRoute';
import { RecipeDraftContinue } from './components/RecipeDraftContinue/RecipeDraftContinue';
import { useRecipeDraftAutosave } from '@/lib/recipeDraftAutosave';
import { Screen } from '@/components/layout/Screen/Screen';
import { translateApiError } from '@/i18n/translateApiError';
import { useVariantDraft, type FamilyRecipeDraft } from '@/lib/familyRecipes';
import { useRecipe, type RecipeDetail } from '@/lib/recipes';
import { useMomentOptions } from './components/FamilyGuidance/FamilyGuidance';
import { draftOfVariantDraft } from './hooks/familyDraft';
import { VariantOfRow } from './components/VariantOfRow/VariantOfRow';
import { FamilyRecipeForm } from './components/FamilyRecipeForm/FamilyRecipeForm';
import { namedGuidance, routePropsOf } from './hooks/familyRecipeFormInputs';

/** "Make a variant": the editor opens on a copy of the Recipe being viewed, or on a resumed Recipe Draft of this base. */
export function NewVariantPage() {
  const { t } = useTranslation(['recipes', 'common', 'errors']);
  const { id = '' } = useParams();
  const location = useLocation();
  const route = useRecipeDraftRoute();
  // Started beside the route lookup, so the copy and the base's view are on their way while it answers (the form reads the same queries).
  useVariantDraft(id);
  useRecipe(id);
  const draftRoute = routePropsOf(route);
  const resuming = new URLSearchParams(location.search).has(DRAFT_PARAM);
  const title = t('recipes:family.newHeading');
  const back = { label: t('recipes:back'), href: `/recipes/${id}` };
  if (route.error || route.loading) {
    return (
      <>
        <Screen title={title} back={back} />
        {route.error ? (
          <Alert>{translateApiError(t, route.error)}</Alert>
        ) : (
          <Spinner label={t('common:loading')} />
        )}
      </>
    );
  }
  // The base is archived (or not visible): the Recipe Draft carries on as a New Recipe (ADR 0028).
  if (
    route.resumed &&
    (!route.resumed.baseAvailable || !route.resumed.baseRecipeId)
  ) {
    return (
      <Navigate
        to={`/recipes/new?${DRAFT_PARAM}=${route.resumed.id}`}
        replace
      />
    );
  }
  // The Recipe Draft belongs to another base: open it under that base, so Save makes a Variant of the right one.
  if (route.resumed?.baseRecipeId && route.resumed.baseRecipeId !== id) {
    return (
      <Navigate
        to={`/recipes/${route.resumed.baseRecipeId}/variant/new?${DRAFT_PARAM}=${route.resumed.id}`}
        replace
      />
    );
  }
  return (
    <RecipeDraftContinue
      key={route.formKey}
      active={!resuming}
      kind="variant"
      baseRecipeId={id}
      title={title}
      back={back}
    >
      <NewVariantContent baseId={id} draftRoute={draftRoute} />
    </RecipeDraftContinue>
  );
}

function NewVariantContent({
  baseId: id,
  draftRoute,
}: {
  baseId: string;
  draftRoute: RecipeDraftRouteProps;
}) {
  const { t } = useTranslation(['recipes', 'common', 'errors']);
  const back = { label: t('recipes:back'), href: `/recipes/${id}` };
  const draft = useVariantDraft(id);
  // The draft carries link ids only; the source's own view names them.
  const source = useRecipe(id);
  // ADR 0029: on a Family's copy the Variant still branches from the Catalog Base, which the copy's own view does not name.
  const baseId = draft.data?.parentId;
  const fetchesBase = baseId !== undefined && baseId !== id;
  const catalogBase = useRecipe(baseId ?? '', fetchesBase, false);
  // A disabled query is "pending" for ever: wait only for a Base that is being fetched.
  const ready =
    draft.data !== undefined &&
    !source.isPending &&
    !(fetchesBase && catalogBase.isPending);
  // When the Base cannot be fetched, name nothing rather than the Family's copy.
  const baseTitle = fetchesBase ? catalogBase.data?.title : source.data?.title;

  return (
    <>
      {draft.error ? (
        <>
          <Screen title={t('recipes:family.newHeading')} back={back} />
          <Alert>{translateApiError(t, draft.error)}</Alert>
        </>
      ) : null}
      {!ready && !draft.error ? (
        <>
          <Screen title={t('recipes:family.newHeading')} back={back} />
          <Spinner label={t('common:loading')} />
        </>
      ) : null}
      {draft.data && ready ? (
        <VariantForm
          baseId={id}
          prefill={draft.data}
          source={source.data}
          baseTitle={baseTitle}
          draftRoute={draftRoute}
        />
      ) : null}
    </>
  );
}

/** The Variant form once the base's copy is here; autosaves like New Recipe, with the base stored on the Recipe Draft. */
function VariantForm({
  baseId,
  prefill,
  source,
  baseTitle,
  draftRoute,
}: {
  baseId: string;
  prefill: FamilyRecipeDraft;
  source: RecipeDetail | undefined;
  /** The Catalog Base this Variant branches from (not the copy it was filled from). */
  baseTitle: string | undefined;
  draftRoute: RecipeDraftRouteProps;
}) {
  const { resumed } = draftRoute;
  const { t } = useTranslation(['recipes', 'common', 'errors']);
  const momentOptions = useMomentOptions();
  const [finishing, setFinishing] = useState(false);
  const [resumedForm] = useState(() =>
    resumed ? formOfContent(resumed.content) : null,
  );
  // The untouched form is the copy of the base: no Recipe Draft until the Member changes it.
  const [copy] = useState(() => ({
    draft: draftOfVariantDraft(prefill),
    guidance: namedGuidance(prefill, source),
  }));
  const [initial] = useState(() => ({
    draft: resumedForm?.draft ?? copy.draft,
    guidance: resumedForm?.guidance ?? copy.guidance,
  }));
  const [formState, setFormState] = useState<RecipeDraftForm>(initial);
  const autosave = useRecipeDraftAutosave({
    kind: 'variant',
    baseRecipeId: baseId,
    content: contentOfForm(formState),
    blank: contentOfForm(copy),
    resumed: resumed ? { id: resumed.id, version: resumed.version } : undefined,
  });
  const session = useRecipeDraftFormSession({
    autosave,
    route: draftRoute,
    finishing,
    setFinishing,
  });

  return (
    <FamilyRecipeForm
      header={{
        title: t('recipes:family.newHeading'),
        back: { label: t('recipes:back'), href: `/recipes/${baseId}` },
        subline: <RecipeDraftStatus status={autosave.status} />,
      }}
      openTab="details"
      stepsHint={t('recipes:family.tips.variantHint')}
      hint={t('recipes:family.copyHint', {
        source: source?.title ?? prefill.title,
      })}
      belowTitle={baseTitle ? <VariantOfRow title={baseTitle} /> : null}
      notices={session.notices}
      detailsEnd={session.discardButton}
      initial={initial.draft}
      saving={session.saving}
      error={session.create.error}
      guidance={{ initial: initial.guidance, momentOptions }}
      onChange={setFormState}
      onSave={(document, guidance) =>
        session.save({ parentId: prefill.parentId, document, guidance })
      }
    />
  );
}
