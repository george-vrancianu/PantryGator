import { Alert, Spinner } from '@pocket-pantry/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
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
import {
  plateMatchInput,
  useResumedPlateBases,
} from './hooks/useResumedPlateBases';
import { useRecipeDraftAutosave } from '@/lib/recipeDraftAutosave';
import {
  STANDALONE,
  noBasePick,
} from './components/BaseRecipePicker/BaseRecipePicker';
import type { BaseRecipeOption } from '@/lib/baseRecipeOption';
import { Screen } from '@/components/layout/Screen/Screen';
import {
  RemovableSourceLink,
  isSourceLink,
} from './components/SourceLink/SourceLink';
import { translateApiError } from '@/i18n/translateApiError';
import { emptyDraft } from '@/lib/recipeDraft';
import { toGuidanceDraft } from '@/lib/guidanceDraft';
import { usePlateMatches } from '@/lib/plateRecipe';
import { useMomentOptions } from './components/FamilyGuidance/FamilyGuidance';
import { draftOfVariantDraft, type NewRecipeDraft } from './hooks/familyDraft';
import { BaseRecipeCard } from './components/BaseRecipeCard/BaseRecipeCard';
import { FamilyRecipeForm } from './components/FamilyRecipeForm/FamilyRecipeForm';
import { namedGuidance, routePropsOf } from './hooks/familyRecipeShared';

/**
 * What can be handed to the New Recipe page (react-router `location.state`) to open it filled:
 * a draft, and the closest Base Recipes to offer as its base. Without `closestBases` the page
 * saves a Base Recipe and shows no picker.
 */
export type NewRecipeState = {
  draft: NewRecipeDraft;
  closestBases?: BaseRecipeOption[];
  /** How many of the closest "Hide Recipes with my Allergies" left out; with it, the picker offers Show. */
  hiddenByAllergiesCount?: number;
  /** The page the draft was read from; kept on the Recipe unless the Member removes it. */
  sourceLink?: string | null;
  /** The language the page was translated from (a code like "fr"); only kept with the Source Link. */
  sourceLanguage?: string | null;
};

const blankGuidance = { nutritionNote: null, pairings: [], eatingMoments: [] };

/** "New Recipe": the Family Recipe form, blank or filled from a supplied draft or a resumed Recipe Draft; saved as a Base Recipe, or a Variant of the picked base. */
export function NewRecipePage() {
  const location = useLocation();
  const { t } = useTranslation(['common', 'errors', 'recipes']);
  const route = useRecipeDraftRoute();
  const draftRoute = routePropsOf(route);
  if (route.error || route.loading) {
    return (
      <>
        <Screen
          title={t('recipes:family.newRecipeHeading')}
          back={{ label: t('recipes:back'), href: '/recipes' }}
        />
        {route.error ? (
          <Alert>{translateApiError(t, route.error)}</Alert>
        ) : (
          <Spinner label={t('common:loading')} />
        )}
      </>
    );
  }
  // A resumed Recipe Draft holds everything; the state a reload kept would only repeat it.
  const supplied = route.resumed ? null : suppliedOf(location.state);
  const resuming = new URLSearchParams(location.search).has(DRAFT_PARAM);
  return (
    <RecipeDraftContinue
      key={route.formKey}
      active={supplied === null && !resuming}
      kind="new_recipe"
      baseRecipeId={null}
      title={t('recipes:family.newRecipeHeading')}
    >
      <NewRecipeContent supplied={supplied} draftRoute={draftRoute} />
    </RecipeDraftContinue>
  );
}

