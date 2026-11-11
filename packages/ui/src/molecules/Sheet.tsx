import MuiDialog from '@mui/material/Dialog';
import Slide from '@mui/material/Slide';
import {
  forwardRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { Box } from '../atoms/Layout';
import { useToastHost } from './ToastProvider';
import { tokens } from '../theme/tokens';
import { useBreakpointUp } from '../theme/useBreakpointUp';
import { focusOpening } from '../theme/focusOpening';
import { usePrefersReducedMotion } from '../theme/usePrefersReducedMotion';
import { palette, radius, shadow } from '../theme/themeVars';

/** How long the phone sheet slides in and out, ms. */
const SLIDE_MS = 340;
const SLIDE_EASING = 'cubic-bezier(.2,.8,.2,1)';
/** The Themes define no scrim; a translucent black reads on light and dark alike. */
const SCRIM = `color-mix(in srgb, ${palette('common-black')} 38%, transparent)`;

export type SheetProps = {
  open: boolean;
  /**
   * Called for a scrim tap and for Escape. A child that wants Escape for
   * itself (say, a popover) calls `event.stopPropagation()` on that keydown.
   */
  onClose: () => void;
  /**
   * Called once the open transition has finished. For non-focus work only:
   * never focus a field here (ADR 0039); use `initialFocus`.
   */
  onEntered?: () => void;
  /**
   * The element to focus once the open transition ends. Without it, focus stays on
   * the sheet itself. Below `md` a text field is not focused (the phone keyboard
   * would jump the sheet). It never moves focus the Member has already moved to a
   * control inside the sheet; focus left outside the sheet goes to the sheet.
   */
  initialFocus?: RefObject<HTMLElement | null>;
  /**
   * Called once the close transition has finished: the dialog is gone, the app is no longer `aria-hidden`
   * and focus is back on the opener. Use it for anything that needs to focus something after the close.
   */
  onExited?: () => void;
  /** Accessible name of the dialog. */
  label: string;
  /** Pinned above the body, e.g. a title row and tabs. */
  header?: ReactNode;
  /** Pinned below the body; omit for none. */
  footer?: ReactNode;
  /** Scrolls when it does not fit. */
  children: ReactNode;
  /**
   * `tall` (default) fills 90 dvh on a phone; `content` is as tall as its
   * content, up to the same 90 dvh, for short sheets such as a single field.
   */
  size?: 'tall' | 'content';
  /**
   * `false` makes a sheet the Member must answer, such as Review: a scrim tap and
   * Escape do not call `onClose`. Default `true`.
   */
  dismissable?: boolean;
  /** Only when not dismissable: called for Escape, so the caller can ask first ("Discard?"). */
  onEscape?: () => void;
};

const SlideUp = forwardRef(function SlideUp(
  props: { children: ReactElement },
  ref: Ref<unknown>,
) {
  return <Slide direction="up" easing={SLIDE_EASING} ref={ref} {...props} />;
});

/**
 * A modal sheet: a bottom sheet (90 dvh or content-sized, handle, slides up) below `md`, a
 * centred dialog (`sm` wide, 80 vh) from `md` up. Built on the MUI dialog, so
 * focus is trapped while open and returns to the opener on close.
 */
export function Sheet({
  open,
  onClose,
  onEntered,
  initialFocus,
  onExited,
  label,
  header,
  footer,
  children,
  size = 'tall',
  dismissable = true,
  onEscape,
}: SheetProps) {
  const centred = useBreakpointUp('md');
  const reduceMotion = usePrefersReducedMotion();
  const { color } = tokens;
  // Toasts show inside the open sheet, where they can be heard and reached.
  const [paper, setPaper] = useState<HTMLElement | null>(null);
  // Only while open: a toast raised as the sheet closes must not sit in the
  // paper that is sliding away.
  useToastHost(open ? paper : null);
  const focusInitial = focusOpening(paper, initialFocus, centred);
  return (
    <MuiDialog
      open={open}
      onClose={(_event, reason) => {
        if (dismissable) onClose();
        else if (reason === 'escapeKeyDown') onEscape?.();
      }}
      fullWidth
      maxWidth={centred ? 'sm' : false}
      slots={centred ? undefined : { transition: SlideUp }}
      transitionDuration={reduceMotion ? 0 : centred ? undefined : SLIDE_MS}
      sx={
        centred
          ? undefined
          : { '& .MuiDialog-container': { alignItems: 'flex-end' } }
      }
      slotProps={{
        backdrop: { sx: { backgroundColor: SCRIM } },
        transition: {
          onEntered: () => {
            focusInitial();
            onEntered?.();
          },
          onExited,
        },
        paper: {
          ref: setPaper,
          'aria-label': label,
          sx: {
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backgroundColor: color.bg,
            backgroundImage: 'none',
            boxShadow: shadow.float,
            ...(centred
              ? { borderRadius: radius.sheet, maxHeight: '80vh' }
              : {
                  m: 0,
                  width: '100%',
                  height: size === 'tall' ? '90dvh' : 'auto',
                  maxHeight: '90dvh',
                  borderRadius: `${radius.sheet} ${radius.sheet} 0 0`,
                }),
          },
        },
      }}
    >
      {centred ? null : (
        <Box
          aria-hidden
          sx={{
            flexShrink: 0,
            width: 40,
            height: 5,
            mt: 1,
            mx: 'auto',
            borderRadius: '999px',
            backgroundColor: color.line,
          }}
        />
      )}
      {header ? <Box sx={{ flexShrink: 0 }}>{header}</Box> : null}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{children}</Box>
      {footer ? (
        <Box
          sx={{
            flexShrink: 0,
            borderTop: `1px solid ${color.line}`,
            backgroundColor: color.bg,
          }}
        >
          {footer}
        </Box>
      ) : null}
    </MuiDialog>
  );
}
