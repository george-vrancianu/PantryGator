import {
  Alert,
  Button,
  Checkbox,
  Stack,
  TextField,
  Typography,
} from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '../../i18n/translateApiError';
import {
  useTipWrites,
  type AdminRecipe,
  type RecipeTip,
} from '../../lib/adminRecipes';
import { moved } from '../../lib/recipeDraft';
import { RowControls } from '../RowControls';

type TipsRecipe = Pick<AdminRecipe, 'id' | 'steps' | 'tips' | 'parentTips'>;
export type TipWrites = ReturnType<typeof useTipWrites>;
type Props = { recipe: TipsRecipe };

/**
 * Tips of a saved Recipe: Recipe-level ones and one group per Step, plus (on
 * a Variant) toggles for the Base Recipe's Recipe-level Tips. Every change is
 * sent straight away; Step Tips follow their Step through reordering because
 * they anchor to the Step id.
 */
export function RecipeTips({ recipe }: Props) {
  const writes = useTipWrites(recipe.id);
  return <TipsEditor recipe={recipe} writes={writes} />;
}

/** The Tips editor over any Tip writes of the same shape (the Admin's Recipe Tips card). */
export function TipsEditor({ recipe, writes }: Props & { writes: TipWrites }) {
  const { t } = useTranslation(['admin', 'errors']);
  const error =
    writes.add.error ??
    writes.update.error ??
    writes.remove.error ??
    writes.reorder.error ??
    writes.hide.error;
  const busy =
    writes.add.isPending ||
    writes.update.isPending ||
    writes.remove.isPending ||
    writes.reorder.isPending ||
    writes.hide.isPending;

  const group = (stepId: string | null) =>
    recipe.tips.filter((tip) => tip.stepId === stepId);

  /** Reorder inside one group; the API takes every Tip of the Recipe. */
  const move = (members: RecipeTip[], index: number, offset: -1 | 1) => {
    const reordered = moved(members, index, offset);
    const slots = recipe.tips
      .map((tip, position) => (members.includes(tip) ? position : -1))
      .filter((position) => position >= 0);
    const ids = recipe.tips.map((tip) => tip.id);
    slots.forEach((slot, k) => {
      ids[slot] = reordered[k].id;
    });
    writes.reorder.mutate(ids);
  };

  const groupProps = (
    stepId: string | null,
    legend: string,
    newLabel: string,
    groupName: string,
  ) => ({
    legend,
    groupName,
    newLabel,
    members: group(stepId),
    busy,
    onAdd: (text: string) => writes.add.mutateAsync({ text, stepId }),
    onSave: (tipId: string, text: string) =>
      writes.update.mutate({ tipId, text }),
    onRemove: (tipId: string) => writes.remove.mutate(tipId),
    onMove: move,
  });

  const hiddenIds = (recipe.parentTips ?? [])
    .filter((tip) => tip.hidden)
    .map((tip) => tip.id);

  return (
    <Stack
      spacing={2}
      component="section"
      aria-label={t('admin:recipe.tips.title')}
    >
      <Typography variant="sectionLabel" color="text.secondary">
        {t('admin:recipe.tips.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t('admin:recipe.tips.hint')}
      </Typography>
      {error ? <Alert>{translateApiError(t, error)}</Alert> : null}
      {recipe.parentTips ? (
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
          {recipe.parentTips.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('admin:recipe.tips.noInherited')}
            </Typography>
          ) : null}
          {recipe.parentTips.map((tip) => (
            <Checkbox
              key={tip.id}
              label={t('admin:recipe.tips.show', { text: tip.text })}
              checked={!tip.hidden}
              disabled={busy}
              onChange={(event) =>
                writes.hide.mutate(
                  event.target.checked
                    ? hiddenIds.filter((id) => id !== tip.id)
                    : [...hiddenIds, tip.id],
                )
              }
            />
          ))}
        </Stack>
      ) : null}
      <TipGroup
        {...groupProps(
          null,
          t('admin:recipe.tips.recipeLevel'),
          t('admin:recipe.tips.new'),
          t('admin:recipe.tips.groupRecipe'),
        )}
      />
      {recipe.steps.map((step, index) => (
        <TipGroup
          key={step.id}
          {...groupProps(
            step.id,
            t('admin:recipe.tips.forStep', { number: index + 1 }),
            t('admin:recipe.tips.newForStep', { number: index + 1 }),
            t('admin:recipe.tips.groupStep', { number: index + 1 }),
          )}
        />
      ))}
    </Stack>
  );
}

type GroupProps = {
  legend: string;
  /** Short name of the group, in the accessible names of its Tips. */
  groupName: string;
  newLabel: string;
  members: RecipeTip[];
  busy: boolean;
  onAdd: (text: string) => Promise<unknown>;
  onSave: (tipId: string, text: string) => void;
  onRemove: (tipId: string) => void;
  onMove: (members: RecipeTip[], index: number, offset: -1 | 1) => void;
};

function TipGroup({
  legend,
  groupName,
  newLabel,
  members,
  busy,
  onAdd,
  onSave,
  onRemove,
  onMove,
}: GroupProps) {
  const { t } = useTranslation('admin');
  const [text, setText] = useState('');

  const add = async () => {
    const value = text.trim();
    if (!value) return;
    try {
      await onAdd(value);
      setText('');
    } catch {
      // The error is shown by the parent.
    }
  };

  return (
    <Stack component="fieldset" spacing={1} sx={{ border: 0, p: 0, m: 0 }}>
      <Typography component="legend" variant="body2" sx={{ fontWeight: 700 }}>
        {legend}
      </Typography>
      {members.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('recipe.tips.none')}
        </Typography>
      ) : null}
      {members.map((tip, index) => (
        <TipRow
          key={tip.id}
          tip={tip}
          position={index + 1}
          group={groupName}
          first={index === 0}
          last={index === members.length - 1}
          busy={busy}
          onSave={onSave}
          onRemove={onRemove}
          onMove={(offset) => onMove(members, index, offset)}
        />
      ))}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <TextField
          label={newLabel}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <Button variant="secondary" disabled={busy} onClick={() => void add()}>
          {t('recipe.tips.add')}
        </Button>
      </Stack>
    </Stack>
  );
}

type RowProps = {
  tip: RecipeTip;
  position: number;
  group: string;
  first: boolean;
  last: boolean;
  busy: boolean;
  onSave: (tipId: string, text: string) => void;
  onRemove: (tipId: string) => void;
  onMove: (offset: -1 | 1) => void;
};

function TipRow({
  tip,
  position,
  group,
  first,
  last,
  busy,
  onSave,
  onRemove,
  onMove,
}: RowProps) {
  const { t } = useTranslation('admin');
  const [text, setText] = useState(tip.text);
  const dirty = text.trim() !== tip.text && text.trim() !== '';
  return (
    <Stack spacing={0.5}>
      <TextField
        label={t('recipe.tips.text', { position, group })}
        value={text}
        onChange={(event) => setText(event.target.value)}
        multiline
      />
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <RowControls
          moveUp={t('recipe.tips.moveUp', { position, group })}
          moveDown={t('recipe.tips.moveDown', { position, group })}
          remove={t('recipe.tips.remove', { position, group })}
          first={first}
          last={last}
          disabled={busy}
          onMoveUp={() => onMove(-1)}
          onMoveDown={() => onMove(1)}
          onRemove={() => onRemove(tip.id)}
        />
        {dirty ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => onSave(tip.id, text.trim())}
          >
            {t('recipe.tips.save', { position, group })}
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}
