import { Box, radius, shadow, tokens } from '@pocket-pantry/ui';
import type { MouseEventHandler, ReactNode } from 'react';
import { Link } from 'react-router-dom';

type LinkProps =
  | { to: string; label: string; describedBy?: string }
  | { to?: undefined; label?: undefined; describedBy?: undefined };

/**
 * Gator on the accent tint with a speech bubble beside him, which fades in after his Entrance.
 * Gator sits whole inside the panel, with room above for his hop and below for his shadow; size
 * him at 170. Pass `to` to make the whole panel one link, named by `label` (and described by the element `describedBy`).
 */
export function GatorBubblePanel({
  gator,
  children,
  to,
  label,
  describedBy,
  onClick,
}: {
  gator: ReactNode;
  /** What Gator says. */
  children: ReactNode;
  /** Link only: runs on press, and may stop the navigation to do something first. */
  onClick?: MouseEventHandler<HTMLElement>;
} & LinkProps) {
  return (
    <Box
      {...(to
        ? {
            component: Link,
            to,
            'aria-label': label,
            'aria-describedby': describedBy,
            onClick,
          }
        : {})}
      sx={{
        position: 'relative',
        display: 'block',
        height: 206,
        borderRadius: radius.card,
        bgcolor: tokens.color.accentTint,
        color: tokens.color.accentOnTint,
        textDecoration: 'none',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          left: 10,
          top: '50%',
          transform: 'translateY(-50%)',
        }}
      >
        {gator}
      </Box>
      <Box
        sx={{
          position: 'absolute',
          // Beside Gator, not pinned to the far edge, so it stays next to him on a wide screen.
          left: 'min(188px, calc(100% - 162px))',
          top: 12,
          width: 150,
          boxSizing: 'border-box',
          p: '11px 13px',
          borderRadius: radius.card,
          bgcolor: tokens.color.surface,
          boxShadow: shadow.card,
          color: tokens.color.ink,
          fontSize: 13.5,
          fontWeight: 600,
          lineHeight: 1.35,
          '@keyframes pp-gator-bubble-in': {
            from: { opacity: 0, transform: 'translateY(6px) scale(.94)' },
            to: { opacity: 1, transform: 'none' },
          },
          '@media (prefers-reduced-motion: no-preference)': {
            animation: 'pp-gator-bubble-in 400ms ease-out 700ms backwards',
          },
        }}
      >
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: -8,
            top: 58,
            width: 16,
            height: 16,
            bgcolor: tokens.color.surface,
            transform: 'rotate(45deg)',
          }}
        />
        <Box sx={{ position: 'relative' }}>{children}</Box>
      </Box>
    </Box>
  );
}
