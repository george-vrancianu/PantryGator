import CircularProgress from '@mui/material/CircularProgress';
import MuiDialog from '@mui/material/Dialog';
import Slide from '@mui/material/Slide';
import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { Button } from '../atoms/Button';
import { BackIcon, CloseIcon } from '../atoms/icons';
import { IconButton } from '../atoms/IconButton';
import { Box } from '../atoms/Layout';
import { useRegisterOpenSheet } from './openSheets';
import { useToastHost } from './ToastProvider';
import { useBreakpointUp } from '../theme/useBreakpointUp';
import { focusOpening, useSkipTextRestore } from '../theme/focusOpening';
import { usePrefersReducedMotion } from '../theme/usePrefersReducedMotion';
import { plusBottomInset, sheetTopRoom } from '../theme/safeArea';
import { useUiLabels } from '../theme/uiLabels';
import {
  bodyFont,
  canopy,
  border,
  color as themeColor,
  displayType,
  palette,
  radius,
} from '../theme/themeVars';

/** How long the phone sheet slides in and out, ms. */
const SLIDE_MS = 340;
const SLIDE_EASING = 'cubic-bezier(.2,.8,.2,1)';

type SheetBaseProps = {
  open: boolean;
  /**
   * Called for a scrim tap, for Escape and for the X. A child that wants Escape for
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
   * and focus is back on the opener (below `md`, not when that was a text field: ADR 0039). Use it for anything that needs to focus something after the close.
   */
  onExited?: () => void;
  /** Scrolls when it does not fit. */
  children: ReactNode;
  /**
   * `tall` (default) fills 90 dvh on a phone; `content` is as tall as its
   * content, up to the same 90 dvh, for short sheets such as a single field.
   */
  size?: 'tall' | 'content';
  /**
   * `false` makes a sheet the Member must answer, such as Review: a scrim tap and
   * Escape do not call `onClose`, and no X is drawn. Default `true`.
   */
  dismissable?: boolean;
  /** Only when not dismissable: called for Escape, so the caller can ask first ("Discard?"). */
  onEscape?: () => void;
};

/** The footer's main action, on the right. Give `onClick`, or `form` (the id of a form in the content) to submit it. */
export type SheetPrimary = {
  label: string;
  /** Shows the button's spinner and disables both footer buttons; the X stays enabled. */
  pending?: boolean;
  disabled?: boolean;
  /** `danger` when destroying is the Sheet's purpose (Revoke, Discard). */
  tone?: 'danger';
} & ({ onClick: () => void; form?: never } | { form: string; onClick?: never });

/** The footer's alternative action, on the left. A real alternative, never a way to close. */
export type SheetSecondary = { label: string; onClick: () => void };

/** A danger link at the bottom of the content, away from the primary. */
export type SheetDestructive = { label: string; onClick: () => void };

/** The roles of a Sheet's chrome (ADR 0043). Sheet draws them; callers cannot. */
type SheetRoleProps = {
  /** Drawn in the title row at display 25/800; the dialog's accessible name. */
  title: string;
  subtitle?: string;
  /** Draws Back at the left of the title row. */
  onBack?: () => void;
  destructive?: SheetDestructive;
  label?: never;
  header?: never;
  footer?: never;
} & (
  | { primary?: undefined; secondary?: never }
  | { primary: SheetPrimary; secondary?: SheetSecondary }
);

/** The old chrome slots, kept until every caller has moved to the roles (spec 821). */
type SheetSlotProps = {
  /** Accessible name of the dialog. */
  label: string;
  /** Pinned above the body, e.g. a title row and tabs. */
  header?: ReactNode;
  /** Pinned below the body; omit for none. */
  footer?: ReactNode;
  title?: never;
  subtitle?: never;
  onBack?: never;
  primary?: never;
  secondary?: never;
  destructive?: never;
};

export type SheetProps = SheetBaseProps & (SheetRoleProps | SheetSlotProps);

/** A long label wraps inside its share of the grid instead of pushing the other button out. */
const footerButtonSx = {
  minWidth: 0,
  height: 'auto',
  whiteSpace: 'normal',
  lineHeight: 1.2,
  py: '8px',
} as const;

/** The button's own spinner, sized to the label. Decorative: the button's `aria-busy` says it is working. */
function PendingSpinner() {
  return <CircularProgress size={18} thickness={5} color="inherit" />;
}

const SlideUp = forwardRef(function SlideUp(
  props: { children: ReactElement },
  ref: Ref<unknown>,
) {
  return <Slide direction="up" easing={SLIDE_EASING} ref={ref} {...props} />;
});

const SheetContainerContext = createContext<HTMLElement | null>(null);

/**
 * Where the Sheets below this provider open, instead of the end of the body: an element of the
 * screen that forces its own Theme or turns its content (the camera, ADR 0037). A Sheet gets the
 * Theme and the turn of that element, and `position: fixed` resolves against it when it has a
 * transform. `null` (the default) is the body.
 */
export const SheetContainerProvider = SheetContainerContext.Provider;

