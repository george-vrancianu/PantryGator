import {
  Alert,
  Box,
  PlusIcon,
  Spinner,
  Tag,
  Typography,
  type TagTone,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/layout/Screen/Screen';
import { localIso } from '../../lib/pantry';
import {
  dateRange,
  planPhase,
  planTitle,
  useMealPlans,
  type PlanPhase,
} from '../../lib/mealPlanPage';
import { useToday } from '../../lib/useToday';
import { translateApiError } from '../../i18n/translateApiError';
import { RecipeRowLayout } from '../../components/RecipeRowLayout';

const PHASE_TONE: Record<PlanPhase, TagTone> = {
  past: 'neutral',
  current: 'accent',
  upcoming: 'ok',
};

/** The Family's Meal Plans, newest first: open one, or start a new one. */
export function MealPlansPage() {
  const { t, i18n } = useTranslation(['mealPlans', 'common']);
  const today = localIso(useToday());
  const plans = useMealPlans();
  const items = plans.data ?? [];

  return (
    <Screen
      title={t('mealPlans:title')}
      back={{ label: t('screenHeader:back'), href: '/' }}
      primary={{
        label: t('mealPlans:newPlan'),
        icon: <PlusIcon size={20} />,
        href: '/meal-plans/new',
      }}
    >
      {plans.error ? <Alert>{translateApiError(t, plans.error)}</Alert> : null}
      {plans.isPending ? <Spinner label={t('common:loading')} /> : null}
      {plans.data && items.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: '32px' }}>
          <Typography>{t('mealPlans:empty')}</Typography>
          <Typography variant="meta" color="text.secondary">
            {t('mealPlans:emptyHint')}
          </Typography>
        </Box>
      ) : null}
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {items.map((plan) => {
          const phase = planPhase(plan, today);
          return (
            <RecipeRowLayout
              key={plan.id}
              title={planTitle(plan, i18n.language)}
              meta={[
                plan.name ? dateRange(plan, i18n.language) : null,
                t('mealPlans:dayCount', { count: plan.days }),
                t('mealPlans:servings', { count: plan.servings }),
              ].filter((part): part is string => part !== null)}
              pills={
                <Box sx={{ mt: '6px' }}>
                  <Tag tone={PHASE_TONE[phase]}>
                    {t(`mealPlans:phase.${phase}`)}
                  </Tag>
                </Box>
              }
              to={`/meal-plans/${plan.id}`}
            />
          );
        })}
      </Box>
    </Screen>
  );
}
