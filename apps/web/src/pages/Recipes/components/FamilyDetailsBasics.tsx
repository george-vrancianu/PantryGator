import {
  Box,
  Stack,
  Typography,
  bodyFont,
  border,
  color,
  displayType,
  radius,
  tokens,
} from '@pocket-pantry/ui';
import { useId, type ChangeEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RecipeTagsField } from '@/components/recipeEditor/RecipeTagsField/RecipeTagsField';
import type { DraftProblems, RecipeDraft } from '../../../lib/recipeDraft';
import { DIFFICULTIES, type Difficulty } from '../../../lib/recipeVocabulary';

type Props = {
  draft: RecipeDraft;
  problems: DraftProblems;
  /** The line under the title until it is wrong: what the draft is. */
  hint?: string;
  /** Right under the title and its hint: Base Recipe card or the Variant row. */
  belowTitle?: ReactNode;
  showTitleError: boolean;
  onChange: (patch: Partial<RecipeDraft>) => void;
  onTitleBlur: () => void;
};

type FactKey = 'servings' | 'prepMinutes' | 'cookMinutes';

const cellSx = (invalid: boolean) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minWidth: 0,
  px: '6px',
  py: '8px',
  textAlign: 'center',
  backgroundColor: color.fieldBg,
  border: `${border.field} solid ${invalid ? tokens.color.urgentFg : tokens.color.line}`,
  borderRadius: radius.control,
  '&:focus-within': {
    borderColor: invalid ? tokens.color.urgentFg : tokens.color.accent,
    boxShadow: `0 0 0 3px ${tokens.color.accentTint}`,
  },
});

const cellLabelSx = {
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: tokens.color.muted,
} as const;

const cellUnitSx = { ...cellLabelSx, textTransform: 'none' } as const;

const cellValueSx = {
  width: '100%',
  minWidth: 0,
  p: 0,
  border: 0,
  outline: 0,
  background: 'transparent',
  font: 'inherit',
  fontSize: 19,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'center',
  color: tokens.color.ink,
} as const;

/** Details basics of a Family Recipe draft: the title, the facts strip (Serves, Prep, Cook, Level) and Tags. */
export function FamilyDetailsBasics({
  draft,
  problems,
  hint,
  belowTitle,
  showTitleError,
  onChange,
  onTitleBlur,
}: Props) {
  const { t } = useTranslation(['admin', 'recipes']);
  const messageId = useId();
  const titleMsgId = useId();

  const levels: (Difficulty | '')[] = ['', ...DIFFICULTIES];
  const nextLevel = () =>
    onChange({
      difficulty:
        levels[(levels.indexOf(draft.difficulty) + 1) % levels.length],
    });
  const levelText = draft.difficulty
    ? t(`recipes:difficulty.${draft.difficulty}`)
    : t('admin:recipe.fields.difficultyNone');

  // One message at a time, in the order of the cells.
  const factsMessage: { key: FactKey; text: string } | null = problems.servings
    ? {
        key: 'servings',
        text:
          draft.servings.trim() === ''
            ? t('recipes:family.details.servesRequired')
            : t('admin:recipe.invalid.servings'),
      }
    : problems.prepMinutes
      ? { key: 'prepMinutes', text: t('admin:recipe.invalid.minutes') }
      : problems.cookMinutes
        ? { key: 'cookMinutes', text: t('admin:recipe.invalid.minutes') }
        : null;

  const numberCell = (
    key: FactKey,
    label: string,
    placeholder: string,
    unit?: string,
  ) => {
    const hasMessage = factsMessage?.key === key;
    return (
      <Box
        component="label"
        data-invalid={hasMessage ? 'true' : undefined}
        sx={cellSx(hasMessage)}
      >
        <Box component="span" sx={cellLabelSx}>
          {label}
        </Box>
        <Box
          component="input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={label}
          aria-invalid={problems[key] ? true : undefined}
          aria-describedby={hasMessage ? messageId : undefined}
          placeholder={placeholder}
          value={draft[key]}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onChange({ [key]: event.target.value })
          }
          sx={cellValueSx}
        />
        <Box component="span" sx={cellUnitSx}>
          {unit ?? ' '}
        </Box>
      </Box>
    );
  };

  const minutes = t('recipes:minutesShort');
  return (
    <Stack spacing={2.5}>
      <Box>
        <Box
          component="input"
          type="text"
          required
          autoComplete="off"
          aria-label={t('recipes:family.title')}
          aria-invalid={showTitleError ? true : undefined}
          aria-describedby={showTitleError || hint ? titleMsgId : undefined}
          placeholder={t('recipes:family.details.titlePlaceholder')}
          value={draft.title}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onChange({ title: event.target.value })
          }
          onBlur={onTitleBlur}
          sx={{
            ...displayType,
            display: 'block',
            width: '100%',
            p: 0,
            pb: '6px',
            border: 0,
            borderBottom: `${border.width} solid ${tokens.color.line}`,
            borderRadius: 0,
            outline: 0,
            background: 'transparent',
            fontSize: 28,
            fontWeight: 600,
            color: tokens.color.ink,
            '&:focus': { borderBottomColor: tokens.color.accent },
            '&::placeholder': { color: tokens.color.muted, opacity: 0.7 },
          }}
        />
        {showTitleError ? (
          <Typography
            id={titleMsgId}
            variant="caption"
            sx={{ display: 'block', mt: '6px', color: tokens.color.urgentFg }}
          >
            {t('admin:recipe.invalid.title')}
          </Typography>
        ) : hint ? (
          <Typography
            id={titleMsgId}
            variant="caption"
            sx={{ display: 'block', mt: '6px', color: tokens.color.muted }}
          >
            {hint}
          </Typography>
        ) : null}
      </Box>
      {belowTitle}
      <Box>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: '8px',
          }}
        >
          {numberCell('servings', t('recipes:facts.serves'), '4')}
          {numberCell(
            'prepMinutes',
            t('recipes:family.details.prep'),
            '–',
            minutes,
          )}
          {numberCell(
            'cookMinutes',
            t('recipes:family.details.cook'),
            '–',
            minutes,
          )}
          <Box
            component="button"
            type="button"
            aria-label={t('recipes:family.details.levelCycle', {
              value: levelText,
            })}
            onClick={nextLevel}
            sx={{
              ...cellSx(false),
              justifyContent: 'center',
              font: 'inherit',
              fontFamily: bodyFont,
              color: tokens.color.ink,
              cursor: 'pointer',
            }}
          >
            <Box component="span" sx={cellLabelSx}>
              {t('recipes:facts.level')}
            </Box>
            <Box
              component="span"
              sx={{
                fontSize: 19,
                fontWeight: 600,
                color: draft.difficulty ? tokens.color.ink : tokens.color.muted,
                opacity: draft.difficulty ? 1 : 0.6,
              }}
            >
              {levelText}
            </Box>
            <Box component="span" sx={cellUnitSx}>
              {' '}
            </Box>
          </Box>
        </Box>
        {factsMessage ? (
          <Typography
            id={messageId}
            variant="caption"
            sx={{ display: 'block', mt: '6px', color: tokens.color.urgentFg }}
          >
            {factsMessage.text}
          </Typography>
        ) : null}
      </Box>
      <RecipeTagsField
        scope="family"
        value={draft.tagIds}
        onChange={(tagIds) => onChange({ tagIds })}
      />
    </Stack>
  );
}
