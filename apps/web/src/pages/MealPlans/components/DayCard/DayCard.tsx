import { Box, Button, Card, focusRing, Tag, tokens } from '@pocket-pantry/ui';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AllergenIndicator,
  allergenIndicatorLabel,
} from '@/components/allergy/AllergenIndicator/AllergenIndicator';
import { statusMark } from '@/components/mealPlan/MealPlanPopover/statusMark';
import {
  dayLabel,
  statusLabel,
} from '@/components/mealPlan/MealPlanPopover/mealPlanText';
import { MEALTIMES, type Mealtime } from '@/lib/mealPlan';
import { missingFor, type PlanDay, type PlanSlot } from '@/lib/mealPlanPage';
import { RecipeRowLayout } from '@/components/recipe/RecipeRowLayout/RecipeRowLayout';

/** A filled slot's forecast as the Widget's Tag: covered, on list, short, or "No longer available". */
function StatusTag({ slot }: { slot: PlanSlot }) {
  const { t } = useTranslation('mealPlans');
  if (!slot.status) return null;
  return (
    <Box sx={{ mt: '6px' }}>
      {statusMark({ ...slot, status: slot.status }, t)}
    </Box>
  );
}

type Props = {
  day: PlanDay;
  today: string;
  /** The day a deep link opened; it takes focus. */
  selected: boolean;
  adding: boolean;
  onOpenSlot: (mealtime: Mealtime) => void;
  onAddToSlot: (mealtime: Mealtime) => void;
  onAddMissing: () => void;
};

/** One day: its date, Add missing for the day, and three rows (Breakfast, Lunch, Dinner). Past days are dimmed and have no actions. */
export const DayCard = forwardRef<HTMLHeadingElement, Props>(function DayCard(
  { day, today, selected, adding, onOpenSlot, onAddToSlot, onAddMissing },
  headingRef,
) {
  const { t, i18n } = useTranslation('mealPlans');
  const { t: tRecipes } = useTranslation('recipes');
  const language = i18n.language;
  const headingId = `day-${day.date}`;
  const missing = day.past ? 0 : missingFor([day]).length;
  const label = dayLabel(language, day.date);
  return (
    <Card
      component="section"
      aria-labelledby={headingId}
      data-selected={selected ? '' : undefined}
      sx={{ p: '12px 14px' }}
    >
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: '4px' }}
      >
        <Box
          component="h2"
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          sx={{
            flex: 1,
            m: 0,
            fontSize: 15,
            fontWeight: 700,
            outline: 'none',
            ...focusRing,
            color: day.past ? tokens.color.muted : tokens.color.ink,
          }}
        >
          {label}
          {day.date === today ? ` · ${t('day.today')}` : null}
        </Box>
        {day.past ? <Tag tone="neutral">{t('day.past')}</Tag> : null}
        {missing > 0 ? (
          <Button
            variant="primary"
            size="sm"
            disabled={adding}
            aria-label={t('day.addMissingLabel', { day: label })}
            onClick={onAddMissing}
          >
            {t('day.addMissing', { count: missing })}
          </Button>
        ) : null}
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {MEALTIMES.map((mealtime) => {
          const slot = day.slots[mealtime];
          const mealtimeName = t(`mealtime.${mealtime}`);
          if (!slot) {
            return (
              <Box
                component="li"
                key={mealtime}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  minHeight: 48,
                  borderTop: `1px solid ${tokens.color.line}`,
                  opacity: day.past ? 0.55 : 1,
                }}
              >
                <Box sx={{ flex: 1, fontSize: 13, color: tokens.color.muted }}>
                  <Box component="span" sx={{ fontWeight: 700 }}>
                    {mealtimeName}
                  </Box>
                  {day.past ? ` · ${t('slot.empty')}` : null}
                </Box>
                {day.past ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('slot.addLabel', {
                      mealtime: mealtimeName,
                      day: label,
                    })}
                    onClick={() => onAddToSlot(mealtime)}
                  >
                    {t('slot.add')}
                  </Button>
                )}
              </Box>
            );
          }
          return (
            <RecipeRowLayout
              key={mealtime}
              title={slot.recipeTitle}
              meta={[mealtimeName, t('servings', { count: slot.servings })]}
              pills={
                <>
                  {day.past ? null : <StatusTag slot={slot} />}
                  {slot.allergyWarning ? (
                    <Box sx={{ mt: '6px' }}>
                      <AllergenIndicator
                        warning={slot.allergyWarning}
                        withOwners
                      />
                    </Box>
                  ) : null}
                </>
              }
              dimmed={day.past}
              onClick={day.past ? undefined : () => onOpenSlot(mealtime)}
              aria-label={[
                t('slot.open', {
                  mealtime: mealtimeName,
                  day: label,
                  title: slot.recipeTitle,
                }),
                !day.past && slot.status
                  ? statusLabel(t, { ...slot, status: slot.status })
                  : null,
                slot.allergyWarning
                  ? allergenIndicatorLabel(tRecipes, slot.allergyWarning, true)
                  : null,
              ]
                .filter(Boolean)
                .join(', ')}
            />
          );
        })}
      </Box>
    </Card>
  );
});