/**
 * A modal sheet: a bottom sheet (90 dvh or content-sized, handle, slides up) below `md`, a
 * centred dialog (`sm` wide, 80 vh) from `md` up. Built on the MUI dialog, so
 * focus is trapped while open and returns to the opener on close, except onto
 * a text field below `md` (ADR 0039).
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
  title,
  subtitle,
  onBack,
  primary,
  secondary,
  destructive,
  children,
  size = 'tall',
  dismissable = true,
  onEscape,
}: SheetProps) {
  const titleId = useId();
  const container = useContext(SheetContainerContext);
  const usesRoles = title !== undefined;
  const labels = useUiLabels();
  const centred = useBreakpointUp('md');
  const reduceMotion = usePrefersReducedMotion();
  // Toasts show inside the open sheet, where they can be heard and reached.
  const [paper, setPaper] = useState<HTMLElement | null>(null);
  // Only while open: a toast raised as the sheet closes must not sit in the
  // paper that is sliding away.
  useToastHost(open ? paper : null);
  useRegisterOpenSheet(open);
  const focusInitial = focusOpening(paper, initialFocus, centred);
  const skipRestore = useSkipTextRestore(open, centred);
  return (
    <MuiDialog
      open={open}
      container={container ?? undefined}
      disableRestoreFocus={skipRestore}
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
        backdrop: { sx: { backgroundColor: canopy.scrim } },
        transition: {
          onEntered: () => {
            focusInitial();
            onEntered?.();
          },
          onExited,
        },
        paper: {
          ref: setPaper,
          ...(usesRoles
            ? { 'aria-labelledby': titleId }
            : { 'aria-label': label }),
          sx: {
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            // The working sheet's look (Canopy handoff section 8.1).
            background: canopy.sheetBg,
            boxShadow: canopy.sheetShadow,
            ...(centred
              ? { borderRadius: radius.sheet, maxHeight: '80vh' }
              : {
                  m: 0,
                  width: '100%',
                  // Never taller than the screen below the top inset (ADR 0040), so the grab handle stays reachable.
                  height:
                    size === 'tall'
                      ? `min(90dvh, calc(100dvh - ${sheetTopRoom}))`
                      : 'auto',
                  maxHeight: `min(90dvh, calc(100dvh - ${sheetTopRoom}))`,
                  borderRadius: radius.sheetTop,
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
            width: 38,
            height: 4,
            mt: '9px',
            mx: 'auto',
            borderRadius: radius.handle,
            backgroundColor: themeColor.lineStrong,
          }}
        />
      )}
      {usesRoles ? (
        <Box
          sx={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            px: '16px',
            pt: '8px',
            pb: '8px',
          }}
        >
          {onBack ? (
            <IconButton label={labels.sheetBack} tone="plain" onClick={onBack}>
              <BackIcon size={22} />
            </IconButton>
          ) : null}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box
              component="h2"
              id={titleId}
              sx={{
                m: 0,
                ...displayType,
                fontSize: '25px',
                lineHeight: 1.15,
                color: palette('text-primary'),
                overflowWrap: 'anywhere',
              }}
            >
              {title}
            </Box>
            {subtitle ? (
              <Box
                sx={{
                  mt: '2px',
                  fontFamily: bodyFont,
                  fontSize: '14px',
                  color: themeColor.ink2,
                  overflowWrap: 'anywhere',
                }}
              >
                {subtitle}
              </Box>
            ) : null}
          </Box>
          {dismissable ? (
            <IconButton label={labels.sheetClose} tone="well" onClick={onClose}>
              <CloseIcon size={20} />
            </IconButton>
          ) : null}
        </Box>
      ) : null}
      {header ? <Box sx={{ flexShrink: 0 }}>{header}</Box> : null}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          // With no pinned footer, nothing else clears the home indicator (ADR 0040).
          ...(usesRoles && !primary ? { pb: plusBottomInset(0) } : {}),
        }}
      >
        {children}
        {destructive ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: '16px' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={destructive.onClick}
              disabled={primary?.pending}
              sx={{
                color: palette('error-main'),
                '&:hover': {
                  backgroundColor: palette('error-light'),
                  color: palette('error-main'),
                },
              }}
            >
              {destructive.label}
            </Button>
          </Box>
        ) : null}
      </Box>
      {footer ? (
        <Box
          sx={{
            flexShrink: 0,
            borderTop: `${border.width} solid ${palette('pp-line')}`,
          }}
        >
          {footer}
        </Box>
      ) : null}
      {primary ? (
        <Box
          data-sheet-footer=""
          sx={{
            flexShrink: 0,
            borderTop: `${border.width} solid ${palette('pp-line')}`,
            px: '16px',
            pt: '12px',
            pb: plusBottomInset(12),
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: secondary ? '1fr 2fr' : '1fr',
              gap: '12px',
              alignItems: 'center',
            }}
          >
            {secondary ? (
              <Button
                variant="secondary"
                fullWidth
                sx={{ ...footerButtonSx, minHeight: 44 }}
                disabled={primary.pending}
                onClick={secondary.onClick}
              >
                {secondary.label}
              </Button>
            ) : null}
            <Button
              fullWidth
              type={primary.form === undefined ? 'button' : 'submit'}
              form={primary.form}
              onClick={primary.onClick}
              disabled={primary.disabled || primary.pending}
              aria-busy={primary.pending || undefined}
              startIcon={primary.pending ? <PendingSpinner /> : undefined}
              sx={{
                ...footerButtonSx,
                minHeight: 52,
                ...(primary.tone === 'danger' && {
                  backgroundColor: palette('error-main'),
                  backgroundImage: 'none',
                  borderColor: 'transparent',
                  color: palette('error-light'),
                  '&:hover': { filter: 'brightness(.94)' },
                }),
              }}
            >
              {primary.label}
            </Button>
          </Box>
        </Box>
      ) : null}
    </MuiDialog>
  );
}
