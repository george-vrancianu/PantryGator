import {
  Box,
  CheckIcon,
  CloseIcon,
  InfoIcon,
  Tag,
  WarningIcon,
  palette,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { formatAmount } from '@/lib/amount';
import type { VoiceAnswer, VoiceAnswerKind } from '@/lib/voice';
import { IngredientIconSlot } from '@/components/catalog/IngredientIconSlot/IngredientIconSlot';
import { RunningLowChip } from '@/components/pantry/RunningLowChip/RunningLowChip';

/**
 * How each kind of answer looks: its mark and its words (voice namespace). The one place to add a
 * kind: a new member of `VoiceAnswer` needs an entry here, and a detail line when it carries more.
 */
const ANSWER: Record<
  VoiceAnswerKind,
  { icon: React.ReactNode; verdict: string; tone: string }
> = {
  yes: {
    icon: <CheckIcon size={18} />,
    verdict: 'answers.verdict.yes',
    tone: 'success-main',
  },
  onlyExpired: {
    icon: <WarningIcon size={18} />,
    verdict: 'answers.verdict.onlyExpired',
    tone: 'warning-main',
  },
  no: {
    icon: <CloseIcon size={18} />,
    verdict: 'answers.verdict.no',
    tone: 'text-secondary',
  },
  notSure: {
    icon: <InfoIcon size={18} />,
    verdict: 'answers.verdict.notSure',
    tone: 'text-secondary',
  },
};

/**
 * One Pantry answer as a list item: the Ingredient Icon and name, the verdict for its kind, then the
 * same details the Assistant speaks. Shared by the answer sheet and the answer card in Review; put it
 * in a list (`ul`).
 */
export function PantryAnswerRow({ answer }: { answer: VoiceAnswer }) {
  const { t, i18n } = useTranslation('voice');
  const look = ANSWER[answer.kind];
  const where =
    answer.kind === 'yes'
      ? [
          ...answer.totals.map(({ unit, quantity }) =>
            formatAmount(quantity, unit, i18n.language, t),
          ),
          ...answer.locations.map((location) =>
            t(`common:locations.${location}`),
          ),
        ].join(' · ')
      : '';
  return (
    <Box
      component="li"
      data-voice-answer={answer.id}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '11px',
        minHeight: 60,
        py: '9px',
        px: '12px',
        '& + &': { borderTop: `1px solid ${palette('divider')}` },
      }}
    >
      <IngredientIconSlot
        ingredientId={answer.ingredient?.id}
        aisleId={answer.ingredient?.parentCategory.aisle.id}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: 15, fontWeight: 600 }}>
          {answer.ingredient?.name ?? answer.name ?? answer.text}
        </Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: 13,
            color: palette(look.tone),
          }}
        >
          <Box component="span" aria-hidden sx={{ display: 'flex' }}>
            {look.icon}
          </Box>
          {t(look.verdict)}
        </Box>
        {where && (
          <Box sx={{ fontSize: 13, color: palette('text-secondary') }}>
            {where}
          </Box>
        )}
        {'onShoppingList' in answer && answer.onShoppingList && (
          <Box sx={{ fontSize: 13, color: palette('text-secondary') }}>
            {t('answers.onShoppingList')}
          </Box>
        )}
      </Box>
      {answer.kind === 'yes' && (answer.expiringSoon || answer.runningLow) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {answer.expiringSoon && (
            <Tag tone="soon">{t('answers.expiringSoon')}</Tag>
          )}
          {answer.runningLow && <RunningLowChip />}
        </Box>
      )}
    </Box>
  );
}
