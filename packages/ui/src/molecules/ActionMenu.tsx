import Box from '@mui/material/Box';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useId, useState, type ReactNode, type Ref } from 'react';
import { MoreIcon } from '../atoms/icons';
import { HeaderButton } from '../atoms/HeaderButton';
import { IconButton } from '../atoms/IconButton';
import { tokens } from '../theme/tokens';
import { usePrefersReducedMotion } from '../theme/usePrefersReducedMotion';
import { nestedRadius, radius, shadow } from '../theme/themeVars';

export type ActionMenuItem = {
  label: string;
  icon?: ReactNode;
  /** A small pill after the label, e.g. "new". */
  badge?: string;
  /** Draws a divider above the item. */
  dividerBefore?: boolean;
  /** Renders the item as a link. */
  href?: string;
  onClick?: () => void;
  /** `urgent` colours a destructive item. */
  tone?: 'urgent';
};

export type ActionMenuProps = {
  /** Accessible name of the menu button. */
  label: string;
  items: ActionMenuItem[];
  /** Ref to the menu button, e.g. to return focus to it after an action is cancelled. */
  buttonRef?: Ref<HTMLButtonElement>;
  /** The button's icon; "…" by default. */
  icon?: ReactNode;
  /** The button's tone, as on `IconButton`; the header action's `accent` for a "+" menu. */
  tone?: 'surface' | 'accent' | 'canopyChip' | 'key';
  /** Draw the button as a labelled Canopy header button (icon 18 and `label`, e.g. "More") instead of an icon-only one. */
  labelled?: boolean;
};

/** An icon button ("…" unless `icon` says otherwise) that opens a dropdown of actions. Escape, outside click and focus are handled by the MUI menu. */
export function ActionMenu({
  label,
  items,
  buttonRef,
  icon,
  tone,
  labelled,
}: ActionMenuProps) {
  const reduceMotion = usePrefersReducedMotion();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const close = () => setAnchor(null);
  return (
    <>
      {labelled ? (
        <HeaderButton
          ref={buttonRef}
          icon={icon ?? <MoreIcon size={18} />}
          tone={tone === 'key' ? 'key' : 'chip'}
          aria-haspopup="menu"
          aria-expanded={anchor !== null}
          aria-controls={anchor ? menuId : undefined}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          {label}
        </HeaderButton>
      ) : (
        <IconButton
          ref={buttonRef}
          label={label}
          tone={tone}
          aria-haspopup="menu"
          aria-expanded={anchor !== null}
          aria-controls={anchor ? menuId : undefined}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          {icon ?? <MoreIcon size={20} />}
        </IconButton>
      )}
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={anchor !== null}
        onClose={close}
        transitionDuration={reduceMotion ? 0 : undefined}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              minWidth: 190,
              mt: '6px',
              borderRadius: radius.card,
              border: `1px solid ${tokens.color.line}`,
              boxShadow: shadow.float,
            },
          },
          list: { sx: { p: '6px' } },
        }}
      >
        {items.map((item) => {
          const urgent = item.tone === 'urgent';
          return (
            <MenuItem
              key={item.label}
              // `button` + `href` lets ButtonBase use the theme's LinkComponent (the router link).
              {...(item.href ? { component: 'button', href: item.href } : {})}
              onClick={() => {
                close();
                item.onClick?.();
              }}
              sx={{
                ...(item.dividerBefore
                  ? {
                      position: 'relative',
                      mt: '9px',
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: -5,
                        left: 0,
                        right: 0,
                        height: '1px',
                        bgcolor: tokens.color.line,
                      },
                    }
                  : {}),
                gap: '10px',
                height: 44,
                px: '12px',
                // Concentric with the menu, 6 px inside its edge.
                borderRadius: nestedRadius(radius.card, 6),
                fontSize: 15,
                fontWeight: 600,
                color: urgent ? tokens.color.urgentFg : tokens.color.ink,
                '&:hover': { backgroundColor: tokens.color.subtle },
                '& svg': {
                  width: 18,
                  height: 18,
                  color: urgent ? tokens.color.urgentFg : tokens.color.muted,
                },
              }}
            >
              {item.icon}
              {item.label}
              {item.badge ? ' ' : null}
              {item.badge ? (
                <Box
                  component="span"
                  sx={{
                    ml: 'auto',
                    px: '7px',
                    py: '1px',
                    borderRadius: radius.pill,
                    bgcolor: tokens.color.accentTint,
                    color: tokens.color.accentOnTint,
                    fontSize: 10.5,
                    fontWeight: 700,
                  }}
                >
                  {item.badge}
                </Box>
              ) : null}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
