import {
  Alert,
  Box,
  Button,
  Sheet,
  Stack,
  Tag,
  Typography,
  tokens,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import {
  issueDetail,
  readableAmount,
  reasonText,
} from '../../../components/MealPlanPopover/mealPlanText';
import { ingredientKey, type PlanIssue } from '../../../lib/mealPlan';
import type { AddMissingScope } from '../../../lib/mealPlan';
import type { PlanSlot } from '../../../lib/mealPlanPage';
import type { PantryLine } from '../../../lib/recipes';
import { LineStatusPill } from '../../Recipes/components/PantryStatus';
import { ServingsStepper } from '../../Recipes/components/Servings';

/** A forecast issue as a Pantry-status line, so the Recipe page's pill words it (short amounts as kg / l). */
function asPantryLine(issue: PlanIssue): PantryLine {
  const missing = issue.kind === 'missing';
  const shortfall =
    !missing && issue.quantity !== null && issue.unit !== null
      ? readableAmount(issue.quantity, issue.unit)
      : null;
  return {
    lineId: ingredientKey(issue),
    ingredientId: issue.ingredientId,
    name: issue.name,
    status: missing ? 'missing' : 'short',
    optional: false,
    pantryBasic: false,
    quantity: issue.quantity,
    unit: issue.unit,
    shortfall:
      shortfall && shortfall.unit
        ? { quantity: shortfall.quantity, unit: shortfall.unit }
        : null,
    usesExpiringSoon: false,
    onShoppingList: issue.onList,
  };
}

type Props = {
  slot: PlanSlot | undefined;
  /** "Dinner on Fri 16 Oct". */
  context: string;
  planId: string;
  planServings: number;
  today: string;
  error: string | null;
  busy: boolean;
  adding: boolean;
  onServings: (servings: number | undefined) => void;
  onChangeRecipe: () => void;
  onClear: () => void;
  onAddLine: (scope: AddMissingScope) => void;
  onClose: () => void;
};

/** A filled slot's detail: its forecast lines with reasons, the Servings override, Change Recipe and Clear. */
export function SlotSheet({
  slot,
  context,
  planId,
  planServings,
  today,
  error,
  busy,
  adding,
  onServings,
  onChangeRecipe,
  onClear,
  onAddLine,
  onClose,
}: Props) {
  const { t, i18n } = useTranslation('mealPlans');
  const { t: tDashboard } = useTranslation('dashboard');
  return (
    <Sheet
      open={slot !== undefined}
      onClose={onClose}
      title={slot?.recipeTitle ?? t('detail.lines')}
      subtitle={slot ? context : undefined}
      primary={{ label: t('detail.done'), onClick: onClose }}
      secondary={{
        label: t('detail.changeRecipe'),
        onClick: () => {
          if (!busy) onChangeRecipe();
        },
      }}
      destructive={{
        label: t('detail.clear'),
        onClick: () => {
          if (!busy) onClear();
        },
      }}
    >
      {slot ? (
        <Stack spacing={2} sx={{ px: 3, pb: 2 }}>
          {error ? <Alert>{error}</Alert> : null}
          {slot.unavailable ? null : (
            <Box>
              <Typography
                variant="sectionLabel"
                color="text.secondary"
                component="p"
                sx={{ mb: 0.5 }}
              >
                {t('detail.servings')}
              </Typography>
              <ServingsStepper
                servings={slot.servings}
                disabled={busy}
                onChange={(servings) =>
                  onServings(servings === planServings ? undefined : servings)
                }
              />
            </Box>
          )}
          {slot.unavailable ? (
            <Alert severity="warning">{t('detail.unavailable')}</Alert>
          ) : slot.issues.length === 0 ? (
            <Typography color="text.secondary">
              {t('detail.nothingShort')}
            </Typography>
          ) : (
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {slot.issues.map((issue) => {
                const reason = reasonText(
                  tDashboard,
                  i18n.language,
                  issue,
                  today,
                );
                const uncertain = issue.kind === 'uncertain';
                const detailText = issueDetail(
                  tDashboard,
                  i18n.language,
                  issue,
                );
                // A short line's amount is in its pill; "need" has no pill amount.
                const meta = [
                  issue.kind === 'missing' ? detailText : null,
                  reason,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Box
                    component="li"
                    key={ingredientKey(issue)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      py: '10px',
                      borderTop: `1px solid ${tokens.color.divider}`,
                      '&:first-of-type': { borderTop: 0 },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ fontSize: 15, fontWeight: 600 }}>
                        {issue.name}
                      </Box>
                      {meta ? (
                        <Box sx={{ fontSize: 13, color: tokens.color.muted }}>
                          {meta}
                        </Box>
                      ) : null}
                      {uncertain ? (
                        <Box sx={{ fontSize: 13, color: tokens.color.muted }}>
                          {t('detail.uncertainNote')}
                        </Box>
                      ) : null}
                    </Box>
                    {uncertain ? (
                      <Tag tone="neutral">{t('detail.uncertain')}</Tag>
                    ) : (
                      <LineStatusPill line={asPantryLine(issue)} />
                    )}
                    {uncertain || issue.onList ? null : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={adding}
                        aria-label={t('detail.addLine', {
                          name: issue.name,
                        })}
                        onClick={() =>
                          onAddLine(
                            issue.ingredientId
                              ? {
                                  scope: 'ingredient',
                                  ingredientId: issue.ingredientId,
                                  planId,
                                }
                              : {
                                  scope: 'ingredient',
                                  name: issue.name,
                                  planId,
                                },
                          )
                        }
                      >
                        {t('slot.add')}
                      </Button>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </Stack>
      ) : null}
    </Sheet>
  );
}
