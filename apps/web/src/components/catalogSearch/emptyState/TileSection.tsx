import { Box, tokens } from '@pocket-pantry/ui';
import { Children, useId, type ReactNode } from 'react';

/** An empty-state block shows at most this many tiles; the rest are reached by typing. */
export const MAX_TILES = 8;

export type TileSectionProps = {
  heading: string;
  /** Shown at the right of the heading, when given. */
  count?: number;
  /** A control beside the heading, e.g. a link to manage the list. */
  action?: ReactNode;
  /** Shown instead of the grid when there are no tiles, e.g. "Nothing has run out or expired. Nice." */
  none?: string;
  /** The tiles; only the first 8 are shown. */
  children?: ReactNode;
};

/** A labelled section holding a two-column grid of empty-state tiles. */
export function TileSection({
  heading,
  count,
  action,
  none,
  children,
}: TileSectionProps) {
  const headingId = useId();
  const { color } = tokens;
  const tiles = Children.toArray(children).slice(0, MAX_TILES);
  return (
    <Box component="section" aria-labelledby={headingId}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          m: '12px 2px 4px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: color.muted,
        }}
      >
        <Box
          component="h3"
          id={headingId}
          sx={{ m: 0, font: 'inherit', letterSpacing: 'inherit' }}
        >
          {heading}
        </Box>
        {count !== undefined || action ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {count !== undefined ? (
              <Box
                component="span"
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: 'normal',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {count}
              </Box>
            ) : null}
            {action}
          </Box>
        ) : null}
      </Box>
      {tiles.length === 0 && none ? (
        <Box sx={{ p: '4px 2px 14px', fontSize: 13, color: color.muted }}>
          {none}
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '10px',
            pb: '14px',
          }}
        >
          {tiles}
        </Box>
      )}
    </Box>
  );
}
