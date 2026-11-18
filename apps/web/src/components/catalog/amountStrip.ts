import { color, insetFocusRing, palette } from '@pocket-pantry/ui';

/** The divider between two segments of the amount field's strip, in px: the strip's line colour shows through the gap. */
export const STRIP_DIVIDER = 1;

/** The amount field's second row: segments edge to edge, a divider between each two. */
export const stripSx = {
  display: 'flex',
  gap: `${STRIP_DIVIDER}px`,
  height: '100%',
  overflow: 'hidden',
  backgroundColor: palette('pp-line'),
} as const;

/** One segment of the strip: a unit toggle or a Usual Amount value. */
export const segmentSx = (selected: boolean) =>
  ({
    flex: '1 1 auto',
    minWidth: 44,
    height: '100%',
    px: '10px',
    border: 0,
    borderRadius: 0,
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 14,
    fontWeight: selected ? 700 : 600,
    fontVariantNumeric: 'tabular-nums',
    backgroundColor: selected ? palette('pp-accent') : color.fieldBg,
    color: selected ? color.accentInk : palette('text-primary'),
    transition: 'background-color .12s, color .12s',
    '&[hidden]': { display: 'none' },
    ...insetFocusRing,
    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
  }) as const;
