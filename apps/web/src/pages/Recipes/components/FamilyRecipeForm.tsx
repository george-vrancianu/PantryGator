import {
  Alert,
  Box,
  Button,
  SAFE_TOP,
  segmentedTabId,
  segmentedTabPanelId,
  SegmentedTabs,
  Stack,
  tokens,
  usePrefersReducedMotion,
} from '@pocket-pantry/ui';
import {
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type ReactNode,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogSearch } from '../../../components/catalogSearch/CatalogSearch';
import { BrowseByAisle } from '../../../components/catalogSearch/emptyState/BrowseByAisle';
import type { FamilyRecipeDocument } from '../../../lib/familyRecipes';
import { useFamilyCatalog } from '../../../lib/familyCatalog';
import type { GuidanceInput } from '../../../lib/adminRecipes';
import {
  hasGuidanceProblem,
  toGuidanceInput,
  type GuidanceDraft,
} from '../../../lib/guidanceDraft';
import type { MomentOption } from '../../../components/recipeEditor/GuidanceFields';
import { GuidanceCard } from './GuidanceCard';
import { AppScreenHeader } from '../../../components/AppScreenHeader';
import { translateApiError } from '../../../i18n/translateApiError';
import { RecipeLinesSection } from '../../../components/recipeEditor/RecipeLinesSection';
import { FamilyDetailsBasics } from './FamilyDetailsBasics';
import { RecipeStepsSection } from '../../../components/recipeEditor/RecipeStepsSection';
import { documentOf, type FamilyDraft } from '../familyDraft';
import {
  hasProblems,
  newKey,
  problemsOf,
  type LineDraft,
} from '../../../lib/recipeDraft';

export type EditorTab = 'details' | 'ingredients' | 'steps';

type Props = {
  /** The screen header: Back, the page title, and (in the subline) the Recipe Draft status. */
  header: {
    title: string;
    titleRef?: Ref<HTMLHeadingElement>;
    back: { label: string; href: string };
    subline?: ReactNode;
  };
  /** The tab the editor opens on. */
  openTab: EditorTab;
  /** A line at the top of Details. */
  hint?: string;
  /** Top of Details, above the fields: Base Recipe picker, Source Link, notes. */
  detailsTop?: ReactNode;
  /** Under the title on Details: the Base Recipe card, or the Variant row. */
  belowTitle?: ReactNode;
  /** End of Details, after the "Ingredients ›" link: Discard draft. */
  detailsEnd?: ReactNode;
  /** End of Steps (Edit's Tips). */
  stepsEnd?: ReactNode;
  /** Pinned under the sticky tabs, visible on every tab: write notice, stale-draft banner, status. */
  notices?: ReactNode;
  initial: FamilyDraft;
  /** Reseeds the fields from `initial` when it changes (Edit, after a save), keeping the tab and the panels below. */
  seedKey?: string;
  /** Reseeds only the Guidance card from `guidance.initial`; defaults to `seedKey`. A Recipe-only reseed keeps the Member's Guidance edits. */
  guidanceSeedKey?: string;
  saving: boolean;
  error: unknown;
  /** How many own Tips a saved Step carries, for the warning before removing it. */
  stepTipCount?: (stepId: string) => number;
  /** A line under the Steps about Tips (New and Variant). */
  stepsHint?: string;
  /** Edit only: Tips edited inline under their Steps. */
  stepTips?: ComponentProps<typeof RecipeStepsSection>['stepTips'];
  /** The Recipe's guidance (a Variant draft's copy, or a blank one), edited and saved with the document. */
  guidance?: {
    initial: GuidanceDraft;
    momentOptions: MomentOption[];
    /** The saved Recipe being edited, which a Pairing cannot link to. */
    recipeId?: string;
    /** A Recipe from Link draft: the card says its Guidance is never read from the page. */
    fromLink?: boolean;
  };
  /** Reports the form as it is, on mount and after every change (for the Recipe Draft). */
  onChange?: (state: {
    draft: FamilyDraft;
    guidance: GuidanceDraft | null;
  }) => void;
  onSave: (
    document: FamilyRecipeDocument,
    guidance?: GuidanceInput,
  ) => void | Promise<void>;
};

/**
 * The Family's Recipe document: metadata, Tags,
 * Ingredient Lines (a Catalog Ingredient or a typed name) and Steps.
 * Family Recipes are never translated, so there is one text per field.
 */
