import MuiDialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { useState, type ReactNode, type RefObject } from 'react';
import { useBreakpointUp } from '../theme/useBreakpointUp';
import { focusOpening } from '../theme/focusOpening';
import { radius, shadow } from '../theme/themeVars';
import type { ThemeId } from '../theme/themes';

export type DialogProps = {
  open: boolean;
  /** Called for Escape and a click on the backdrop. */
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Buttons along the bottom edge, e.g. Cancel. */
  actions?: ReactNode;
  /** Centred whatever the window's width (a landscape tablet's own layout decides); by default only from `md` up. */
  centred?: boolean;
  /**
   * The element to focus once the dialog has opened. Without it, focus stays on
   * the dialog itself. Below `md` a text field is not focused (the phone keyboard
   * would jump the dialog). It never moves focus the Member has already moved to a
   * control inside the dialog; focus left outside the dialog goes to the dialog.
   */
  initialFocus?: RefObject<HTMLElement | null>;
  /**
   * Force this Theme on the dialog. It portals to the end of the body, outside the Theme of the
   * screen that opened it (the camera is always dark), so it takes that Theme from here.
   */
  theme?: ThemeId;
};

/**
 * A modal that is a bottom sheet on a phone (anchored to the bottom edge, full
 * width, rounded top) and a centred dialog from the `md` breakpoint up (see
 * `useBreakpointUp`). Focus is trapped while open and returns to the element
 * that opened it on close.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  centred: forceCentred = false,
  initialFocus,
  theme,
}: DialogProps) {
  const wide = useBreakpointUp('md');
  const centred = forceCentred || wide;
  const [paper, setPaper] = useState<HTMLElement | null>(null);
  const focusInitial = focusOpening(paper, initialFocus, centred);
  return (
    <MuiDialog
      open={open}
      onClose={onClose}
      data-theme={theme}
      fullWidth
      maxWidth={centred ? 'sm' : false}
      sx={
        centred
          ? undefined
          : { '& .MuiDialog-container': { alignItems: 'flex-end' } }
      }
      slotProps={{
        transition: { onEntered: focusInitial },
        paper: {
          ref: setPaper,
          sx: centred
            ? { borderRadius: radius.sheet, boxShadow: shadow.float }
            : {
                m: 0,
                width: '100%',
                maxHeight: '85dvh',
                boxShadow: shadow.float,
                borderRadius: `${radius.sheet} ${radius.sheet} 0 0`,
              },
        },
      }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>{children}</DialogContent>
      {actions ? <DialogActions>{actions}</DialogActions> : null}
    </MuiDialog>
  );
}
