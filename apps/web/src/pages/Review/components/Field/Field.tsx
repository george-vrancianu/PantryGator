import { Box, tokens, radius } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';

/** The 40 px, 12 px-radius control look shared by every input in the edit panel. */
export const controlSx = {
  boxSizing: 'border-box',
  width: '100%',
  height: 40,
  px: '12px',
  borderRadius: radius.control,
  border: `1px solid ${tokens.color.line}`,
  bgcolor: tokens.color.surface,
  color: tokens.color.ink,
  fontFamily: 'inherit',
  fontSize: 14,
  '&:focus-visible': {
    outline: `3px solid ${tokens.color.accent}`,
    outlineOffset: 1,
  },
} as const;

/** The small caption above each control in the edit panel. */
export const fieldLabelSx = {
  display: 'block',
  mb: '4px',
  fontSize: 11,
  fontWeight: 600,
  color: tokens.color.muted,
} as const;

type Props = {
  /** The id of the control inside, so the visible label is its accessible name. */
  htmlFor: string;
  label: string;
  /** Inline error text; the control points at it with `errorId`. */
  error?: string;
  errorId?: string;
  children: ReactNode;
};

/** The inline error text under a control. */
export function FieldError({
  id,
  children,
}: {
  id?: string;
  children: string;
}) {
  return (
    <Box id={id} sx={{ mt: '4px', fontSize: 12, color: tokens.color.urgentFg }}>
      {children}
    </Box>
  );
}

/** A labelled control with its inline error under it. */
export function Field({ htmlFor, label, error, errorId, children }: Props) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box
        component="label"
        id={`${htmlFor}-label`}
        htmlFor={htmlFor}
        sx={fieldLabelSx}
      >
        {label}
      </Box>
      {children}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </Box>
  );
}