/** The route state if it is a supplied draft; anything else is ignored. */
function suppliedOf(state: unknown): NewRecipeState | null {
  if (typeof state !== 'object' || state === null) return null;
  const {
    draft,
    closestBases,
    hiddenByAllergiesCount,
    sourceLink,
    sourceLanguage,
  } = state as Partial<NewRecipeState>;
  if (typeof draft !== 'object' || draft === null) return null;
  if (!Array.isArray(draft.lines) || !Array.isArray(draft.steps)) return null;
  if (!Array.isArray(draft.tips)) return null;
  if (typeof draft.guidance !== 'object' || draft.guidance === null)
    return null;
  if (closestBases !== undefined && !Array.isArray(closestBases)) return null;
  if (
    hiddenByAllergiesCount !== undefined &&
    typeof hiddenByAllergiesCount !== 'number'
  )
    return null;
  // A Source Link that is not a web address would show a Remove button with nothing to remove.
  if (
    sourceLink !== undefined &&
    sourceLink !== null &&
    !(typeof sourceLink === 'string' && isSourceLink(sourceLink))
  )
    return null;
  if (
    sourceLanguage !== undefined &&
    sourceLanguage !== null &&
    typeof sourceLanguage !== 'string'
  )
    return null;
  return state as NewRecipeState;
}

