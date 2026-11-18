import {
  Alert,
  Box,
  Card,
  insetFocusRing,
  Button,
  Chip,
  ClockIcon,
  CloseIcon,
  IconButton,
  Stack,
  TextField,
  tokens,
  Typography,
} from '@pocket-pantry/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  moved,
  newKey,
  reordered,
  type DraftProblems,
  type StepDraft,
} from '@/lib/recipeDraft';
import { RowControls } from '@/components/RowControls';
import { GripGlyph, SortableItem, SortableList } from '../sortable';
import { StepNumber } from '@/components/StepNumber';
import type { RecipeTip } from '@/lib/adminRecipes';
import { useUndoRemoval } from '../useUndoRemoval';
import { NewTipRow, TipRow, type TipActions } from '../TipRows/TipRows';

/** Minutes a Timer starts at when the chip is tapped. */
const DEFAULT_TIMER = '5';

type Props = {
  steps: StepDraft[];
  problems: DraftProblems;
  /** How many own Tips a saved Step carries, for the warning before removing it. */
  tipCount: (step: StepDraft) => number;
  onChange: (steps: StepDraft[]) => void;
  /** A line under the Steps: what happens to Tips here. */
  hint?: string;
  /** Changes when the host reseeds `steps`; an open Undo toast is dropped then. */
  seedKey?: string;
  /** Edit only: inline Tips under each saved Step, with a Tip chip in the tool row. */
  stepTips?: { of: (stepId: string) => RecipeTip[]; actions: TipActions };
};

