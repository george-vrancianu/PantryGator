import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { DockItem } from '../molecules/DockItem';
import {
  DOCK_BOTTOM_CSS,
  DOCK_CENTRE_WIDTH,
  DOCK_HEIGHT,
  DOCK_PADDING,
} from '../theme/dock';
import { gutterBoth } from '../theme/safeArea';
import { border, radius, shadow } from '../theme/themeVars';

export type DockEntry = {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
};

export type DockProps = {
  /** Accessible name of the navigation landmark. */
  label: string;
  /** The four tabs: the first two sit left of the middle slot, the rest right of it. */
  items: DockEntry[];
  activeKey?: string;
  /** The middle slot, usually a `DockCapsule`; it may reach past the bar's edges. */
  centre?: ReactNode;
  /** Stacking order; raised while a Voice Note is recorded so the scrim does not dim the mic. */
  zIndex?: number;
  /**
   * Teaching mode: the four tabs are dimmed, `aria-disabled`, out of the tab order and do nothing, and
   * none is marked as the current page. The `centre` capsule lights its own half (`DockCapsule`'s `teach`).
   */
  teaching?: boolean;
};

/**
 * The floating bottom navigation. Sizes from pocket-pantry-handoff sections 5
 * and 9; colours, border, radius and shadow follow the Theme
 * (docs/handoffs/themes/handoff.md section 4).
 */
export function Dock({
  label,
  items,
  activeKey,
  centre,
  zIndex = 10,
  teaching = false,
}: DockProps) {
  const tab = (item: DockEntry) => (
    <DockItem
      key={item.key}
      label={item.label}
      href={item.href}
      icon={item.icon}
      active={!teaching && item.key === activeKey}
      disabled={teaching}
    />
  );
  return (
    <Box
      component="nav"
      aria-label={label}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: DOCK_BOTTOM_CSS,
        zIndex,
        mx: 'auto',
        width: `calc(100% - 2 * ${gutterBoth(16)})`,
        maxWidth: { sm: 480, md: 520 },
        height: DOCK_HEIGHT,
        boxSizing: 'border-box',
        p: `${DOCK_PADDING}px`,
        display: 'grid',
        gridTemplateColumns: `repeat(2, minmax(0, 1fr)) ${DOCK_CENTRE_WIDTH}px repeat(2, minmax(0, 1fr))`,
        gap: { xs: '4px', md: '6px' },
        bgcolor: 'pp.dockBg',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderWidth: border.width,
        borderStyle: 'solid',
        borderColor: 'pp.line',
        borderRadius: radius.dock,
        boxShadow: shadow.float,
      }}
    >
      {items.slice(0, 2).map(tab)}
      <Box sx={{ position: 'relative' }}>{centre}</Box>
      {items.slice(2).map(tab)}
    </Box>
  );
}
