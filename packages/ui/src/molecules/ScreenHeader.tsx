import Box from '@mui/material/Box';
import {
  useState,
  type MouseEventHandler,
  type ReactNode,
  type Ref,
} from 'react';
import { BackIcon, HomeIcon } from '../atoms/icons';
import { IconButton } from '../atoms/IconButton';
import { ActionMenu, type ActionMenuItem } from './ActionMenu';
import { Typography } from '../atoms/Typography';
import { topRoomBelowInset } from '../theme/safeArea';
import { tokens } from '../theme/tokens';
import { radius } from '../theme/themeVars';

export type ScreenHeaderAction = {
  /** Accessible name of the icon-only button. */
  label: string;
  icon: ReactNode;
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  /** Turns the button into a menu of these items (e.g. two ways to add a Recipe); `href` and `onClick` are then ignored. */
  items?: ActionMenuItem[];
  /** Ref to the button, e.g. to return focus to it when a sheet it opened closes. */
  buttonRef?: Ref<HTMLButtonElement>;
};

export type ScreenHeaderProps = {
  /** Omit to leave the header without a title (the screen then carries its own H1). */
  title?: string;
  /** A muted line under the title. Needs `title`; ignored without it. */
  subtitle?: string;
  /** The Home button, only where the Dock is hidden (the Dock carries Home elsewhere). Omit to leave it out. */
  home?: { label: string; href?: string };
  /** The single action on the right, the only button there: add, search or share. */
  action?: ScreenHeaderAction;
  /** A small muted line under the title (and subtitle), e.g. a status. Needs `title`; ignored without it. */
  subline?: ReactNode;
  /** Keep the title to one line with an ellipsis, so a long title never pushes the action off. */
  truncateTitle?: boolean;
  /** A mark before the title, on a tab root (e.g. the Gator logo). Not counted toward the one-button rule. */
  leading?: ReactNode;
  /** Content right-aligned in the header, e.g. counter chips on wide screens. */
  trailing?: ReactNode;
  /** A Back link to `href`, in place of the Home button. */
  back?: {
    label: string;
    href: string;
    /** A "+n" count on Back's corner, hidden at 0; the label should name it too. It bumps when it grows. */
    badge?: number;
    /** Called on click; the screen may `preventDefault()` to leave with its own motion. */
    onClick?: MouseEventHandler<HTMLElement>;
  };
  /** Makes the title programmatically focusable, so a screen can move focus to it. Needs `title`. */
  titleRef?: Ref<HTMLHeadingElement>;
};

/** Sub-screen header: optional Back or Home button, H1 title, optional trailing content (e.g. counter chips), one action button. */
export function ScreenHeader({
  title,
  subtitle,
  subline,
  truncateTitle,
  leading,
  home,
  action,
  trailing,
  titleRef,
  back,
}: ScreenHeaderProps) {
  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        // Same box as the DashboardHeader, so every screen's header is as tall as Home's.
        // The page is already padded by the top inset; this room gives way to it (ADR 0040).
        pt: topRoomBelowInset(28),
        pb: '18px',
        boxSizing: 'content-box',
        minHeight: '54px',
      }}
    >
      {back ? (
        <Box sx={{ position: 'relative', display: 'flex' }}>
          <IconButton
            label={back.label}
            href={back.href}
            onClick={back.onClick}
          >
            <BackIcon size={20} />
          </IconButton>
          {back.badge ? <BackBadge count={back.badge} /> : null}
        </Box>
      ) : home ? (
        <IconButton label={home.label} href={home.href ?? '/'}>
          <HomeIcon size={20} />
        </IconButton>
      ) : null}
      {leading}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {title ? (
          <Typography
            variant="h2"
            component="h1"
            ref={titleRef}
            tabIndex={titleRef ? -1 : undefined}
            sx={{
              outline: 'none',
              overflowWrap: 'break-word',
              ...(truncateTitle
                ? {
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }
                : {}),
            }}
          >
            {title}
          </Typography>
        ) : null}
        {subtitle ? (
          <Typography
            sx={{ fontSize: 13, color: tokens.color.muted, mt: '2px' }}
          >
            {subtitle}
          </Typography>
        ) : null}
        {title && subline ? (
          <Box
            sx={{
              fontSize: 12.5,
              color: tokens.color.muted,
              mt: '2px',
              minHeight: '1.4em',
            }}
          >
            {subline}
          </Box>
        ) : null}
      </Box>
      {trailing || action ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {trailing}
          {action ? <HeaderAction {...action} /> : null}
        </Box>
      ) : null}
    </Box>
  );
}

/** The header's one action: an accent button, or a menu when it has `items`. */
function HeaderAction({
  label,
  icon,
  href,
  onClick,
  items,
  buttonRef,
}: ScreenHeaderAction) {
  return items ? (
    <ActionMenu
      label={label}
      tone="accent"
      icon={icon}
      items={items}
      buttonRef={buttonRef}
    />
  ) : (
    <IconButton
      ref={buttonRef}
      label={label}
      tone="accent"
      href={href}
      onClick={onClick}
    >
      {icon}
    </IconButton>
  );
}

/** The "+n" pill on Back's corner; it bumps when the count grows, not when Undo shrinks it. */
function BackBadge({ count }: { count: number }) {
  const [previous, setPrevious] = useState(count);
  const [bump, setBump] = useState(0);
  if (count !== previous) {
    setPrevious(count);
    if (count > previous) setBump((n) => n + 1);
  }
  return (
    <Box
      key={bump}
      aria-hidden
      data-testid="back-badge"
      sx={{
        position: 'absolute',
        top: '-4px',
        right: '-6px',
        minWidth: 20,
        height: 20,
        px: '5px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        bgcolor: tokens.color.accent,
        color: 'pp.accentInk',
        boxShadow: `0 0 0 2px ${tokens.color.bg}`,
        fontSize: 11,
        fontWeight: 700,
        pointerEvents: 'none',
        '@keyframes pp-back-badge-bump': {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.3)' },
          '100%': { transform: 'scale(1)' },
        },
        '@media (prefers-reduced-motion: no-preference)': {
          animation: 'pp-back-badge-bump 400ms ease-out',
        },
      }}
    >
      +{count}
    </Box>
  );
}