/** The ordered Steps of a Recipe draft: one block each, with a Timer chip, Move up/down, remove, and add at both ends. */
export function RecipeStepsSection({
  steps,
  problems,
  tipCount,
  onChange,
  hint,
  seedKey,
  stepTips,
}: Props) {
  const { t } = useTranslation(['admin', 'common']);
  /** Steps whose blank text should be flagged: edited or blurred, not just added. */
  const [touchedSteps, setTouchedSteps] = useState<Set<number>>(new Set());
  /** Steps whose Timer field the user opened or edited, so it stays up while blank. */
  const [openTimers, setOpenTimers] = useState<Set<number>>(new Set());
  /** A saved Step with Tips waiting for the user to confirm its removal. */
  const [removing, setRemoving] = useState<number | null>(null);
  /** Saved Steps with a blank Tip row open, by Step id. */
  const [addingTip, setAddingTip] = useState<Set<string>>(new Set());
  const setTipRow = (stepId: string, open: boolean) =>
    setAddingTip((old) => {
      const next = new Set(old);
      if (open) next.add(stepId);
      else next.delete(stepId);
      return next;
    });
  /** The Step just added, whose text takes focus once it is rendered. */
  const focusKey = useRef<number | null>(null);
  const removeWithUndo = useUndoRemoval(steps, onChange, seedKey);

  const addToSet =
    (set: (update: (old: Set<number>) => Set<number>) => void) =>
    (key: number) =>
      set((old) => new Set(old).add(key));
  const touch = addToSet(setTouchedSteps);
  const openTimer = addToSet(setOpenTimers);
  const closeTimer = (key: number) =>
    setOpenTimers((old) => {
      const next = new Set(old);
      next.delete(key);
      return next;
    });
  const changeStep = (key: number, patch: Partial<StepDraft>) =>
    onChange(
      steps.map((step) => (step.key === key ? { ...step, ...patch } : step)),
    );
  const without = (key: number) => steps.filter((item) => item.key !== key);
  const addAt = (index: number) => {
    const step = { key: newKey(), text: '', timer: '' };
    onChange([...steps.slice(0, index), step, ...steps.slice(index)]);
    focusKey.current = step.key;
  };
  const remove = (step: StepDraft, index: number) =>
    removeWithUndo(
      step,
      index,
      t('admin:recipe.steps.text', { number: index + 1 }),
    );

  const addRow = (label: string, index: number) => (
    <Box
      component="button"
      type="button"
      onClick={() => addAt(index)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        px: '14px',
        border: 0,
        bgcolor: 'transparent',
        font: 'inherit',
        cursor: 'pointer',
        ...insetFocusRing,
        width: '100%',
        minHeight: 48,
        justifyContent: 'flex-start',
        textAlign: 'start',
        color: tokens.color.accent,
        fontSize: 14.5,
        fontWeight: 700,
        '&:hover': { bgcolor: tokens.color.subtle },
      }}
    >
      <StepNumber dashed>+</StepNumber>
      {label}
    </Box>
  );

  return (
    <Stack
      component="fieldset"
      spacing={1.5}
      sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
    >
      <Typography component="legend" variant="sectionLabel">
        {t('admin:recipe.steps.title')}
      </Typography>
      {steps.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('admin:recipe.steps.empty')}
        </Typography>
      ) : null}
      <Card
        variant="list"
        sx={{
          p: 0,
          overflow: 'hidden',
          '& > * + *, & > ol > li + li': {
            borderTop: `1px solid ${tokens.color.divider}`,
          },
        }}
      >
        {steps.length === 0
          ? addRow(t('admin:recipe.steps.addFirst'), 0)
          : addRow(t('admin:recipe.steps.addStart'), 0)}
        {steps.length > 0 ? (
          <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none' }}>
            <SortableList
              keys={steps.map((step) => step.key)}
              nameOf={(key) =>
                t('admin:recipe.steps.text', {
                  number: steps.findIndex((step) => step.key === key) + 1,
                })
              }
              onReorder={(from, to) => onChange(reordered(steps, from, to))}
            >
              {steps.map((step, index) => {
                const number = index + 1;
                const tips = tipCount(step);
                const flagged =
                  problems.steps[step.key]?.text === true &&
                  touchedSteps.has(step.key);
                const timerOpen = openTimers.has(step.key) || step.timer !== '';
                const timerFlagged = problems.steps[step.key]?.timer === true;
                const timerErrorId = `step-${step.key}-timer-error`;
                return (
                  <SortableItem
                    key={step.key}
                    id={step.key}
                    gripLabel={t('admin:recipe.reorder.grip', {
                      name: t('admin:recipe.steps.text', { number }),
                    })}
                  >
                    {({ row, grip }) => (
                      <Stack
                        component="li"
                        {...row}
                        direction="row"
                        spacing={1.5}
                        sx={{
                          ...row.sx,
                          alignItems: 'flex-start',
                          p: '12px 14px',
                        }}
                      >
                        <Box
                          sx={{
                            mt: '6px',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <Box component="button" {...grip}>
                            <GripGlyph />
                          </Box>
                          <StepNumber>{number}</StepNumber>
                        </Box>
                        <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
                          <TextField
                            value={step.text}
                            placeholder={t('admin:recipe.steps.placeholder', {
                              number,
                            })}
                            inputRef={(node: HTMLElement | null) => {
                              if (node && focusKey.current === step.key) {
                                focusKey.current = null;
                                node.focus();
                              }
                            }}
                            onChange={(event) => {
                              touch(step.key);
                              changeStep(step.key, {
                                text: event.target.value,
                              });
                            }}
                            onBlur={() => touch(step.key)}
                            error={flagged}
                            helperText={
                              flagged
                                ? t('admin:recipe.invalid.stepText')
                                : undefined
                            }
                            multiline
                            minRows={1}
                            slotProps={{
                              htmlInput: {
                                'aria-label': t('admin:recipe.steps.text', {
                                  number,
                                }),
                              },
                            }}
                          />
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ alignItems: 'flex-start', flexWrap: 'wrap' }}
                          >
                            {timerOpen ? (
                              <Stack
                                direction="row"
                                spacing={0.5}
                                sx={{ alignItems: 'center' }}
                              >
                                <ClockIcon size={16} />
                                <TextField
                                  size="small"
                                  value={step.timer}
                                  onChange={(event) => {
                                    openTimer(step.key);
                                    changeStep(step.key, {
                                      timer: event.target.value,
                                    });
                                  }}
                                  onBlur={() => {
                                    if (step.timer.trim() !== '') return;
                                    closeTimer(step.key);
                                    changeStep(step.key, { timer: '' });
                                  }}
                                  error={timerFlagged}
                                  sx={{ width: 110 }}
                                  slotProps={{
                                    htmlInput: {
                                      inputMode: 'decimal',
                                      'aria-describedby': timerFlagged
                                        ? timerErrorId
                                        : undefined,
                                      'aria-label': t(
                                        'admin:recipe.steps.timer',
                                        {
                                          number,
                                        },
                                      ),
                                    },
                                    input: {
                                      endAdornment: (
                                        <Typography
                                          variant="body2"
                                          color="text.secondary"
                                        >
                                          {t('admin:recipe.steps.minutes')}
                                        </Typography>
                                      ),
                                    },
                                  }}
                                />
                                <IconButton
                                  tone="plain"
                                  size={40}
                                  label={t('admin:recipe.steps.clearTimer', {
                                    number,
                                  })}
                                  onClick={() => {
                                    closeTimer(step.key);
                                    changeStep(step.key, { timer: '' });
                                  }}
                                >
                                  <CloseIcon />
                                </IconButton>
                              </Stack>
                            ) : (
                              <Chip
                                icon={<ClockIcon />}
                                label={t('admin:recipe.steps.addTimer')}
                                aria-label={t(
                                  'admin:recipe.steps.addTimerFor',
                                  {
                                    number,
                                  },
                                )}
                                onClick={() => {
                                  openTimer(step.key);
                                  changeStep(step.key, {
                                    timer: DEFAULT_TIMER,
                                  });
                                }}
                              />
                            )}
                            {stepTips && step.id ? (
                              <Chip
                                icon={<span aria-hidden>💡</span>}
                                label={t('admin:recipe.steps.addTip')}
                                aria-label={t('admin:recipe.steps.addTipFor', {
                                  number,
                                })}
                                onClick={() => setTipRow(step.id!, true)}
                              />
                            ) : null}
                            {step.tips && step.tips.length > 0 ? (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ alignSelf: 'center' }}
                              >
                                <span aria-hidden>💡 </span>
                                {t('admin:recipe.steps.copiedTips', {
                                  count: step.tips.length,
                                })}
                              </Typography>
                            ) : null}
                            <RowControls
                              moveUp={t('admin:recipe.steps.moveUp', {
                                number,
                              })}
                              moveDown={t('admin:recipe.steps.moveDown', {
                                number,
                              })}
                              remove={t('admin:recipe.steps.remove', {
                                number,
                              })}
                              first={index === 0}
                              last={index === steps.length - 1}
                              onMoveUp={() => onChange(moved(steps, index, -1))}
                              onMoveDown={() =>
                                onChange(moved(steps, index, 1))
                              }
                              onRemove={() =>
                                tips > 0
                                  ? setRemoving(step.key)
                                  : remove(step, index)
                              }
                            />
                          </Stack>
                          {timerOpen && timerFlagged ? (
                            <Typography
                              id={timerErrorId}
                              variant="caption"
                              color="error"
                            >
                              {t('admin:recipe.invalid.timer')}
                            </Typography>
                          ) : null}
                          {stepTips && step.id ? (
                            <>
                              {stepTips.of(step.id).map((tip, tipIndex) => (
                                <TipRow
                                  key={`${tip.id}-${tip.text}`}
                                  tip={tip}
                                  label={t('admin:recipe.steps.tipOf', {
                                    n: tipIndex + 1,
                                    step: number,
                                  })}
                                  placeholder={t(
                                    'admin:recipe.steps.tipPlaceholder',
                                  )}
                                  removeLabel={t(
                                    'admin:recipe.steps.deleteTip',
                                    {
                                      n: tipIndex + 1,
                                      step: number,
                                    },
                                  )}
                                  actions={stepTips.actions}
                                  order={{
                                    up: t('admin:recipe.steps.moveTipUp', {
                                      n: tipIndex + 1,
                                      step: number,
                                    }),
                                    down: t('admin:recipe.steps.moveTipDown', {
                                      n: tipIndex + 1,
                                      step: number,
                                    }),
                                    first: tipIndex === 0,
                                    last:
                                      tipIndex ===
                                      stepTips.of(step.id!).length - 1,
                                  }}
                                />
                              ))}
                              {addingTip.has(step.id) ? (
                                <NewTipRow
                                  label={t('admin:recipe.steps.newTip', {
                                    number,
                                  })}
                                  placeholder={t(
                                    'admin:recipe.steps.tipPlaceholder',
                                  )}
                                  removeLabel={t(
                                    'admin:recipe.steps.cancelTip',
                                    {
                                      number,
                                    },
                                  )}
                                  stepId={step.id}
                                  actions={stepTips.actions}
                                  onDone={() => setTipRow(step.id!, false)}
                                />
                              ) : null}
                            </>
                          ) : null}
                          {removing === step.key ? (
                            <Alert severity="warning">
                              <Stack spacing={1}>
                                <span>
                                  {t('admin:recipe.steps.tipsWarning', {
                                    number,
                                    count: tips,
                                  })}
                                </span>
                                <Stack direction="row" spacing={1}>
                                  <Button
                                    onClick={() => {
                                      setRemoving(null);
                                      onChange(without(step.key));
                                    }}
                                  >
                                    {t('admin:recipe.steps.removeWithTips')}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    sx={{ height: 52 }}
                                    onClick={() => setRemoving(null)}
                                  >
                                    {t('admin:recipe.steps.keep')}
                                  </Button>
                                </Stack>
                              </Stack>
                            </Alert>
                          ) : null}
                        </Stack>
                      </Stack>
                    )}
                  </SortableItem>
                );
              })}
            </SortableList>
          </Box>
        ) : null}
        {steps.length > 0
          ? addRow(t('admin:recipe.steps.add'), steps.length)
          : null}
      </Card>
      {hint ? (
        <Typography variant="body2" color="text.secondary">
          {hint}
        </Typography>
      ) : null}
    </Stack>
  );
}
