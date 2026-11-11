import {
  Alert,
  Box,
  SAFE_TOP,
  segmentedTabId,
  segmentedTabPanelId,
  SegmentedTabs,
  Snackbar,
  Spinner,
  Stack,
  tokens,
  usePrefersReducedMotion,
} from '@pocket-pantry/ui';
import { useEffect, useId, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { AppScreenHeader } from '../../components/AppScreenHeader';
import { useAddToFamily } from '../../lib/addToFamily';
import { exploreAdds } from '../../lib/exploreAdds';
import { isPlainClick } from '../../lib/isPlainClick';
import { familyRecipeHref, recipeHref } from '../../lib/recipeHref';
import { SourceLink } from '../../components/SourceLink';
import { translateApiError } from '../../i18n/translateApiError';
import { ApiError } from '../../lib/api';
import {
  useAddLineToShoppingList,
  useAddMissingToShoppingList,
  useRecipe,
  useRecipePantryMatch,
} from '../../lib/recipes';
import type { RecipeDetailLine } from '../../lib/recipes';
import { AllergyWarningBanner } from './components/AllergyWarningBanner';
import { RecipeHero } from './components/RecipeHero';
import { RecipeHeader } from './components/RecipeHeader';
import {
  PREVIEW_BAR_CLEARANCE,
  PREVIEW_BAR_HEIGHT,
  PreviewBar,
} from '../../components/PreviewBar';
import { PreviewNote } from './components/PreviewNote';
import { linesToAdd } from './components/PantryStatus';
import { DETAIL_SECTIONS, type DetailTab } from './components/sections';

/** One Recipe. Keyed by id so Servings and add results never leak across a Variant <-> base link. */
export function RecipeDetailPage({ preview = false }: { preview?: boolean }) {
  const { id = '' } = useParams();
  return <RecipeDetail key={id} id={id} preview={preview} />;
}

/** `/recipes/explore/:id`: a Catalog Recipe's read-only preview, in the detail page's preview mode. */
export function RecipePreviewPage() {
  return <RecipeDetailPage preview />;
}

/** Header, then the sections; a Variant links back to its base. */
function RecipeDetail({ id, preview }: { id: string; preview: boolean }) {
  const { t } = useTranslation(['recipes', 'common']);
  const query = useRecipe(id);
  const recipe = query.data;
  const [picked, setPicked] = useState<number | null>(null);
  const servings = picked ?? recipe?.servings ?? 1;
  const matchQuery = useRecipePantryMatch(id, servings, recipe !== undefined);
  const match = matchQuery.data;
  const addMissing = useAddMissingToShoppingList(id);
  const addLine = useAddLineToShoppingList(id);
  const [toast, setToast] = useState<string | null>(null);
  // The bulk add was done for the Servings picked; picking others re-opens it.
  const [addedList, setAddedList] = useState(false);
  const onAddMissing = () => {
    const count = linesToAdd(match).length;
    addMissing.mutate(servings, {
      onSuccess: () => {
        setToast(t('recipes:pantry.added', { count }));
        setAddedList(true);
      },
    });
  };
  // Lines added by hand at the Servings picked; picking others starts over, like the bulk add.
  const [handAddedLineIds, setHandAddedLineIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const onAddLine = (
    line: RecipeDetailLine,
    done: { onAdded: () => void; onFailed: () => void },
  ) =>
    addLine.mutate(
      { lineId: line.id, servings },
      {
        onSuccess: () => {
          setToast(
            t('recipes:pantry.addedLine', { name: line.ingredientName }),
          );
          setHandAddedLineIds((ids) => new Set(ids).add(line.id));
          done.onAdded();
        },
        onError: done.onFailed,
      },
    );

  const tabsId = useId();
  const [tab, setTab] = useState<DetailTab>('ingredients');
  const reduceMotion = usePrefersReducedMotion();
  const openTab = (next: DetailTab) => {
    if (next === tab) return;
    setTab(next);
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };
  const fromExplore =
    (useLocation().state as { fromExplore?: boolean } | null)?.fromExplore ===
    true;
  // The toasts of an add sit above the bar that replaces the Dock.
  const addToFamily = useAddToFamily(
    preview
      ? {
          toastBottom: PREVIEW_BAR_CLEARANCE,
          // Only a preview opened from Explore counts toward its Back badge.
          ...(fromExplore ? { onNet: exploreAdds.bump } : {}),
        }
      : {},
  );
  // Parked while a preview opened from Explore shows, so Explore knows it is being returned to.
  // Unparked on leaving, so a later fresh visit starts at 0.
  useEffect(() => {
    if (!(preview && fromExplore)) return;
    exploreAdds.park();
    return () => exploreAdds.unpark();
  }, [preview, fromExplore]);
  const navigate = useNavigate();
  // React Router's history index: a replace (a redirect at load) does not raise it.
  const hasHistory =
    ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
  const leavePreview = (event: MouseEvent<HTMLElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    if (hasHistory) navigate(-1);
    else navigate('/recipes/explore', { state: { noSlide: true } });
  };
  const addState = recipe
    ? addToFamily.stateOf({
        id: recipe.id,
        title: recipe.title,
        familyCopyId: recipe.familyCopyId,
      })
    : undefined;
  const toBuy = match?.shortOrMissingCount ?? 0;

  // The Family's own Recipes have no preview; they open as themselves.
  if (preview && recipe && recipe.owner === 'family') {
    return <Navigate replace to={familyRecipeHref(recipe.id)} />;
  }
  // A Catalog Recipe opens as the Family's copy, else as its preview.
  if (!preview && recipe && recipe.owner === 'catalog') {
    return <Navigate replace to={recipeHref(recipe)} />;
  }
  return (
    <>
      {preview ? (
        <AppScreenHeader
          back={{
            label: t('recipes:back'),
            href: '/recipes/explore',
            onClick: leavePreview,
          }}
          {...(recipe ? {} : { title: t('recipes:explore.title') })}
        />
      ) : (
        <RecipeHeader recipe={recipe} />
      )}
      <Stack spacing={2.5}>
        {query.error ? (
          <Alert>
            {query.error instanceof ApiError && query.error.status === 404
              ? t('recipes:notFound')
              : translateApiError(t, query.error)}
          </Alert>
        ) : null}
        {query.isPending ? <Spinner label={t('common:loading')} /> : null}
        {recipe ? (
          <>
            <RecipeHero
              recipe={recipe}
              servings={servings}
              {...(preview
                ? { preview: { inFamily: addState?.status !== 'none' } }
                : {})}
            />
            {recipe.sourceLink ? (
              <Box>
                <SourceLink
                  href={recipe.sourceLink}
                  translatedFrom={recipe.sourceLanguage}
                />
              </Box>
            ) : null}
            {recipe.allergyWarning ? (
              <AllergyWarningBanner warning={recipe.allergyWarning} />
            ) : null}
            <Box
              sx={{
                position: 'sticky',
                top: SAFE_TOP,
                zIndex: 2,
                py: '8px',
                bgcolor: tokens.color.bg,
                // Paints the page background out to the screen edges.
                boxShadow: `0 0 0 100vmax ${tokens.color.bg}`,
                clipPath: 'inset(0 -100vmax)',
              }}
            >
              <SegmentedTabs
                label={recipe.title}
                id={tabsId}
                value={tab}
                onChange={openTab}
                tabs={[
                  {
                    value: 'ingredients',
                    label: t('recipes:tabs.ingredients'),
                    badge: toBuy > 0 ? String(toBuy) : undefined,
                    badgeLabel: t('recipes:pantry.toBuy', { count: toBuy }),
                  },
                  { value: 'steps', label: t('recipes:tabs.steps') },
                  { value: 'about', label: t('recipes:tabs.about') },
                ]}
              />
            </Box>
            <Stack
              role="tabpanel"
              id={segmentedTabPanelId(tabsId, tab)}
              aria-labelledby={segmentedTabId(tabsId, tab)}
              spacing={2.5}
            >
              {DETAIL_SECTIONS.filter((section) => section.tab === tab).map(
                ({ key, Component }) => (
                  <Component
                    key={key}
                    recipe={recipe}
                    servings={servings}
                    preview={
                      preview
                        ? {
                            stateOf: (variant) =>
                              addToFamily.stateOf({
                                id: variant.id,
                                title: variant.title,
                                familyCopyId: variant.familyCopyId,
                              }),
                            onAdd: (variant) => void addToFamily.add(variant),
                            fromExplore,
                          }
                        : undefined
                    }
                    onServingsChange={(next) => {
                      setPicked(next);
                      setAddedList(false);
                      setHandAddedLineIds(new Set());
                    }}
                    match={match}
                    stale={matchQuery.isPlaceholderData}
                    adding={addMissing.isPending || addLine.isPending}
                    added={addedList}
                    addError={
                      addMissing.error
                        ? translateApiError(t, addMissing.error)
                        : null
                    }
                    onAddMissing={onAddMissing}
                    addLine={{
                      onAdd: onAddLine,
                      handAddedIds: handAddedLineIds,
                      error: addLine.error
                        ? translateApiError(t, addLine.error)
                        : null,
                    }}
                  />
                ),
              )}
              {preview ? <PreviewNote /> : null}
            </Stack>
          </>
        ) : null}
      </Stack>
      {preview && recipe && addState ? (
        <>
          {/* Room under the content for the fixed bar. */}
          <Box aria-hidden sx={{ height: PREVIEW_BAR_HEIGHT }} />
          <PreviewBar
            recipeId={recipe.id}
            title={recipe.title}
            canMakeVariant={!recipe.archived && !recipe.base?.archived}
            state={addState}
            onAdd={() => void addToFamily.add(recipe)}
          />
        </>
      ) : null}
      <Snackbar
        open={toast !== null}
        onClose={() => setToast(null)}
        bottom={preview ? PREVIEW_BAR_CLEARANCE : 'aboveDock'}
      >
        <Alert severity="success" role="status">
          {toast}
        </Alert>
      </Snackbar>
    </>
  );
}
