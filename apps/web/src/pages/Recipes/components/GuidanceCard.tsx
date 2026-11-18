import {
  Box,
  Button,
  Card,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Chip,
  CloseIcon,
  IconButton,
  Stack,
  TextField,
  Typography,
  tokens,
  usePrefersReducedMotion,
} from '@pocket-pantry/ui';
import { CreditPrice } from '@/components/credits/CreditPrice/CreditPrice';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PairingRow,
  type MomentOption,
  type RecipePickerProps,
} from '@/components/recipeEditor/GuidanceFields/GuidanceFields';
import {
  SuggestedMark,
  useGuidanceSuggestion,
} from '@/components/recipeEditor/SuggestGuidance/SuggestGuidance';
import {
  MAX_EATING_MOMENTS,
  MAX_NUTRITION_NOTE,
  MAX_PAIRINGS,
} from '../../../lib/adminRecipes';
import {
  emptyPairing,
  guidanceProblems,
  hasGuidanceProblem,
  noteLength,
  type EatingMomentDraft,
  type GuidanceDraft,
  type PairingDraft,
} from '../../../lib/guidanceDraft';
import type { GuidanceField } from '../../../lib/guidanceSuggestion';
import { useCreditPrice, useRefreshCredits } from '../../../lib/credits';
import { suggestFamilyGuidance } from '../../../lib/familyRecipes';
import { suggestionRecipeOf, type FamilyDraft } from '../hooks/familyDraft';
import { FamilyRecipePicker } from './FamilyGuidance';

const fieldsetReset = { border: 0, p: 0, m: 0, minWidth: 0 };
const bareButtonSx = {
  p: 0,
  minHeight: 44,
  border: 0,
  bgcolor: 'transparent',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
} as const;

type Props = {
  draft: GuidanceDraft;
  onChange: (draft: GuidanceDraft) => void;
  momentOptions: MomentOption[];
  /** The Recipe content on the page now, which Suggest Guidance reads. */
  page: FamilyDraft;
  /** A Recipe from Link draft: its Guidance is never read from the page. */
  fromLink?: boolean;
  /** The saved Recipe being edited, which a Pairing cannot link to. */
  recipeId?: string;
};

/** How many Pairings, Eating Moments and Nutrition Notes are set. */
export const guidanceSetCount = (draft: GuidanceDraft) =>
  draft.pairings.length +
  draft.eatingMoments.length +
  (draft.nutritionNote.trim() ? 1 : 0);

/**
 * Guidance of a New Recipe or a Variant as one collapsed card on Details. Suggest Guidance
 * sits on the card's row, so it can be asked for without opening the card; the answer fills
 * only the empty fields (ADR 0026).
 */
