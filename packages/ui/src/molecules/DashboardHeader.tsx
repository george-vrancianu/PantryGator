import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { Typography } from '../atoms/Typography';
import { topRoomBelowInset } from '../theme/safeArea';
import { palette } from '../theme/themeVars';

export type DashboardHeaderProps = {
  /** The refresh mark, before the greeting. */
  leading?: ReactNode;
  /** The greeting, kept to one line with an ellipsis. */
  greeting: string;
  /** The small line under the greeting: today's date. */
  subline?: ReactNode;
  /** The buttons at the end (Customise, Settings), in order. */
  actions: ReactNode;
};

/** The Dashboard's header: mark, greeting with the date under it, then the actions. */
export function DashboardHeader({
  leading,
  greeting,
  subline,
  actions,
}: DashboardHeaderProps) {
  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        // The page is already padded by the top inset; this room gives way to it (ADR 0040).
        pt: topRoomBelowInset(28),
        pb: '18px',
        // Keeps the old date + h1 header's content height (about 54px) so the widget grid starts where it did.
        boxSizing: 'content-box',
        minHeight: '54px',
      }}
    >
      {leading}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography
          variant="h1"
          sx={{
            fontSize: 21,
            lineHeight: 1.15,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {greeting}
        </Typography>
        {subline ? (
          <Box
            sx={{
              fontSize: 12.5,
              color: palette('text-secondary'),
              mt: '2px',
              minHeight: '1.4em',
            }}
          >
            {subline}
          </Box>
        ) : null}
      </Box>
      <Box sx={{ display: 'flex', gap: '8px', flexShrink: 0 }}>{actions}</Box>
    </Box>
  );
}
