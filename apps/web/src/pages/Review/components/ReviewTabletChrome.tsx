import { Box, Button, tokens, displayType, radius } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { COUNTER_TONE, type Counts } from './ReviewCounters';

/** The tablet header's three counter chips: one row beside the title instead of the phone's tiles. */
export function ReviewCounterChips({ save, check, excluded }: Counts) {
  const { t } = useTranslation('review');
  const chips = [
    { key: 'save', value: save },
    { key: 'check', value: check },
    { key: 'excluded', value: excluded },
  ] as const;
  return (
    <Box sx={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
      {chips.map((chip) => (
        <Box
          key={chip.key}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            height: 36,
            px: '14px',
            boxSizing: 'border-box',
            borderRadius: radius.card,
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            ...COUNTER_TONE[chip.key],
          }}
        >
          <Box
            component="span"
            sx={{
              ...displayType,
              fontSize: 16,
            }}
          >
            {chip.value}
          </Box>
          {t(`counter.${chip.key}`)}
        </Box>
      ))}
    </Box>
  );
}

type FooterProps = {
  saveLabel: string;
  canSave: boolean;
  onSave: () => void;
  onDiscard: () => void;
};

/** Under the table, in the page flow: helper text on the left, Discard and Save on the right. No sticky bar on tablet. */
export function ReviewTabletFooter({
  saveLabel,
  canSave,
  onSave,
  onDiscard,
}: FooterProps) {
  const { t } = useTranslation('review');
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        mt: '20px',
      }}
    >
      <Box sx={{ fontSize: 13, color: tokens.color.muted }}>
        {t('footer.helper')}
      </Box>
      <Box sx={{ display: 'flex', gap: '10px' }}>
        <Button
          variant="ghost"
          onClick={onDiscard}
          sx={{
            height: 52,
            bgcolor: tokens.color.surface,
            border: `1px solid ${tokens.color.line}`,
            color: tokens.color.ink,
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          {t('discard')}
        </Button>
        <Button
          onClick={onSave}
          disabled={!canSave}
          sx={{ fontSize: 15, fontWeight: 700 }}
        >
          {saveLabel}
        </Button>
      </Box>
    </Box>
  );
}
