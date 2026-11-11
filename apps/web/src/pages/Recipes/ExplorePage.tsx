import {
  Alert,
  Box,
  displayType,
  plusBottomInset,
  radius,
  Spinner,
  Stack,
  tokens,
  usePrefersReducedMotion,
} from '@pocket-pantry/ui';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppScreenHeader } from '../../components/AppScreenHeader';
import { ExploreRow } from '../../components/ExploreRow';
import { QuickViewSheet } from '../../components/QuickViewSheet';
import { HiddenByAllergiesNote } from '../../components/HiddenByAllergiesNote';
import { translateApiError } from '../../i18n/translateApiError';
import { isPlainClick } from '../../lib/isPlainClick';
import { localIso } from '../../lib/pantry';
import { useAddToFamily } from '../../lib/addToFamily';
import { exploreAdds, useExploreAdds } from '../../lib/exploreAdds';
import {
  canMakeBases,
  cardFor,
  indexCards,
  useCookTonight,
} from '../../lib/cookTonight';
import {
  isFiltering,
  useRecipes,
  type RecipeBrowse,
  type RecipeListItem,
} from '../../lib/recipes';
import { RecipeFilters } from './components/RecipeFilters';
import { SectionLabel } from './components/SectionLabel';
import { TagNoMatch } from './components/TagNoMatch';

/** Rows a group shows before "Show n more". */
const LIMIT = 4;
/** Lifts a toast above the quick view's action buttons. */
const QUICK_VIEW_TOAST_BOTTOM =
  // Sheet bottom padding 28 + explanation line(s) ~36 + gap 10 + Make a Variant 48 + gap 8 + Add 48 + 8 slack
  plusBottomInset(186);

const SLIDE = '320ms cubic-bezier(.2,.8,.2,1)';

/** Slides in from the right and, on Back, out to it; no motion under reduced motion. */
const slideSx = (leaving: boolean, enter: boolean) =>
  ({
    '@keyframes pp-explore-slide-in': {
      from: { transform: 'translateX(100%)' },
      to: { transform: 'translateX(0)' },
    },
    '@keyframes pp-explore-slide-out': {
      from: { transform: 'translateX(0)' },
      to: { transform: 'translateX(100%)' },
    },
    '@media (prefers-reduced-motion: no-preference)': {
      animation: leaving
        ? `pp-explore-slide-out ${SLIDE} forwards`
        : enter
          ? `pp-explore-slide-in ${SLIDE}`
          : 'none',
    },
  }) as const;

/**
 * Explore (`/recipes/explore`): the Catalog Base Recipes, each one tap from being added to the
 * Family. "You can make this" (Catalog Cook Tonight) comes first, then "All Recipes"; searching or
 * filtering folds them into one "Matches" list that lists Catalog Variants too.
 */
