import { Box, tokens } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';

type Props = {
  id: string;
  children: ReactNode;
  /** Follows the title inside the heading ("All recipes · 12"), so it is part of the heading's name. */
  count?: number;
  /** Right-aligned beside the heading (a link). */
  end?: ReactNode;
};

/** A small caps heading with its count after the title and an optional right-aligned link. */
export function SectionLabel({ id, children, count, end }: Props) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: '12px',
        mb: '8px',
      }}
    >
      <Box
        component="h2"
        id={id}
        sx={{
          m: 0,
          flex: 1,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: tokens.color.muted,
        }}
      >
        {children}
        {count === undefined ? null : ` · ${count}`}
      </Box>
      {end}
    </Box>
  );
}
