import {
  BatteryLowIcon,
  Box,
  PlusIcon,
  StapleStar,
  border,
  color,
  focusRing,
  radius,
  tokens,
} from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { StapleToggleState } from '@/components/lists/useStapleToggle';
import { keyframesSx } from '../../../lib/keyframesSx';

type Props = {
  /** The Ingredient's name, for the Add batch label. */
  name: string;
  /** An Unmatched Ingredient has no Staple or Running low: only Add batch. */
  unmatched: boolean;
  /** The row's Staple state and toggle, which says so in a toast once saved. */
  staple: StapleToggleState;
  runningLow: boolean;
  /** Flip Running low; the row sends it and says so. */
  onToggleLow: () => void;
  /** Open the Add batch form with this Ingredient already picked. */
  onAddBatch: () => void;
};

/**
 * The action row at the bottom of an open Ingredient's card: a Staple chip and a Running low chip
 * (matched Ingredients only), then a round Add batch button. Each chip flips at once and says so in a
 * toast with no Undo (Pantry batches handoff, section 3).
 */
export function IngredientActions({
  name,
  unmatched,
  staple,
  runningLow,
  onToggleLow,
  onAddBatch,
}: Props) {
  const { t } = useTranslation('pantry');

  return (
    <Box
      sx={{
        display: 'flex',
        gap: '8px',
        p: '10px 12px',
        borderTop: `1px solid ${tokens.color.divider}`,
        ...keyframesSx('pp-actions-in', '200ms 120ms both', {
          from: { opacity: 0 },
        }),
      }}
    >
      {unmatched ? null : (
        <>
          {/* Named by its label, "Make Staple" or "Staple", and pressed while it is one. */}
          <ActionChip
            pressed={staple.isStaple}
            tone="staple"
            ariaDisabled={!staple.ready}
            onClick={staple.toggle}
            icon={<StapleStar on={staple.isStaple} />}
          >
            {t(staple.isStaple ? 'group.staple' : 'group.makeStaple')}
          </ActionChip>
          <ActionChip
            pressed={runningLow}
            tone="low"
            onClick={onToggleLow}
            icon={<BatteryLowIcon size={16} strokeWidth={2.2} />}
          >
            {t('group.runningLow')}
          </ActionChip>
        </>
      )}
      <Box
        component="button"
        type="button"
        aria-label={t('group.addBatch', { name })}
        onClick={onAddBatch}
        sx={[
          actionButtonSx,
          {
            flex: '0 0 38px',
            width: 38,
            p: 0,
            ml: 'auto',
            borderRadius: '50%',
            borderColor: 'transparent',
            bgcolor: tokens.color.accentTint,
            color: tokens.color.accentOnTint,
          },
        ]}
      >
        <PlusIcon size={16} strokeWidth={2.4} />
      </Box>
    </Box>
  );
}

/** What the chips and the Add batch button share: 38 tall, outlined, pressing in to .96. */
const actionButtonSx = {
  height: 38,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: `${border.width} solid ${color.lineStrong}`,
  font: 'inherit',
  cursor: 'pointer',
  transition: 'background-color .15s, color .15s, transform 80ms',
  '&:active': { transform: 'scale(.96)' },
  '& svg': { flex: '0 0 auto' },
  ...focusRing,
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
} as const;

/** Each chip's fill while pressed. */
const PRESSED_FILL = {
  staple: {
    bgcolor: tokens.color.accentTint,
    color: tokens.color.accentOnTint,
    '& svg': { color: 'pp.star' },
  },
  low: { bgcolor: tokens.color.butter, color: tokens.color.butterInk },
};

type ChipProps = {
  pressed: boolean;
  /** The chip's fill while pressed: accent tint with a star-coloured icon, or butter. */
  tone: keyof typeof PRESSED_FILL;
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  ariaDisabled?: boolean;
};

function ActionChip({
  pressed,
  tone,
  icon,
  children,
  onClick,
  ariaDisabled,
}: ChipProps) {
  return (
    <Box
      component="button"
      type="button"
      aria-pressed={pressed}
      aria-disabled={ariaDisabled || undefined}
      onClick={onClick}
      sx={[
        actionButtonSx,
        {
          flex: '1 1 0',
          minWidth: 0,
          px: '8px',
          gap: '6px',
          borderRadius: radius.chip,
          bgcolor: color.cardBg,
          color: tokens.color.ink,
          fontSize: 13,
          fontWeight: 700,
          whiteSpace: 'nowrap',
        },
        pressed && { borderColor: 'transparent', ...PRESSED_FILL[tone] },
      ]}
    >
      {icon}
      <Box
        component="span"
        sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {children}
      </Box>
    </Box>
  );
}
