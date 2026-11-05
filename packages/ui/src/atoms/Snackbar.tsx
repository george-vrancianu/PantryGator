import Box from '@mui/material/Box';
import MuiSnackbar from '@mui/material/Snackbar';
import type { Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { aboveDock, DOCK_HEIGHT } from '../theme/dock';
import { radius, shadow } from '../theme/themeVars';

export type SnackbarProps = {
  open: boolean;
  onClose: () => void;
  /** Where it sits: `'aboveDock'` clears the floating Dock (and the device's bottom inset), a number is the distance from the bottom in px, a string a CSS length. Defaults to the bottom edge. */
  bottom?: 'aboveDock' | number | string;
  /** The distance from the right edge (a number in px, or a CSS length): the toast then centres in the space left of it, e.g. beside a rail. */
  right?: number | string;
  /** Usually an `Alert`. */
  children: ReactNode;
};

/** A transient message at the bottom of the screen that closes itself after 6 s. A click elsewhere does not dismiss it. */
export function Snackbar({
  open,
  onClose,
  bottom,
  right,
  children,
}: SnackbarProps) {
  return (
    <MuiSnackbar
      open={open}
      autoHideDuration={6000}
      onClose={(_event, reason) => {
        if (reason !== 'clickaway') onClose();
      }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={[
        bottom === 'aboveDock'
          ? {
              bottom: {
                xs: aboveDock(DOCK_HEIGHT.xs),
                md: aboveDock(DOCK_HEIGHT.md),
              },
            }
          : bottom !== undefined
            ? // MUI sets `bottom: 24` from `sm` up inside a media query, which comes later in the CSS,
              // so the value has to sit in the same query to win. Same value at every width.
              (theme: Theme) => ({
                bottom,
                [theme.breakpoints.up('sm')]: { bottom },
              })
            : {},
        // MUI centres a Snackbar on the window from `sm` up: centre it between the edges instead.
        // MUI sets that inside a `min-width` media query, which comes later in the CSS, so the override
        // has to sit in the same query to win. The query only cancels MUI's own: both branches must
        // keep the same values, so no layout depends on window width (even inside CameraFrame).
        right !== undefined
          ? (theme: Theme) => {
              const override = { left: 0, right, transform: 'none' };
              return {
                ...override,
                justifyContent: 'center',
                [theme.breakpoints.up('sm')]: override,
              };
            }
          : {},
      ]}
    >
      {/* Floats like a toast: the Theme's float shadow on the control radius. */}
      <Box
        sx={{
          borderRadius: radius.control,
          boxShadow: shadow.float,
        }}
      >
        {children}
      </Box>
    </MuiSnackbar>
  );
}