export function ExplorePage() {
  const { t } = useTranslation(['recipes', 'common']);
  const [browse, setBrowse] = useState<RecipeBrowse>({
    search: '',
    tagIds: [],
  });
  const [showHidden, setShowHidden] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const reduceMotion = usePrefersReducedMotion();
  const navigate = useNavigate();
  // A native listener: React skips `animationend` where the browser (or jsdom) has no CSS animations.
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const page = pageRef.current;
    if (!leaving || !page) return;
    const done = (event: Event) => {
      if (event.target === page) navigate('/recipes');
    };
    page.addEventListener('animationend', done);
    // If the animation never ends (interrupted, or no CSS animations), leave anyway.
    const fallback = window.setTimeout(() => navigate('/recipes'), 400);
    return () => {
      page.removeEventListener('animationend', done);
      window.clearTimeout(fallback);
    };
  }, [leaving, navigate]);
  // Net adds this visit: the Back badge. It outlives the page so that a round trip through a
  // preview keeps it; a fresh visit (not Back from a preview) starts again at 0.
  const added = useExploreAdds();
  // Returning means coming back from a preview this page opened (not merely a POP: a reload or a
  // Back from elsewhere is a fresh visit and slides in). The reset is synchronous so no stale
  // count paints; it is idempotent, so a double render is harmless.
  const noSlide =
    (useLocation().state as { noSlide?: boolean } | null)?.noSlide === true;
  const [enter] = useState(() => {
    if (exploreAdds.parked()) return false;
    exploreAdds.reset();
    return !noSlide;
  });
  const [quick, setQuick] = useState<RecipeListItem | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const recipes = useRecipes(browse, { showHidden, scope: 'catalog' });
  const cookTonight = useCookTonight(
    // oxlint-disable-next-line react/purity -- "today" must follow the clock across midnight
    localIso(new Date()),
    showHidden,
    'catalog',
  );
  // "You can make this" never shows Recipes "Hide Recipes with my Allergies" leaves out, even
  // after "Show": it is built from the unrevealed queries (the same cache entries until then).
  const safeRecipes = useRecipes(browse, { scope: 'catalog' });
  const safeCookTonight = useCookTonight(
    // oxlint-disable-next-line react/purity -- "today" must follow the clock across midnight
    localIso(new Date()),
    false,
    'catalog',
  );
  const { add, stateOf } = useAddToFamily({
    onNet: exploreAdds.bump,
    // While the quick view is open its buttons sit at the bottom: lift the toast clear of them.
    ...(quickOpen ? { toastBottom: QUICK_VIEW_TOAST_BOTTOM } : {}),
  });
  const filtering = isFiltering(browse);
  const items = recipes.data?.recipes ?? [];
  const quickRecipe = quick
    ? (items.find((item) => item.id === quick.id) ?? quick)
    : null;
  const cards = cookTonight.data?.cards ?? [];
  const index = indexCards(cards);
  const safeIndex = indexCards(safeCookTonight.data?.cards ?? []);

  // The Bases the Pantry can make, most expiring first. A card's best match can be a Catalog
  // Variant; the group lists its Base (the Variant is reached through the Base).
  const canMake = filtering
    ? []
    : canMakeBases(
        safeCookTonight.data?.cards ?? [],
        safeRecipes.data?.recipes ?? [],
      );
  const canMakeIds = new Set(canMake.map((item) => item.id));
  const rest = filtering
    ? items
    : items.filter((item) => !canMakeIds.has(item.id));

  const hiddenCount = filtering
    ? (recipes.data?.hiddenByAllergiesCount ?? 0)
    : Math.max(
        recipes.data?.hiddenByAllergiesCount ?? 0,
        cookTonight.data?.hiddenByAllergiesCount ?? 0,
      );

  const group = (
    label: string,
    rows: RecipeListItem[],
    options: { hideCanMake?: boolean; safe?: boolean } = {},
  ) => (
    <Group
      key={`${label}|${browse.search}|${browse.tagIds.join(',')}`}
      label={label}
      rows={rows}
      render={(recipe) => (
        <ExploreRow
          key={recipe.id}
          recipe={recipe}
          state={stateOf(recipe)}
          onAdd={() => void add(recipe)}
          card={cardFor(options.safe ? safeIndex : index, recipe)}
          filtering={filtering}
          matchedTagIds={browse.tagIds}
          hideCanMake={options.hideCanMake ?? false}
          onOpen={() => {
            setQuick(recipe);
            setQuickOpen(true);
          }}
        />
      )}
    />
  );

  return (
    <Box
      sx={slideSx(leaving, enter)}
      ref={pageRef}
      data-testid="explore-page"
      data-motion={leaving ? 'out' : enter ? 'in' : 'none'}
    >
      <AppScreenHeader
        title={t('recipes:explore.title')}
        back={{
          label:
            added > 0
              ? t('recipes:explore.backAdded', { count: added })
              : t('recipes:explore.back'),
          href: '/recipes',
          badge: added,
          onClick: (event) => {
            const plain = isPlainClick(event);
            if (plain) exploreAdds.reset();
            if (!plain || reduceMotion) return;
            event.preventDefault();
            setLeaving(true);
          },
        }}
      />
      <Stack spacing={1.5} useFlexGap>
        <Box
          sx={{ fontSize: 13.5, color: tokens.color.muted, lineHeight: 1.4 }}
        >
          {t('recipes:explore.subline')}
        </Box>
        <RecipeFilters
          value={browse}
          onChange={setBrowse}
          searchLabel={t('recipes:explore.search')}
          tags={{
            scope: 'catalog',
            showHidden,
            resultCount: recipes.data ? items.length : undefined,
          }}
        />
        <HiddenByAllergiesNote
          count={hiddenCount}
          onShow={() => setShowHidden(true)}
        />
        {recipes.error ? (
          <Alert>{translateApiError(t, recipes.error)}</Alert>
        ) : null}
        {recipes.isPending ? <Spinner label={t('common:loading')} /> : null}
        {recipes.data && items.length === 0 && browse.tagIds.length > 0 ? (
          <TagNoMatch
            browse={browse}
            onChange={setBrowse}
            scope="catalog"
            showHidden={showHidden}
          />
        ) : null}
        {recipes.data && items.length === 0 && browse.tagIds.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: '32px' }}>
            <Box sx={{ ...displayType, fontSize: 18 }}>
              {t('recipes:noMatches')}
            </Box>
            <Box sx={{ fontSize: 14, color: tokens.color.muted, mt: '4px' }}>
              {t('recipes:explore.noMatchesHint')}
            </Box>
          </Box>
        ) : null}
        {canMake.length > 0
          ? group(t('recipes:explore.canMake'), canMake, {
              hideCanMake: true,
              safe: true,
            })
          : null}
        {rest.length > 0
          ? group(
              filtering ? t('recipes:matches') : t('recipes:allRecipes'),
              rest,
            )
          : null}
      </Stack>
      {quickRecipe ? (
        <QuickViewSheet
          recipe={quickRecipe}
          open={quickOpen}
          onClose={() => setQuickOpen(false)}
          card={cardFor(index, quickRecipe)}
          state={stateOf(quickRecipe)}
          onAdd={(recipe) => void add(recipe)}
          stateOf={stateOf}
        />
      ) : null}
    </Box>
  );
}

/** A labelled list showing `LIMIT` rows, then a dashed "Show n more" row. */
function Group({
  label,
  rows,
  render,
}: {
  label: string;
  rows: RecipeListItem[];
  render: (recipe: RecipeListItem) => ReactNode;
}) {
  const { t } = useTranslation('recipes');
  const headingId = useId();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, LIMIT);
  const hidden = rows.length - shown.length;
  return (
    <section>
      <SectionLabel id={headingId} count={rows.length}>
        {label}
      </SectionLabel>
      <Box
        component="ul"
        aria-labelledby={headingId}
        sx={{ listStyle: 'none', m: 0, p: 0 }}
      >
        {shown.map(render)}
      </Box>
      {hidden > 0 ? (
        <Box
          component="button"
          type="button"
          onClick={() => setExpanded(true)}
          sx={{
            display: 'block',
            width: '100%',
            mt: '8px',
            py: '12px',
            border: `1.5px dashed ${tokens.color.line}`,
            borderRadius: radius.control,
            bgcolor: 'transparent',
            color: tokens.color.accent,
            font: 'inherit',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {t('explore.showMore', { count: hidden })}
        </Box>
      ) : null}
    </section>
  );
}
