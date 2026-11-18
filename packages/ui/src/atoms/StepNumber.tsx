import type { ReactNode } from 'react';
import { displayType } from '../theme/themeVars';
import { tokens } from '../theme/tokens';
import { Box } from './Layout';

export type StepNumberProps = {
  children: ReactNode;
  /** The dashed accent outline of an "add" row, instead of the filled ink disc. */
  dashed?: boolean;
};

/** The round Step number glyph shared by the Recipe detail page and the Steps editor. */
export function StepNumber({ children, dashed = false }: StepNumberProps) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        flex: '0 0 28px',
        height: 28,
        borderRadius: '50%',
        bgcolor: dashed ? 'transparent' : tokens.color.ink,
        color: dashed ? tokens.color.accent : tokens.color.surface,
        border: dashed ? `1.5px dashed ${tokens.color.accent}` : 0,
        boxSizing: 'border-box',
        display: 'grid',
        placeItems: 'center',
        ...displayType,
        fontSize: 14,
      }}
    >
      {children}
    </Box>
  );
}
