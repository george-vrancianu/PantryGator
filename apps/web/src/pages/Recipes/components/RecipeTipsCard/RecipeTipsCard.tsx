import { Button, Card, Checkbox, Stack, Typography } from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecipeTip } from '@/lib/adminRecipes';
import {
  NewTipRow,
  TipRow,
  type TipActions,
} from '@/components/recipeEditor/TipRows/TipRows';

type Props = {
  /** The Recipe's own Recipe-level Tips (not tied to a Step). */
  tips: RecipeTip[];
  /** On a Variant, the Base Recipe's Recipe-level Tips and whether each is hidden. */
  parentTips?: (RecipeTip & { hidden: boolean })[];
  actions: TipActions;
  busy: boolean;
  onHide: (tipIds: string[]) => void;
};

/** The "Recipe tips" card under the Steps: own Recipe-level Tips with the same rows, and a Variant's inherited Tips as show/hide checkboxes. Writes are immediate. */
export function RecipeTipsCard({
  tips,
  parentTips,
  actions,
  busy,
  onHide,
}: Props) {
  const { t } = useTranslation(['recipes', 'admin']);
  const [adding, setAdding] = useState(false);
  const hiddenIds = (parentTips ?? [])
    .filter((tip) => tip.hidden)
    .map((tip) => tip.id);
  return (
    <Card
      component="section"
      aria-label={t('recipes:family.recipeTips.title')}
      sx={{ p: '14px' }}
    >
      <Stack spacing={1.5}>
        <Typography variant="sectionLabel" color="text.secondary">
          {t('recipes:family.recipeTips.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('recipes:family.recipeTips.hint')}
        </Typography>
        {parentTips ? (
          <Stack
            component="fieldset"
            spacing={0.5}
            sx={{ border: 0, p: 0, m: 0 }}
          >
            <Typography
              component="legend"
              variant="body2"
              sx={{ fontWeight: 700 }}
            >
              {t('admin:recipe.tips.inherited')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('admin:recipe.tips.inheritedHint')}
            </Typography>
            {parentTips.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('admin:recipe.tips.noInherited')}
              </Typography>
            ) : null}
            {parentTips.map((tip) => (
              <Checkbox
                key={tip.id}
                label={t('admin:recipe.tips.show', { text: tip.text })}
                checked={!tip.hidden}
                disabled={busy}
                onChange={(event) =>
                  onHide(
                    event.target.checked
                      ? hiddenIds.filter((id) => id !== tip.id)
                      : [...hiddenIds, tip.id],
                  )
                }
              />
            ))}
          </Stack>
        ) : null}
        {tips.map((tip, index) => (
          <TipRow
            key={`${tip.id}-${tip.text}`}
            tip={tip}
            label={t('recipes:family.recipeTips.tip', { number: index + 1 })}
            placeholder={t('recipes:family.recipeTips.placeholder')}
            removeLabel={t('recipes:family.recipeTips.delete', {
              number: index + 1,
            })}
            actions={actions}
          />
        ))}
        {adding ? (
          <NewTipRow
            label={t('recipes:family.recipeTips.new')}
            placeholder={t('recipes:family.recipeTips.placeholder')}
            removeLabel={t('recipes:family.recipeTips.cancelNew')}
            stepId={null}
            actions={actions}
            onDone={() => setAdding(false)}
          />
        ) : (
          <Button variant="ghost" onClick={() => setAdding(true)}>
            {t('recipes:family.recipeTips.add')}
          </Button>
        )}
      </Stack>
    </Card>
  );
}