export function FamilyRecipeForm({
  header,
  openTab,
  hint,
  detailsTop,
  belowTitle,
  detailsEnd,
  stepsEnd,
  notices,
  initial,
  seedKey,
  guidanceSeedKey = seedKey,
  saving,
  error,
  stepTipCount,
  stepsHint,
  stepTips,
  guidance,
  onChange,
  onSave,
}: Props) {
  const { t } = useTranslation([
    'recipes',
    'admin',
    'common',
    'errors',
    'catalog',
  ]);
  const [draft, setDraft] = useState<FamilyDraft>(initial);
  const [searchKey, setSearchKey] = useState(0);
  const [guidanceDraft, setGuidanceDraft] = useState<GuidanceDraft | null>(
    guidance?.initial ?? null,
  );
  const [seededWith, setSeededWith] = useState(seedKey);
  if (seededWith !== seedKey) {
    setSeededWith(seedKey);
    setDraft(initial);
  }
  const [guidanceSeededWith, setGuidanceSeededWith] = useState(guidanceSeedKey);
  if (guidanceSeededWith !== guidanceSeedKey) {
    setGuidanceSeededWith(guidanceSeedKey);
    if (guidance) setGuidanceDraft(guidance.initial);
  }
  const [titleTouched, setTitleTouched] = useState(false);
  const tabsId = useId();
  const [tab, setTab] = useState<EditorTab>(openTab);
  const reduceMotion = usePrefersReducedMotion();
  const goTo = (next: EditorTab) => {
    if (next === tab) return;
    setTab(next);
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };
  useEffect(() => {
    onChange?.({ draft, guidance: guidanceDraft });
    // The latest `onChange` is enough; only edits report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, guidanceDraft]);
  const problems = problemsOf(draft);
  const guidanceBad = guidanceDraft ? hasGuidanceProblem(guidanceDraft) : false;
  const showTitleError = problems.title && titleTouched;

  const change = (patch: Partial<FamilyDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  // Family Ingredients by id, for the Family pill; ones picked this session count before the refetch.
  const familyCatalog = useFamilyCatalog();
  const familyIds = new Set(
    familyCatalog.data?.ingredients.map((item) => item.id) ?? [],
  );
  const [pickedFamily, setPickedFamily] = useState<Set<string>>(new Set());
  const [addedKey, setAddedKey] = useState<number | null>(null);
  const addLine = (line: Pick<LineDraft, 'ingredientId' | 'name' | 'unit'>) => {
    const key = newKey();
    change({
      lines: [
        ...draft.lines,
        { key, quantity: '', optional: false, note: '', ...line },
      ],
    });
    setAddedKey(key);
  };

  const canSave = !hasProblems(problems) && !guidanceBad;
  const submit = () =>
    onSave(
      documentOf(draft),
      guidanceDraft ? toGuidanceInput(guidanceDraft) : undefined,
    );
  const detailsBad =
    showTitleError ||
    problems.servings ||
    problems.prepMinutes ||
    problems.cookMinutes ||
    guidanceBad;
  const lineCount = draft.lines.length;
  const stepCount = draft.steps.length;

  return (
    <>
      <AppScreenHeader
        title={header.title}
        titleRef={header.titleRef}
        back={header.back}
        subline={header.subline}
        truncateTitle
        trailing={
          <Button
            size="sm"
            shape="pill"
            disabled={saving || !canSave}
            onClick={submit}
          >
            {saving ? t('admin:common.saving') : t('admin:common.save')}
          </Button>
        }
      />
      <Stack spacing={2.5}>
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
            label={t('recipes:family.editorTabs')}
            id={tabsId}
            value={tab}
            onChange={goTo}
            tabs={[
              {
                value: 'details',
                label: t('recipes:family.tabs.details'),
                badge: detailsBad ? '!' : undefined,
                accessibleName: detailsBad
                  ? `${t('recipes:family.tabs.details')}, ${t('recipes:family.tabs.needsAttention')}`
                  : undefined,
              },
              {
                value: 'ingredients',
                label: t('recipes:tabs.ingredients'),
                badge: String(lineCount),
                accessibleName: `${t('recipes:tabs.ingredients')}, ${lineCount}`,
              },
              {
                value: 'steps',
                label: t('recipes:tabs.steps'),
                badge: String(stepCount),
                accessibleName: `${t('recipes:tabs.steps')}, ${stepCount}`,
              },
            ]}
          />
          {notices || error ? (
            // Each line that has content sits 8px under the one above; an empty status line adds nothing.
            <Stack sx={{ '& > :not(:empty)': { mt: '8px' } }}>
              {notices}
              {error ? <Alert>{translateApiError(t, error)}</Alert> : null}
            </Stack>
          ) : null}
        </Box>
        {/* All three panels stay mounted while hidden: Suggest Guidance (in flight or answered) and the Tips hold state of their own. */}
        <Stack
          role="tabpanel"
          id={segmentedTabPanelId(tabsId, 'details')}
          aria-labelledby={segmentedTabId(tabsId, 'details')}
          spacing={2.5}
          hidden={tab !== 'details'}
          sx={tab !== 'details' ? { display: 'none' } : undefined}
        >
          <>
            {detailsTop}
            <FamilyDetailsBasics
              draft={draft}
              problems={problems}
              hint={hint}
              belowTitle={belowTitle}
              showTitleError={showTitleError}
              onChange={change}
              onTitleBlur={() => setTitleTouched(true)}
            />
            {guidance && guidanceDraft ? (
              <GuidanceCard
                draft={guidanceDraft}
                onChange={setGuidanceDraft}
                momentOptions={guidance.momentOptions}
                page={draft}
                fromLink={guidance.fromLink}
                recipeId={guidance.recipeId}
              />
            ) : null}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => goTo('ingredients')}>
                {t('recipes:family.tabs.toIngredients')}
              </Button>
            </Box>
            {detailsEnd}
          </>
        </Stack>
        <Stack
          role="tabpanel"
          id={segmentedTabPanelId(tabsId, 'ingredients')}
          aria-labelledby={segmentedTabId(tabsId, 'ingredients')}
          spacing={2.5}
          hidden={tab !== 'ingredients'}
          sx={tab !== 'ingredients' ? { display: 'none' } : undefined}
        >
          <>
            <RecipeLinesSection
              seedKey={seedKey}
              lines={draft.lines}
              problems={problems}
              focusKey={addedKey}
              onMatched={(line, ingredient) => {
                if (ingredient.owner === 'family')
                  setPickedFamily((ids) => new Set(ids).add(ingredient.id));
                setDraft((current) => ({
                  ...current,
                  lines: current.lines.map((item) =>
                    item.key === line.key
                      ? {
                          ...item,
                          ingredientId: ingredient.id,
                          name: ingredient.name,
                        }
                      : item,
                  ),
                }));
              }}
              onChange={(lines) => change({ lines })}
              isFamily={(line) =>
                familyIds.has(line.ingredientId) ||
                pickedFamily.has(line.ingredientId)
              }
            >
              <CatalogSearch
                emptyState={<BrowseByAisle />}
                key={searchKey}
                inline
                label={t('catalog:search.addIngredient')}
                placeholder={t('catalog:search.addIngredient')}
                onSelect={(ingredient) => {
                  if (ingredient.owner === 'family')
                    setPickedFamily((ids) => new Set(ids).add(ingredient.id));
                  addLine({
                    ingredientId: ingredient.id,
                    name: ingredient.name,
                    unit: ingredient.defaultUnit,
                  });
                  setSearchKey((value) => value + 1);
                }}
                onUseTyped={(name) => {
                  addLine({ ingredientId: '', name, unit: 'g' });
                  setSearchKey((value) => value + 1);
                }}
              />
            </RecipeLinesSection>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => goTo('steps')}>
                {t('recipes:family.tabs.toSteps')}
              </Button>
            </Box>
          </>
        </Stack>
        <Stack
          role="tabpanel"
          id={segmentedTabPanelId(tabsId, 'steps')}
          aria-labelledby={segmentedTabId(tabsId, 'steps')}
          spacing={2.5}
          hidden={tab !== 'steps'}
          sx={tab !== 'steps' ? { display: 'none' } : undefined}
        >
          <RecipeStepsSection
            steps={draft.steps}
            problems={problems}
            seedKey={seedKey}
            tipCount={(step) =>
              step.id && stepTipCount
                ? stepTipCount(step.id)
                : (step.tips?.length ?? 0)
            }
            hint={stepsHint}
            stepTips={stepTips}
            onChange={(steps) => change({ steps })}
          />
          {stepsEnd}
        </Stack>
      </Stack>
    </>
  );
}
