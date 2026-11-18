import { Alert, Box, Spinner, TextField, Typography } from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Screen } from '@/components/layout/Screen/Screen';
import { ConfirmPrompt } from '../../components/ConfirmAction';
import { EditorForm } from '../../components/EditorForm';
import { ExpiryField } from '@/components/expiryPicker/ExpiryField/ExpiryField';
import { useFamily } from '../../lib/family';
import { localIso, type IsoDate } from '../../lib/pantry';
import {
  addDaysIso,
  MAX_NAME_LENGTH,
  MAX_PLAN_DAYS,
  MAX_START_AHEAD_DAYS,
  planErrorMessage,
  useMealPlan,
  useMealPlanMutations,
  type MealPlanDetail,
  type PlanInput,
} from '../../lib/mealPlanPage';
import { useToday } from '../../lib/useToday';
import {
  ServingsStepper,
  StepperPill,
} from '@/components/recipe/Servings/Servings';
import { fullDate } from '@/components/mealPlan/MealPlanPopover/mealPlanText';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** `/meal-plans/new`, with `?start=YYYY-MM-DD` from the Widget pre-filling the start date. */
export function NewMealPlanPage() {
  const { t } = useTranslation('mealPlans');
  const [params] = useSearchParams();
  return (
    <MealPlanForm
      title={t('newPlan')}
      back={{ label: t('back'), href: '/meal-plans' }}
      start={params.get('start')}
    />
  );
}

/** `/meal-plans/:id/edit`. */
export function EditMealPlanPage() {
  const { t, i18n } = useTranslation(['mealPlans', 'common']);
  const { id = '' } = useParams();
  const today = localIso(useToday());
  const plan = useMealPlan(id, today);
  const title = t('mealPlans:editPlan');
  const back = { label: t('mealPlans:back'), href: `/meal-plans/${id}` };
  if (plan.data) {
    return <MealPlanForm title={title} back={back} plan={plan.data} />;
  }
  return (
    <Screen title={title} back={back}>
      {plan.isPending ? <Spinner label={t('common:loading')} /> : null}
      {plan.error ? (
        <Alert>{planErrorMessage(t, i18n.language, plan.error)}</Alert>
      ) : null}
    </Screen>
  );
}

