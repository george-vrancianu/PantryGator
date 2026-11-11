import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { DOCK_CLEARANCE } from '../theme/dock';
import { gutterLeft, gutterRight, SAFE_TOP } from '../theme/safeArea';
import { tokens } from '../theme/tokens';

export type PageLayoutProps = {
  children: ReactNode;
  /** Reserve room at the bottom so content never hides under the Dock (or its capsule, which reaches above it). */
  withDock?: boolean;
  /** Bottom padding (a CSS length, or one per breakpoint) that replaces the default Dock room, e.g. to also clear a row of controls that hangs above the Dock. */
  dockClearance?: string | { xs: string; md: string };
  /** Lift the ~960 px cap to 1180 px for table screens that need the room. */
  wide?: boolean;
};

/** Page frame: 20 px gutters on phones, 48 px on wide screens (or the side inset when larger), padded by the top inset, content capped at ~960 px. */
export function PageLayout({
  children,
  withDock = true,
  dockClearance,
  wide = false,
}: PageLayoutProps) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        backgroundColor: tokens.color.bg,
        color: tokens.color.ink,
        pt: SAFE_TOP,
        pl: { xs: gutterLeft(20), md: gutterLeft(48) },
        pr: { xs: gutterRight(20), md: gutterRight(48) },
        // A page sliding in from the edge must not widen the document; clip makes no scroll container, so sticky still works.
        overflowX: 'clip',
        pb: withDock ? (dockClearance ?? DOCK_CLEARANCE) : '24px',
      }}
    >
      {/* Covers the status bar: scrolled content goes under it, and nothing tappable sits behind the island. */}
      <Box
        aria-hidden
        data-testid="safe-area-band"
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: SAFE_TOP,
          bgcolor: tokens.color.bg,
          pointerEvents: 'none',
          zIndex: 3,
        }}
      />
      <Box component="main" sx={{ maxWidth: wide ? 1180 : 960, mx: 'auto' }}>
        {children}
      </Box>
    </Box>
  );
}
