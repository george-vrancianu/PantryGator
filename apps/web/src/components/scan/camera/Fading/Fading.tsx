import { Box } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';

const FADE_MS = 200;

type Props = {
  /** Faded out and out of the tab order and the accessibility tree, but still taking its space. */
  hidden: boolean;
  children: ReactNode;
  /** The grid cell's own alignment. */
  justify?: 'start' | 'center' | 'end';
};

/**
 * A control that is not offered in some modes (Import and the Scan Language chip in Barcode or
 * Plate): it fades out over 200 ms, cannot be focused or tapped, and keeps its place so nothing
 * around it moves.
 */
export function Fading({ hidden, children, justify = 'center' }: Props) {
  return (
    <Box
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      sx={{
        display: 'flex',
        justifyContent: justify,
        alignItems: 'center',
        opacity: hidden ? 0 : 1,
        visibility: hidden ? 'hidden' : 'visible',
        transition: `opacity ${FADE_MS}ms, visibility 0s linear ${hidden ? `${FADE_MS}ms` : '0s'}`,
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {children}
    </Box>
  );
}
