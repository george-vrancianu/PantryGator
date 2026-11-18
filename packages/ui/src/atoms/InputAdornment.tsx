import MuiInputAdornment from '@mui/material/InputAdornment';
import type { ReactNode } from 'react';
import { palette } from '../theme/themeVars';

export type InputAdornmentProps = {
  /** Which side of the input the adornment sits on. */
  position: 'start' | 'end';
  children: ReactNode;
};

/** A muted icon or text inside a TextField's edge. */
export function InputAdornment({ position, children }: InputAdornmentProps) {
  return (
    <MuiInputAdornment
      position={position}
      sx={{ color: palette('text-secondary') }}
    >
      {children}
    </MuiInputAdornment>
  );
}
