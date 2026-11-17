// PROTOTYPE: how should an Ingredient open on Pantry? Never merge into main.
// Four variants on the real /pantry route, switched with `?open=`:
//   lift  : today's behaviour (margin + grid-row grow + staggered Batch rows), the baseline.
//   ring  : no lift, no grow. An accent ring fades in on the row's own border; Batches sit on a tint and fade in as one.
//   sweep : no lift, no grow. Same ring and tint; one soft light sweeps across the Batches as they appear.
//   rail  : no lift, no grow, no ring. An accent rail on the left edge; Batch rows fade in one after another, alternating tint.
// Every non-baseline variant animates opacity/transform only, so nothing is laid out per frame,
// and the open block keeps its exact size and place, so the rows below move once, not progressively.
import { border, color, radius, shadow, tokens } from '@pocket-pantry/ui';
import { useSearchParams } from 'react-router-dom';
import { keyframesSx } from '../../../lib/keyframesSx';

export const OPEN_VARIANTS = [
  { key: 'lift', name: 'today: lift + grow' },
  { key: 'ring', name: 'ring + tint fade' },
  { key: 'sweep', name: 'ring + tint + light sweep' },
  { key: 'rail', name: 'left rail + row cascade' },
] as const;
export type OpenVariant = (typeof OPEN_VARIANTS)[number]['key'];

export function useOpenVariant(): OpenVariant {
  const [params] = useSearchParams();
  const value = params.get('open');
  return OPEN_VARIANTS.some((variant) => variant.key === value)
    ? (value as OpenVariant)
    : 'lift';
}

const tint = (percent: number) =>
  `color-mix(in srgb, ${tokens.color.accentTint} ${percent}%, ${color.cardBg})`;

/** The row's block when it never lifts: card-stack edges stay put, the highlight is an overlay. */
export function flatBlockSx(
  variant: Exclude<OpenVariant, 'lift'>,
  { open, first, last }: { open: boolean; first: boolean; last: boolean },
) {
  const top = first ? radius.card : 0;
  const bottom = last ? radius.card : 0;
  return {
    position: 'relative',
    zIndex: open ? 2 : 'auto',
    overflow: 'hidden',
    bgcolor: color.cardBg,
    borderStyle: 'solid',
    borderLeftWidth: border.width,
    borderRightWidth: border.width,
    borderLeftColor: color.cardLine,
    borderRightColor: color.cardLine,
    borderTopWidth: first ? border.width : '1px',
    borderTopColor: first ? color.cardLine : tokens.color.divider,
    borderBottomWidth: last ? border.width : 0,
    borderBottomColor: color.cardLine,
    borderTopLeftRadius: top,
    borderTopRightRadius: top,
    borderBottomRightRadius: bottom,
    borderBottomLeftRadius: bottom,
    boxShadow: shadow.card,
    // The highlight paints above the children (an inset box-shadow would sit under their backgrounds).
    '&::after': {
      content: '""',
      position: 'absolute',
      pointerEvents: 'none',
      zIndex: 3,
      opacity: open ? 1 : 0,
      transition: 'opacity 180ms ease-out',
      ...(variant === 'rail'
        ? {
            top: 0,
            bottom: 0,
            left: 0,
            width: '4px',
            bgcolor: tokens.color.accent,
          }
        : {
            inset: 0,
            borderRadius: 'inherit',
            border: `1.5px solid ${tokens.color.accent}`,
          }),
    },
    '@media (prefers-reduced-motion: reduce)': {
      '&::after': { transition: 'none' },
    },
  } as const;
}

/** The open body (the Batches and the action row) for a flat variant: no grow, it is just there. */
export function flatBodySx(variant: Exclude<OpenVariant, 'lift'>) {
  if (variant === 'ring')
    return {
      bgcolor: tint(35),
      ...keyframesSx('pp-open-fade', '160ms ease-out both', {
        from: { opacity: 0 },
        to: { opacity: 1 },
      }),
    };
  if (variant === 'sweep')
    return {
      position: 'relative',
      isolation: 'isolate',
      overflow: 'hidden',
      bgcolor: tint(35),
      ...keyframesSx('pp-open-fade', '140ms ease-out both', {
        from: { opacity: 0 },
        to: { opacity: 1 },
      }),
      '&::before': {
        content: '""',
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        pointerEvents: 'none',
        background: `linear-gradient(100deg, transparent 30%, color-mix(in srgb, ${tokens.color.accentTint} 90%, white) 50%, transparent 70%)`,
        transform: 'translateX(-100%)',
        willChange: 'transform',
        ...keyframesSx(
          'pp-open-sweep',
          '650ms cubic-bezier(.4,0,.2,1) 60ms both',
          {
            from: { transform: 'translateX(-100%)', opacity: 0.9 },
            to: { transform: 'translateX(100%)', opacity: 0 },
          },
        ),
      },
    };
  return { bgcolor: color.cardBg };
}

/** One Batch row's look in a flat variant. */
export function flatBatchSx(
  variant: Exclude<OpenVariant, 'lift'>,
  index: number,
) {
  if (variant === 'rail')
    return {
      bgcolor: index % 2 === 0 ? tint(45) : tint(25),
      ...keyframesSx(
        'pp-batch-cascade',
        `180ms ease-out ${index * 40}ms both`,
        {
          from: { opacity: 0, transform: 'translateX(-6px)' },
          to: { opacity: 1, transform: 'none' },
        },
      ),
    };
  // ring / sweep: the body fades; each row repeats the tint because SwipeRow paints its own surface.
  return { bgcolor: tint(35) };
}
