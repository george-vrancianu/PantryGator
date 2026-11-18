import type { ReactNode } from 'react';
import { Box } from '../atoms/Layout';
import { StepNumber } from '../atoms/StepNumber';
import { insetFocusRing } from '../theme/focusRing';
import { palette } from '../theme/themeVars';

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
        typography: 'body2',
        fontWeight: 700,
        '&:hover': { bgcolor: palette('pp-subtle') },
      }}
    >
      <StepNumber dashed>{glyph}</StepNumber>
      {label}
    </Box>
  );
}
