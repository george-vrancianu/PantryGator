import { border, color, palette, radius, shadow } from '@pocket-pantry/ui';
import { keyframesSx } from '../../../lib/keyframesSx';

/** The open Ingredient's Batch rows: a light accent tint, alternating so they read as separate rows. */
const batchTint = (index: number) =>
  `color-mix(in srgb, ${palette('pp-accentTint')} ${index % 2 === 0 ? 45 : 25}%, ${color.cardBg})`;

type Block = { open: boolean; first: boolean; last: boolean };

/**
 * One Ingredient row as a block of its Location card. Opening it moves nothing: the block keeps its edges
 * and corners, and an accent rail fades in on its left edge. Only opacity animates, so the list is laid out
 * once when the Batches appear, not on every frame.
 */
export function ingredientBlockSx({ open, first, last }: Block) {
  const top = first ? radius.card : 0;
  const bottom = last ? radius.card : 0;
  return {
    position: 'relative',
    overflow: 'hidden',
    bgcolor: color.cardBg,
    // Longhands: jsdom drops shorthands that hold `var()`.
    borderStyle: 'solid',
    borderLeftWidth: border.width,
    borderRightWidth: border.width,
    borderLeftColor: color.cardLine,
    borderRightColor: color.cardLine,
    // Inside the card, a divider; on the card's top edge, its own line.
    borderTopWidth: first ? border.width : '1px',
    borderTopColor: first ? color.cardLine : palette('divider'),
    borderBottomWidth: last ? border.width : 0,
    borderBottomColor: color.cardLine,
    borderTopLeftRadius: top,
    borderTopRightRadius: top,
    borderBottomRightRadius: bottom,
    borderBottomLeftRadius: bottom,
    boxShadow: shadow.card,
    // The rail paints above the rows, which fill their own backgrounds.
    '&::after': {
      content: '""',
      position: 'absolute',
      zIndex: 3,
      top: 0,
      bottom: 0,
      left: 0,
      width: '4px',
      pointerEvents: 'none',
      bgcolor: palette('pp-accent'),
      opacity: open ? 1 : 0,
      transition: 'opacity 180ms ease-out',
    },
    '@media (prefers-reduced-motion: reduce)': {
      '&::after': { transition: 'none' },
    },
  } as const;
}

/** A Batch row of the open Ingredient: its tint, and it fades in from the left a beat after the one above. */
export function batchRowSx(index: number) {
  return {
    bgcolor: batchTint(index),
    ...keyframesSx('pp-batch-in', `180ms ease-out ${index * 40}ms both`, {
      from: { opacity: 0, transform: 'translateX(-6px)' },
      to: { opacity: 1, transform: 'none' },
    }),
  };
}