function NewRecipeContent({
  supplied,
  draftRoute,
}: {
  supplied: NewRecipeState | null;
  draftRoute: RecipeDraftRouteProps;
}) {
  const { resumed } = draftRoute;
  const { t } = useTranslation(['recipes', 'common', 'errors']);
  const [basePick, setBasePick] = useState(noBasePick);
  // True from the tap on Save until the create answers, so a second tap cannot make a second Recipe.
  const [finishing, setFinishing] = useState(false);
  const momentOptions = useMomentOptions();
  // The Member may drop the Source Link before saving, but not change it.
  const [resumedForm] = useState(() =>
    resumed ? formOfContent(resumed.content) : null,
  );
  // The picked base: a resumed one, else the top match the picker starts on.
  const [parentId, setParentId] = useState<string | null>(
    resumedForm?.pickedBaseId ?? supplied?.closestBases?.[0]?.id ?? null,
  );
  const plateScan = resumedForm?.plateScan;
  // Plate matches and the base picked before leaving are not stored: asked for again.
  // Once Save is tapped they stop, so the save's refetches do not wait on them.
  const resumedBases = useResumedPlateBases(resumedForm, !finishing);
  const sourceLanguage = resumedForm
    ? resumedForm.sourceLanguage
    : supplied?.sourceLanguage;
  const offeredLink = resumedForm
    ? resumedForm.sourceLink
    : (supplied?.sourceLink ?? null);
  // Removing the link is undoable until the Member saves: it is only left out of the Recipe Draft and the save.
  const [linkRemoved, setLinkRemoved] = useState(false);
  const sourceLink = linkRemoved ? null : offeredLink;
  const headingRef = useRef<HTMLHeadingElement>(null);
  // "Show" in the hidden-by-Allergies note asks the ranking again, hidden ones too, for the draft as it arrived.
  const [showHidden, setShowHidden] = useState(false);
  const revealed = usePlateMatches(
    {
      ...(resumedForm
        ? plateMatchInput(resumedForm.draft.title, resumedForm.draft.lines)
        : plateMatchInput(
            supplied?.draft.title ?? '',
            supplied?.draft.lines ?? [],
          )),
      showHidden: true,
    },
    showHidden && !finishing,
  );
  const offeredBases = supplied?.closestBases ?? resumedBases.closest;
  const offeredHidden =
    supplied?.hiddenByAllergiesCount ?? resumedBases.hiddenByAllergiesCount;
  const closestBases = revealed.data?.matches ?? offeredBases;
  const hiddenCount = revealed.data
    ? revealed.data.hiddenByAllergiesCount
    : offeredHidden;
  // Nothing close and nothing hidden (or not matched yet): no picker, a Base Recipe.
  // A resumed pick counts too: matches may be slow, empty or failed, and the pick must still be saved (ADR 0028).
  const hasBases =
    offeredBases.length > 0 ||
    offeredHidden > 0 ||
    (Boolean(resumedForm?.pickedBaseId) && !resumedBases.gone);
  // What the Member picked before leaving stays picked (named once looked up).
  const pick = {
    ...basePick,
    // A Plate Scan or link draft stores Standalone as no pick: it must not fall back to the top match.
    chosen:
      basePick.chosen ??
      resumedForm?.pickedBaseId ??
      (resumedForm?.plateScan || resumedForm?.offersBases ? STANDALONE : null),
    another: basePick.another ?? resumedBases.picked,
  };
  const [initial] = useState(() =>
    resumedForm
      ? resumedForm.draft
      : supplied
        ? draftOfVariantDraft(supplied.draft)
        : emptyDraft(),
  );
  const [initialGuidance] = useState(
    () =>
      resumedForm?.guidance ??
      (supplied
        ? namedGuidance(supplied.draft, undefined)
        : toGuidanceDraft(blankGuidance)),
  );
  // What the form holds now, for the Recipe Draft.
  const [formState, setFormState] = useState<RecipeDraftForm>({
    draft: initial,
    guidance: initialGuidance,
  });
  const autosave = useRecipeDraftAutosave({
    kind: 'new_recipe',
    baseRecipeId: null,
    content: contentOfForm({
      ...formState,
      sourceLink,
      sourceLanguage,
      pickedBaseId: hasBases ? parentId : null,
      plateScan,
      offersBases: resumedForm?.offersBases,
    }),
    // A supplied fill is kept at once, so nothing counts as blank.
    blank: supplied
      ? null
      : contentOfForm({
          draft: emptyDraft(),
          guidance: toGuidanceDraft(blankGuidance),
        }),
    resumed: resumed ? { id: resumed.id, version: resumed.version } : undefined,
  });
  const session = useRecipeDraftFormSession({
    autosave,
    route: draftRoute,
    finishing,
    setFinishing,
  });
  // A read that counted against a Cap must not be lost: no waiting for an edit.
  useEffect(() => {
    if (supplied) void autosave.flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <FamilyRecipeForm
      header={{
        title: t('recipes:family.newRecipeHeading'),
        titleRef: headingRef,
        back: { label: t('recipes:back'), href: '/recipes' },
        subline: <RecipeDraftStatus status={autosave.status} />,
      }}
      openTab="details"
      hint={t('recipes:family.newRecipeHint')}
      stepsHint={t('recipes:family.tips.newHint')}
      detailsTop={
        <>
          {offeredLink ? (
            <RemovableSourceLink
              href={offeredLink}
              translatedFrom={sourceLanguage}
              removed={linkRemoved}
              onRemove={() => setLinkRemoved(true)}
              onUndo={() => setLinkRemoved(false)}
            />
          ) : null}
          {resumed?.kind === 'variant' && !resumed.baseAvailable ? (
            <Alert severity="info">{t('recipes:drafts.baseGone')}</Alert>
          ) : null}
        </>
      }
      belowTitle={
        hasBases && resumedBases.ready ? (
          <BaseRecipeCard
            pickedTitle={
              parentId === null
                ? null
                : (closestBases.find((b) => b.id === parentId)?.title ??
                  (pick.another?.id === parentId ? pick.another.title : null) ??
                  resumedBases.picked?.title ??
                  null)
            }
            pick={pick}
            onPick={setBasePick}
            closest={closestBases}
            loading={showHidden && (revealed.isPending || revealed.isFetching)}
            hiddenByAllergiesCount={hiddenCount}
            onShowHidden={() => {
              // A failed Show leaves the answer in error (it never goes stale): ask again.
              if (showHidden) {
                if (revealed.isError) void revealed.refetch();
                return;
              }
              // Keep the current pick: the revealed list may rank it lower or drop it, so it stays offered.
              const current = closestBases.find((b) => b.id === parentId);
              setBasePick({
                ...pick,
                chosen: parentId ?? STANDALONE,
                another: current ?? pick.another,
              });
              setShowHidden(true);
            }}
            onChange={setParentId}
          />
        ) : null
      }
      notices={session.notices}
      detailsEnd={session.discardButton}
      initial={initial}
      saving={session.saving}
      error={session.create.error}
      guidance={{
        initial: initialGuidance,
        momentOptions,
        fromLink: Boolean(offeredLink),
      }}
      onChange={setFormState}
      onSave={(document, guidance) =>
        session.save({
          parentId: hasBases ? parentId : null,
          document,
          guidance,
          extra: {
            ...(sourceLink ? { sourceLink } : {}),
            // The language note belongs to the link: no link, no note.
            ...(sourceLink && sourceLanguage ? { sourceLanguage } : {}),
          },
        })
      }
    />
  );
}