/** The editor: its Save is the top bar's labelled gold key (ADR 0042), so the form carries no Save of its own. */
function MealPlanForm({
  title,
  back,
  plan,
  start,
}: {
  title: string;
  back: { label: string; href: string };
  plan?: MealPlanDetail;
  start?: string | null;
}) {
  const { t, i18n } = useTranslation(['mealPlans', 'errors', 'admin']);
  const navigate = useNavigate();
  const today = localIso(useToday());
  const lastStart = addDaysIso(today, MAX_START_AHEAD_DAYS);
  const family = useFamily();
  const { create, update, remove } = useMealPlanMutations(today);

  const prefilled =
    start && ISO.test(start) && start >= today && start <= lastStart
      ? start
      : today;
  const [name, setName] = useState(plan?.name ?? '');
  const [startDate, setStartDate] = useState<IsoDate>(
    plan?.startDate ?? prefilled,
  );
  const [days, setDays] = useState(plan?.days ?? 7);
  // Until the Member picks, a new plan follows the Family's size (the API's default).
  const [servings, setServings] = useState<number | null>(
    plan?.servings ?? null,
  );
  const [confirming, setConfirming] = useState(false);

  const shownServings = servings ?? family.data?.members.length ?? 2;
  const dropped = plan
    ? plan.slots.filter((slot) => slot.dayIndex >= days).length
    : 0;

  const save = () => {
    if (!plan) {
      const input: PlanInput = { startDate, days, name: name.trim() || null };
      if (servings !== null) input.servings = servings;
      create.mutate(input, {
        onSuccess: (made) => navigate(`/meal-plans/${made.id}`),
      });
      return;
    }
    // Only what changed: moving a plan that has begun is refused, and renaming it should not be.
    const changes: PlanInput = {};
    if (name.trim() !== (plan.name ?? '')) changes.name = name.trim() || null;
    if (startDate !== plan.startDate) changes.startDate = startDate;
    if (days !== plan.days) changes.days = days;
    if (shownServings !== plan.servings) changes.servings = shownServings;
    update.mutate(
      { id: plan.id, ...changes },
      { onSuccess: () => navigate(`/meal-plans/${plan.id}`) },
    );
  };

  const submit = () => {
    if (plan && dropped > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    save();
  };

  const writeError = create.error ?? update.error ?? remove.error;
  const saving = create.isPending || update.isPending;

  const saveLabel = plan ? t('admin:common.save') : t('mealPlans:form.create');
  const savingLabel = plan
    ? t('admin:common.saving')
    : t('mealPlans:form.creating');

  return (
    <>
      <Screen
        title={title}
        back={back}
        primary={{
          label: saveLabel,
          text: saving ? savingLabel : saveLabel,
          disabled: saving,
          onClick: submit,
        }}
      />
      <EditorForm
        heading={
          plan
            ? t('mealPlans:form.editHeading')
            : t('mealPlans:form.createHeading')
        }
        error={writeError}
        errorText={
          writeError
            ? planErrorMessage(t, i18n.language, writeError)
            : undefined
        }
        canSave
        saving={saving}
        hideActions
        onSubmit={submit}
        onDelete={
          plan
            ? () =>
                remove.mutate(plan.id, {
                  onSuccess: () => navigate('/meal-plans'),
                })
            : undefined
        }
        deleting={remove.isPending}
      >
        <TextField
          label={t('mealPlans:form.name')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          slotProps={{ htmlInput: { maxLength: MAX_NAME_LENGTH } }}
          helperText={t('mealPlans:form.namePlaceholder')}
        />
        {plan && plan.startDate < today ? (
          <Box>
            <Typography
              variant="sectionLabel"
              color="text.secondary"
              component="p"
              sx={{ mb: 0.5 }}
            >
              {t('mealPlans:form.starts')}
            </Typography>
            <Typography>{fullDate(i18n.language, plan.startDate)}</Typography>
            <Typography variant="meta" color="text.secondary">
              {t('mealPlans:form.startLocked')}
            </Typography>
          </Box>
        ) : (
          <ExpiryField
            label={t('mealPlans:form.starts')}
            value={startDate}
            onChange={(value) => value && setStartDate(value)}
            usualDays={null}
            context={t('mealPlans:form.startContext', {
              date: fullDate(i18n.language, lastStart),
            })}
            range={{ min: today, max: lastStart }}
          />
        )}
        <Box>
          <Typography
            variant="sectionLabel"
            color="text.secondary"
            component="p"
            sx={{ mb: 0.5 }}
          >
            {t('mealPlans:form.days')}
          </Typography>
          <StepperPill
            value={days}
            min={1}
            max={MAX_PLAN_DAYS}
            onChange={(value) => {
              setDays(value);
              // Shortening again must ask again.
              setConfirming(false);
            }}
            fewerLabel={t('mealPlans:form.fewerDays')}
            moreLabel={t('mealPlans:form.moreDays')}
          >
            <span>{t('mealPlans:form.daysValue', { count: days })}</span>
          </StepperPill>
        </Box>
        <Box>
          <Typography
            variant="sectionLabel"
            color="text.secondary"
            component="p"
            sx={{ mb: 0.5 }}
          >
            {t('mealPlans:form.servings')}
          </Typography>
          <ServingsStepper servings={shownServings} onChange={setServings} />
        </Box>
        {confirming && dropped > 0 ? (
          <ConfirmPrompt
            message={t('mealPlans:form.shorten', { days, count: dropped })}
            disabled={saving}
            onConfirm={save}
            onCancel={() => setConfirming(false)}
          />
        ) : null}
      </EditorForm>
    </>
  );
}
