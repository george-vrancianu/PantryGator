import ButtonBase from '@mui/material/ButtonBase';
import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { focusRing } from '../theme/focusRing';
import { bodyFont, dock, radius } from '../theme/themeVars';

export type DockItemProps = {
  label: string;
  href: string;
  icon: ReactNode;
  active?: boolean;
  /**
   * Dimmed and inert, for the Dock's teaching mode: still announced (`aria-disabled`) but out of the
   * tab order, and it goes nowhere.
   */
  disabled?: boolean;
};

export function DockItem({
  label,
  href,
  icon,
  active = false,
  disabled = false,
}: DockItemProps) {
  // Canopy: white icon and label on the active tab (plus the gold mark), 68 % cream on the rest.
  const colour = active ? dock.on : dock.off;

  return (
    <ButtonBase
      // Disabled: no href at all, so there is nothing to follow, and a click or Enter does nothing.
      {...(disabled ? {} : { href })}
      aria-current={active && !disabled ? 'page' : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      onClick={disabled ? (event) => event.preventDefault() : undefined}
      sx={[
        {
          position: 'relative',
          flexDirection: 'column',
          gap: '5px',
          borderRadius: radius.dock,
          color: colour,
          fontSize: 11,
          fontWeight: active ? 700 : 600,
          fontFamily: bodyFont,
        },
        disabled ? { opacity: 0.4, cursor: 'default' } : {},
        focusRing,
      ]}
    >
      {/* The icon row: a fixed height keeps labels aligned across tabs. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 22,
          '& svg': {
            width: 22,
            height: 22,
            strokeWidth: active ? 1.9 : 1.6,
          },
        }}
      >
        {icon}
      </Box>
      <span>{label}</span>
      {active && !disabled ? (
        <Box
          aria-hidden
          data-active-mark=""
          sx={{
            position: 'absolute',
            bottom: 6,
            left: '50%',
            width: 16,
            height: 2,
            ml: '-8px',
            borderRadius: radius.pill,
            bgcolor: dock.mark,
          }}
        />
      ) : null}
    </ButtonBase>
  );
}
