import type { ReactNode } from 'react';
import { Box } from '../atoms/Layout';
import { Card, type CardProps } from '../atoms/Card';
import { StepNumber } from '../atoms/StepNumber';
import { insetFocusRing } from '../theme/focusRing';
import { palette } from '../theme/themeVars';

/** A hairline between the card's blocks (its direct children, and the items of a list inside it). */
const divided = {
  '& > * + *, & > ol > li + li': {
    borderTop: `1px solid ${palette('divider')}`,
  },
};

/**
 * The one card of a Recipe editor tab (Ingredients, Steps): no padding of its own, its blocks
 * (rows, a list, an add row) sit edge to edge, separated by hairlines. Rows set their own padding.
 */
export function EditorCard({ sx, ...props }: CardProps) {
  return (
    <Card
      variant="list"
      sx={[
        { p: 0, overflow: 'hidden' },
        divided,
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    />
  );
}

export type AddRowProps = {
  label: ReactNode;
  onClick: () => void;
  /** The glyph in the dashed circle; a "+" by default. */
  glyph?: ReactNode;
};

/**
 * An "add" row drawn like a row of the list it belongs to: a dashed accent circle with a "+", then
 * the label in the accent, 48 pt high.
 */
export function AddRow({ label, onClick, glyph = '+' }: AddRowProps) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
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
        color: palette('pp-accent'),
        fontSize: 14.5,
        fontWeight: 700,
        '&:hover': { bgcolor: palette('pp-subtle') },
      }}
    >
      <StepNumber dashed>{glyph}</StepNumber>
      {label}
    </Box>
  );
}