export function GuidanceCard({
  draft,
  onChange,
  momentOptions,
  page,
  fromLink,
  recipeId,
}: Props) {
  const { t } = useTranslation(['recipes', 'admin']);
  const reduceMotion = usePrefersReducedMotion();
  const bodyId = useId();
  const priceId = useId();
  const price = useCreditPrice('guidance');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const refreshCredits = useRefreshCredits();
  const suggestion = useGuidanceSuggestion({
    draft,
    onChange,
    // A kept suggestion costs a Credit, a refused or empty one costs none: look at the balance again either way.
    send: (guidance) =>
      suggestFamilyGuidance({
        recipe: suggestionRecipeOf(page),
        guidance,
        ...(recipeId ? { recipeId } : {}),
      }).finally(() => void refreshCredits()),
  });
  const RecipePicker = useMemo(
    () =>
      function Picker(props: RecipePickerProps) {
        return <FamilyRecipePicker {...props} excludeId={recipeId} />;
      },
    [recipeId],
  );
  const problems = guidanceProblems(draft);
  const hasProblem = hasGuidanceProblem(draft);
  const set = guidanceSetCount(draft);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const wasAllFilled = useRef(suggestion.allFilled);
  // The Suggest button leaves once every field is filled; keep focus on the row.
  useEffect(() => {
    if (
      !wasAllFilled.current &&
      suggestion.allFilled &&
      document.activeElement === document.body
    ) {
      toggleRef.current?.focus();
    }
    wasAllFilled.current = suggestion.allFilled;
  }, [suggestion.allFilled]);
  const subline =
    set > 0
      ? t('recipes:family.guidanceCard.setCount', { count: set })
      : fromLink
        ? t('recipes:family.guidanceCard.linkOptional')
        : t('recipes:family.guidanceCard.optional');
  const change = (patch: Partial<GuidanceDraft>) =>
    onChange({ ...draft, ...patch });
  // Always mounted, so a screen reader announces the text when it arrives.
  const nothing = (field: GuidanceField) => (
    <Typography
      role="status"
      variant="body2"
      color="text.secondary"
      sx={{ '&:empty': { m: '0 !important' } }}
    >
      {suggestion.noSuggestions.includes(field)
        ? t('recipes:family.guidanceCard.nothing')
        : null}
    </Typography>
  );
  const removePairing = (key: number) =>
    change({ pairings: draft.pairings.filter((p) => p.key !== key) });

  const patchPairing = (key: number, patch: Partial<PairingDraft>) =>
    change({
      pairings: draft.pairings.map((p) =>
        p.key === key ? { ...p, ...patch, suggested: false } : p,
      ),
    });
  const patchMoment = (id: string, patch: Partial<EatingMomentDraft>) =>
    change({
      eatingMoments: draft.eatingMoments.map((m) =>
        m.eatingMomentId === id ? { ...m, ...patch, suggested: false } : m,
      ),
    });
  // One tap Good for, two Avoid, three clears.
  const cycle = (id: string) => {
    const current = draft.eatingMoments.find((m) => m.eatingMomentId === id);
    if (!current) {
      change({
        eatingMoments: [
          ...draft.eatingMoments,
          { eatingMomentId: id, polarity: 'good_for', reason: '' },
        ],
      });
    } else if (current.polarity === 'good_for') {
      patchMoment(id, { polarity: 'avoid' });
    } else {
      change({
        eatingMoments: draft.eatingMoments.filter(
          (m) => m.eatingMomentId !== id,
        ),
      });
    }
  };
  const unknownMoment = t('admin:recipe.guidance.eatingMoments.unknown');
  const chipMoments: MomentOption[] = [
    ...momentOptions.filter((m) => !m.archived),
    ...draft.eatingMoments
      .filter(
        (use) =>
          !momentOptions.some(
            (m) => m.id === use.eatingMomentId && !m.archived,
          ),
      )
      .map((use) => ({
        id: use.eatingMomentId,
        name:
          momentOptions.find((m) => m.id === use.eatingMomentId)?.name ??
          unknownMoment,
        archived: true,
      })),
  ];
  const momentNames = new Map(chipMoments.map((m) => [m.id, m.name]));
  const momentsFull = draft.eatingMoments.length >= MAX_EATING_MOMENTS;
  const pairingsFull = draft.pairings.length >= MAX_PAIRINGS;
  const ChevronIcon = open && reduceMotion ? ChevronUpIcon : ChevronDownIcon;

  return (
    <Card
      component="section"
      aria-label={t('recipes:family.guidanceCard.title')}
      sx={{ p: 0 }}
    >
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 1, px: '16px', py: '6px' }}
      >
        <Box
          component="button"
          type="button"
          ref={toggleRef}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
          sx={{
            ...bareButtonSx,
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, fontSize: 15 }}>
              {t('recipes:family.guidanceCard.title')}
            </Typography>
            <Typography
              variant="meta"
              color={hasProblem ? 'error' : 'text.secondary'}
            >
              {hasProblem ? t('recipes:family.guidanceCard.problem') : subline}
            </Typography>
          </Box>
          <Box
            aria-hidden
            sx={{
              display: 'flex',
              flexShrink: 0,
              transform:
                open && !reduceMotion ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: reduceMotion ? 'none' : 'transform 200ms',
            }}
          >
            <ChevronIcon size={18} />
          </Box>
        </Box>
        {suggestion.allFilled ? null : (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <CreditPrice
              kind="guidance"
              id={priceId}
              sx={{ fontSize: 12, color: 'text.secondary' }}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={suggestion.working}
              aria-describedby={price ? priceId : undefined}
              onClick={() => {
                setOpen(true);
                suggestion.suggest();
              }}
            >
              {suggestion.working
                ? t('recipes:family.guidanceCard.suggesting')
                : t('recipes:family.guidanceCard.suggest')}
            </Button>
          </Stack>
        )}
      </Stack>
      <Typography
        role="status"
        variant="meta"
        color="text.secondary"
        sx={suggestion.filled.length > 0 ? { px: '16px', pb: 1 } : undefined}
      >
        {suggestion.filled.length > 0
          ? t('admin:recipe.guidance.suggest.added', {
              fields: suggestion.filled
                .map((field) =>
                  t(`admin:recipe.guidance.suggest.fields.${field}`),
                )
                .join(', '),
            })
          : null}
      </Typography>
      <Stack
        id={bodyId}
        hidden={!open}
        spacing={2}
        sx={{ px: '16px', pb: '16px', display: open ? 'flex' : 'none' }}
      >
        <Stack component="fieldset" spacing={1} sx={fieldsetReset}>
          <Typography
            component="legend"
            variant="sectionLabel"
            color="text.secondary"
          >
            {t('admin:recipe.guidance.pairings.title')}
          </Typography>
          {nothing('pairings')}
          {draft.pairings.map((pairing, index) =>
            editing === pairing.key ? (
              <Stack key={pairing.key} spacing={1}>
                <PairingRow
                  pairing={pairing}
                  position={index + 1}
                  first={index === 0}
                  last={index === draft.pairings.length - 1}
                  RecipePicker={RecipePicker}
                  onChange={(patch) => patchPairing(pairing.key, patch)}
                  onMove={(offset) => {
                    const next = [...draft.pairings];
                    const target = index + offset;
                    [next[index], next[target]] = [next[target]!, next[index]!];
                    change({ pairings: next });
                  }}
                  onRemove={() => {
                    setEditing(null);
                    removePairing(pairing.key);
                  }}
                />
                <div>
                  <Button variant="ghost" onClick={() => setEditing(null)}>
                    {t('recipes:family.guidanceCard.donePairing')}
                  </Button>
                </div>
              </Stack>
            ) : (
              <Stack
                key={pairing.key}
                direction="row"
                sx={{ alignItems: 'center', gap: 1 }}
              >
                <Box
                  component="button"
                  type="button"
                  aria-label={t('recipes:family.guidanceCard.editPairing', {
                    label:
                      pairing.label.trim() ||
                      t('admin:recipe.guidance.pairings.heading', {
                        position: index + 1,
                      }),
                  })}
                  onClick={() => setEditing(pairing.key)}
                  sx={{ ...bareButtonSx, flex: 1, minWidth: 0 }}
                >
                  <Typography sx={{ fontWeight: 600, fontSize: 15 }} noWrap>
                    {pairing.label.trim() ||
                      t('admin:recipe.guidance.pairings.heading', {
                        position: index + 1,
                      })}
                    {pairing.suggested ? <SuggestedMark /> : null}
                  </Typography>
                  <Typography variant="meta" color="text.secondary" noWrap>
                    {[
                      pairing.kind === 'food'
                        ? t('admin:recipe.guidance.pairings.kindFood')
                        : t('admin:recipe.guidance.pairings.kindDrink'),
                      pairing.reason.trim(),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Typography>
                </Box>
                <IconButton
                  tone="plain"
                  size={40}
                  label={t('admin:recipe.guidance.pairings.remove', {
                    position: index + 1,
                  })}
                  onClick={() => removePairing(pairing.key)}
                >
                  <CloseIcon size={16} />
                </IconButton>
              </Stack>
            ),
          )}
          {problems.pairing ? (
            <Typography variant="body2" color="error">
              {t('admin:recipe.guidance.pairings.invalid')}
            </Typography>
          ) : null}
          {problems.linkPosition !== null ? (
            <Typography variant="body2" color="error">
              {t('admin:recipe.guidance.pairings.linkIncomplete', {
                position: problems.linkPosition,
              })}
            </Typography>
          ) : null}
          {pairingsFull ? (
            <Typography variant="body2" color="text.secondary">
              {t('admin:recipe.guidance.pairings.limit', { max: MAX_PAIRINGS })}
            </Typography>
          ) : (
            <div>
              <Button
                variant="ghost"
                onClick={() => {
                  const added = emptyPairing();
                  change({ pairings: [...draft.pairings, added] });
                  setEditing(added.key);
                }}
              >
                {t('admin:recipe.guidance.pairings.add')}
              </Button>
            </div>
          )}
        </Stack>

        <Stack component="fieldset" spacing={1} sx={fieldsetReset}>
          <Typography
            component="legend"
            variant="sectionLabel"
            color="text.secondary"
          >
            {t('admin:recipe.guidance.eatingMoments.title')}
          </Typography>
          <Typography variant="meta" color="text.secondary">
            {t('recipes:family.guidanceCard.momentHint')}
          </Typography>
          {nothing('eatingMoments')}
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {chipMoments.map((m) => {
              const use = draft.eatingMoments.find(
                (u) => u.eatingMomentId === m.id,
              );
              const state = !use
                ? t('recipes:family.guidanceCard.notSet')
                : use.polarity === 'good_for'
                  ? t('admin:recipe.guidance.eatingMoments.goodFor')
                  : t('admin:recipe.guidance.eatingMoments.avoid');
              return (
                <Chip
                  key={m.id}
                  label={m.name}
                  selected={Boolean(use)}
                  aria-label={`${m.name}: ${state}`}
                  disabled={!use && momentsFull}
                  icon={
                    use?.polarity === 'good_for' ? (
                      <CheckIcon />
                    ) : use ? (
                      <CloseIcon />
                    ) : undefined
                  }
                  sx={
                    use?.polarity === 'avoid'
                      ? {
                          backgroundColor: tokens.color.soonBg,
                          color: tokens.color.soonFg,
                          '& .chip-icon': { color: tokens.color.soonFg },
                        }
                      : undefined
                  }
                  onClick={() => cycle(m.id)}
                />
              );
            })}
          </Stack>
          {momentsFull ? (
            <Typography variant="body2" color="text.secondary">
              {t('admin:recipe.guidance.eatingMoments.limit', {
                max: MAX_EATING_MOMENTS,
              })}
            </Typography>
          ) : null}
          {draft.eatingMoments.map((use) => {
            const name = momentNames.get(use.eatingMomentId) ?? unknownMoment;
            return (
              <Stack key={use.eatingMomentId} spacing={0.5}>
                {use.suggested ? (
                  <Typography variant="meta">
                    {name}
                    <SuggestedMark />
                  </Typography>
                ) : null}
                <TextField
                  label={t('admin:recipe.guidance.eatingMoments.reason', {
                    name,
                  })}
                  value={use.reason}
                  onChange={(event) =>
                    patchMoment(use.eatingMomentId, {
                      reason: event.target.value,
                    })
                  }
                  multiline
                />
              </Stack>
            );
          })}
        </Stack>

        <Stack component="fieldset" spacing={1} sx={fieldsetReset}>
          <Typography
            component="legend"
            variant="sectionLabel"
            color="text.secondary"
          >
            {t('admin:recipe.guidance.nutrition.title')}
            {draft.nutritionNoteSuggested ? <SuggestedMark /> : null}
          </Typography>
          <TextField
            label={t('admin:recipe.guidance.nutrition.label')}
            value={draft.nutritionNote}
            onChange={(event) =>
              change({
                nutritionNote: event.target.value,
                nutritionNoteSuggested: false,
              })
            }
            error={problems.note}
            helperText={t('admin:recipe.guidance.nutrition.helper')}
            multiline
            minRows={2}
          />
          <Typography
            variant="meta"
            color={problems.note ? 'error' : 'text.secondary'}
          >
            {t('admin:recipe.guidance.nutrition.counter', {
              count: noteLength(draft.nutritionNote),
              max: MAX_NUTRITION_NOTE,
            })}
          </Typography>
          {problems.note ? (
            <Typography variant="body2" color="error">
              {t('admin:recipe.guidance.nutrition.tooLong', {
                max: MAX_NUTRITION_NOTE,
              })}
            </Typography>
          ) : null}
          {nothing('nutritionNote')}
        </Stack>
      </Stack>
    </Card>
  );
}
