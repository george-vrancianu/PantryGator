import { Box, canopy, displayType, radius, palette } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';

/**
 * A small pill holding a number: the Tags button's count (`solid`, on the accent; `gold` on the Canopy) and the relax
 * buttons' counts (`tint`). Decorative; the control it sits in carries the accessible name.
 */
export function CountBadge({
  tone,
  children,
}: {
  tone: 'solid' | 'tint' | 'gold';
  children: ReactNode;
}) {
  return (
    <Box
      component="span"
      aria-hidden={tone === 'tint' ? undefined : true}
      sx={{
        minWidth: 20,
        height: 20,
        px: '6px',
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.box,
        bgcolor:
          tone === 'gold'
            ? canopy.gold
            : tone === 'solid'
              ? palette('pp-accent')
              : palette('pp-accentTint'),
        color:
          tone === 'gold'
            ? canopy.goldInk
            : tone === 'solid'
              ? 'var(--mui-palette-pp-accentInk)'
              : palette('pp-accentOnTint'),
        fontFamily: tone === 'gold' ? displayType.fontFamily : undefined,
        fontSize: 11.5,
        fontWeight: tone === 'gold' ? 800 : 700,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </Box>
  );
}
