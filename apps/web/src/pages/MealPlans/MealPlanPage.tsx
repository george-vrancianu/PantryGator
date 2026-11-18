import {
  Alert,
  Box,
  Button,
  MoreIcon,
  PlusIcon,
  Spinner,
  Stack,
  Toggle,
  Typography,
  palette,
} from '@pocket-pantry/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { Screen } from '@/components/layout/Screen/Screen';
import {
  dayLabel,
  shortWeekday,
} from '@/components/mealPlan/MealPlanPopover/mealPlanText';
import { localIso, type IsoDate } from '@/lib/pantry';
import {
  dateRange,
  missingFor,
  planDays,
  planErrorMessage,
  planPhase,
  planTitle,
  shortSummary,
  useMealPlan,
  useMealPlanMutations,
  type MealPlanDetail,
  type SlotKey,
} from '@/lib/mealPlanPage';
import { useAddMissing } from '@/lib/useAddMissing';
import { useToday } from '@/lib/useToday';
import { DayCard } from './components/DayCard/DayCard';
import { RecipePickerSheet } from './components/RecipePickerSheet/RecipePickerSheet';
import { SlotSheet } from './components/SlotSheet/SlotSheet';

/** One Meal Plan: the forecast summary, Fill, Add missing, and a card per day with its three Mealtimes. `?day=` opens on a day. */
export function MealPlanPage() {
  const { t, i18n } = useTranslation(['mealPlans', 'common']);
  const language = i18n.language;
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const focusDay = params.get('day');
  const today = localIso(useToday());
  const plan = useMealPlan(id, today);
  const mutations = useMealPlanMutations(today);
  const addMissing = useAddMissing(today);
  const [onlyWhatIHave, setOnlyWhatIHave] = useState(false);
  const [detail, setDetail] = useState<SlotKey | null>(null);
  const [picking, setPicking] = useState<SlotKey | null>(null);
  const headings = useRef(new Map<IsoDate, HTMLHeadingElement>());

  const view = plan.data;
  const days = useMemo(
    () => (view ? planDays(view, today) : []),
    [view, today],
  );

  const loaded = view !== undefined;
  useEffect(() => {
    if (!loaded || !focusDay) return;
    const heading = headings.current.get(focusDay);
    heading?.focus();
    if (typeof heading?.scrollIntoView === 'function') {
      heading.scrollIntoView({ block: 'start' });
    }
  }, [loaded, focusDay]);

  // Only the latest write's error shows: starting any write drops the others' old errors.
  const clearErrors = () => {
    mutations.setSlot.reset();
    mutations.clearSlot.reset();
    mutations.fill.reset();
  };
  const writeError =
    mutations.setSlot.error ??
    mutations.clearSlot.error ??
    mutations.fill.error;
  const errorText = writeError
    ? planErrorMessage(t, language, writeError)
    : null;

  const labelOf = (iso: IsoDate) => dayLabel(language, iso);
  const contextOf = (ref: SlotKey) => {
    const day = days[ref.dayIndex];
    return t('mealPlans:picker.for', {
      mealtime: t(`mealPlans:mealtime.${ref.mealtime}`),
      day: day ? labelOf(day.date) : '',
    });
  };

  const detailSlot = detail
    ? days[detail.dayIndex]?.slots[detail.mealtime]
    : undefined;

  const putSlot = (
    ref: SlotKey,
    recipeId: string,
    servings?: number,
    onSuccess?: () => void,
  ) => {
    clearErrors();
    mutations.setSlot.mutate(
      {
        id,
        ...ref,
        recipeId,
        ...(servings === undefined ? {} : { servings }),
      },
      { onSuccess },
    );
  };

  return (
    <Screen
      title={view ? planTitle(view, language) : t('mealPlans:title')}
      status={
        view
          ? [
              view.name ? dateRange(view, language) : null,
              t('mealPlans:dayCount', { count: view.days }),
              t('mealPlans:servings', { count: view.servings }),
            ]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
      back={{ label: t('mealPlans:back'), href: '/meal-plans' }}
      primary={
        view
          ? {
              label: t('mealPlans:editPlan'),
              icon: <MoreIcon size={20} />,
              href: `/meal-plans/${view.id}/edit`,
            }
          : undefined
      }
    >
      {plan.isPending ? <Spinner label={t('common:loading')} /> : null}
      {plan.error ? (
        <Alert>{planErrorMessage(t, language, plan.error)}</Alert>
      ) : null}
      {view ? (
        <Stack spacing={1.5} useFlexGap>
          <PlanToolbar
            view={view}
            today={today}
            filling={mutations.fill.isPending}
            onlyWhatIHave={onlyWhatIHave}
            onOnlyWhatIHave={setOnlyWhatIHave}
            onFill={() => {
              clearErrors();
              mutations.fill.mutate({ id, onlyWhatIHave });
            }}
            adding={addMissing.isPending}
            onAddMissing={() => addMissing.add({ scope: 'plan', planId: id })}
          />
          {errorText && !detail && !picking ? <Alert>{errorText}</Alert> : null}
          {days.map((day) => (
            <DayCard
              key={day.date}
              ref={(element) => {
                if (element) headings.current.set(day.date, element);
                else headings.current.delete(day.date);
              }}
              day={day}
              today={today}
              selected={day.date === focusDay}
              adding={addMissing.isPending}
              onOpenSlot={(mealtime) =>
                setDetail({ dayIndex: day.dayIndex, mealtime })
              }
              onAddToSlot={(mealtime) =>
                setPicking({ dayIndex: day.dayIndex, mealtime })
              }
              onAddMissing={() =>
                addMissing.add({ scope: 'date', date: day.date })
              }
            />
          ))}
          <SlotSheet
            slot={detailSlot}
            context={detail ? contextOf(detail) : ''}
            planId={id}
            planServings={view.servings}
            today={today}
            error={picking ? null : errorText}
            busy={mutations.setSlot.isPending || mutations.clearSlot.isPending}
            adding={addMissing.isPending}
            onServings={(servings) =>
              detail &&
              detailSlot &&
              putSlot(detail, detailSlot.recipeId, servings)
            }
            onChangeRecipe={() => setPicking(detail)}
            onClear={() => {
              if (!detail) return;
              clearErrors();
              mutations.clearSlot.mutate(
                { id, ...detail },
                { onSuccess: () => setDetail(null) },
              );
            }}
            onAddLine={addMissing.add}
            onClose={() => setDetail(null)}
          />
          <RecipePickerSheet
            open={picking !== null}
            context={picking ? contextOf(picking) : ''}
            error={picking ? errorText : null}
            busy={mutations.setSlot.isPending}
            onPick={(recipeId) =>
              picking &&
              putSlot(
                picking,
                recipeId,
                days[picking.dayIndex]?.slots[picking.mealtime]
                  ?.servingsOverride ?? undefined,
                () => setPicking(null),
              )
            }
            onClose={() => setPicking(null)}
          />
        </Stack>
      ) : null}
    </Screen>
  );
}

/** The forecast summary and Add missing for the plan, then Fill with its "Only what I have" switch. */
function PlanToolbar({
  view,
  today,
  filling,
  onlyWhatIHave,
  onOnlyWhatIHave,
  onFill,
  adding,
  onAddMissing,
}: {
  view: MealPlanDetail;
  today: IsoDate;
  filling: boolean;
  onlyWhatIHave: boolean;
  onOnlyWhatIHave: (value: boolean) => void;
  onFill: () => void;
  adding: boolean;
  onAddMissing: () => void;
}) {
  const { t, i18n } = useTranslation('mealPlans');
  const days = planDays(view, today);
  const short = shortSummary(days);
  const missing = missingFor(days.filter((day) => !day.past));
  const tag = view.forecast.tag;
  const summary = short
    ? t('summary.short', {
        count: short.count,
        day: shortWeekday(i18n.language, short.from),
      })
    : tag.kind === 'coveredOnceYouShop'
      ? t('summary.coveredOnceYouShop')
      : tag.kind === 'allCovered'
        ? t('summary.allCovered')
        : t('summary.none');
  return (
    <Stack spacing={1.25} useFlexGap>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Typography
          role="status"
          sx={{ flex: 1, fontSize: 15, fontWeight: 700 }}
        >
          {summary}
        </Typography>
        {missing.length > 0 ? (
          <Button
            variant="primary"
            size="sm"
            startIcon={<PlusIcon size={14} strokeWidth={2.6} />}
            disabled={adding}
            onClick={onAddMissing}
          >
            {t('addMissing.plan', { count: missing.length })}
          </Button>
        ) : null}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Button
          variant="secondary"
          disabled={filling || planPhase(view, today) === 'past'}
          onClick={onFill}
        >
          {filling ? t('fill.filling') : t('fill.button')}
        </Button>
        <Box
          component="label"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: 14,
            color: palette('text-primary'),
          }}
        >
          <Toggle
            checked={onlyWhatIHave}
            onChange={onOnlyWhatIHave}
            aria-label={t('fill.onlyWhatIHave')}
          />
          {t('fill.onlyWhatIHave')}
        </Box>
      </Box>
    </Stack>
  );
}
