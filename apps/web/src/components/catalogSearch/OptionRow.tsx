import { Box, tokens, radius } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';

export type OptionRowProps = {
  id: string;
  /** Keyboard-highlighted. */
  active: boolean;
  /** The first option has no rule above it. */
  first: boolean;
  /** Rule above the row; a dashed one sets "Use as typed" apart from the results. */
  rule?: 'solid' | 'dashed';
  /** Faded while newer results load. */
  dimmed?: boolean;
  /** Accessible name, when the content alone does not spell it out. */
  label?: string;
  onSelect: () => void;
  children: ReactNode;
};

/** The shell of one listbox option: the li, tap guard, hover, and the active bar. */
export function OptionRow({
  id,
  active,
  first,
  rule = 'solid',
  dimmed = false,
  label,
  onSelect,
  children,
}: OptionRowProps) {
  const { color } = tokens;
  return (
    <Box
      component="li"
      id={id}
      role="option"
      aria-selected={active}
      aria-label={label}
      data-dimmed={dimmed ? 'true' : undefined}
      // Keep focus in the input so the tap still lands.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
      sx={{
        position: 'relative',
        minHeight: 58,
        p: '9px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        cursor: 'pointer',
        backgroundColor: active ? color.subtle : 'transparent',
        borderTop: first
          ? 0
          : rule === 'dashed'
            ? `1px dashed ${color.tickBorder}`
            : `1px solid ${color.divider}`,
        opacity: dimmed ? 0.72 : 1,
        transition: 'opacity 200ms',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        '&:hover': { backgroundColor: color.subtle },
        ...(active
          ? {
              '&::before': {
                content: '""',
                position: 'absolute',
                left: 0,
                top: 10,
                bottom: 10,
                width: 3,
                borderRadius: radius.tag,
                backgroundColor: color.accent,
              },
            }
          : {}),
        outline: 'none',
      }}
    >
      {children}
    </Box>
  );
}
