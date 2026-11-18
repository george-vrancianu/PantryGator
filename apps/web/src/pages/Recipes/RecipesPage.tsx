import {
  Alert,
  Box,
  canopy,
  CompassIcon,
  HeaderButton,
  PlusIcon,
  Spinner,
  Stack,
  tokens,
  displayType,
} from '@pocket-pantry/ui';
import { useId, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/layout/Screen/Screen';
import { HiddenByAllergiesNote } from '@/components/allergy/HiddenByAllergiesNote/HiddenByAllergiesNote';
import { translateApiError } from '../../i18n/translateApiError';
import { cardFor, indexCards, useCookTonight } from '../../lib/cookTonight';
import { useAddToFamily } from '../../lib/addToFamily';
import { localIso } from '../../lib/pantry';
import {
  hasNoFamilyRecipes,
  isFiltering,
  useRecipes,
  type RecipeBrowse,
  type RecipeListItem,
} from '../../lib/recipes';
import { useRecipeDrafts } from '../../lib/recipeDrafts';
import {
  FROM_LINK_PARAM,
  FROM_TEXT_PARAM,
  FROM_TEXT_PREFILL_STATE,
} from '../../lib/recipeRoutes';
import { useRecipeDraftDiscard } from './useRecipeDraftDiscard';
import { EmptyFamilyRecipes } from './components/EmptyFamilyRecipes';
import {
  CookTonightHeader,
  CookTonightHeaderPlaceholder,
} from './components/CookTonightHeader';
import { FromLinkSheet } from './components/FromLinkSheet';
import {
  FromTextSheet,
  type FromTextPrefill,
} from './components/FromTextSheet';
import { bleedSx } from './components/bleed';
import { RecipeFilters } from './components/RecipeFilters';
import { RecipeRow } from './components/RecipeRow';
import { TagNoMatch } from './components/TagNoMatch';
import { SectionLabel } from './components/SectionLabel';

/**
 * The list without the Variants that sit under a Base in it. The Base's count becomes the
 * Variants grouped under it. A Variant belongs to its `parentId` or, when that is a Catalog
 * Recipe, to the Family's copy of it (`copiedFromId`).
 */
function groupVariants(found: RecipeListItem[]): RecipeListItem[] {
  const baseFor = new Map<string, string>();
  for (const item of found) {
    if (item.parentId !== null) continue;
    if (item.copiedFromId) baseFor.set(item.copiedFromId, item.id);
  }
  const counts = new Map<string, number>();
  const rows = found.filter((item) => {
    const base =
      item.parentId === null ? undefined : baseFor.get(item.parentId);
    if (base === undefined) return true;
    counts.set(base, (counts.get(base) ?? 0) + 1);
    return false;
  });
  return rows.map((item) =>
    item.parentId === null
      ? {
          ...item,
          variantCount: counts.get(item.id) ?? 0,
        }
      : item,
  );
}

/** The Family's Recipes (Catalog Recipes are reached through Explore): Bases by default, Variants too once a search or filter is active. */
export function RecipesPage() {
  const { t } = useTranslation(['recipes', 'common']);
  const [browse, setBrowse] = useState<RecipeBrowse>({
    search: '',
    tagIds: [],
  });
  // "Show" in the hidden-by-Allergies note asks the list and the Cook Tonight card for everything.
  const [showHidden, setShowHidden] = useState(false);
  const recipes = useRecipes(browse, { showHidden, scope: 'family' });
  const cookTonight = useCookTonight(
    // oxlint-disable-next-line react/purity -- "today" must follow the clock across midnight; freezing it would leave a Member on a stale day
    localIso(new Date()),
    showHidden,
    'family',
  );
  // Recipe Drafts are not Recipes: just an entry to the list, hidden when there are none (ADR 0028).
  const drafts = useRecipeDrafts();
  const discarding = useRecipeDraftDiscard({ takeFromForm: true });
  const draftCount =
    drafts.data?.filter((draft) => !discarding.hiddenIds.has(draft.id))
      .length ?? 0;
  const [params, setParams] = useSearchParams();
  const fromLinkOpen = params.get(FROM_LINK_PARAM) === '1';
  const fromTextOpen = params.get(FROM_TEXT_PARAM) === '1';
  // "Paste text instead" on a failed link read arrives here with the site to name and the read to replace.
  const prefill = (
    useLocation().state as {
      [FROM_TEXT_PREFILL_STATE]?: FromTextPrefill;
    } | null
  )?.[FROM_TEXT_PREFILL_STATE];
  const closeFromLink = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(FROM_LINK_PARAM);
        return next;
      },
      { replace: true },
    );
  const closeFromText = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(FROM_TEXT_PARAM);
        return next;
      },
      { replace: true },
    );
  const headingId = useId();
  const filtering = isFiltering(browse);
  const found = recipes.data?.recipes ?? [];
  // Not searching: a Variant sits under its Base (a Family Recipe, or the Family's copy of its
  // Catalog Base); one without a Base in the list is its own row, labelled "Variant of {base}".
  const items = filtering ? found : groupVariants(found);
  // No live Recipes (archived ones aren't listed): chef Gator replaces the search, chips and list.
  const noneListed = recipes.data !== undefined && items.length === 0;
  // Recipes hidden by Allergies are still Recipes: that Family isn't empty.
  const empty = !filtering && hasNoFamilyRecipes(recipes.data);
  const addToFamily = useAddToFamily();
  const addButton = useRef<HTMLButtonElement>(null);
  const cards = cookTonight.data?.cards ?? [];
  const index = indexCards(cards);
  // Hidden until both answers arrive, so an error or a slow load never reads as "nothing to cook";
  // while they load the header keeps its size.
  const cookTonightHeader =
    filtering || empty ? null : recipes.data &&
      !recipes.error &&
      cookTonight.data &&
      !cookTonight.error ? (
      <CookTonightHeader cards={cards} />
    ) : recipes.error || cookTonight.error ? null : (
      <CookTonightHeaderPlaceholder />
    );

  return (
    <>
      <Screen
        title={t('recipes:title')}
        header={cookTonightHeader}
        secondary={
          <HeaderButton
            href="/recipes/explore"
            icon={<CompassIcon size={18} />}
          >
            {t('recipes:explore.pill')}
          </HeaderButton>
        }
        primary={{
          label: t('recipes:add'),
          icon: <PlusIcon size={20} />,
          buttonRef: addButton,
          items: [
            { label: t('recipes:family.newRecipe'), href: '/recipes/new' },
            {
              label: t('recipes:fromLink.menuItem'),
              href: `/recipes?${FROM_LINK_PARAM}=1`,
            },
            {
              label: t('recipes:fromText.menuItem'),
              href: `/recipes?${FROM_TEXT_PARAM}=1`,
            },
            {
              label: t('recipes:explore.menuItem'),
              icon: <CompassIcon size={18} />,
              dividerBefore: true,
              badge: t('recipes:explore.menuNew'),
              href: '/recipes/explore',
            },
          ],
        }}
      />
      {/* Flex gap leaves the children's margins alone, so the filters can bleed to the screen edges. */}
      <Stack spacing={1.5} useFlexGap>
        {draftCount > 0 ? (
          <Box
            component={Link}
            to="/recipes/drafts"
            sx={{
              fontSize: 15,
              fontWeight: 700,
              color: tokens.color.accent,
              textDecoration: 'none',
            }}
          >
            {t('recipes:drafts.entry', { count: draftCount })}
          </Box>
        ) : null}
        {empty ? null : (
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              bgcolor: canopy.sheetTop,
              ml: bleedSx.ml,
              mr: bleedSx.mr,
              pl: bleedSx.pl,
              pr: bleedSx.pr,
              py: '8px',
            }}
          >
            <RecipeFilters
              value={browse}
              onChange={setBrowse}
              tags={{
                scope: 'family',
                showHidden,
                resultCount: recipes.data ? items.length : undefined,
              }}
            />
          </Box>
        )}
        <HiddenByAllergiesNote
          count={
            filtering
              ? (recipes.data?.hiddenByAllergiesCount ?? 0)
              : Math.max(
                  recipes.data?.hiddenByAllergiesCount ?? 0,
                  cookTonight.data?.hiddenByAllergiesCount ?? 0,
                )
          }
          onShow={() => setShowHidden(true)}
        />
        {recipes.error ? (
          <Alert>{translateApiError(t, recipes.error)}</Alert>
        ) : null}
        {recipes.isPending ? <Spinner label={t('common:loading')} /> : null}
        {empty ? (
          <EmptyFamilyRecipes
            onNewRecipe={() => addButton.current?.click()}
            {...addToFamily}
          />
        ) : null}
        {noneListed && !empty && browse.tagIds.length > 0 ? (
          <TagNoMatch
            browse={browse}
            onChange={setBrowse}
            scope="family"
            showHidden={showHidden}
          />
        ) : null}
        {noneListed && !empty && browse.tagIds.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: '32px' }}>
            <Box sx={{ ...displayType, fontSize: 18 }}>
              {filtering ? t('recipes:noMatches') : t('recipes:allHidden')}
            </Box>
            <Box sx={{ fontSize: 14, color: tokens.color.muted, mt: '4px' }}>
              {filtering
                ? t('recipes:noMatchesHint')
                : t('recipes:allHiddenHint')}
            </Box>
          </Box>
        ) : null}
        {items.length > 0 ? (
          <section>
            <SectionLabel id={headingId} count={items.length}>
              {filtering ? t('recipes:matches') : t('recipes:allRecipes')}
            </SectionLabel>
            <Box
              component="ul"
              aria-labelledby={headingId}
              sx={{ listStyle: 'none', m: 0, p: 0 }}
            >
              {items.map((recipe) => (
                <RecipeRow
                  key={recipe.id}
                  recipe={recipe}
                  card={cardFor(index, recipe)}
                  filtering={filtering || recipe.parentId !== null}
                  matchedTagIds={browse.tagIds}
                />
              ))}
            </Box>
            {!filtering ? (
              <Box sx={{ fontSize: 13, color: tokens.color.muted, mt: '12px' }}>
                {t('recipes:variantsHint')}
              </Box>
            ) : null}
          </section>
        ) : null}
      </Stack>
      <FromLinkSheet
        open={fromLinkOpen}
        onClose={closeFromLink}
        onExited={() => addButton.current?.focus()}
      />
      <FromTextSheet
        open={fromTextOpen}
        prefill={fromTextOpen ? prefill : undefined}
        onClose={closeFromText}
        onExited={() => addButton.current?.focus()}
      />
    </>
  );
}
